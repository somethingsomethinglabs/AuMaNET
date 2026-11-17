import test from 'node:test';
import assert from 'node:assert/strict';
import {NativeBluetooth,WebBluetoothAdapter} from '../packages/core/dist/index.js';
import {BLE_SERVICE,BLE_REQUEST,BLE_RESPONSE} from '../packages/protocol/dist/index.js';

const snapshot={schema:'aumanet.ble.v1',node:'1cdbd47539c0',name:'AuMaNET',firmware:'0.5.0',role:'A',uptime_ms:10,radio_started:true,storage_ready:true,messages:[]};
function fixture() {
  const calls=[],commands=[],notifications=[];let onDisconnect,buffer='',deny=false,respond=true,enabled=true;
  const decoder=new TextDecoder('utf-8',{fatal:true});
  const client={
    async initialize(options){calls.push(['initialize',options]);if(deny)throw new Error('Permission denied');},
    async isEnabled(){return enabled;},
    async requestEnable(){calls.push(['enable-prompt']);enabled=true;},
    async requestDevice(options){calls.push(['chooser',options]);return {deviceId:'physical-id',name:'AuMaNET'};},
    async connect(id,callback){calls.push(['connect',id]);onDisconnect=callback;},
    async disconnect(id){calls.push(['disconnect',id]);},
    async startNotifications(id,service,characteristic,callback){
      assert.equal(service,BLE_SERVICE);assert.equal(characteristic,BLE_RESPONSE);notifications.push(callback);
    },
    async write(id,service,characteristic,value){
      assert.equal(service,BLE_SERVICE);assert.equal(characteristic,BLE_REQUEST);assert.ok(value.byteLength<=20);
      buffer+=decoder.decode(value,{stream:true});
      if(buffer.endsWith('\n')) {
        const command=JSON.parse(buffer);buffer='';commands.push(command);
        if(!respond)return;
        const bytes=new TextEncoder().encode(JSON.stringify({requestId:command.requestId,ok:true,snapshot})+'\n');
        // View offset is nonzero, as real bridge buffers may be slices.
        const padded=new Uint8Array(bytes.length+4);padded.set(bytes,2);
        for(let i=0;i<bytes.length;i+=7) notifications.at(-1)(new DataView(padded.buffer,i+2,Math.min(7,bytes.length-i)));
      }
    }
  };
  const bridge=new NativeBluetooth(client),adapter=new WebBluetoothAdapter(bridge);
  return {bridge,adapter,calls,commands,notifications,disconnect:()=>onDisconnect('physical-id'),set enabled(v){enabled=v;},set deny(v){deny=v;},set respond(v){respond=v;}};
}
test('native permissions are requested only on connect and discovery is service-filtered',async()=>{
  const f=fixture();await assert.rejects(f.bridge.getAvailability(),/when you connect/);assert.equal(f.calls.length,0);
  assert.deepEqual(await f.adapter.connect(),snapshot);
  assert.deepEqual(f.calls.slice(0,2),[['initialize',{androidNeverForLocation:true}],['chooser',{services:[BLE_SERVICE]}]]);
  f.adapter.disconnect();
});
test('native bridge transports UTF-8 frames with the existing request and retry ID contract',async()=>{
  const f=fixture();await f.adapter.connect();
  await f.adapter.send('0123456789abcdef','abc'+'🙂'.repeat(59));
  assert.equal(f.commands.at(-1).text,'abc'+'🙂'.repeat(59));f.adapter.disconnect();
});
test('denied native permissions produce no connection or hardware writes',async()=>{
  const f=fixture();f.deny=true;await assert.rejects(f.adapter.connect(),/permission denied.*Nearby devices/);
  assert.equal(f.adapter.state,'disconnected');assert.equal(f.calls.length,1);assert.equal(f.commands.length,0);
});
test('Bluetooth enablement is prompted from connect, never on startup',async()=>{
  const f=fixture();f.enabled=false;await assert.rejects(f.bridge.getAvailability(),/when you connect/);assert.equal(f.calls.length,0);
  await f.adapter.connect();assert.ok(f.calls.some(c=>c[0]==='enable-prompt'));f.adapter.disconnect();
});
test('native disconnect cancels pending send without replay; reconnect ignores old callbacks',async()=>{
  const f=fixture();await f.adapter.connect();const oldNotification=f.notifications[0];
  f.respond=false;const pending=f.adapter.send('0123456789abcdef','text');
  await new Promise(resolve=>setImmediate(resolve));f.disconnect();await assert.rejects(pending,/disconnected/);
  assert.equal(f.commands.filter(c=>c.op==='send').length,1);
  f.respond=true;await f.adapter.connect(true);
  oldNotification(new DataView(new TextEncoder().encode('malformed old data\n').buffer));
  assert.equal(f.adapter.state,'connected');assert.equal(f.calls.filter(c=>c[0]==='chooser').length,1);f.adapter.disconnect();
});
