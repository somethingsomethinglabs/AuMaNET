import {execFileSync} from 'node:child_process';
import {mkdir,writeFile,mkdtemp,rm,readFile} from 'node:fs/promises';
import {deflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {encodeTileFrame} from '../browser-preparation/native-transport.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),active=path.resolve(root,'../../mobile/android/app/src/main/java/au/aumanet/app/maps'),jdk=process.env.JAVA_HOME??path.join(os.homedir(),'.codex/aumanet-tools/java/jdk-21.0.13+9');
const jsonJar=path.resolve(root,'../../artifacts/maps/native-android-compile/json-20250517.jar');
const fixtureHash='3ea61b2a06e31edf1c91134fe9106b0ebb16628be169f3db75bc7a2b06b45796';
try{await readFile(jsonJar);}catch(error){if(error.code!=='ENOENT')throw error;const response=await fetch('https://repo.maven.apache.org/maven2/org/json/json/20250517/json-20250517.jar');if(!response.ok||Number(response.headers.get('content-length'))>256*1024)throw new Error('JSON test-fixture download failed');const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>256*1024||createHash('sha256').update(bytes).digest('hex')!==fixtureHash)throw new Error('JSON test-fixture checksum mismatch');await mkdir(path.dirname(jsonJar),{recursive:true});await writeFile(jsonJar,bytes);}
if(createHash('sha256').update(await readFile(jsonJar)).digest('hex')!==fixtureHash)throw new Error('JSON test-fixture checksum mismatch');
const directory=await mkdtemp(path.join(os.tmpdir(),'aumanet-map-native-active-'));
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
function chunk(type,data){const body=Buffer.concat([Buffer.from(type),data]),out=Buffer.alloc(body.length+8);out.writeUInt32BE(data.length);body.copy(out,4);out.writeUInt32BE(crc32(body),out.length-4);return out;}
try{
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(256);ihdr.writeUInt32BE(256,4);ihdr[8]=8;ihdr[9]=6;
  const pixels=Buffer.alloc(256*(256*4+1));for(let y=0;y<256;y++)for(let x=0;x<256;x++){const start=y*1025+1+x*4;pixels[start]=x;pixels[start+1]=y;pixels[start+2]=120;pixels[start+3]=255;}
  const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
  const frame=encodeTileFrame({sessionId:'a'.repeat(32),sequence:0,z:0,x:0,y:0,sha256:createHash('sha256').update(png).digest('hex')},png),golden=path.join(directory,'js-frame.bin');await writeFile(golden,new Uint8Array(frame));await mkdir(path.join(directory,'classes'));
  const testSource=(await readFile(path.join(root,'MapPreparationFilesTest.java'),'utf8')).replace('package au.aumanet.maps.prototype;','package au.aumanet.app.maps;');await writeFile(path.join(directory,'MapPreparationFilesTest.java'),testSource);
  execFileSync(path.join(jdk,'bin','javac.exe'),['-cp',jsonJar,'-d',path.join(directory,'classes'),path.join(active,'MapMutationLease.java'),path.join(active,'MapPreparationFiles.java'),path.join(active,'OfflineMapValidation.java'),path.join(active,'BoundedMapInputStream.java'),path.join(directory,'MapPreparationFilesTest.java'),path.join(root,'OfflineMapValidationTest.java'),path.join(root,'BoundedMapInputStreamTest.java')],{stdio:'inherit'});
  execFileSync(path.join(jdk,'bin','java.exe'),['-cp',path.join(directory,'classes')+path.delimiter+jsonJar,'au.aumanet.app.maps.MapPreparationFilesTest',path.join(directory,'data'),golden],{stdio:'inherit'});
  execFileSync(path.join(jdk,'bin','java.exe'),['-cp',path.join(directory,'classes')+path.delimiter+jsonJar,'au.aumanet.app.maps.OfflineMapValidationTest',path.resolve(root,'../../tests/fixtures/offline-map-type-parity.json'),...(process.argv[2]?[path.resolve(process.argv[2])]:[])],{stdio:'inherit'});
  execFileSync(path.join(jdk,'bin','java.exe'),['-cp',path.join(directory,'classes')+path.delimiter+jsonJar,'au.aumanet.app.maps.BoundedMapInputStreamTest',path.join(directory,'stream-tests')],{stdio:'inherit'});
  execFileSync(path.join(jdk,'bin','javac.exe'),['-cp',path.join(directory,'classes')+path.delimiter+jsonJar,'-d',path.join(directory,'classes'),path.join(active,'GeoscienceMaps.java'),path.join(root,'GeoscienceMapsTest.java')],{stdio:'inherit'});
  execFileSync(path.join(jdk,'bin','java.exe'),['-cp',path.join(directory,'classes')+path.delimiter+jsonJar,'au.aumanet.app.maps.GeoscienceMapsTest',path.join(directory,'geoscience-tests')],{stdio:'inherit'});
}finally{await rm(directory,{recursive:true,force:true});}
