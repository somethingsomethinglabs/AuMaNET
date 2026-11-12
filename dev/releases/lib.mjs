import {readFileSync} from 'node:fs';
import {createHash,createPrivateKey,createPublicKey,sign,verify} from 'node:crypto';

export const FORMAT=JSON.parse(readFileSync(new URL('./format.json',import.meta.url)));
export const TRUST=JSON.parse(readFileSync(new URL('./trust.json',import.meta.url)));
export const PROFILE_BYTES=readFileSync(new URL('./boards/xiao-esp32s3-halow-au.json',import.meta.url));
export const PROFILE_SHA=sha(PROFILE_BYTES);
export const CHANNELS=['stable','beta','nightly','branch'];
const ARTIFACT_DOMAIN=Buffer.from(TRUST.artifactDomain,'utf8');
const CATALOG_DOMAIN=Buffer.from(TRUST.catalogDomain,'utf8');
const CDN_HOSTS=new Set(['github.com','api.github.com','raw.githubusercontent.com','objects.githubusercontent.com','release-assets.githubusercontent.com']);
const MAX_SAFE=Number.MAX_SAFE_INTEGER;
export function sha(bytes){return createHash('sha256').update(bytes).digest('hex');}
function requireThat(value,message){if(!value)throw Error(message);}
function integer(value,min,max,name){requireThat(Number.isSafeInteger(value)&&value>=min&&value<=max,`Invalid ${name}`);return value;}
function hex(value,bytes,name){requireThat(typeof value==='string'&&new RegExp(`^[0-9a-f]{${bytes*2}}$`).test(value),`Invalid ${name}`);return Buffer.from(value,'hex');}
function notesChecked(notes){requireThat(typeof notes==='string'&&Buffer.byteLength(notes)<=2048&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(notes),'Invalid release notes');return notes;}
export function canonicalBase64(value,max,name='base64'){
 requireThat(typeof value==='string'&&value.length<=Math.ceil(max/3)*4&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value),`Invalid ${name}`);
 const bytes=Buffer.from(value,'base64');requireThat(bytes.length<=max&&bytes.toString('base64')===value,`Noncanonical ${name}`);return bytes;
}
function writeAscii(buffer,offset,size,value,name){requireThat(typeof value==='string'&&value.length>0&&value.length<size&&/^[\x21-\x7e]+$/.test(value),`Invalid ${name}`);buffer.write(value,offset,size-1,'ascii');}
function readAscii(buffer,offset,size,name){const bytes=buffer.subarray(offset,offset+size),zero=bytes.indexOf(0);requireThat(zero>0&&bytes.subarray(zero).every(b=>b===0),`Invalid padded ${name}`);const value=bytes.subarray(0,zero).toString('ascii');requireThat(Buffer.from(value,'ascii').equals(bytes.subarray(0,zero))&&/^[\x21-\x7e]+$/.test(value),`Invalid ASCII ${name}`);return value;}
function validRef(ref){requireThat(/^[A-Za-z0-9][A-Za-z0-9._/+\-]*$/.test(ref)&&!ref.includes('..')&&!ref.includes('//')&&!ref.endsWith('/')&&!ref.endsWith('.'), 'Invalid Git ref');return ref;}
function keyFor(trust){const der=canonicalBase64(trust.spkiBase64,128,'public key');requireThat(sha(der)===trust.keyId,'Public key ID mismatch');const key=createPublicKey({key:der,type:'spki',format:'der'});requireThat(key.asymmetricKeyType==='ec'&&key.asymmetricKeyDetails?.namedCurve==='prime256v1','Expected P256 release key');return key;}
function privateFor(value,trust){const key=createPrivateKey(value),publicDer=createPublicKey(key).export({type:'spki',format:'der'});requireThat(sha(publicDer)===trust.keyId,'Signing key does not match pinned public key');return key;}
function canonicalDer(sig){
 requireThat(sig.length>=8&&sig.length<=72&&sig[0]===0x30&&sig[1]===sig.length-2,'Invalid DER signature');let at=2;
 const order=BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
 for(let n=0;n<2;n++){requireThat(sig[at++]===2,'Invalid DER integer');const length=sig[at++];requireThat(length>=1&&length<=33&&at+length<=sig.length,'Invalid DER integer length');const bytes=sig.subarray(at,at+length);requireThat(!(bytes[0]&128)&&!(length>1&&bytes[0]===0&&!(bytes[1]&128)),'Noncanonical DER integer');const value=BigInt('0x'+bytes.toString('hex'));requireThat(value>0n&&value<order,'ECDSA integer outside P256 range');at+=length;}
 requireThat(at===sig.length,'Trailing DER data');return sig;
}
function signed(domain,body,key){return canonicalDer(sign('sha256',Buffer.concat([domain,body]),key));}
function checkedSignature(domain,body,signature,trust){const sig=canonicalDer(canonicalBase64(signature,72,'signature'));requireThat(verify('sha256',Buffer.concat([domain,body]),keyFor(trust),sig),'Release signature rejected');}

export function encodeArtifact(meta,trust=TRUST){
 const body=Buffer.alloc(384);Buffer.from(FORMAT.magicHex,'hex').copy(body);body.writeUInt16BE(1,8);body.writeUInt16BE(1,10);
 const role=meta.role==='A'?1:meta.role==='B'?2:0,channel=CHANNELS.indexOf(meta.channel);requireThat(role&&channel>=0,'Invalid role/channel');body[12]=role;body[13]=channel;body.writeUInt16BE(1,14);
 body.writeUInt32BE(integer(meta.imageBytes,580,FORMAT.maxImageBytes,'image size'),16);body.writeBigUInt64BE(BigInt(integer(meta.sequence,1,MAX_SAFE,'artifact sequence')),20);body.writeBigUInt64BE(BigInt(integer(meta.issuedUnixSeconds,1,MAX_SAFE,'artifact time')),28);body.writeUInt16BE(1,36);
 requireThat(typeof meta.dirtySource==='boolean','Explicit source provenance required');body.writeUInt16BE(meta.dirtySource?1:0,38);requireThat(!meta.dirtySource||channel>=2,'Stable/beta require a clean source build');
 requireThat(!/^0+$/.test(meta.imageSha256)&&!/^0+$/.test(meta.commit),'Image digest and commit must be nonzero');hex(meta.imageSha256,32,'image digest').copy(body,40);hex(meta.commit,20,'commit').copy(body,72);hex(trust.keyId,32,'publisher ID').copy(body,92);
 writeAscii(body,124,32,meta.version,'version');validRef(meta.gitRef);writeAscii(body,156,128,meta.gitRef,'Git ref');writeAscii(body,284,64,meta.buildId,'build ID');hex(PROFILE_SHA,32,'profile').copy(body,348);body.write('AU',380,'ascii');body[382]=24;
 decodeArtifact(body,trust);return body;
}
export function decodeArtifact(body,trust=TRUST){
 requireThat(Buffer.isBuffer(body)&&body.length===384,'Artifact descriptor must be384 bytes');requireThat(body.subarray(0,8).equals(Buffer.from(FORMAT.magicHex,'hex'))&&body.readUInt16BE(8)===1,'Unknown descriptor format');
 requireThat(body.readUInt16BE(10)===1&&body.readUInt16BE(14)===1&&body.readUInt16BE(36)===1,'Unsupported board/layout/protocol');requireThat((body[12]===1||body[12]===2)&&body[13]<=3&&body.readUInt16BE(38)<=1&&body[383]===0,'Invalid descriptor role/channel/flags');
 requireThat(body.subarray(348,380).toString('hex')===PROFILE_SHA&&body.subarray(380,382).toString('ascii')==='AU'&&body[382]===24,'Unsupported board/radio profile');requireThat(body.subarray(92,124).toString('hex')===trust.keyId,'Unknown publisher');
 const u64=at=>{const n=body.readBigUInt64BE(at);requireThat(n>0n&&n<=BigInt(MAX_SAFE),'Unsafe unsigned integer');return Number(n);};
 const result={artifactId:sha(body),role:body[12]===1?'A':'B',boardId:1,layoutId:1,channel:CHANNELS[body[13]],imageBytes:integer(body.readUInt32BE(16),580,FORMAT.maxImageBytes,'image size'),sequence:u64(20),issuedUnixSeconds:u64(28),dirtySource:body.readUInt16BE(38)===1,imageSha256:body.subarray(40,72).toString('hex'),commit:body.subarray(72,92).toString('hex'),keyId:trust.keyId,version:readAscii(body,124,32,'version'),gitRef:validRef(readAscii(body,156,128,'Git ref')),buildId:readAscii(body,284,64,'build ID'),boardProfileSha256:PROFILE_SHA,country:'AU',configuredTxCeilingDbm:24};
 requireThat(!result.dirtySource||body[13]>=2,'Dirty stable/beta build rejected');requireThat(!/^0+$/.test(result.imageSha256)&&!/^0+$/.test(result.commit),'Image digest and commit must be nonzero');return result;
}

/** Publisher-side independent inspection. Never infer role from a filename. */
export function inspectImage(image,{allowPrivateBootstrap=false}={}){
 requireThat(Buffer.isBuffer(image)&&image.length>=580&&image.length<=FORMAT.maxImageBytes,'Image outside OTA size bounds');requireThat(image[0]===0xe9&&image.readUInt16LE(12)===9&&image[1]>0&&image[1]<=16,'Expected ESP32-S3 application image');
 let at=24,checksum=0xef;for(let n=0;n<image[1];n++){requireThat(at+8<=image.length,'Truncated segment header');const size=image.readUInt32LE(at+4);at+=8;requireThat(size>0&&size<=image.length-at,'Truncated image segment');for(const byte of image.subarray(at,at+size))checksum^=byte;at+=size;}
 const checkAt=Math.floor(at/16)*16+15;requireThat(checkAt<image.length&&image[checkAt]===checksum,'ESP image checksum rejected');requireThat(image[23]===1&&checkAt+33===image.length,'Expected exact hashed ESP image');requireThat(createHash('sha256').update(image.subarray(0,checkAt+1)).digest().equals(image.subarray(checkAt+1)),'ESP image digest rejected');
 requireThat(image.readUInt32LE(32)===0xabcd5432,'Missing ESP app descriptor');const d=image.subarray(0x120,0x120+292);requireThat(d.length===292&&d.subarray(0,8).toString('hex')==='41554d4244310000','Missing AuMaNET embedded build identity');
 requireThat(d[13]===0||allowPrivateBootstrap&&d[13]===1,'Private bootstrap images cannot be published');requireThat((d[8]===1||d[8]===2)&&d[9]===1&&d.subarray(10,12).toString()==='AU'&&d[12]===24&&d[14]<=3&&d[15]<=1,'Unsupported embedded board/role/radio profile');
 const result={role:d[8]===1?'A':'B',channel:CHANNELS[d[14]],dirtySource:d[15]===1,version:readAscii(d,16,32,'embedded version'),commit:d.subarray(48,68).toString('hex'),gitRef:validRef(readAscii(d,68,128,'embedded Git ref')),buildId:readAscii(d,196,64,'embedded build ID'),privateBootstrap:d[13]===1,imageBytes:image.length,imageSha256:sha(image)};
 requireThat(result.version===readAscii(image,48,32,'ESP version'),'ESP/custom version mismatch');requireThat(d.subarray(260,292).toString('hex')===PROFILE_SHA,'Embedded profile mismatch');requireThat(!result.dirtySource||d[14]>=2,'Dirty stable/beta image rejected');return result;
}
export function createRelease(image,{sequence,issuedUnixSeconds,imageUrl,notes=''},privatePem,trust=TRUST){
 const identity=inspectImage(image);imageUrl=validateImageUrl(imageUrl);notesChecked(notes);const body=encodeArtifact({...identity,sequence,issuedUnixSeconds},trust);return {manifest:body.toString('base64'),signature:signed(ARTIFACT_DOMAIN,body,privateFor(privatePem,trust)).toString('base64'),imageUrl,notes,sourceStatus:identity.dirtySource?'dirty':'clean'};
}
export function validateImageUrl(value){
 requireThat(typeof value==='string'&&value.length<=2048,'Invalid image URL');let url;try{url=new URL(value);}catch{throw Error('Invalid image URL');}requireThat(url.protocol==='https:'&&CDN_HOSTS.has(url.hostname)&&!url.username&&!url.password&&!url.hash&&(!url.port||url.port==='443'),'Untrusted image URL');return url.href;
}
export function verifyRelease(release,trust=TRUST){
 requireThat(release&&typeof release==='object'&&!Array.isArray(release),'Invalid release record');requireThat(Object.keys(release).sort().join(',')==='imageUrl,manifest,notes,signature,sourceStatus','Unknown release field');const body=canonicalBase64(release.manifest,384,'manifest');requireThat(body.length===384,'Wrong descriptor size');checkedSignature(ARTIFACT_DOMAIN,body,release.signature,trust);const parsed=decodeArtifact(body,trust);validateImageUrl(release.imageUrl);notesChecked(release.notes);requireThat(release.sourceStatus===(parsed.dirtySource?'dirty':'clean'),'Source provenance mismatch');return {...parsed,imageUrl:release.imageUrl,notes:release.notes,sourceStatus:release.sourceStatus};
}
export function verifyPackage(release,image,trust=TRUST){const parsed=verifyRelease(release,trust),identity=inspectImage(image);for(const key of ['role','channel','dirtySource','version','commit','gitRef','buildId','imageBytes','imageSha256'])requireThat(parsed[key]===identity[key],`Image/manifest ${key} mismatch`);return parsed;}

function stableJson(value){if(Array.isArray(value))return value.map(stableJson);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stableJson(value[k])]));return value;}
export function createCatalog(releases,{sequence,issuedAt,expiresAt},privatePem,trust=TRUST){
 const payload={schema:'aumanet.firmware-catalog.v1',sequence,issuedAt,expiresAt,keyId:trust.keyId,releases};const bytes=Buffer.from(JSON.stringify(stableJson(payload)),'utf8');const result={payload:bytes.toString('base64'),signature:signed(CATALOG_DOMAIN,bytes,privateFor(privatePem,trust)).toString('base64')};verifyCatalog(result,{now:issuedAt,trust});return result;
}
export function verifyCatalog(envelope,{now=Math.floor(Date.now()/1000),minimumSequence=0,trust=TRUST}={}){
 requireThat(envelope&&typeof envelope==='object'&&!Array.isArray(envelope)&&Object.keys(envelope).sort().join(',')==='payload,signature','Invalid catalog envelope');requireThat(Buffer.byteLength(JSON.stringify(envelope))<=262144,'Catalog too large');const bytes=canonicalBase64(envelope.payload,196608,'catalog payload');checkedSignature(CATALOG_DOMAIN,bytes,envelope.signature,trust);
 const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);let payload;try{payload=JSON.parse(text);}catch{throw Error('Invalid catalog JSON');}requireThat(payload&&typeof payload==='object'&&!Array.isArray(payload)&&Object.keys(payload).sort().join(',')==='expiresAt,issuedAt,keyId,releases,schema,sequence','Invalid catalog fields');requireThat(payload.schema==='aumanet.firmware-catalog.v1'&&payload.keyId===trust.keyId,'Catalog schema/publisher mismatch');
 integer(now,1,MAX_SAFE,'current time');integer(payload.sequence,1,MAX_SAFE,'catalog sequence');requireThat(payload.sequence>=minimumSequence,'Catalog sequence replay');integer(payload.issuedAt,1,MAX_SAFE,'catalog time');integer(payload.expiresAt,1,MAX_SAFE,'catalog expiry');requireThat(payload.issuedAt<=now+300&&payload.expiresAt>now&&payload.expiresAt>payload.issuedAt&&payload.expiresAt-payload.issuedAt<=604800&&now-payload.issuedAt<=604800,'Expired or future catalog');
 requireThat(Array.isArray(payload.releases)&&payload.releases.length<=128,'Too many releases');const seen=new Set(),entries=payload.releases.map(release=>{const value=verifyRelease(release,trust);requireThat(!seen.has(value.artifactId),'Duplicate artifact');seen.add(value.artifactId);requireThat(value.issuedUnixSeconds<=payload.issuedAt+300,'Future artifact');return value;});return {...payload,entries};
}
