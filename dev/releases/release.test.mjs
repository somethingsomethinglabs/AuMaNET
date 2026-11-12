import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createPublicKey,sign,createHash} from 'node:crypto';
import {TRUST,PROFILE_SHA,CHANNELS,sha,encodeArtifact,decodeArtifact,inspectImage,createRelease,verifyRelease,verifyPackage,createCatalog,verifyCatalog,canonicalBase64,validateImageUrl} from './lib.mjs';
import {releasePlan,resolveRequestedCommit,verifyPlannedEnvironment} from './plan.mjs';
import {fetchPrevious} from './fetch-catalog.mjs';
import './find-build.test.mjs';

const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),privatePem=pair.privateKey.export({type:'pkcs8',format:'pem'}),spki=createPublicKey(pair.privateKey).export({type:'spki',format:'der'});
const trust={...TRUST,keyId:sha(spki),spkiBase64:spki.toString('base64')},now=1794460000;
function writeAscii(b,o,s,v){b.fill(0,o,o+s);b.write(v,o,s-1,'ascii');}
function rehash(b){let at=24,xor=0xef;for(let n=0;n<b[1];n++){const length=b.readUInt32LE(at+4);at+=8;for(const byte of b.subarray(at,at+length))xor^=byte;at+=length;}const check=Math.floor(at/16)*16+15;b[check]=xor;createHash('sha256').update(b.subarray(0,check+1)).digest().copy(b,check+1);return b;}
function imageFixture(overrides={}){
 const m={role:'A',channel:'nightly',dirtySource:true,privateBootstrap:false,version:'0.7.0-nightly.test',commit:'c'.repeat(40),gitRef:'refs/heads/test',buildId:'fixture-source-tree',...overrides},b=Buffer.alloc(1104);
 b[0]=0xe9;b[1]=1;b[3]=0x3f;b.writeUInt32LE(0x40370000,4);b.writeUInt16LE(9,12);b[23]=1;b.writeUInt32LE(0x3c020000,24);b.writeUInt32LE(1024,28);b.writeUInt32LE(0xabcd5432,32);writeAscii(b,48,32,m.version);writeAscii(b,80,32,'aumanet_bench');
 const at=0x120;Buffer.from('41554d4244310000','hex').copy(b,at);b[at+8]=m.role==='A'?1:2;b[at+9]=1;b.write('AU',at+10);b[at+12]=24;b[at+13]=m.privateBootstrap?1:0;b[at+14]=CHANNELS.indexOf(m.channel);b[at+15]=m.dirtySource?1:0;writeAscii(b,at+16,32,m.version);Buffer.from(m.commit,'hex').copy(b,at+48);writeAscii(b,at+68,128,m.gitRef);writeAscii(b,at+196,64,m.buildId);Buffer.from(PROFILE_SHA,'hex').copy(b,at+260);return rehash(b);
}
function releaseFor(image=imageFixture(),sequence=1){return createRelease(image,{sequence,issuedUnixSeconds:now,imageUrl:`https://github.com/example/repo/releases/download/test/${sequence}.bin`,notes:'Test release'},privatePem,trust);}
function signedRelease(body){return {manifest:body.toString('base64'),signature:sign('sha256',Buffer.concat([Buffer.from(trust.artifactDomain),body]),pair.privateKey).toString('base64'),imageUrl:'https://github.com/example/repo/releases/download/test/A.bin',notes:'Test only',sourceStatus:body.readUInt16BE(38)?'dirty':'clean'};}
function catalog(releases=[releaseFor()],options={}){return createCatalog(releases,{sequence:4,issuedAt:now,expiresAt:now+3600,...options},privatePem,trust);}

test('publisher artifact signature, embedded identity and complete image round trip',()=>{
 const image=imageFixture(),release=releaseFor(image),parsed=verifyPackage(release,image,trust);assert.equal(parsed.role,'A');assert.equal(parsed.imageSha256,sha(image));assert.equal(parsed.boardProfileSha256,PROFILE_SHA);assert.equal(parsed.channel,'nightly');assert.equal(parsed.dirtySource,true);assert.equal(parsed.artifactId,sha(Buffer.from(release.manifest,'base64')));
 assert.throws(()=>verifyRelease(release,TRUST),/signature|publisher/i);
});
test('filename/caller cannot relabel a role; manifest/image mismatch rejects before publication',()=>{
 const image=imageFixture(),identity=inspectImage(image),wrong=encodeArtifact({...identity,role:'B',sequence:1,issuedUnixSeconds:now},trust);assert.throws(()=>verifyPackage(signedRelease(wrong),image,trust),/role mismatch/);
});
test('separate publisher key cannot be replaced by an owner signing key',()=>{
 const owner=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey.export({type:'pkcs8',format:'pem'});assert.throws(()=>createRelease(imageFixture(),{sequence:1,issuedUnixSeconds:now,imageUrl:'https://github.com/a/b/releases/download/c/A.bin'},owner,trust),/Signing key/);
});
test('private credential bootstrap is never a publishable release',()=>{
 const image=imageFixture({privateBootstrap:true});assert.equal(inspectImage(image,{allowPrivateBootstrap:true}).privateBootstrap,true);assert.throws(()=>releaseFor(image),/Private bootstrap/);
});
test('dirty source cannot be labelled stable or beta, while clean stable is supported',()=>{
 for(const channel of ['stable','beta'])assert.throws(()=>releaseFor(imageFixture({channel,dirtySource:true})),/Dirty/);assert.equal(verifyRelease(releaseFor(imageFixture({channel:'stable',dirtySource:false})),trust).sourceStatus,'clean');
});
test('corrupt ESP checksum, appended digest, header and custom build identity reject',()=>{
 const image=imageFixture();for(const offset of [0,1000,1103]){const changed=Buffer.from(image);changed[offset]^=1;assert.throws(()=>inspectImage(changed));}
 const role=Buffer.from(image);role[0x120+8]=3;rehash(role);assert.throws(()=>inspectImage(role),/board\/role/);
 const version=Buffer.from(image);version[48]=0x31;rehash(version);assert.throws(()=>inspectImage(version),/version mismatch/);
 const profile=Buffer.from(image);profile[0x120+260]^=1;rehash(profile);assert.throws(()=>inspectImage(profile),/profile mismatch/);
});
test('embedded descriptor and OTA size bounds are enforced independently of manifest',()=>{
 const image=imageFixture(),missing=Buffer.from(image);missing[0x120]=0;rehash(missing);assert.throws(()=>inspectImage(missing),/build identity/);assert.throws(()=>inspectImage(Buffer.alloc(2359297)),/size bounds/);assert.throws(()=>inspectImage(image.subarray(0,579)),/size bounds/);
});
test('signed but incompatible descriptor cannot bypass role/layout/radio/size policy',()=>{
 const original=Buffer.from(releaseFor().manifest,'base64');
 for(const [offset,value] of [[12,3],[13,4],[15,2],[37,2],[39,2],[380,0x4e],[382,25],[383,1]]){const body=Buffer.from(original);body[offset]=value;assert.throws(()=>verifyRelease(signedRelease(body),trust));}
 const large=Buffer.from(original);large.writeUInt32BE(2359297,16);assert.throws(()=>verifyRelease(signedRelease(large),trust),/image size/);
 const unsafe=Buffer.from(original);unsafe.writeBigUInt64BE(1n<<63n,20);assert.throws(()=>verifyRelease(signedRelease(unsafe),trust),/Unsafe/);
});
test('noncanonical padded strings, refs, base64 and DER are rejected',()=>{
 const body=Buffer.from(releaseFor().manifest,'base64');body[124+31]=1;assert.throws(()=>decodeArtifact(body,trust),/padded/);
 const image=imageFixture({gitRef:'refs/heads/../evil'});assert.throws(()=>releaseFor(image),/Git ref/);
 for(const value of ['YQ','YQ==\n','YR==','YQ===',' YQ=='])assert.throws(()=>canonicalBase64(value,10));
 const release=releaseFor();release.signature=Buffer.concat([Buffer.from(release.signature,'base64'),Buffer.from([0])]).toString('base64');assert.throws(()=>verifyRelease(release,trust),/signature|DER/);
});
test('catalog signature binds URLs, notes, release channel and immutable build identity',()=>{
 const envelope=catalog(),parsed=verifyCatalog(envelope,{now,trust});assert.equal(parsed.entries[0].version,'0.7.0-nightly.test');const modified={...envelope},payload=JSON.parse(Buffer.from(modified.payload,'base64'));payload.releases[0].notes='Changed after signing';modified.payload=Buffer.from(JSON.stringify(payload)).toString('base64');assert.throws(()=>verifyCatalog(modified,{now,trust}),/signature/);
});
test('catalog replay, expiry and future timestamps fail; signed empty catalog is explicit',()=>{
 const envelope=catalog();assert.throws(()=>verifyCatalog(envelope,{now,minimumSequence:5,trust}),/sequence replay/);assert.throws(()=>verifyCatalog(envelope,{now:now+3600,trust}),/Expired/);assert.throws(()=>verifyCatalog(catalog([],{issuedAt:now+301,expiresAt:now+3600}),{now,trust}),/future/);assert.deepEqual(verifyCatalog(catalog([]),{now,trust}).entries,[]);
});
test('catalog bounds, duplicates, unsupported fields and provenance mismatch fail',()=>{
 const release=releaseFor();assert.throws(()=>catalog([release,release]),/Duplicate/);assert.throws(()=>catalog([],{expiresAt:now+604801}),/Expired/);assert.throws(()=>verifyRelease({...release,sourceStatus:'clean'},trust),/provenance/);assert.throws(()=>verifyRelease({...release,extra:'untrusted'},trust),/Unknown/);const longBuild=imageFixture();longBuild.fill(0x78,0x120+196,0x120+260);rehash(longBuild);assert.throws(()=>releaseFor(longBuild),/padded|build/);
 const bad={...release,notes:'😀'.repeat(513)};assert.throws(()=>verifyRelease(bad,trust),/notes/);assert.throws(()=>verifyCatalog({...catalog(),extra:1},{now,trust}),/envelope/);
});
test('image destinations cannot use plaintext, credentials, local files or deceptive hosts',()=>{
 for(const url of ['http://github.com/a','file:///C:/secret','https://github.com.evil.test/a','https://127.0.0.1/a','https://user:pass@github.com/a','https://github.com:8080/a'])assert.throws(()=>validateImageUrl(url));assert.equal(validateImageUrl('https://github.com/a/b/releases/download/v/A.bin'),'https://github.com/a/b/releases/download/v/A.bin');
});
test('byte tampering after verified download cannot produce an installable package',()=>{
 const image=imageFixture(),release=releaseFor(image),changed=Buffer.from(image);changed[1001]^=1;rehash(changed);assert.throws(()=>verifyPackage(release,changed,trust),/imageSha256 mismatch/);
});
test('nightly/beta/stable and branch plans resolve immutable versions rather than branch URLs',()=>{
 const args={commit:'a'.repeat(40),now:new Date('2026-11-12T00:00:00Z'),runId:'123',attempt:'1'};
 const nightly=releasePlan(args);assert.equal(nightly.channel,'nightly');assert.equal(nightly.version,'0.7.0-nightly.20261112.aaaaaaa');assert.equal(nightly.ref,'refs/heads/main');
 assert.equal(releasePlan({...args,event:'push',ref:'refs/tags/v0.7.0'}).channel,'stable');assert.equal(releasePlan({...args,event:'push',ref:'refs/tags/v0.7.0-beta.2'}).channel,'beta');assert.equal(releasePlan({...args,channel:'branch',ref:'codex/update-test'}).version,'0.7.0-dev.aaaaaaa');
});
test('release plans reject unsafe refs, ambiguous channels and overlong/incompatible versions',()=>{
 const args={commit:'b'.repeat(40)};for(const ref of ['--upload','bad\nref','refs/heads/../main','bad.lock','c'.repeat(40)])assert.throws(()=>releasePlan({...args,ref}));
 assert.throws(()=>releasePlan({...args,channel:'stable'}));assert.throws(()=>releasePlan({...args,channel:'stable',version:'0.7.0-beta.2'}));assert.throws(()=>releasePlan({...args,event:'push',ref:'refs/heads/main'}));assert.throws(()=>releasePlan({...args,channel:'branch',ref:'refs/tags/v0.7.0'}));
});
test('publisher notes match native control-character policy and allow ordinary multiline notes',()=>{
 const release=releaseFor();for(const value of ['bad\u0000note','escape\u001b','delete\u007f'])assert.throws(()=>verifyRelease({...release,notes:value},trust),/notes/);assert.equal(verifyRelease({...release,notes:'First line\nSecond\ttab\r\n'},trust).notes,'First line\nSecond\ttab\r\n');
});
test('zero image digest or commit is incompatible even with a valid publisher signature',()=>{
 const body=Buffer.from(releaseFor().manifest,'base64');for(const [at,size] of [[40,32],[72,20]]){const changed=Buffer.from(body);changed.fill(0,at,at+size);assert.throws(()=>verifyRelease(signedRelease(changed),trust),/nonzero/);}
});
test('trusted planner resolves only exact requested remote refs without executing target code',()=>{
 let called;const commit=resolveRequestedCommit('codex/updates',args=>{called=args;return 'a'.repeat(40)+'\trefs/heads/codex/updates\n';});assert.equal(commit,'a'.repeat(40));assert.deepEqual(called,['ls-remote','--exit-code','origin','refs/heads/codex/updates','refs/heads/codex/updates^{}']);
 assert.equal(resolveRequestedCommit('refs/tags/v0.7.0',()=> 'a'.repeat(40)+'\trefs/tags/v0.7.0\n'+'b'.repeat(40)+'\trefs/tags/v0.7.0^{}\n'),'b'.repeat(40));assert.throws(()=>resolveRequestedCommit('main',()=> 'a'.repeat(40)+'\trefs/heads/other\n'),/did not resolve/);
});
test('publish independently enforces original requested channel/ref/build identity',()=>{
 const date=new Date('2026-11-12T00:00:00Z'),p=releasePlan({commit:'a'.repeat(40),runId:'123',now:date}),env={PLAN_ISSUED_AT:String(p.issuedAt),PLAN_COMMIT:p.commit,RELEASE_COMMIT:p.commit,RELEASE_CHANNEL:p.channel,RELEASE_VERSION:p.version,RELEASE_REF:p.ref,RELEASE_BUILD_ID:p.buildId,RELEASE_TAG:p.tag,REQUESTED_REF:'main',REQUESTED_CHANNEL:'nightly',GITHUB_RUN_ID:'123'};assert.equal(verifyPlannedEnvironment(env,date).commit,p.commit);
 for(const [key,value] of [['RELEASE_CHANNEL','stable'],['RELEASE_VERSION','0.7.0'],['RELEASE_REF','refs/heads/other'],['RELEASE_BUILD_ID','forged'],['RELEASE_COMMIT','b'.repeat(40)]])assert.throws(()=>verifyPlannedEnvironment({...env,[key]:value},date),/differs/);
 assert.throws(()=>verifyPlannedEnvironment({...env,PLAN_ISSUED_AT:String(p.issuedAt-7201)},date),/Expired/);assert.throws(()=>releasePlan({commit:p.commit,channel:'branch',version:'0.7.0-dev.bbbbbbb'}),/exact date and source/);
});
test('previous catalog initialization requires an actual404, never a generic network/API failure',async()=>{
 assert.equal(await fetchPrevious(async()=>new Response('',{status:404}),{allowMissing:true,trust}),null);await assert.rejects(fetchPrevious(async()=>new Response('',{status:404}),{trust}),/explicitly selected/);for(const status of [401,429,500])await assert.rejects(fetchPrevious(async()=>new Response('',{status}),{allowMissing:true,trust}),/HTTP/);
});
test('publisher preserves expired signed history but rejects tampered or oversized previous catalog',async()=>{
 const original=JSON.stringify(catalog()),url='https://github.com/somethingsomethinglabs/AuMaNET/releases/download/firmware-catalog/catalog.json';let calls=0;
 const network=body=>async(request,options)=>{calls++;if(request.includes('api.github.com')){assert.equal(options.headers.Authorization,'Bearer test-token');return new Response(JSON.stringify({tag_name:'firmware-catalog',assets:[{name:'catalog.json',browser_download_url:url}]}));}assert.equal(options.headers.Authorization,undefined);return new Response(body);};
 assert.equal((await fetchPrevious(network(original),{token:'test-token',trust,now:now+10000000})).toString(),original);assert.equal(calls,2);
 const tampered=JSON.parse(original);tampered.payload=Buffer.from('{}').toString('base64');await assert.rejects(fetchPrevious(network(JSON.stringify(tampered)),{token:'test-token',trust,now}),/signature/);await assert.rejects(fetchPrevious(network(Buffer.alloc(262145)),{token:'test-token',trust,now}),/too large/);
});
