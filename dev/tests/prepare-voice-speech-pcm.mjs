// Artifact preparation only. OfflineAudioContext never plays or captures sound.
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const source=resolve(root,'dev/artifacts/native-audio-audit/librispeech-speech-source.flac');
const assets=resolve(root,'dev/mobile/android/app/src/debug/assets/voice-fixtures');
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const flac=await readFile(source);
if(sha256(flac)!=='3909a6c5ae93112518681fcbf0a74df43615a4f88bd6d5cd788775255296e3f6')throw new Error('Unexpected speech source');
if(sha256(await readFile(resolve(assets,'LICENSE.txt')))!=='908b0b565ae9bf61b7b41447cb0b83564f320375723bcc884ec30e5537a0d5dc')throw new Error('Bundle the source license before audio');
await readFile(resolve(assets,'ATTRIBUTION.txt'));
const browser=await chromium.launch({channel:'chromium',headless:true});
try{
  const page=await browser.newPage();
  const decoded=await page.evaluate(async bytes=>{
    const encode=buffer=>{let binary='';for(let offset=0;offset<buffer.length;offset+=16384)binary+=String.fromCharCode(...buffer.subarray(offset,offset+16384));return btoa(binary);};
    const results=[];
    for(const rate of [16000,48000]){
      const context=new OfflineAudioContext(1,1,rate);
      const audio=await context.decodeAudioData(Uint8Array.from(bytes).buffer);
      if(audio.numberOfChannels!==1||audio.sampleRate!==rate||audio.duration>6)throw new Error('Unexpected decoded reference format');
      const floats=audio.getChannelData(0),pcm=new Uint8Array(floats.length*2),view=new DataView(pcm.buffer);
      for(let index=0;index<floats.length;index++){
        if(!Number.isFinite(floats[index]))throw new Error('Invalid decoded sample');
        view.setInt16(index*2,Math.max(-32768,Math.min(32767,Math.round(floats[index]*32768))),true);
      }
      results.push({rate,samples:floats.length,pcm:encode(pcm)});
    }
    return results;
  },Array.from(flac));
  const pcm16=Buffer.from(decoded[0].pcm,'base64'),pcm48=Buffer.from(decoded[1].pcm,'base64');
  if(decoded[0].samples!==78720||createHash('md5').update(pcm16).digest('hex')!=='55f5a7763817658c062b2b4d08fd1025')throw new Error('Decoded source does not match FLAC STREAMINFO PCM MD5');
  if(decoded[1].samples!==236160||pcm48.length!==472320)throw new Error('Unexpected resampled frame count');
  const manifest={schema:'aumanet.debug-speech-fixture.v1',scope:'Licensed recording for code tests; not actual microphone/acoustic quality acceptance',
    source:{resource:'LibriSpeech SLR12',url:'https://www.openslr.org/12/',archive:'https://www.openslr.org/resources/12/dev-clean.tar.gz',entry:'LibriSpeech/dev-clean/2277/149896/2277-149896-0026.flac',
      license:'CC-BY-4.0',copyright:'LibriSpeech (c) 2014 by Vassil Panayotov',sha256:sha256(flac),bytes:95629,sampleRate:16000,channels:1,bits:16,samples:78720,seconds:4.92,decodedPcmMd5:'55f5a7763817658c062b2b4d08fd1025',decodedPcmMd5Verified:true,
      acquisition:'Only hash-pinned bytes0–1048575 of the official archive were downloaded; whole archive checksum was not verified'},
    derived:{file:'librispeech-2277-149896-0026-48k.pcm',sha256:sha256(pcm48),bytes:pcm48.length,sampleRate:48000,channels:1,bits:16,encoding:'PCM16LE',samples:236160,seconds:4.92},
    preparation:{script:'dev/tests/Prepare-VoiceSpeechFixture.ps1 + prepare-voice-speech-pcm.mjs',method:'Chromium OfflineAudioContext decodeAudioData/resampling; source PCM checked against FLAC MD5',browserVersion:browser.version(),nodeVersion:process.version},
    runtime:{frameMs:10,samplesPerFrame:480,leadingSilenceFrames:50,trailingSilenceFrames:50,totalFrames:592,totalSeconds:5.92,quietGain:0.25,noisePeakPcm16:4096,noiseSeedHex:'13579bdf',speechSection:'Scheduled reference interval only; not per-frame speech ground truth'},
    releaseIncluded:false,personalMicrophoneCaptured:false};
  await writeFile(resolve(assets,manifest.derived.file),pcm48);
  await writeFile(resolve(assets,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify({status:'prepared',sourcePcmMd5Verified:true,derivedSha256:manifest.derived.sha256,seconds:manifest.derived.seconds,browserVersion:manifest.preparation.browserVersion}));
}finally{await browser.close();}
