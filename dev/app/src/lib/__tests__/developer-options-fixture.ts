// Isolated browser navigation fixture. No native capture, devices, or permissions.
import {mount,unmount} from 'svelte';
import {Capacitor,registerPlugin} from '@capacitor/core';
import ConnectedApp from '../ConnectedApp.svelte';
import '../../styles.css';

const calls:string[]=[];
const pin='AB'.repeat(32);
const state={schema:'aumanet.voice-lab.v1',source:'device',processId:'12345678-1234-1234-1234-123456789abc',sessionId:'a'.repeat(32),
  sequence:1,initialized:true,joined:true,connection:'connected',muted:true,deafened:false,transmitting:false,gateEpoch:3,
  leaseRemainingMs:0,observedElapsedMs:100,error:'',interruption:'',peerVerified:true,pathVerified:true,localFingerprint:pin,
  remoteFingerprint:pin,wifiAddress:'192.168.0.101',audioFocus:true,routeReady:true,captureActive:true,playbackActive:true,
  captureFrames:100,openFrames:0,zeroedFrames:100,playbackFrames:100,captureLevel:0,playbackLevel:0,processingResult:'STORED',
  probeTone:false,inputMode:'ptt',detectorAvailable:true,detectorSpeech:false,detectorError:'',detectorFrames:0,preRollMs:0,
  groupId:'',groupEpoch:0,groupPeerId:'',capturePostAvailable:true,capturePostFrames:100,
  detectorSensitivity:50,detectorProfile:'balanced',detectorPreferenceNotice:'',
  routes:[{id:1,type:2,label:'Speaker'}],effectiveRoute:1,stats:{}};
registerPlugin('AuMaNETVoiceLab',{web:()=>({snapshot:async()=>{calls.push('snapshot');return state;},
  command:async()=>{calls.push('command');throw new Error('Navigation must not change native audio');},
  start:async()=>{calls.push('start');throw new Error('Navigation must not start native audio');},
  stop:async()=>{calls.push('stop');throw new Error('Navigation must not stop native audio');}})});
const original={getPlatform:Capacitor.getPlatform,isPluginAvailable:Capacitor.isPluginAvailable,isNativePlatform:Capacitor.isNativePlatform};
Capacitor.getPlatform=()=> 'android';
Capacitor.isPluginAvailable=name=>name==='AuMaNETVoiceLab';
Capacitor.isNativePlatform=()=>false;
document.body.innerHTML='<div id="developer-options-check"></div>';
const component=mount(ConnectedApp,{target:document.getElementById('developer-options-check')!});
Object.assign(window,{__developerOptionsFixture:{get calls(){return [...calls];},get muted(){return state.muted;},
  async destroy(){await unmount(component);Object.assign(Capacitor,original);}}});
