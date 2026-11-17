// Synthetic bridge/manifest boundaries. Real JPEG preparation and native transfer
// have separate browser, native-worker and physical-device checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {NativeGroupMessagesClient} from '../packages/core/dist/index.js';
import {parseGroupMessageRecord,GROUP_MESSAGE_IMAGE_BYTES as MAX,GROUP_MESSAGE_IMAGE_EDGE as EDGE,GROUP_MESSAGE_IMAGE_BASE64 as BASE64} from '../packages/protocol/dist/index.js';
const self='A'.repeat(64),peer='B'.repeat(64),id='c'.repeat(32),scope={groupId:'d'.repeat(32),selfId:self,epoch:1};
const hash=value=>createHash('sha256').update(value).digest('hex').toUpperCase();
function fixture(size=MAX){
  const bytes=Buffer.alloc(size,19),sha=hash(bytes),prepared={dataBase64:bytes.toString('base64'),mimeType:'image/jpeg',width:EDGE,height:1,byteLength:size,sha256:sha};
  let row,calls=0;
  const snapshot=()=>({schema:'aumanet.group-messages.v1',source:'device',processId:'12345678-1234-1234-1234-123456789abc',sequence:1,observedElapsedMs:1,storeRevision:row?2:1,storeReady:true,connected:true,canSend:true,canSendImage:true,deliveryPaused:false,textByteLimit:2048,clockUncertain:false,scope,draft:'keep this draft',history:[],outbox:row?[row]:[],error:''});
  const bridge={snapshot:async()=>snapshot(),lookup:async options=>({schema:'aumanet.group-message-lookup.v1',source:'device',...scope,id:options.id,found:!!row,retired:false,cancelled:false,...(row?{textSha256:hash('\0'+sha),membershipEpoch:1,record:row}:{})}),
    sendImage:async options=>{calls++;row={id,senderId:self,text:'',kind:'image',image:{mimeType:'image/jpeg',width:options.width,height:options.height,byteLength:size,sha256:sha,sourceSha256:sha,state:'available',receivedBytes:size,totalBytes:size},createdAt:1000,storedAt:1000,expiresAt:86401000,membershipEpoch:1,recipients:[peer],acknowledgedBy:[],attempts:0,lastAttemptAt:0,state:'queued',error:'',retryable:true,nextRetryAt:1000,attemptLimit:5};return snapshot();},
    readImage:async options=>({schema:'aumanet.group-image.v1',source:'device',...options,mimeType:'image/jpeg',sha256:sha,dataBase64:prepared.dataBase64})};
  const client=new NativeGroupMessagesClient(bridge,()=>id);client.setScope(scope);
  return {client,prepared,get row(){return row;},get calls(){return calls;}};
}
test('one-MiB image at the dimension cap survives send, durable reconciliation and verified read',async()=>{
  assert.equal(MAX,1048576);assert.equal(EDGE,2048);assert.equal(BASE64,1398104);
  const f=fixture();await f.client.refresh();await f.client.sendImage(f.prepared);assert.equal(f.calls,1);
  assert.equal(parseGroupMessageRecord(f.row).image.byteLength,MAX);
  const read=await f.client.readImage(f.row);assert.equal(read.bytes.length,MAX);assert.equal(read.sha256,f.prepared.sha256);
  assert.equal(f.client.state.draft,'keep this draft');
});
test('payload, encoding and dimension overflow are rejected before any native send',async()=>{
  for(const patch of [{byteLength:MAX+1},{dataBase64:'A'.repeat(BASE64+1)},{width:EDGE+1},{height:EDGE+1}]){
    const f=fixture(4);await f.client.refresh();await assert.rejects(f.client.sendImage({...f.prepared,...patch}));assert.equal(f.calls,0);
  }
});
test('received manifests accept above-old-limit sizes and reject new-limit overflow',async()=>{
  const f=fixture(300000);await f.client.refresh();await f.client.sendImage(f.prepared);assert.equal(parseGroupMessageRecord(f.row).image.byteLength,300000);
  for(const patch of [{byteLength:MAX+1,receivedBytes:MAX+1,totalBytes:MAX+1},{width:EDGE+1},{height:EDGE+1}])assert.throws(()=>parseGroupMessageRecord({...f.row,image:{...f.row.image,...patch}}));
});
