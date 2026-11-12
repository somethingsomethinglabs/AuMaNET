#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync,existsSync,statSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {generateKeyPairSync,createPublicKey} from 'node:crypto';
import {TRUST,inspectImage,createRelease,verifyRelease,verifyPackage,createCatalog,verifyCatalog,canonicalBase64,sha} from './lib.mjs';

const [command,...args]=process.argv.slice(2),options=new Map();
for(let i=0;i<args.length;i++){const key=args[i];if(!/^--[a-z-]+$/.test(key)||i+1>=args.length||args[i+1].startsWith('--'))throw Error('Expected --option VALUE');const values=options.get(key)||[];values.push(args[++i]);options.set(key,values);}
function one(key,fallback){const values=options.get('--'+key);if(!values)return fallback;if(values.length!==1)throw Error(`Duplicate --${key}`);return values[0];}
function required(key){const value=one(key);if(!value)throw Error(`Missing --${key}`);return value;}
function allow(names){for(const key of options.keys())if(!names.includes(key.slice(2)))throw Error(`Unknown ${key}`);}
function number(key,fallback){const value=one(key);if(value===undefined)return fallback;if(!/^[0-9]+$/.test(value)||!Number.isSafeInteger(Number(value)))throw Error(`Invalid --${key}`);return Number(value);}
function boundedFile(path,max){const file=resolve(path),s=statSync(file);if(!s.isFile()||s.size<1||s.size>max)throw Error('Input file exceeds its format bounds');const bytes=readFileSync(file);if(bytes.length!==s.size||bytes.length>max)throw Error('Input file changed while reading');return bytes;}
function json(path){return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(boundedFile(path,262144)));}
function freshFile(path,data){const target=resolve(path);writeFileSync(target,data,{flag:'wx',mode:0o600});return target;}
function key(){return boundedFile(required('key-file'),16384);}
function prune(releases){
 const unique=new Map();for(const release of releases){const parsed=verifyRelease(release);unique.set(parsed.artifactId,{release,parsed});}
 const counts=new Map();return [...unique.values()].sort((a,b)=>['stable','beta','nightly','branch'].indexOf(a.parsed.channel)-['stable','beta','nightly','branch'].indexOf(b.parsed.channel)||b.parsed.sequence-a.parsed.sequence||a.parsed.artifactId.localeCompare(b.parsed.artifactId)).filter(row=>{const p=row.parsed,id=[p.role,p.channel,p.channel==='branch'?p.gitRef:''].join('/'),count=counts.get(id)||0;counts.set(id,count+1);return count<3;}).slice(0,128).map(row=>row.release);
}
try{
 if(command==='keygen'){
  allow(['key-file','public-out']);const privatePath=resolve(required('key-file')),publicPath=resolve(required('public-out'));if(existsSync(privatePath)||existsSync(publicPath))throw Error('Key generation never overwrites an existing trust or private key');
  const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),spki=createPublicKey(pair.privateKey).export({type:'spki',format:'der'});freshFile(privatePath,pair.privateKey.export({format:'pem',type:'pkcs8'}));const trust={...TRUST,keyId:sha(spki),spkiBase64:spki.toString('base64')};freshFile(publicPath,JSON.stringify(trust,null,2)+'\n');console.log(JSON.stringify({keyId:trust.keyId,publicTrust:publicPath,privateKeyWritten:true}));
 }else if(command==='inspect'){
  allow(['image']);console.log(JSON.stringify(inspectImage(boundedFile(required('image'),2359296)),null,2));
 }else if(command==='package'){
  allow(['image','image-base-url','image-url','key-file','sequence','issued-at','notes-file','out','expect-role','expect-channel','expect-commit','expect-version','expect-ref','expect-build-id']);const image=boundedFile(required('image'),2359296),identity=inspectImage(image),file=`firmware-${identity.role}-${identity.imageSha256.slice(0,16)}.bin`,base=one('image-base-url');
  for(const [name,field] of [['expect-role','role'],['expect-channel','channel'],['expect-commit','commit'],['expect-version','version'],['expect-ref','gitRef'],['expect-build-id','buildId']])if(one(name)!==undefined&&one(name)!==identity[field])throw Error(`Embedded ${field} differs from approved build plan`);
  if(Boolean(base)===Boolean(one('image-url')))throw Error('Choose --image-base-url or --image-url');const imageUrl=base?base.replace(/\/$/,'')+'/'+file:one('image-url'),notes=one('notes-file')?new TextDecoder('utf-8',{fatal:true}).decode(boundedFile(one('notes-file'),2048)):identity.dirtySource?'Local development snapshot; source contains uncommitted changes.':'Verified source build '+identity.commit;
  const release=createRelease(image,{sequence:number('sequence',Date.now()),issuedUnixSeconds:number('issued-at',Math.floor(Date.now()/1000)),imageUrl,notes},key());verifyPackage(release,image);const parsed=verifyRelease(release),out=resolve(required('out'));mkdirSync(out,{recursive:true});const imagePath=freshFile(join(out,file),image),record=freshFile(join(out,`release-${identity.role}-${parsed.artifactId}.json`),JSON.stringify(release,null,2)+'\n');console.log(JSON.stringify({artifactId:parsed.artifactId,version:parsed.version,channel:parsed.channel,role:parsed.role,sourceStatus:release.sourceStatus,image:imagePath,release:record}));
 }else if(command==='catalog'){
  allow(['release','previous','key-file','sequence','issued-at','expires-at','out']);const incoming=(options.get('--release')||[]).map(json);let previous=[],minimum=0;
  if(one('previous')){const envelope=json(one('previous')),payload=JSON.parse(canonicalBase64(envelope.payload,196608).toString('utf8'));const checked=verifyCatalog(envelope,{now:payload.issuedAt});if(checked.issuedAt>Math.floor(Date.now()/1000)+300)throw Error('Future previous catalog');previous=checked.releases;minimum=checked.sequence;}
  const issuedAt=number('issued-at',Math.floor(Date.now()/1000)),sequence=number('sequence',Math.max(Date.now(),minimum+1));if(sequence<=minimum)throw Error('New catalog sequence must increase');const catalog=createCatalog(prune([...previous,...incoming]),{sequence,issuedAt,expiresAt:number('expires-at',issuedAt+604800)},key());const checked=verifyCatalog(catalog,{now:issuedAt});freshFile(required('out'),JSON.stringify(catalog,null,2)+'\n');console.log(JSON.stringify({sequence:checked.sequence,releases:checked.entries.length,expiresAt:checked.expiresAt,output:resolve(required('out'))}));
 }else if(command==='verify'){
  allow(['catalog','release','image']);if(Boolean(one('catalog'))===Boolean(one('release')))throw Error('Choose --catalog or --release');if(one('catalog')){const result=verifyCatalog(json(one('catalog')));console.log(JSON.stringify({verified:true,sequence:result.sequence,releases:result.entries.length,expiresAt:result.expiresAt}));}else{const release=json(one('release')),parsed=one('image')?verifyPackage(release,boundedFile(one('image'),2359296)):verifyRelease(release);console.log(JSON.stringify({verified:true,...parsed}));}
 }else throw Error('Use keygen, inspect, package, catalog or verify; see dev/releases/README.md');
}catch(error){console.error('Release tooling: '+error.message);process.exitCode=1;}
