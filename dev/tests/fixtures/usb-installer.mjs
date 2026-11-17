// Disposable synthetic images and publisher keys. Never published or flashed.
import {generateKeyPairSync,createHash,sign} from 'node:crypto';
import {PROFILE_SHA,TRUST} from '../../releases/lib.mjs';
import {LAYOUT,DOMAIN,FLASH_BYTES,otaCrc} from '../../web-installer/policy.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
export const now=1794800000;
export function application(){
  const b=Buffer.alloc(1104);b[0]=0xe9;b[1]=1;b.writeUInt16LE(9,12);b[23]=1;b.writeUInt32LE(1024,28);b.writeUInt32LE(0xabcd5432,32);b.write('0.9.1-test',48);
  const at=0x120;Buffer.from('41554d4244310000','hex').copy(b,at);b[at+8]=3;b[at+9]=1;b.write('AU',at+10);b[at+12]=24;b[at+14]=2;b[at+15]=1;b.write('0.9.1-test',at+16);b.fill(0xcc,at+48,at+68);b.write('refs/heads/disposable-fixture',at+68);b.write('host-fixture-never-install',at+196);Buffer.from(PROFILE_SHA,'hex').copy(b,at+260);
  return rehash(b);
}
export function rehash(b){let at=24,sum=0xef;for(let i=0;i<b[1];i++){const n=b.readUInt32LE(at+4);at+=8;for(const x of b.subarray(at,at+n))sum^=x;at+=n;}const end=Math.floor(at/16)*16+15;b[end]=sum;createHash('sha256').update(b.subarray(0,end+1)).digest().copy(b,end+1);return b;}
export function partitions(){
  const b=Buffer.alloc(0xc00,255);for(let i=0;i<LAYOUT.length;i++){const [name,type,sub,offset,size]=LAYOUT[i],at=i*32;b.fill(0,at,at+32);b.writeUInt16LE(0x50aa,at);b[at+2]=type;b[at+3]=sub;b.writeUInt32LE(offset,at+4);b.writeUInt32LE(size,at+8);b.write(name,at+12);}
  b[192]=b[193]=0xeb;createHash('md5').update(b.subarray(0,192)).digest().copy(b,208);return b;
}
export function retained(slot=0){const b=Buffer.alloc(FLASH_BYTES,255);partitions().copy(b,0x8000);b.fill(0x42,0x9000,0xf000);const at=0x790000;b.writeUInt32LE(slot+1,at);b.writeUInt32LE(2,at+24);b.writeUInt32LE(otaCrc(b.subarray(at,at+4)),at+28);return b;}
export function fixture(purpose='app-update'){
  const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),der=pair.publicKey.export({type:'spki',format:'der'}),trust={...TRUST,keyId:hash(der),spkiBase64:der.toString('base64')};
  const app=application(),files=new Map([['application.bin',app]]);
  if(purpose==='blank-install'){const boot=Buffer.alloc(64);boot[0]=0xe9;boot.writeUInt16LE(9,12);files.set('bootloader.bin',boot);files.set('partitions.bin',partitions());}
  const parts=(purpose==='blank-install'?['bootloader','partitions','application']:['application']).map(kind=>({kind,file:kind+'.bin',bytes:files.get(kind+'.bin').length,sha256:hash(files.get(kind+'.bin'))}));
  const payload={schema:'aumanet.usb-install.v1',keyId:trust.keyId,boardId:1,chip:'ESP32-S3',flashBytes:FLASH_BYTES,layoutId:1,profileSha256:PROFILE_SHA,purpose,version:'0.9.1-test',sequence:5,issuedAt:now-10,expiresAt:now+3600,parts};
  const signed=(p=payload,domain=DOMAIN)=>{const bytes=Buffer.from(JSON.stringify(p));return {payload:bytes.toString('base64'),signature:sign('sha256',Buffer.concat([Buffer.from(domain),bytes]),pair.privateKey).toString('base64')};};
  return {trust,payload,files,signed,profile:PROFILE_SHA,privatePem:pair.privateKey.export({type:'pkcs8',format:'pem'})};
}
