/** Opt-in signed recovery-policy/path-proof wire contract; no RF activation. */
import {routedId,routedHex,routedBytes} from './routed-node-profile.js';
export const RELAY_RECOVERY_NODE_LIMIT=8;
export const RELAY_RECOVERY_POLICY_BYTES=672;
export const RELAY_RECOVERY_PROOF_BYTES=320;
export interface RelayRecoveryNode {readonly nodeId:string;readonly nodeSpkiSha256:string;readonly priority:number;readonly mayRoot:boolean;}
export interface RelayRecoveryPolicyBody {
  readonly schema:'aumanet.relay-recovery-policy.v1';readonly groupId:string;readonly ownerSpkiSha256:string;
  readonly epoch:number;readonly policyRevision:number;readonly issuedAtMs:number;readonly validUntilMs:number;
  /** Durable mode uses validUntilMs as first-admission deadline, never as restored ownership expiry. */
  readonly retention:'expires'|'durable-until-replaced';
  readonly radioProfileSha256:string;readonly freshnessMs:number;readonly lossMs:number;readonly debounceMs:number;
  readonly retryMs:number;readonly jitterMs:number;readonly operationTimeoutMs:number;readonly maxAttempts:number;readonly maxDepth:number;
  readonly nodes:readonly RelayRecoveryNode[];
}
export interface SignedRelayRecoveryPolicy {readonly schema:'aumanet.signed-relay-recovery-policy.v1';readonly bodyHex:string;readonly signatureDerHex:string;}
export interface RelayRootProofBody {
  readonly schema:'aumanet.relay-root-proof.v1';readonly groupId:string;readonly policySha256:string;readonly epoch:number;readonly policyRevision:number;
  readonly rootId:string;readonly rootBootNonce:string;readonly rootGeneration:number;readonly observerId:string;readonly challengeNonce:string;
  readonly sequence:number;readonly advertiserBootNonce:string;readonly advertiserGeneration:number;readonly path:readonly string[];
}
export interface SignedRelayRootProof {
  readonly schema:'aumanet.signed-relay-root-proof.v1';readonly bodyHex:string;
  readonly signatures:readonly {readonly nodeId:string;readonly signatureDerHex:string}[];
}
export interface RelayRecoveryChallenge {
  readonly schema:'aumanet.relay-recovery-challenge.v1';readonly groupId:string;readonly epoch:number;readonly policyRevision:number;
  readonly policySha256:string;readonly observerId:string;readonly nonce:string;readonly expiresAtMonotonicMs:number;
}
const policyMagic=Uint8Array.of(65,85,82,80,79,76,49,0);
const proofMagic=Uint8Array.of(65,85,82,80,82,49,0,0);
const hopMagic=Uint8Array.of(65,85,82,72,79,80,49,0);
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Expected recovery object');return value as Record<string,unknown>;}
function keys(value:Record<string,unknown>,names:string[]){if(Object.keys(value).length!==names.length||Object.keys(value).some(k=>!names.includes(k)))throw Error('Unexpected recovery fields');}
function uint(value:unknown,min=1,max=Number.MAX_SAFE_INTEGER):value is number{return typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max;}
function signature(value:unknown):value is string{return typeof value==='string'&&value.length>=16&&value.length<=144&&value.length%2===0&&/^[a-f0-9]+$/.test(value);}
function safe(view:DataView,offset:number):number{const n=view.getBigUint64(offset);if(n>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Unsafe recovery integer');return Number(n);}
function put(view:DataView,offset:number,value:number){view.setBigUint64(offset,BigInt(value));}
export function parseRelayRecoveryPolicy(value:unknown):RelayRecoveryPolicyBody {
  const v=object(value);keys(v,['schema','groupId','ownerSpkiSha256','epoch','policyRevision','issuedAtMs','validUntilMs','retention','radioProfileSha256',
    'freshnessMs','lossMs','debounceMs','retryMs','jitterMs','operationTimeoutMs','maxAttempts','maxDepth','nodes']);
  if(v.schema!=='aumanet.relay-recovery-policy.v1'||!routedId(v.groupId)||!routedId(v.ownerSpkiSha256,32)||!routedId(v.radioProfileSha256,32)||
    !uint(v.epoch)||!uint(v.policyRevision)||!uint(v.issuedAtMs)||!uint(v.validUntilMs)||v.validUntilMs<=v.issuedAtMs||v.validUntilMs-v.issuedAtMs>604800000||
    v.retention!=='expires'&&v.retention!=='durable-until-replaced'||
    !uint(v.freshnessMs,1,60000)||!uint(v.lossMs,v.freshnessMs,120000)||!uint(v.debounceMs,1,120000)||!uint(v.retryMs,1,120000)||
    !uint(v.jitterMs,0,v.debounceMs)||!uint(v.operationTimeoutMs,1,120000)||!uint(v.maxAttempts,1,32)||!uint(v.maxDepth,0,7)||
    !Array.isArray(v.nodes)||v.nodes.length<1||v.nodes.length>RELAY_RECOVERY_NODE_LIMIT||v.maxDepth>v.nodes.length-1)throw Error('Invalid bounded relay recovery policy');
  const nodes:RelayRecoveryNode[]=v.nodes.map(raw=>{const n=object(raw);keys(n,['nodeId','nodeSpkiSha256','priority','mayRoot']);
    if(!routedId(n.nodeId)||!routedId(n.nodeSpkiSha256,32)||n.nodeSpkiSha256===v.ownerSpkiSha256||!uint(n.priority,0,65535)||typeof n.mayRoot!=='boolean')throw Error('Invalid admitted recovery node');
    return {nodeId:n.nodeId,nodeSpkiSha256:n.nodeSpkiSha256,priority:n.priority,mayRoot:n.mayRoot};});
  if(new Set(nodes.map(n=>n.nodeId)).size!==nodes.length||new Set(nodes.map(n=>n.nodeSpkiSha256)).size!==nodes.length||!nodes.some(n=>n.mayRoot))throw Error('Duplicate nodes/keys or no eligible recovery root');
  nodes.sort((a,b)=>a.nodeId<b.nodeId?-1:a.nodeId>b.nodeId?1:0);
  return {schema:'aumanet.relay-recovery-policy.v1',groupId:v.groupId,ownerSpkiSha256:v.ownerSpkiSha256,epoch:v.epoch,policyRevision:v.policyRevision,
    issuedAtMs:v.issuedAtMs,validUntilMs:v.validUntilMs,retention:v.retention,radioProfileSha256:v.radioProfileSha256,freshnessMs:v.freshnessMs,lossMs:v.lossMs,
    debounceMs:v.debounceMs,retryMs:v.retryMs,jitterMs:v.jitterMs,operationTimeoutMs:v.operationTimeoutMs,maxAttempts:v.maxAttempts,maxDepth:v.maxDepth,nodes};
}
export function encodeRelayRecoveryPolicy(value:RelayRecoveryPolicyBody):Uint8Array {
  const p=parseRelayRecoveryPolicy(value),out=new Uint8Array(RELAY_RECOVERY_POLICY_BYTES),v=new DataView(out.buffer);
  out.set(policyMagic);v.setUint16(8,1);v.setUint16(10,p.retention==='durable-until-replaced'?1:0);out.set(routedBytes(p.groupId),12);out.set(routedBytes(p.ownerSpkiSha256),28);
  put(v,60,p.epoch);put(v,68,p.policyRevision);put(v,76,p.issuedAtMs);put(v,84,p.validUntilMs);out.set(routedBytes(p.radioProfileSha256),92);
  [p.freshnessMs,p.lossMs,p.debounceMs,p.retryMs,p.jitterMs,p.operationTimeoutMs].forEach((n,i)=>v.setUint32(124+i*4,n));
  out[148]=p.maxAttempts;out[149]=p.maxDepth;out[150]=p.nodes.length;
  p.nodes.forEach((node,i)=>{const at=160+i*64;out.set(routedBytes(node.nodeId),at);out.set(routedBytes(node.nodeSpkiSha256),at+16);v.setUint16(at+48,node.priority);out[at+50]=node.mayRoot?1:0;});return out;
}
export function decodeRelayRecoveryPolicy(input:Uint8Array):RelayRecoveryPolicyBody {
  if(!(input instanceof Uint8Array)||input.length!==RELAY_RECOVERY_POLICY_BYTES)throw Error('Wrong recovery policy size');
  const b=new Uint8Array(input),v=new DataView(b.buffer),count=b[150]!;
  if(policyMagic.some((x,i)=>x!==b[i])||v.getUint16(8)!==1||v.getUint16(10)>1||count<1||count>8||b.slice(151,160).some(Boolean))throw Error('Noncanonical recovery policy');
  const nodes=[];
  for(let i=0;i<count;i++){const at=160+i*64;if(b[at+50]!>1||b.slice(at+51,at+64).some(Boolean))throw Error('Noncanonical recovery node');
    nodes.push({nodeId:routedHex(b.slice(at,at+16)),nodeSpkiSha256:routedHex(b.slice(at+16,at+48)),priority:v.getUint16(at+48),mayRoot:b[at+50]===1});}
  if(b.slice(160+count*64).some(Boolean))throw Error('Unused recovery node bytes must be zero');
  const p=parseRelayRecoveryPolicy({schema:'aumanet.relay-recovery-policy.v1',groupId:routedHex(b.slice(12,28)),ownerSpkiSha256:routedHex(b.slice(28,60)),
    epoch:safe(v,60),policyRevision:safe(v,68),issuedAtMs:safe(v,76),validUntilMs:safe(v,84),retention:v.getUint16(10)===1?'durable-until-replaced':'expires',radioProfileSha256:routedHex(b.slice(92,124)),
    freshnessMs:v.getUint32(124),lossMs:v.getUint32(128),debounceMs:v.getUint32(132),retryMs:v.getUint32(136),jitterMs:v.getUint32(140),operationTimeoutMs:v.getUint32(144),
    maxAttempts:b[148],maxDepth:b[149],nodes});
  if(routedHex(encodeRelayRecoveryPolicy(p))!==routedHex(b))throw Error('Recovery nodes are not in canonical order');return p;
}
export function parseSignedRelayRecoveryPolicy(value:unknown):SignedRelayRecoveryPolicy {
  const v=object(value);keys(v,['schema','bodyHex','signatureDerHex']);
  if(v.schema!=='aumanet.signed-relay-recovery-policy.v1'||typeof v.bodyHex!=='string'||v.bodyHex.length!==RELAY_RECOVERY_POLICY_BYTES*2||!signature(v.signatureDerHex))throw Error('Invalid signed recovery policy');
  decodeRelayRecoveryPolicy(routedBytes(v.bodyHex));return {schema:v.schema,bodyHex:v.bodyHex,signatureDerHex:v.signatureDerHex};
}
export function parseRelayRootProof(value:unknown):RelayRootProofBody {
  const v=object(value);keys(v,['schema','groupId','policySha256','epoch','policyRevision','rootId','rootBootNonce','rootGeneration','observerId','challengeNonce',
    'sequence','advertiserBootNonce','advertiserGeneration','path']);
  if(v.schema!=='aumanet.relay-root-proof.v1'||!routedId(v.groupId)||!routedId(v.policySha256,32)||!uint(v.epoch)||!uint(v.policyRevision)||
    !routedId(v.rootId)||!routedId(v.rootBootNonce)||!uint(v.rootGeneration)||!routedId(v.observerId)||!routedId(v.challengeNonce,32)||!uint(v.sequence)||
    !routedId(v.advertiserBootNonce)||!uint(v.advertiserGeneration)||!Array.isArray(v.path)||v.path.length<1||v.path.length>7||
    v.path.some(n=>!routedId(n)||n===v.observerId)||new Set(v.path).size!==v.path.length||v.path[0]!==v.rootId||v.path.length===1&&v.rootBootNonce!==v.advertiserBootNonce)throw Error('Invalid bounded rooted path proof');
  return {schema:v.schema,groupId:v.groupId,policySha256:v.policySha256,epoch:v.epoch,policyRevision:v.policyRevision,rootId:v.rootId,rootBootNonce:v.rootBootNonce,
    rootGeneration:v.rootGeneration,observerId:v.observerId,challengeNonce:v.challengeNonce,sequence:v.sequence,advertiserBootNonce:v.advertiserBootNonce,
    advertiserGeneration:v.advertiserGeneration,path:[...v.path] as string[]};
}
export function encodeRelayRootProof(value:RelayRootProofBody):Uint8Array {
  const p=parseRelayRootProof(value),b=new Uint8Array(RELAY_RECOVERY_PROOF_BYTES),v=new DataView(b.buffer);
  b.set(proofMagic);v.setUint16(8,1);b.set(routedBytes(p.groupId),12);b.set(routedBytes(p.policySha256),28);put(v,60,p.epoch);put(v,68,p.policyRevision);
  b.set(routedBytes(p.rootId),76);b.set(routedBytes(p.rootBootNonce),92);put(v,108,p.rootGeneration);b.set(routedBytes(p.observerId),116);
  b.set(routedBytes(p.challengeNonce),132);put(v,164,p.sequence);b.set(routedBytes(p.advertiserBootNonce),172);put(v,188,p.advertiserGeneration);
  b[196]=p.path.length;p.path.forEach((n,i)=>b.set(routedBytes(n),208+i*16));return b;
}
export function decodeRelayRootProof(input:Uint8Array):RelayRootProofBody {
  if(!(input instanceof Uint8Array)||input.length!==RELAY_RECOVERY_PROOF_BYTES)throw Error('Wrong rooted path proof size');
  const b=new Uint8Array(input),v=new DataView(b.buffer),count=b[196]!;
  if(proofMagic.some((x,i)=>x!==b[i])||v.getUint16(8)!==1||v.getUint16(10)!==0||count<1||count>7||b.slice(197,208).some(Boolean)||b.slice(208+count*16).some(Boolean))throw Error('Noncanonical rooted path proof');
  const p=parseRelayRootProof({schema:'aumanet.relay-root-proof.v1',groupId:routedHex(b.slice(12,28)),policySha256:routedHex(b.slice(28,60)),epoch:safe(v,60),policyRevision:safe(v,68),
    rootId:routedHex(b.slice(76,92)),rootBootNonce:routedHex(b.slice(92,108)),rootGeneration:safe(v,108),observerId:routedHex(b.slice(116,132)),challengeNonce:routedHex(b.slice(132,164)),
    sequence:safe(v,164),advertiserBootNonce:routedHex(b.slice(172,188)),advertiserGeneration:safe(v,188),path:Array.from({length:count},(_,i)=>routedHex(b.slice(208+i*16,224+i*16)))});
  if(routedHex(encodeRelayRootProof(p))!==routedHex(b))throw Error('Noncanonical rooted path bytes');return p;
}
export function recoveryHopSigningBytes(body:Uint8Array,nodeId:string):Uint8Array {
  const p=decodeRelayRootProof(body);if(!p.path.includes(nodeId))throw Error('Signer is not part of the claimed rooted path');
  const bytes=new Uint8Array(8+body.length+16);bytes.set(hopMagic);bytes.set(body,8);bytes.set(routedBytes(nodeId),8+body.length);return bytes;
}
export function parseSignedRelayRootProof(value:unknown):SignedRelayRootProof {
  const v=object(value);keys(v,['schema','bodyHex','signatures']);
  if(v.schema!=='aumanet.signed-relay-root-proof.v1'||typeof v.bodyHex!=='string'||v.bodyHex.length!==RELAY_RECOVERY_PROOF_BYTES*2||!Array.isArray(v.signatures))throw Error('Invalid signed rooted path');
  const p=decodeRelayRootProof(routedBytes(v.bodyHex));if(v.signatures.length!==p.path.length)throw Error('Every rooted path node must endorse the proof');
  const signatures=v.signatures.map((raw,i)=>{const s=object(raw);keys(s,['nodeId','signatureDerHex']);if(s.nodeId!==p.path[i]||!signature(s.signatureDerHex))throw Error('Wrong ordered path signer');return {nodeId:s.nodeId as string,signatureDerHex:s.signatureDerHex};});
  return {schema:v.schema,bodyHex:v.bodyHex,signatures};
}
