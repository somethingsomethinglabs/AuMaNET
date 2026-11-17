import test from 'node:test';
import assert from 'node:assert/strict';
import {crc32} from 'node:zlib';
import {FLASH_BYTES,verifyBundle,verifyImages,planWrites,checkedWrite,checkPartitionTable,activeSlot,otaCrc,sha} from '../web-installer/policy.mjs';
import {fixture,now,retained,partitions,rehash} from './fixtures/usb-installer.mjs';
import {createRelease,verifyPackage} from '../releases/lib.mjs';
async function prepared(purpose='app-update'){const f=fixture(purpose),bundle=await verifyBundle(f.signed(),f.trust,f.profile,now),images=await verifyImages(bundle,f.files);return {...f,bundle,images};}
test('real publisher P256 signature and every image hash round trip',async()=>{const f=await prepared();assert.equal(f.bundle.purpose,'app-update');assert.equal(f.images.get('application').length,1104);assert(Object.isFrozen(f.bundle.parts[0]));});
test('maintainer release verification supports the generic U image required by the installer',()=>{const f=fixture(),image=f.files.get('application.bin'),release=createRelease(image,{sequence:1,issuedUnixSeconds:now,imageUrl:'https://github.com/example/disposable/releases/download/test/application.bin'},f.privatePem,f.trust);assert.equal(verifyPackage(release,image,f.trust).role,'U');});
test('different publisher, tampered payload, signature and signing domain reject',async()=>{
  const f=fixture(),other=fixture();await assert.rejects(verifyBundle(f.signed(),other.trust,f.profile,now));
  const p=f.signed();p.payload=Buffer.from(JSON.stringify({...f.payload,version:'attacker'})).toString('base64');await assert.rejects(verifyBundle(p,f.trust,f.profile,now));
  await assert.rejects(verifyBundle({...f.signed(),signature:'AAAA'},f.trust,f.profile,now));await assert.rejects(verifyBundle(f.signed(f.payload,'wrong domain'),f.trust,f.profile,now));
});
test('signed incompatible board, purpose, size, profile and unknown fields reject',async()=>{
  const f=fixture();for(const change of [{boardId:2},{chip:'ESP32'},{flashBytes:0x400000},{layoutId:2},{profileSha256:'00'.repeat(32)},{purpose:'erase-all'},{extra:true},{sequence:1.2},{issuedAt:now+301},{expiresAt:now},{expiresAt:now+604801}])await assert.rejects(verifyBundle(f.signed({...f.payload,...change}),f.trust,f.profile,now),JSON.stringify(change));
});
test('signed path traversal, duplicate files and image bounds reject',async()=>{
  const f=fixture();for(const change of [{file:'../image.bin'},{file:'https://evil/image.bin'},{file:'x..bin'},{bytes:0},{bytes:0x240001},{sha256:'xx'}])await assert.rejects(verifyBundle(f.signed({...f.payload,parts:[{...f.payload.parts[0],...change}]}),f.trust,f.profile,now));
});
test('missing, modified and private-bootstrap images reject even with matching package digest',async()=>{
  const f=await prepared();await assert.rejects(verifyImages(f.bundle,new Map()));const changed=Buffer.from(f.files.get('application.bin'));changed[1000]^=1;await assert.rejects(verifyImages(f.bundle,new Map([['application.bin',changed]])));
  changed.set(f.files.get('application.bin'));changed[0x120+13]=1;rehash(changed);const payload={...f.payload,parts:[{...f.payload.parts[0],sha256:await sha(changed)}]};await assert.rejects(verifyImages(payload,new Map([['application.bin',changed]])),/generic universal/);
});
test('blank install requires all eight MiB erased and uses fixed safe offsets',async()=>{
  const f=await prepared('blank-install'),blank=new Uint8Array(FLASH_BYTES).fill(255);assert.deepEqual(planWrites(f.bundle,blank).map(x=>x.address),[0,0x8000,0x10000]);blank[0x9000]=1;assert.throws(()=>planWrites(f.bundle,blank),/not blank/);assert.throws(()=>planWrites(f.bundle,new Uint8Array(1)),/Complete/);
});
test('retained update chooses only confirmed current OTA slot and retains NVS',async()=>{
  const f=await prepared();for(const slot of [0,1])assert.deepEqual(planWrites(f.bundle,retained(slot)),[{kind:'application',address:slot===0?0x310000:0x550000}]);assert.throws(()=>planWrites(f.bundle,new Uint8Array(FLASH_BYTES).fill(255)));
});
test('partition layout flags, extra records and integrity cannot be bypassed',()=>{
  checkPartitionTable(partitions());for(const offset of [0,4,12,28,96,208,224]){const table=partitions();table[offset]^=1;assert.throws(()=>checkPartitionTable(table));}
});
test('boot selection CRC matches zlib reference and pending boots fail closed',()=>{
  for(const seq of [1,2,3,123456]){const b=Buffer.alloc(4);b.writeUInt32LE(seq);assert.equal(otaCrc(b),crc32(b,0xffffffff));}
  const b=retained().subarray(0x790000,0x792000);assert.equal(activeSlot(b),0);b.writeUInt32LE(1,24);assert.throws(()=>activeSlot(b),/Unconfirmed/);b.fill(255);assert.throws(()=>activeSlot(b),/No confirmed/);
});
function adapter(backup){let memory=Buffer.from(backup),calls=0;return {get calls(){return calls;},get memory(){return memory;},async readMac(){return '1cdbd47539c0';},async readFlash(at,n){return Uint8Array.from(memory.subarray(at,at+n));},async writeFlash(options){calls++;assert.equal(options.eraseAll,false);assert.equal(options.flashSize,'keep');assert.equal(options.flashMode,'keep');for(const part of options.fileArray)memory.set(part.data,part.address);}};}
test('real checked mutation boundary writes one app and verifies protected regions',async()=>{
  const f=await prepared(),backup=retained(),loader=adapter(backup);await checkedWrite({clock:()=>now,loader,bundle:f.bundle,images:f.images,backup,mac:'1cdbd47539c0',expectedMac:'1cdbd47539c0'});assert.equal(loader.calls,1);assert.deepEqual(loader.memory.subarray(0x9000,0xf000),backup.subarray(0x9000,0xf000));
});
test('wrong node, changed backup and changed images cause zero writes',async()=>{
  const f=await prepared();for(const mode of ['wrong','changed','image']){const backup=retained(),loader=adapter(backup);if(mode==='changed')loader.memory[0x9000]^=1;const images=new Map(f.images);if(mode==='image'){const b=images.get('application').slice();b[999]^=1;images.set('application',b);}await assert.rejects(checkedWrite({clock:()=>now,loader,bundle:f.bundle,images,backup,mac:'1cdbd47539c0',expectedMac:mode==='wrong'?'7ce8b1a777ec':'1cdbd47539c0'}));assert.equal(loader.calls,0);}
});
test('unknown write outcome never retries, readback corruption fails',async()=>{
  const f=await prepared(),backup=retained();for(const mode of ['lost','readback','protected']){const loader=adapter(backup),write=loader.writeFlash;let calls=0;loader.writeFlash=async options=>{calls++;await write(options);if(mode==='lost')throw Error('Lost acknowledgement');if(mode==='readback')loader.memory[0x310000]^=1;if(mode==='protected')loader.memory[0x9000]^=1;};await assert.rejects(checkedWrite({clock:()=>now,loader,bundle:f.bundle,images:f.images,backup,mac:'1cdbd47539c0',expectedMac:'1cdbd47539c0'}));assert.equal(calls,1);}
});
test('a package that expires while reviewing or rechecking the backup cannot write',async()=>{
  const f=await prepared(),backup=retained(),loader=adapter(backup);await assert.rejects(checkedWrite({clock:()=>f.bundle.expiresAt,loader,bundle:f.bundle,images:f.images,backup,mac:'1cdbd47539c0',expectedMac:'1cdbd47539c0'}),/expired/);assert.equal(loader.calls,0);
});
