// Maintainer-side packaging only. No device access and no private key output.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createPrivateKey,createPublicKey,sign} from 'node:crypto';
import {TRUST,PROFILE_SHA,verifyPackage} from '../dev/releases/lib.mjs';
import {DOMAIN,sha,verifyBundle,verifyImages} from '../dev/web-installer/policy.mjs';
const args=new Map();
for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i],value=process.argv[i+1];if(!['--release','--image','--bootloader','--partitions','--key-file','--sequence','--out'].includes(key)||!value||args.has(key))throw Error('Use --release JSON --image BIN --key-file PEM --sequence INTEGER --out NEW_DIRECTORY; add --bootloader BIN --partitions BIN for blank installation.');args.set(key,value);}
for(const name of ['--release','--image','--key-file','--sequence','--out'])if(!args.has(name))throw Error(`Missing ${name}`);
if(args.has('--bootloader')!==args.has('--partitions'))throw Error('Blank installation requires both bootloader and partition table');
const sequence=Number(args.get('--sequence'));if(!Number.isSafeInteger(sequence)||sequence<1)throw Error('Invalid installer sequence');
const release=JSON.parse(await readFile(args.get('--release'),'utf8')),application=await readFile(args.get('--image'));
const identity=verifyPackage(release,application);if(identity.role!=='U')throw Error('Only generic universal firmware is supported');
const files=new Map([['application.bin',new Uint8Array(application)]]),parts=[];
if(args.has('--bootloader'))for(const kind of ['bootloader','partitions'])files.set(`${kind}.bin`,new Uint8Array(await readFile(args.get('--'+kind))));
for(const kind of args.has('--bootloader')?['bootloader','partitions','application']:['application']){const file=`${kind}.bin`,bytes=files.get(file);parts.push({kind,file,bytes:bytes.length,sha256:await sha(bytes)});}
const now=Math.floor(Date.now()/1000),payload={schema:'aumanet.usb-install.v1',keyId:TRUST.keyId,boardId:1,chip:'ESP32-S3',flashBytes:0x800000,layoutId:1,profileSha256:PROFILE_SHA,purpose:args.has('--bootloader')?'blank-install':'app-update',version:identity.version,sequence,issuedAt:now,expiresAt:now+604800,parts};
await verifyImages(payload,files);
const key=createPrivateKey(await readFile(args.get('--key-file'))),publicDer=createPublicKey(key).export({format:'der',type:'spki'});
if(await sha(publicDer)!==TRUST.keyId)throw Error('Signing key does not match the pinned firmware publisher');
const encoded=Buffer.from(JSON.stringify(payload)),envelope={payload:encoded.toString('base64'),signature:sign('sha256',Buffer.concat([Buffer.from(DOMAIN),encoded]),key).toString('base64')};
await verifyBundle(envelope,TRUST,PROFILE_SHA);
const out=resolve(args.get('--out'));await mkdir(out); // Exclusive directory: never replace a published package.
for(const [file,bytes] of files)await writeFile(join(out,file),bytes,{flag:'wx'});
await writeFile(join(out,'installer.json'),JSON.stringify(envelope,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({created:true,directory:out,purpose:payload.purpose,version:payload.version,sequence,expiresAt:payload.expiresAt,deviceAccess:false}));
