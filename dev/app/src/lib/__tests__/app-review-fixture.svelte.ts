// Browser presentation only: synthetic native readbacks, no Android/peer/media access.
import './network-overview-fixture.svelte';
import {Capacitor,registerPlugin} from '@capacitor/core';
const pin='AB'.repeat(32);
const voice={schema:'aumanet.voice-lab.v1',source:'device',processId:'12345678-1234-1234-1234-123456789abc',sessionId:'a'.repeat(32),sequence:1,initialized:true,joined:true,connection:'connected',muted:true,deafened:false,transmitting:false,gateEpoch:3,leaseRemainingMs:0,observedElapsedMs:100,error:'',interruption:'',peerVerified:true,pathVerified:true,localFingerprint:pin,remoteFingerprint:pin,wifiAddress:'192.0.2.1',audioFocus:true,routeReady:true,captureActive:true,playbackActive:true,captureFrames:100,openFrames:0,zeroedFrames:100,playbackFrames:100,captureLevel:0,playbackLevel:0,processingResult:'STORED',probeTone:false,inputMode:'ptt',detectorAvailable:true,detectorSpeech:false,detectorError:'',detectorFrames:0,preRollMs:0,groupId:'',groupEpoch:0,groupPeerId:'',capturePostAvailable:true,capturePostFrames:100,detectorSensitivity:50,detectorProfile:'balanced',detectorPreferenceNotice:'',routes:[{id:1,type:2,label:'Speaker'}],effectiveRoute:1,stats:{}};
registerPlugin('AuMaNETVoiceLab',{web:()=>({snapshot:async()=>({...voice,sequence:++voice.sequence}),command:async()=>{throw Error('Presentation review must not transmit');},stop:async()=>({...voice,joined:false})})});
const available=Capacitor.isPluginAvailable;
Capacitor.isPluginAvailable=name=>name==='AuMaNETVoiceLab'||available(name);
const fixture=(window as unknown as {__networkOverviewFixture:{enableRadio():Promise<void>;enableInternet():Promise<void>;enableBenchmark():Promise<void>;completeBenchmark():void}}).__networkOverviewFixture;
await fixture.enableRadio();await fixture.enableInternet();await fixture.enableBenchmark();fixture.completeBenchmark();
