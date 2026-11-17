// Native observation boundary only; cryptographic verification is tested in Java.
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGroupMessageRecord} from '../packages/protocol/dist/index.js';
const record=()=>({id:'a'.repeat(32),senderId:'AA'.repeat(32),text:'Context check',kind:'text',createdAt:20000,storedAt:21000,expiresAt:86420000,membershipEpoch:1,recipients:['BB'.repeat(32)],acknowledgedBy:[],attempts:1,lastAttemptAt:20000,state:'unconfirmed',error:'',retryable:true});
const context=()=>({sentAt:20000,verified:true,location:{latitude:-33,longitude:151,accuracyMeters:8,capturedAt:19000,ageAtSendMs:1000}});
test('legacy messages remain readable without inventing signal or location',()=>{
  const row=parseGroupMessageRecord(record());assert.equal(row.sentContext,undefined);assert.equal(row.radioQuality,undefined);
});
test('bounded native-verified context preserves send location independently of current map',()=>{
  const raw=record();raw.sentContext=context();const row=parseGroupMessageRecord(raw);assert.deepEqual(row.sentContext,raw.sentContext);raw.sentContext.location.latitude=0;assert.equal(row.sentContext.location.latitude,-33);
});
test('verified timestamp may exist without a shared fix',()=>{
  const raw=record();raw.sentContext={sentAt:20000,verified:true};assert.deepEqual(parseGroupMessageRecord(raw).sentContext,raw.sentContext);
});
test('reject unverified, mismatched, stale or invalid context observations',()=>{
  const invalid=[{verified:false},{sentAt:19999},{location:null},{location:{...context().location,latitude:91}},{location:{...context().location,longitude:181}},{location:{...context().location,accuracyMeters:NaN}},{location:{...context().location,accuracyMeters:-1}},{location:{...context().location,accuracyMeters:100001}},{location:{...context().location,ageAtSendMs:15001}},{location:{...context().location,ageAtSendMs:1.5}},{location:{...context().location,capturedAt:0}}];
  for(const patch of invalid){const raw=record();raw.sentContext={...context(),...patch};assert.throws(()=>parseGroupMessageRecord(raw),/Invalid|Expected/);}
});
