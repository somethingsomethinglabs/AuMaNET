/** Enrolled-node foreground handoff proof. This is not credential encryption or
 * node administration. Transport adapters must still authenticate/encrypt their
 * session, and Wi-Fi attachment must perform the existing fresh boot proof. */
export interface BootstrapScope {
  node: string; group: string; owner: string; phone: string;
  epoch: number; profileDigest: string; intentEpoch: number;
}
export interface BootstrapProof extends BootstrapScope {
  schema: 'aumanet.node-bootstrap-proof.v1';
  challenge: string; boot: string; signature: string;
}
const hex = (value: unknown, bytes: number): value is string =>
  typeof value === 'string' && new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value);
const integer = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
function scope(value: BootstrapScope): BootstrapScope {
  if (!value || !hex(value.node,16) || !hex(value.group,16) || !hex(value.owner,32) ||
      !hex(value.phone,32) || !hex(value.profileDigest,32) || !integer(value.epoch) ||
      value.epoch < 1 || !integer(value.intentEpoch)) throw Error('Invalid bootstrap scope');
  return {node:value.node,group:value.group,owner:value.owner,phone:value.phone,
    epoch:value.epoch,profileDigest:value.profileDigest,intentEpoch:value.intentEpoch};
}
function bytes(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(value.match(/../g) ?? [], x => Number.parseInt(x,16));
}
function encode(value: Uint8Array): string {
  return Array.from(value, x=>x.toString(16).padStart(2,'0')).join('');
}
/** Fixed-order, newline-delimited ASCII, no optional fields or secret material.
 * ECDSA signatures use the WebCrypto 64-byte IEEE-P1363 format, not ASN.1 DER. */
export function bootstrapProofBody(raw: Omit<BootstrapProof,'signature'>): Uint8Array<ArrayBuffer> {
  const value=scope(raw);
  if (raw.schema!=='aumanet.node-bootstrap-proof.v1' || !hex(raw.challenge,32) ||
      !hex(raw.boot,16)) throw Error('Invalid bootstrap proof');
  return new TextEncoder().encode([raw.schema,value.node,value.group,value.owner,value.phone,
    String(value.epoch),value.profileDigest,String(value.intentEpoch),raw.challenge,raw.boot,''].join('\n'));
}
export function parseBootstrapProof(raw: unknown): BootstrapProof {
  if (!raw || typeof raw!=='object' || Array.isArray(raw)) throw Error('Invalid bootstrap proof');
  const value=raw as BootstrapProof;
  const keys=['schema','node','group','owner','phone','epoch','profileDigest','intentEpoch','challenge','boot','signature'];
  if (Object.keys(value).length!==keys.length || keys.some(key=>!Object.hasOwn(value,key)) ||
      !hex(value.signature,64)) throw Error('Invalid bootstrap proof');
  bootstrapProofBody(value);
  return {...scope(value),schema:value.schema,challenge:value.challenge,boot:value.boot,signature:value.signature};
}
/** One challenge, one proof, at most ten seconds. Call close on Stop, scope
 * change, permission denial, disconnect or revocation. A new instance alone
 * grants no permission: consume checks the caller's current native intent. */
export class NodeBootstrapChallenge {
  readonly #challenge: string;
  get challenge(): string {return this.#challenge;}
  readonly #scope: BootstrapScope;
  readonly #created: number;
  #closed=false;
  #cancelled=false;
  constructor(saved: BootstrapScope, now: number) {
    this.#scope=scope(saved);
    if (!integer(now) || now>Number.MAX_SAFE_INTEGER-10_000) throw Error('Invalid bootstrap clock');
    this.#created=now;
    this.#challenge=encode(crypto.getRandomValues(new Uint8Array(32)));
  }
  close(): void {this.#cancelled=true;this.#closed=true;}
  async consume(raw: unknown, publicSpki: string, savedPin: string,
    current: ()=>{scope: BootstrapScope; enabled: boolean; foreground: boolean; now: number}): Promise<boolean> {
    if (this.#closed) return false;
    // Claim before asynchronous crypto: duplicate callbacks cannot both win.
    this.#closed=true;
    try {
      const proof=parseBootstrapProof(raw),expected=this.#scope;
      const live=()=>{
        const state=current(),actual=scope(state.scope);
        return !this.#cancelled && state.enabled===true && state.foreground===true && integer(state.now) && state.now>=this.#created &&
          state.now-this.#created<10_000 && Object.keys(expected).every(key=>
            actual[key as keyof BootstrapScope]===expected[key as keyof BootstrapScope]);
      };
      if (!live() || proof.challenge!==this.challenge ||
          Object.keys(expected).some(key=>proof[key as keyof BootstrapScope]!==expected[key as keyof BootstrapScope]) ||
          !hex(publicSpki,91) || !hex(savedPin,32)) return false;
      // Exact named P-256 SubjectPublicKeyInfo; no arbitrary 256-bit curve.
      const prefix='3059301306072a8648ce3d020106082a8648ce3d03010703420004';
      if (!publicSpki.startsWith(prefix)) return false;
      const der=bytes(publicSpki);
      if (encode(new Uint8Array(await crypto.subtle.digest('SHA-256',der)))!==savedPin || !live()) return false;
      const key=await crypto.subtle.importKey('spki',der,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
      const valid=await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,bytes(proof.signature),bootstrapProofBody(proof));
      return valid && live();
    } catch {return false;}
  }
}
