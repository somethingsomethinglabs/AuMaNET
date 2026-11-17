import test from 'node:test';
import assert from 'node:assert/strict';
import {NodeBootstrapChallenge,bootstrapProofBody,parseBootstrapProof} from '../packages/core/dist/node-bootstrap-proof.js';
const hex=value=>Buffer.from(value).toString('hex');
const saved={node:'01'.repeat(16),group:'02'.repeat(16),owner:'03'.repeat(32),phone:'04'.repeat(32),epoch:2,profileDigest:'05'.repeat(32),intentEpoch:3};
async function fixture(){
  const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const der=await crypto.subtle.exportKey('spki',keys.publicKey),pin=hex(await crypto.subtle.digest('SHA-256',der));
  const gate=new NodeBootstrapChallenge(saved,100),state={scope:{...saved},enabled:true,foreground:true,now:101};
  const proof={...saved,schema:'aumanet.node-bootstrap-proof.v1',challenge:gate.challenge,boot:'06'.repeat(16)};
  const sign=async p=>({...p,signature:hex(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keys.privateKey,bootstrapProofBody(p)))});
  return {gate,state,proof:await sign(proof),sign,consume(p){return gate.consume(p,hex(der),pin,()=>state);},der:hex(der),pin};
}
test('real P256 proof accepts once and duplicate callbacks cannot race',async()=>{
  const f=await fixture();assert.deepEqual(await Promise.all([f.consume(f.proof),f.consume(f.proof)]),[true,false]);
});
test('scope binding rejects every wrong target, group, authority, epoch and attachment',async()=>{
  for(const [key,value] of Object.entries(saved)){
    const f=await fixture();const changed={...f.proof,[key]:typeof value==='number'?value+1:'ff'.repeat(value.length/2)};
    assert.equal(await f.consume(await f.sign(changed)),false,key);
  }
});
test('replay, tampering, invalid signature and wrong pin fail closed',async()=>{
  const a=await fixture(),b=await fixture();assert.equal(await b.consume(a.proof),false);
  for(const change of [{boot:'07'.repeat(16)},{signature:'00'.repeat(64)},{challenge:'00'.repeat(32)}]){
    const f=await fixture();assert.equal(await f.consume({...f.proof,...change}),false);
  }
  const f=await fixture();assert.equal(await f.gate.consume(f.proof,f.der,'ff'.repeat(32),()=>f.state),false);
});
test('Stop, background, expired clock, clock rollback, revocation and profile replacement fence proof',async()=>{
  for(const mutate of [f=>f.gate.close(),f=>f.state.enabled=false,f=>f.state.foreground=false,
    f=>f.state.now=10100,f=>f.state.now=99,f=>f.state.scope.epoch++,f=>f.state.scope.intentEpoch++,
    f=>f.state.scope.profileDigest='ff'.repeat(32),f=>f.state.enabled='false',f=>f.state.foreground='true']){
    const f=await fixture();mutate(f);assert.equal(await f.consume(f.proof),false);
  }
});
test('Stop or scope change during asynchronous cryptography fences completion',async()=>{
  for(const mutate of [f=>f.gate.close(),f=>f.state.scope.intentEpoch++]){
    const f=await fixture();const pending=f.consume(f.proof);mutate(f);assert.equal(await pending,false);
  }
});
test('strict bounded wire fields reject extras and unsupported versions',async()=>{
  const f=await fixture();
  for(const change of [{password:'private'},{schema:'aumanet.ble.v1'},{signature:'ff'.repeat(65)},
    {challenge:'0'.repeat(63)},{epoch:1.5},{intentEpoch:Number.MAX_SAFE_INTEGER+1},{node:'AB'.repeat(16)}]){
    assert.throws(()=>parseBootstrapProof({...f.proof,...change}));
  }
  assert.throws(()=>new NodeBootstrapChallenge(saved,Number.MAX_SAFE_INTEGER));
  assert.notEqual(new NodeBootstrapChallenge(saved,100).challenge,f.gate.challenge);
});
