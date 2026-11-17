import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash,randomBytes,sign,verify} from 'node:crypto';
import {RelayRecoveryAdmission} from '../packages/core/dist/relay-recovery-policy.js';
import {encodeRelayRecoveryPolicy,decodeRelayRecoveryPolicy,parseRelayRecoveryPolicy,encodeRelayRootProof,decodeRelayRootProof,
  parseSignedRelayRootProof,recoveryHopSigningBytes} from '../packages/protocol/dist/relay-recovery-policy.js';
const GROUP='a'.repeat(32),A='1'.repeat(32),B='2'.repeat(32),C='3'.repeat(32),RADIO='b'.repeat(64);
const pin=key=>createHash('sha256').update(key.export({type:'spki',format:'der'})).digest('hex');
function storage(raw=null){return {raw,fail:'',writes:0,async read(){return this.raw;},async compareAndSwap(expected,next){this.writes++;
  if(this.raw!==expected)return false;if(this.fail==='before')throw Error('storage unavailable');this.raw=next;if(this.fail==='after')throw Error('commit acknowledgement lost');return true;}};}
function fixture(count=3){
  const owner=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),ownerPin=pin(owner.publicKey),nodeKeys=new Map();
  const nodes=Array.from({length:count},(_,i)=>{const id=String(i+1).repeat(32),key=generateKeyPairSync('ec',{namedCurve:'prime256v1'});nodeKeys.set(id,key);
    return {nodeId:id,nodeSpkiSha256:pin(key.publicKey),priority:i+1,mayRoot:i!==1};});
  const keyByPin=new Map([[ownerPin,owner.publicKey],...nodes.map(n=>[n.nodeSpkiSha256,nodeKeys.get(n.nodeId).publicKey])]);
  const clock={wall:1000000,mono:1000,wallTimeMs(){return this.wall;},monotonicMs(){return this.mono;}};
  const crypto={async verifyP256(hash,body,signature){return keyByPin.has(hash)&&verify('sha256',body,keyByPin.get(hash),signature);},
    async sha256(body){return new Uint8Array(createHash('sha256').update(body).digest());},async randomBytes(n){return new Uint8Array(randomBytes(n));}};
  const floor={values:new Map(),fail:'',async read(scope){if(this.fail==='read')throw Error('floor unavailable');return this.values.get(scope)??0;},
    async advance(scope,expected,next){if((this.values.get(scope)??0)!==expected)return false;if(this.fail==='before')throw Error('floor commit failed');this.values.set(scope,next);
      if(this.fail==='after')throw Error('floor acknowledgement lost');return true;}};
  const trust={enabled:true,groupId:GROUP,ownerSpkiSha256:ownerPin,epoch:1,selfNodeId:nodes.at(-1).nodeId,selfBootNonce:'c'.repeat(32),selfRootGeneration:1,
    minimumPolicyRevision:0,approvedRadioProfileHashes:[RADIO]};
  const store=storage(),make=(s=store,t=trust,f=floor)=>new RelayRecoveryAdmission(t,s,f,crypto,clock);
  const policy=(changes={})=>({schema:'aumanet.relay-recovery-policy.v1',groupId:GROUP,ownerSpkiSha256:ownerPin,epoch:1,policyRevision:1,
    issuedAtMs:1000000,validUntilMs:1100000,retention:'expires',radioProfileSha256:RADIO,freshnessMs:5000,lossMs:10000,debounceMs:1000,retryMs:2000,jitterMs:500,
    operationTimeoutMs:3000,maxAttempts:3,maxDepth:Math.min(7,count-1),nodes,...changes});
  const signedPolicy=changes=>{const bytes=encodeRelayRecoveryPolicy(policy(changes));return {schema:'aumanet.signed-relay-recovery-policy.v1',bodyHex:Buffer.from(bytes).toString('hex'),
    signatureDerHex:sign('sha256',bytes,owner.privateKey).toString('hex')};};
  const proof=(challenge,changes={})=>{
    const p={schema:'aumanet.relay-root-proof.v1',groupId:GROUP,policySha256:challenge.policySha256,epoch:1,policyRevision:challenge.policyRevision,
      rootId:A,rootBootNonce:'d'.repeat(32),rootGeneration:1,observerId:trust.selfNodeId,challengeNonce:challenge.nonce,sequence:1,
      advertiserBootNonce:'e'.repeat(32),advertiserGeneration:1,path:[A,B],...changes};
    const bytes=encodeRelayRootProof(p);
    return {schema:'aumanet.signed-relay-root-proof.v1',bodyHex:Buffer.from(bytes).toString('hex'),signatures:p.path.map(nodeId=>({nodeId,
      signatureDerHex:sign('sha256',recoveryHopSigningBytes(bytes,nodeId),(nodeKeys.get(nodeId)??nodeKeys.get(A)).privateKey).toString('hex')}))};
  };
  async function ready(changes){const admission=make();await admission.load();await admission.installPolicy(signedPolicy(changes));return admission;}
  return {owner,ownerPin,nodeKeys,nodes,keyByPin,clock,crypto,floor,trust,store,make,policy,signedPolicy,proof,ready};
}

test('fixed canonical policy/proof encodings reject reserved, unknown, reordered wire and unsafe bounds',()=>{
  const f=fixture(),policy=f.policy(),bytes=encodeRelayRecoveryPolicy(policy);
  assert.equal(bytes.length,672);assert.equal(Buffer.from(bytes.slice(0,12)).toString('hex'),'415552504f4c310000010000');
  assert.deepEqual(decodeRelayRecoveryPolicy(bytes),policy);
  assert.deepEqual(encodeRelayRecoveryPolicy({...policy,nodes:[...policy.nodes].reverse()}),bytes);
  for(const at of [0,8,10,151,159,160+51,160+3*64]){const bad=new Uint8Array(bytes);bad[at]^=2;assert.throws(()=>decodeRelayRecoveryPolicy(bad));}
  const reordered=new Uint8Array(bytes),a=reordered.slice(160,224),b=reordered.slice(224,288);reordered.set(b,160);reordered.set(a,224);assert.throws(()=>decodeRelayRecoveryPolicy(reordered),/canonical/);
  for(const changes of [{extra:true},{nodes:Array(9).fill(policy.nodes[0])},{nodes:[policy.nodes[0],policy.nodes[0]]},{maxAttempts:33},{maxDepth:8},
    {epoch:Number.MAX_SAFE_INTEGER+1},{jitterMs:1001},{validUntilMs:1000000+604800001},{nodes:policy.nodes.map(n=>({...n,mayRoot:false}))}])assert.throws(()=>parseRelayRecoveryPolicy(f.policy(changes)));
});

test('explicit opt-in, real owner P256 signature and durable floor produce scoped controller policy only',async()=>{
  const f=fixture();assert.throws(()=>f.make(storage(),{...f.trust,enabled:false}));const admission=await f.ready(),controller=await admission.controllerPolicy();
  assert.equal(controller.authorized,true);assert.equal(controller.self,C);assert.equal(controller.selfMayRoot,true);assert.equal(controller.selfPriority,3);
  assert.equal(controller.scope,controller.policySha256.slice(0,32));assert.ok(f.store.raw);assert.equal([...f.floor.values.values()][0],1);
  for(const forbidden of ['membership','updateAuthority','subnet','ownerPrivateKey'])assert.equal(forbidden in controller,false);
});

test('forged/tampered/wrong-owner policies and unsigned verified booleans cannot cross the admission boundary',async()=>{
  const f=fixture(),admission=f.make();await admission.load();const signed=f.signedPolicy();
  const tampered={...signed,bodyHex:Buffer.from(encodeRelayRecoveryPolicy(f.policy({policyRevision:2}))).toString('hex')};
  await assert.rejects(admission.installPolicy(tampered),/signature/);
  const other=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),forged={...signed,signatureDerHex:sign('sha256',Buffer.from(signed.bodyHex,'hex'),other.privateKey).toString('hex')};
  await assert.rejects(admission.installPolicy(forged),/signature/);
  await assert.rejects(admission.installPolicy(f.signedPolicy({groupId:'f'.repeat(32)})),/scope|outside/);
  await assert.rejects(admission.installPolicy({...signed,verified:true}));assert.equal(f.store.raw,null);
});

test('policy hash is immutable at each revision and trusted floors reject old signed policy after restore',async()=>{
  const f=fixture(),admission=await f.ready();const first=f.signedPolicy();
  await assert.rejects(admission.installPolicy(f.signedPolicy({freshnessMs:4000})),/immutable hash/);
  assert.equal((await admission.installPolicy(first)).changed,false);
  await admission.installPolicy(f.signedPolicy({policyRevision:2}));await assert.rejects(admission.installPolicy(first),/rolled-back|replay/);
  const current=f.store.raw,old=JSON.parse(current);old.policy=first;old.policySha256=createHash('sha256').update(Buffer.from(first.bodyHex,'hex')).digest('hex');
  const rollback=f.make(storage(JSON.stringify(old)));await assert.rejects(rollback.load(),/rollback/);assert.equal(rollback.status,'unavailable');
});

test('uncertain policy or floor commits never authorize until authoritative restore/readback',async()=>{
  for(const layer of ['journal','floor'])for(const failure of ['before','after']){
    const f=fixture(),admission=f.make();await admission.load();(layer==='journal'?f.store:f.floor).fail=failure;
    await assert.rejects(admission.installPolicy(f.signedPolicy()));assert.equal(admission.status,'unavailable');await assert.rejects(admission.controllerPolicy());
    f.store.fail='';f.floor.fail='';const restored=f.make();await restored.load();
    if(layer==='journal'&&failure==='before')assert.equal(restored.status,'unloaded');
    else assert.equal((await restored.controllerPolicy()).authorized,true);
  }
});

test('floor unavailability/reversal, trusted clock loss/reversal and policy expiry deny recovery',async()=>{
  const f=fixture(),admission=await f.ready();f.floor.values.set([...f.floor.values.keys()][0],0);
  await assert.rejects(admission.controllerPolicy(),/floor/);assert.equal(admission.status,'unavailable');
  for(const mode of ['wall-missing','mono-reversed','expired']){
    const q=fixture(),a=await q.ready();if(mode==='wall-missing')q.clock.wall=undefined;if(mode==='mono-reversed')q.clock.mono=999;if(mode==='expired')q.clock.wall=1100000;
    await assert.rejects(a.challenge());assert.equal(a.status,'blocked');
  }
});

test('new signed policy can revoke this node or disallow its radio profile without retaining older authority',async()=>{
  const f=fixture(),admission=await f.ready();const next=f.signedPolicy({policyRevision:2,nodes:f.nodes.slice(0,2),maxDepth:1});
  assert.equal((await admission.installPolicy(next)).localAuthorized,false);assert.equal(admission.status,'blocked');await assert.rejects(admission.controllerPolicy());
  await assert.rejects(admission.installPolicy(f.signedPolicy()),/rolled-back/);
  const q=fixture(),a=await q.ready();assert.equal((await a.installPolicy(q.signedPolicy({policyRevision:2,radioProfileSha256:'c'.repeat(64)}))).localAuthorized,false);
});

test('every path node signs the fresh observer-bound root/boot/generation/policy proof using pinned P256 keys',async()=>{
  const f=fixture(),admission=await f.ready(),challenge=await admission.challenge(),signed=f.proof(challenge),body=decodeRelayRootProof(Buffer.from(signed.bodyHex,'hex'));
  assert.equal(Buffer.from(signed.bodyHex,'hex').length,320);assert.deepEqual(body.path,[A,B]);
  const observation=await admission.verifyRootProof(signed,B);assert.equal(observation.authenticated,true);assert.equal(observation.root,A);assert.equal(observation.node,B);
  assert.equal(observation.priority,2);assert.equal(observation.rootPriority,1);assert.equal(observation.eligibleRoot,false);
  assert.equal(await admission.observationForController(observation),observation);
  await assert.rejects(admission.observationForController({...observation,authenticated:true}),/Raw/);
  assert.throws(()=>observation.path.push(C));assert.ok(JSON.parse(f.store.raw).nodes.length);
});

test('advertiser-only signatures, reordered signers, invalid chain signatures and raw authenticated flags reject',async()=>{
  const f=fixture(),admission=await f.ready();let c=await admission.challenge(),proof=f.proof(c);
  await assert.rejects(admission.verifyRootProof({...proof,signatures:proof.signatures.slice(1)},B),/Every/);
  await assert.rejects(admission.verifyRootProof({...proof,signatures:[...proof.signatures].reverse()},B),/signer/);
  await assert.rejects(admission.verifyRootProof({...proof,authenticated:true},B),/Unexpected/);
  proof.signatures[0].signatureDerHex=proof.signatures[1].signatureDerHex;
  await assert.rejects(admission.verifyRootProof(proof,B),/endorsement/);
  await assert.rejects(admission.verifyRootProof(f.proof(c),B),/consumed/);
});

test('wrong observer/policy/neighbor, missing/expired challenges, path loops and noncanonical proof bytes reject',async()=>{
  const f=fixture(),admission=await f.ready(),c=await admission.challenge();
  for(const changes of [{observerId:'4'.repeat(32)},{policySha256:'5'.repeat(64)},{epoch:2},{policyRevision:2},{challengeNonce:'6'.repeat(64)}])
    await assert.rejects(admission.verifyRootProof(f.proof(c,changes),B));
  await assert.rejects(admission.verifyRootProof(f.proof(c),A),/neighbour/);
  assert.throws(()=>f.proof(c,{path:[A,A]}),/path/);assert.throws(()=>f.proof(c,{path:[A,C]}),/path/);
  const proof=f.proof(c),bytes=Buffer.from(proof.bodyHex,'hex');bytes[200]=1;
  assert.throws(()=>parseSignedRelayRootProof({...proof,bodyHex:bytes.toString('hex')}),/canonical/);
  f.clock.mono=c.expiresAtMonotonicMs;f.clock.wall+=5000;
  await assert.rejects(admission.verifyRootProof(f.proof(c),B),/expired/);
});

test('ineligible root and unknown path membership reject despite otherwise valid signatures',async()=>{
  const f=fixture(),admission=await f.ready();let c=await admission.challenge();
  await assert.rejects(admission.verifyRootProof(f.proof(c,{rootId:B,rootBootNonce:'e'.repeat(32),path:[B]}),B),/ineligible/);
  c=await admission.challenge();
  await assert.rejects(admission.verifyRootProof(f.proof(c,{path:[A,'4'.repeat(32)]}),'4'.repeat(32)),/Unknown/);
});

test('root boot/generation fences invalidate older branch views, and no node can inflate policy priority',async()=>{
  const f=fixture(),admission=await f.ready();let c=await admission.challenge();const old=await admission.verifyRootProof(f.proof(c),B);
  c=await admission.challenge();const root=await admission.verifyRootProof(f.proof(c,{path:[A],rootGeneration:2,rootBootNonce:'f'.repeat(32),advertiserBootNonce:'f'.repeat(32),advertiserGeneration:2}),A);
  assert.equal(root.rootPriority,1);await assert.rejects(admission.observationForController(old),/superseded/);
  c=await admission.challenge();await assert.rejects(admission.verifyRootProof(f.proof(c,{sequence:2}),B),/Root boot/);
  c=await admission.challenge();await assert.rejects(admission.verifyRootProof(f.proof(c,{sequence:2,rootGeneration:2,rootBootNonce:'a'.repeat(32)}),B),/Root boot/);
});

test('advertiser reboot normalizes controller sequence and persists raw replay high-water across reload',async()=>{
  const f=fixture(),admission=await f.ready();let c=await admission.challenge();const first=await admission.verifyRootProof(f.proof(c,{sequence:100}),B);
  c=await admission.challenge();const second=await admission.verifyRootProof(f.proof(c,{sequence:1,advertiserGeneration:2,advertiserBootNonce:'a'.repeat(32)}),B);
  assert.ok(second.sequence>first.sequence);const reloaded=f.make();await reloaded.load();c=await reloaded.challenge();
  await assert.rejects(reloaded.verifyRootProof(f.proof(c,{sequence:101}),B),/Advertiser/);
  c=await reloaded.challenge();await assert.rejects(reloaded.verifyRootProof(f.proof(c,{sequence:2,advertiserGeneration:2,advertiserBootNonce:'b'.repeat(32)}),B),/Advertiser/);
  c=await reloaded.challenge();assert.equal((await reloaded.verifyRootProof(f.proof(c,{sequence:2,advertiserGeneration:2,advertiserBootNonce:'a'.repeat(32)}),B)).sequence,second.sequence+1);
});

test('consumed nonce, observation freshness and bounded outstanding challenge capacity cannot be bypassed',async()=>{
  const f=fixture(),admission=await f.ready(),c=await admission.challenge(),proof=f.proof(c),observation=await admission.verifyRootProof(proof,B);
  await assert.rejects(admission.verifyRootProof(proof,B),/consumed/);
  for(let i=0;i<8;i++)await admission.challenge();await assert.rejects(admission.challenge(),/capacity/);
  f.clock.mono=observation.validUntilMonotonicMs;f.clock.wall+=5000;await assert.rejects(admission.observationForController(observation),/stale/);
  await admission.challenge();
});

test('uncertain proof commit returns no usable observation; durable counter rejects replay after authoritative restore',async()=>{
  const f=fixture(),admission=await f.ready(),c=await admission.challenge(),proof=f.proof(c);f.store.fail='after';
  await assert.rejects(admission.verifyRootProof(proof,B),/acknowledgement/);assert.equal(admission.status,'unavailable');await assert.rejects(admission.observationForController({authenticated:true}));
  f.store.fail='';const restored=f.make();await restored.load();const next=await restored.challenge();await assert.rejects(restored.verifyRootProof(f.proof(next),B),/replay/);
});

test('proof verification that outlives challenge produces no controller authorization',async()=>{
  const f=fixture(),admission=await f.ready(),c=await admission.challenge(),base=f.crypto.verifyP256;
  f.crypto.verifyP256=async(...args)=>{const result=await base(...args);if(args[0]!==f.ownerPin){f.clock.mono+=5000;f.clock.wall+=5000;}return result;};
  await assert.rejects(admission.verifyRootProof(f.proof(c),B),/expired/);
});

test('stored replay journal and local boot cannot be rolled back or substituted after load',async()=>{
  const f=fixture(),admission=await f.ready(),c=await admission.challenge();await admission.verifyRootProof(f.proof(c),B);
  const changed=f.make(f.store,{...f.trust,selfBootNonce:'f'.repeat(32)});await assert.rejects(changed.load(),/Local boot/);
  const nextBoot=f.make(f.store,{...f.trust,selfRootGeneration:2,selfBootNonce:'f'.repeat(32)});await nextBoot.load();assert.equal((await nextBoot.controllerPolicy()).selfRootGeneration,2);
  await assert.rejects(admission.controllerPolicy(),/journal changed/);
});

test('eight admitted nodes and seven endorsed path hops are bounded contract capacity, not hardware proof',async()=>{
  const f=fixture(8),admission=await f.ready(),c=await admission.challenge(),path=f.nodes.slice(0,7).map(n=>n.nodeId);
  const observation=await admission.verifyRootProof(f.proof(c,{path}),path.at(-1));assert.equal(observation.path.length,7);
  assert.throws(()=>f.proof(c,{path:f.nodes.map(n=>n.nodeId)}),/path/);
});

test('signed retention modes require trusted first admission and strict restores require current wall time',async()=>{
  for(const retention of ['expires','durable-until-replaced']){
    const f=fixture(),admission=f.make();await admission.load();f.clock.wall=undefined;
    await assert.rejects(admission.installPolicy(f.signedPolicy({retention})),/clocks/);assert.equal(f.store.raw,null);assert.equal(f.floor.values.size,0);
  }
  const f=fixture();await f.ready();f.clock.wall=undefined;const restored=f.make();
  await assert.rejects(restored.load(),/clocks/);await assert.rejects(restored.controllerPolicy());
});

test('explicit durable policy restores offline after reboot and still needs fresh endorsed replay-fenced challenges',async()=>{
  const f=fixture(),first=await f.ready({retention:'durable-until-replaced'});
  const previousChallenge=await first.challenge(),oldProof=f.proof(previousChallenge);
  await first.verifyRootProof(oldProof,B);
  f.clock.wall=undefined;f.clock.mono=0;
  const restored=f.make(f.store,{...f.trust,selfBootNonce:'9'.repeat(32),selfRootGeneration:2});await restored.load();
  assert.equal((await restored.controllerPolicy()).validUntilMs,Number.MAX_SAFE_INTEGER);
  await assert.rejects(restored.verifyRootProof(oldProof,B),/challenge/);
  const challenge=await restored.challenge();assert.notEqual(challenge.nonce,previousChallenge.nonce);
  await assert.rejects(restored.verifyRootProof(f.proof(challenge),B),/replay/);
  const view=await restored.verifyRootProof(f.proof(await restored.challenge(),{sequence:2}),B);
  assert.equal((await restored.observationForController(view)).authenticated,true);
  f.clock.wall=999999999;assert.equal((await restored.controllerPolicy()).authorized,true);
  f.clock.mono=6000;await assert.rejects(restored.observationForController(view),/stale/);
});

test('retention is owner-signed and switching modes requires a higher signed revision with fresh admission time',async()=>{
  const f=fixture(),admission=await f.ready(),strict=f.signedPolicy();
  const tampered={...strict,bodyHex:Buffer.from(encodeRelayRecoveryPolicy(f.policy({retention:'durable-until-replaced'}))).toString('hex')};
  await assert.rejects(admission.installPolicy(tampered),/signature/);
  await assert.rejects(admission.installPolicy(f.signedPolicy({retention:'durable-until-replaced'})),/immutable/);
  await admission.installPolicy(f.signedPolicy({retention:'durable-until-replaced',policyRevision:2}));
  f.clock.wall=undefined;await assert.rejects(admission.installPolicy(f.signedPolicy({policyRevision:3})),/clocks/);
  f.clock.wall=1000001;await admission.installPolicy(f.signedPolicy({policyRevision:3}));
  f.clock.wall=1100000;await assert.rejects(admission.controllerPolicy(),/expired/);
});

test('durable restore rejects hash changes, rollback floors, lost journals and unconfirmed boot readback',async()=>{
  const f=fixture(),first=await f.ready({retention:'durable-until-replaced'}),saved=f.store.raw;
  const bad=JSON.parse(saved);bad.policySha256='f'.repeat(64);
  await assert.rejects(f.make(storage(JSON.stringify(bad))).load(),/hash/);
  const scope=[...f.floor.values.keys()][0];f.floor.values.set(scope,0);
  await assert.rejects(first.controllerPolicy(),/floor/);f.floor.values.set(scope,1);
  const missing=f.make(storage());await missing.load();await assert.rejects(missing.installPolicy(f.signedPolicy({retention:'durable-until-replaced'})),/newer/);
  const stale=f.make(f.store,{...f.trust,minimumPolicyRevision:2});await assert.rejects(stale.load(),/rollback/);
  f.clock.wall=undefined;f.store.fail='after';
  const uncertain=f.make(f.store,{...f.trust,selfRootGeneration:2,selfBootNonce:'9'.repeat(32)});
  await assert.rejects(uncertain.load(),/uncertain|lost/);await assert.rejects(uncertain.controllerPolicy());
  f.store.fail='';const recovered=f.make(f.store,{...f.trust,selfRootGeneration:2,selfBootNonce:'9'.repeat(32)});await recovered.load();
  assert.equal((await recovered.controllerPolicy()).authorized,true);
});
