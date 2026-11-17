// Browser presentation/gesture fixture only; no Android settings, networks or RF.
import {mount,unmount} from 'svelte';
import {Capacitor,registerPlugin} from '@capacitor/core';
import {BleClient} from '@capacitor-community/bluetooth-le';
import ConnectedApp from '../ConnectedApp.svelte';
import '../../styles.css';
const calls:string[]=[],self='CD'.repeat(32),owner='AB'.repeat(32);
let wifi='disconnected',status='interrupted';
function group(){return {schema:'aumanet.group.v1',source:'device',processId:'12345678-1234-1234-1234-123456789abc',sequence:1,observedElapsedMs:100,
  status,role:'member',namesAvailable:true,nameStorage:'ready',nameGeneration:0,identity:{id:self,name:'Fixture member',nameRevision:0},
  group:{id:'a'.repeat(32),name:'Fixture group',epoch:1,ownerId:owner,nameRevision:0},members:[{id:owner,name:'Owner',connected:status==='connected',voiceJoined:false,sharingLocation:false},{id:self,name:'Member',connected:status==='connected',voiceJoined:false,sharingLocation:false}],
  pending:[],sharingLocation:false,voiceJoined:false,signals:[],error:''};}
registerPlugin('AuMaNETNodeConnection',{web:()=>({snapshot:async()=>{calls.push('wifi.snapshot');return {schema:'aumanet.node-connection.v1',source:'device',wifi,nodeAuthenticated:false,radioVerified:false};},openWifiSettings:async()=>{calls.push('wifi.settings');return {opened:true};}})});
registerPlugin('AuMaNETGroup',{web:()=>({snapshot:async()=>{calls.push('group.snapshot');return group();},resume:async()=>{calls.push('group.resume');status='connected';return group();}})});
const original={getPlatform:Capacitor.getPlatform,isPluginAvailable:Capacitor.isPluginAvailable,isNativePlatform:Capacitor.isNativePlatform};
const bleOriginal={initialize:BleClient.initialize,isEnabled:BleClient.isEnabled,requestDevice:BleClient.requestDevice};
BleClient.initialize=async()=>{calls.push('ble.initialize');};BleClient.isEnabled=async()=>true;
BleClient.requestDevice=async()=>{calls.push('ble.requestDevice');throw Error('Fixture chooser cancelled');};
Capacitor.getPlatform=()=> 'android';Capacitor.isPluginAvailable=name=>['AuMaNETNodeConnection','AuMaNETGroup','BluetoothLe'].includes(name);Capacitor.isNativePlatform=()=>false;
document.body.innerHTML='<div id="node-connection-fixture"></div>';
const component=mount(ConnectedApp,{target:document.getElementById('node-connection-fixture')!});
Object.assign(window,{__nodeConnectionFixture:{get calls(){return [...calls];},setWifi(value:string){wifi=value;},setGroup(value:string){status=value;},async destroy(){await unmount(component);Object.assign(Capacitor,original);Object.assign(BleClient,bleOriginal);}}});
