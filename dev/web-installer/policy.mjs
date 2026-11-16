// Browser and host share the exact installation policy. No serial or network IO.
import {md5} from '@noble/hashes/legacy.js';
export const FLASH_BYTES=0x800000, APP_BYTES=0x240000;
export const DOMAIN='AuMaNET USB installer bundle v1\0';
export const LAYOUT=[
  ['nvs',1,2,0x9000,0x6000],['phy_init',1,1,0xf000,0x1000],
  ['factory',0,0,0x10000,0x300000],['ota_0',0,16,0x310000,APP_BYTES],
  ['ota_1',0,17,0x550000,APP_BYTES],['otadata',1,0,0x790000,0x2000],
];
const enc=new TextEncoder();
export const hex=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
export const sha=async b=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',b)));
function need(ok,message){if(!ok)throw Error(message);}
function keys(o,names){need(o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join(',')===names.slice().sort().join(','),'Unexpected package fields');}
function b64(s,max){need(typeof s==='string'&&s.length<=Math.ceil(max/3)*4&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s),'Invalid package encoding');const b=Uint8Array.from(atob(s),c=>c.charCodeAt(0));need(b.length<=max&&btoa(String.fromCharCode(...b))===s,'Noncanonical package encoding');return b;}
function derSignature(s){
  const b=b64(s,72);need(b.length>=8&&b[0]===48&&b[1]===b.length-2,'Invalid publisher signature');
  const out=new Uint8Array(64);let at=2;
  for(let i=0;i<2;i++){
    need(b[at++]===2,'Invalid signature integer');const n=b[at++];need(n>=1&&n<=33&&at+n<=b.length,'Invalid signature length');
    let v=b.slice(at,at+n);at+=n;need(!(v[0]&128)&&!(n>1&&v[0]===0&&!(v[1]&128)),'Noncanonical signature');
    if(v[0]===0&&v.length>1)v=v.slice(1);need(v.length<=32&&v.some(x=>x!==0),'Invalid signature integer');out.set(v,i*32+32-v.length);
  }
  need(at===b.length,'Trailing signature data');return out;
}
export async function verifyBundle(envelope,trust,profileSha,now=Math.floor(Date.now()/1000)){
  keys(envelope,['payload','signature']);const payload=b64(envelope.payload,16384),der=b64(trust.spkiBase64,91);
  need(der.length===91&&hex(der.slice(0,27))==='3059301306072a8648ce3d020106082a8648ce3d03010703420004'&&await sha(der)===trust.keyId,'Invalid pinned publisher');
  const key=await crypto.subtle.importKey('spki',der,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  const signed=new Uint8Array(enc.encode(DOMAIN).length+payload.length);signed.set(enc.encode(DOMAIN));signed.set(payload,enc.encode(DOMAIN).length);
  need(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,derSignature(envelope.signature),signed),'Publisher signature rejected');
  const p=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(payload));
  keys(p,['schema','keyId','boardId','chip','flashBytes','layoutId','profileSha256','purpose','version','sequence','issuedAt','expiresAt','parts']);
  need(p.schema==='aumanet.usb-install.v1'&&p.keyId===trust.keyId&&p.boardId===1&&p.chip==='ESP32-S3'&&p.flashBytes===FLASH_BYTES&&p.layoutId===1&&p.profileSha256===profileSha,'Unsupported board or layout');
  need(['blank-install','app-update'].includes(p.purpose)&&typeof p.version==='string'&&/^[\x21-\x7e]{1,31}$/.test(p.version),'Invalid installation purpose or version');
  need([p.sequence,p.issuedAt,p.expiresAt,now].every(x=>Number.isSafeInteger(x)&&x>0)&&p.issuedAt<=now+300&&p.expiresAt>now&&p.expiresAt>p.issuedAt&&p.expiresAt-p.issuedAt<=604800,'Expired or future install package');
  const expected=p.purpose==='blank-install'?['bootloader','partitions','application']:['application'];
  need(Array.isArray(p.parts)&&p.parts.length===expected.length,'Invalid package parts');
  const files=new Set();
  for(let i=0;i<expected.length;i++){
    const part=p.parts[i];keys(part,['kind','file','bytes','sha256']);
    need(part.kind===expected[i]&&typeof part.file==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}\.bin$/.test(part.file)&&!part.file.includes('..')&&!files.has(part.file),'Invalid package filename');files.add(part.file);
    need(Number.isSafeInteger(part.bytes)&&part.bytes>0&&part.bytes<=({bootloader:0x8000,partitions:0xc00,application:APP_BYTES}[part.kind])&&/^[a-f0-9]{64}$/.test(part.sha256),'Invalid package image bounds');
  }
  return Object.freeze({...p,parts:Object.freeze(p.parts.map(part=>Object.freeze({...part})))});
}
function ascii(b,at,n){const part=b.slice(at,at+n),end=part.indexOf(0);need(end>0&&part.slice(end).every(x=>x===0),'Invalid image identity');return new TextDecoder().decode(part.slice(0,end));}
export async function checkApplication(b,p){
  need(b instanceof Uint8Array&&b.length>=580&&b.length<=APP_BYTES,'Application size is unsupported');const v=new DataView(b.buffer,b.byteOffset,b.byteLength);
  need(b[0]===0xe9&&b[1]>=1&&b[1]<=16&&v.getUint16(12,true)===9&&b[23]===1,'Expected ESP32-S3 application');
  let at=24,sum=0xef;for(let i=0;i<b[1];i++){need(at+8<=b.length,'Truncated application');const n=v.getUint32(at+4,true);at+=8;need(n>0&&at+n<=b.length,'Truncated application');for(const byte of b.subarray(at,at+n))sum^=byte;at+=n;}
  const end=Math.floor(at/16)*16+15;need(end+33===b.length&&b[end]===sum&&await sha(b.slice(0,end+1))===hex(b.slice(end+1)),'Application checksum rejected');
  const d=b.slice(0x120,0x120+292);need(v.getUint32(32,true)===0xabcd5432&&hex(d.slice(0,8))==='41554d4244310000'&&d[8]===3&&d[9]===1&&d[10]===65&&d[11]===85&&d[12]===24&&d[13]===0&&d[14]<=3&&d[15]<=1,'Expected generic universal AU firmware');
  need(hex(d.slice(260,292))===p.profileSha256&&ascii(d,16,32)===p.version&&ascii(b,48,32)===p.version,'Application/package identity mismatch');
  need(!d[15]||d[14]>=2,'Dirty Stable/Beta image rejected');
  const commit=hex(d.slice(48,68)),gitRef=ascii(d,68,128),buildId=ascii(d,196,64);
  need(!/^0+$/.test(commit)&&/^[A-Za-z0-9][A-Za-z0-9._/+\-]*$/.test(gitRef)&&!gitRef.includes('..')&&!gitRef.includes('//')&&!gitRef.endsWith('/')&&!gitRef.endsWith('.')&&/^[\x21-\x7e]+$/.test(buildId),'Invalid application source identity');
  return {channel:['stable','beta','nightly','branch'][d[14]],sourceStatus:d[15]?'dirty':'clean',commit,gitRef,buildId};
}
export function checkPartitionTable(b){
  need(b instanceof Uint8Array&&b.length>=224,'Missing partition table');
  const v=new DataView(b.buffer,b.byteOffset,b.byteLength);
  for(let i=0;i<LAYOUT.length;i++){
    const [name,type,sub,offset,size]=LAYOUT[i],at=i*32;
    need(v.getUint16(at,true)===0x50aa&&b[at+2]===type&&b[at+3]===sub&&v.getUint32(at+4,true)===offset&&v.getUint32(at+8,true)===size&&ascii(b,at+12,16)===name&&v.getUint32(at+28,true)===0,'Unsupported partition layout');
  }
  need(b[192]===0xeb&&b[193]===0xeb&&b.slice(194,208).every(x=>x===255)&&hex(md5(b.slice(0,192)))===hex(b.slice(208,224))&&b.slice(224).every(x=>x===255),'Partition integrity rejected');
}
// Mirrors IDF esp_rom_crc32_le(UINT32_MAX, seq, 4), including ROM inversion.
export function otaCrc(b){let c=0;for(const x of b){c^=x;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
export function activeSlot(b){
  need(b instanceof Uint8Array&&b.length===8192,'Missing boot selection');const v=new DataView(b.buffer,b.byteOffset,b.byteLength),entries=[];
  for(const at of [0,4096]){
    const seq=v.getUint32(at,true),state=v.getUint32(at+24,true),crc=v.getUint32(at+28,true);
    if(seq===0xffffffff||state===3||state===4||crc!==otaCrc(b.slice(at,at+4)))continue;
    need(seq>0&&state===2,'Unconfirmed firmware boot; use normal recovery first');entries.push(seq);
  }
  need(entries.length>0,'No confirmed OTA slot; initial layout migration needs USB recovery');
  return (Math.max(...entries)-1)%2;
}
export async function verifyImages(p,files){
  const result=new Map();
  for(const part of p.parts){const raw=files.get(part.file);need(raw instanceof Uint8Array&&raw.length===part.bytes&&await sha(raw)===part.sha256,'Package image missing or digest mismatch');result.set(part.kind,raw.slice());}
  await checkApplication(result.get('application'),p);
  if(p.purpose==='blank-install'){
    const boot=result.get('bootloader');need(boot.length>=24&&boot[0]===0xe9&&new DataView(boot.buffer,boot.byteOffset,boot.byteLength).getUint16(12,true)===9,'Unsupported bootloader');checkPartitionTable(result.get('partitions'));
  }
  return result;
}
export function planWrites(p,backup){
  need(backup instanceof Uint8Array&&backup.length===FLASH_BYTES,'Complete verified backup is required');
  if(p.purpose==='blank-install'){
    need(backup.every(x=>x===255),'This node is not blank. Use a configuration-preserving update package.');
    return [{kind:'bootloader',address:0},{kind:'partitions',address:0x8000},{kind:'application',address:0x10000}];
  }
  checkPartitionTable(backup.slice(0x8000,0x8c00));
  return [{kind:'application',address:activeSlot(backup.slice(0x790000,0x792000))===0?0x310000:0x550000}];
}
export async function checkedWrite({loader,bundle,images,backup,mac,expectedMac,onprogress=()=>{},clock=()=>Math.floor(Date.now()/1000)}){
  need(mac===expectedMac&&/^[0-9a-f]{12}$/.test(mac),'Wrong physical node');
  const plan=planWrites(bundle,backup);
  for(const part of bundle.parts){const image=images.get(part.kind);need(image instanceof Uint8Array&&image.length===part.bytes&&await sha(image)===part.sha256,'Verified image changed before write');}
  await checkApplication(images.get('application'),bundle);
  // Re-read before mutation: a stale review or a concurrent writer cannot be used.
  const fresh=await loader.readFlash(0,FLASH_BYTES);need(fresh.length===FLASH_BYTES&&await sha(fresh)===await sha(backup),'Node changed since backup; reconnect and inspect');
  need(await loader.readMac()===mac,'Physical node changed');
  const time=clock();need(Number.isSafeInteger(time)&&time>=bundle.issuedAt-300&&time<bundle.expiresAt,'Install package expired before writing');
  for(const part of plan){need(images.has(part.kind),'Missing verified image');}
  await loader.writeFlash({fileArray:plan.map(part=>({address:part.address,data:images.get(part.kind).slice()})),flashMode:'keep',flashFreq:'keep',flashSize:'keep',eraseAll:false,compress:true,reportProgress:onprogress});
  for(const part of plan){const image=images.get(part.kind),read=await loader.readFlash(part.address,image.length);need(read.length===image.length&&await sha(read)===await sha(image),'Flash readback mismatch; preserve backup and use USB recovery');}
  const after=await loader.readFlash(0,FLASH_BYTES);need(after.length===FLASH_BYTES,'Incomplete preservation readback');
  const allowed=plan.map(part=>[part.address,part.kind==='application'?part.address+(bundle.purpose==='blank-install'?0x300000:APP_BYTES):part.kind==='bootloader'?0x8000:0x9000]);
  for(let i=0;i<after.length;i++)if(!allowed.some(([start,end])=>i>=start&&i<end))need(after[i]===backup[i],'Data outside the planned firmware regions changed; retain the backup');
}
