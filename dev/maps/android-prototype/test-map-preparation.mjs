import {execFileSync} from 'node:child_process';
import {mkdir,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {deflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {encodeTileFrame} from '../browser-preparation/native-transport.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),jdk=process.env.JAVA_HOME??'C:/Users/rowan/.codex/aumanet-tools/java/jdk-21.0.13+9',directory=await mkdtemp(path.join(os.tmpdir(),'aumanet-map-native-'));
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
function chunk(type,data){const body=Buffer.concat([Buffer.from(type),data]),out=Buffer.alloc(body.length+8);out.writeUInt32BE(data.length);body.copy(out,4);out.writeUInt32BE(crc32(body),out.length-4);return out;}
try{
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(256);ihdr.writeUInt32BE(256,4);ihdr[8]=8;ihdr[9]=6;
  const pixels=Buffer.alloc(256*(256*4+1));for(let y=0;y<256;y++)for(let x=0;x<256;x++){const start=y*1025+1+x*4;pixels[start]=x;pixels[start+1]=y;pixels[start+2]=120;pixels[start+3]=255;}
  const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
  const frame=encodeTileFrame({sessionId:'a'.repeat(32),sequence:0,z:0,x:0,y:0,sha256:createHash('sha256').update(png).digest('hex')},png),golden=path.join(directory,'js-frame.bin');await writeFile(golden,new Uint8Array(frame));await mkdir(path.join(directory,'classes'));
  execFileSync(path.join(jdk,'bin','javac.exe'),['-d',path.join(directory,'classes'),path.join(root,'MapMutationLease.java'),path.join(root,'MapPreparationFiles.java'),path.join(root,'MapPreparationFilesTest.java')],{stdio:'inherit'});
  execFileSync(path.join(jdk,'bin','java.exe'),['-cp',path.join(directory,'classes'),'au.aumanet.maps.prototype.MapPreparationFilesTest',path.join(directory,'data'),golden],{stdio:'inherit'});
}finally{await rm(directory,{recursive:true,force:true});}
