import {parseGroupMessageRecord,parseNativeGroupMessagesSnapshot} from '../packages/protocol/dist/index.js';
// Host contract only: synthetic native replies, no image decoding or devices.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {NativeGroupMessagesClient} from '../packages/core/dist/index.js';

const self='AA'.repeat(32),peer='BB'.repeat(32),scope={groupId:'a'.repeat(32),selfId:self};
const id='c'.repeat(32),text='Reviewed caption';
const hash=value=>createHash('sha256').update(value).digest('hex').toUpperCase();
const bytes=Uint8Array.from([255,216,255,217]),source=hash(bytes);
const image={dataBase64:Buffer.from(bytes).toString('base64'),mimeType:'image/jpeg',width:1,height:1,byteLength:bytes.length,sha256:source,caption:text};
function record(kind){return {id,senderId:self,text,kind,...(kind==='image'?{image:{mimeType:'image/jpeg',width:1,height:1,byteLength:bytes.length,sha256:source,sourceSha256:source,state:'available',receivedBytes:bytes.length,totalBytes:bytes.length}}:{}),
  createdAt:1000,storedAt:1000,expiresAt:86401000,membershipEpoch:1,recipients:[peer],acknowledgedBy:[],attempts:0,lastAttemptAt:0,
  state:'queued',error:'',retryable:true,nextRetryAt:1000,attemptLimit:5};}
function fixture(intended,observed,evidence){
  let committed=false;const sends=[];
  const snapshot=()=>({schema:'aumanet.group-messages.v1',source:'device',processId:'12345678-1234-1234-1234-123456789abc',
    sequence:committed?2:1,observedElapsedMs:committed?2:1,storeRevision:committed?2:1,storeReady:true,connected:true,canSend:true,canSendImage:true,
    deliveryPaused:false,textByteLimit:2048,clockUncertain:false,scope:{...scope,epoch:1},draft:text,history:[],outbox:committed&&evidence==='visible'?[record(observed)]:[],error:''});
  const send=async options=>{sends.push(structuredClone(options));committed=true;return snapshot();};
  const bridge={snapshot:async()=>snapshot(),send,sendImage:send,
    lookup:async options=>({schema:'aumanet.group-message-lookup.v1',source:'device',...scope,id:options.id,found:committed,retired:false,cancelled:false,
      ...(committed?{textSha256:hash(intended==='image'?text+'\0'+source:text),membershipEpoch:1,record:record(observed)}:{})})};
  const client=new NativeGroupMessagesClient(bridge,()=>id);
  client.setScope(scope);
  return {client,sends,send:()=>intended==='image'?client.sendImage(image):client.send()};
}

for(const evidence of ['visible','lookup'])for(const intended of ['text','image']){
  const opposite=intended==='text'?'image':'text';
  test(`${evidence}: ${intended} intent cannot be confirmed by ${opposite} evidence`,async()=>{
    const f=fixture(intended,opposite,evidence);await f.client.refresh();
    await assert.rejects(f.send(),/not confirmed|different saved content|conflict/i);
    assert.equal(f.sends.length,1,'Reconciliation must not resend or create a replacement operation');
    assert.equal(f.sends[0].id,id);
    // A definite conflicting ID may clear local pending tracking; it must still
    // reject the user operation and never manufacture a successful confirmation.
  });
  test(`${evidence}: matching ${intended} evidence confirms the original operation`,async()=>{
    const f=fixture(intended,intended,evidence);await f.client.refresh();await f.send();
    assert.equal(f.sends.length,1);assert.equal(f.client.pendingSend,undefined);
  });
}

test("native retry deadline/failure counters survive strict image parsing without coercion",()=>{const row=record("image");row.image.nextAutoAt=20000;row.image.failureCount=2;const parsed=parseGroupMessageRecord(row);assert.equal(parsed.image.nextAutoAt,20000);assert.equal(parsed.image.failureCount,2);for(const patch of [{nextAutoAt:"20000"},{failureCount:-1},{failureCount:1.5}])assert.throws(()=>parseGroupMessageRecord({...row,image:{...row.image,...patch}}));});

test("benchmark quiescence is distinct from delivery consent and absent flags remain backward compatible",()=>{const raw={schema:"aumanet.group-messages.v1",source:"device",processId:"12345678-1234-1234-1234-123456789abc",sequence:1,observedElapsedMs:1,storeRevision:1,storeReady:true,connected:true,canSend:true,clockUncertain:false,deliveryPaused:false,scope:{...scope,epoch:1},draft:"",history:[],outbox:[],error:""};assert.equal(parseNativeGroupMessagesSnapshot(raw).benchmarkPaused,undefined);const parsed=parseNativeGroupMessagesSnapshot({...raw,benchmarkPaused:true});assert.equal(parsed.benchmarkPaused,true);assert.equal(parsed.deliveryPaused,false);assert.throws(()=>parseNativeGroupMessagesSnapshot({...raw,benchmarkPaused:"true"}));});
