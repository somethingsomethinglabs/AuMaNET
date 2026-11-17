import test from 'node:test';
import assert from 'node:assert/strict';
import {WebBluetoothAdapter} from '../packages/core/dist/index.js';
import {BLE_REQUEST,parseBluetoothSnapshot} from '../packages/protocol/dist/index.js';
const snapshot={schema:'aumanet.ble.v1',node:'1cdbd47539c0',name:'AuMaNET-39C0',firmware:'0.5.0',role:'A',uptime_ms:100,radio_started:true,storage_ready:true,
  messages:[{id:'0123456789abcdef',from:'B',text:'Hello 🙂 over HaLow',state:'received',uptime_ms:42}]};
function fixture() {
  const device=new EventTarget(), request=new EventTarget(), response=new EventTarget();
  let buffer='', commands=[], selections=0, nextSnapshot=snapshot, respond=true, rejectWrite=false;
  response.startNotifications=async()=>response;
  request.writeValueWithResponse=async bytes=>{
    if(rejectWrite) throw new Error('Adapter lost');
    assert.ok(bytes.length<=20); buffer+=new TextDecoder().decode(bytes);
    if(buffer.endsWith('\n')) {
      const command=JSON.parse(buffer);buffer='';commands.push(command);
      if(!respond) return;
      const reply=new TextEncoder().encode(JSON.stringify({requestId:command.requestId,ok:true,snapshot:nextSnapshot})+'\n');
      for(let i=0;i<reply.length;i+=7) {
        const chunk=reply.slice(i,i+7);response.value=new DataView(chunk.buffer);
        response.dispatchEvent(new Event('characteristicvaluechanged'));
      }
    }
  };
  device.gatt={connected:true,disconnect(){this.connected=false;buffer='';},async connect(){this.connected=true;return {getPrimaryService:async()=>({getCharacteristic:async uuid=>uuid===BLE_REQUEST?request:response})};}};
  const api={getAvailability:async()=>true,requestDevice:async()=>{selections++;return device;}};
  const states=[],adapter=new WebBluetoothAdapter(api,s=>states.push(s));
  return {adapter,device,commands,states,get selections(){return selections;},set snapshot(s){nextSnapshot=s;},set respond(v){respond=v;},set rejectWrite(v){rejectWrite=v;}};
}
test('fragmented notifications preserve multibyte UTF-8 and board delivery state',async()=>{
  const f=fixture();assert.deepEqual(await f.adapter.connect(),snapshot);assert.equal(f.adapter.state,'connected');f.adapter.disconnect();
});
test('browser reconnect reuses the selected device and subscribes again',async()=>{
  const f=fixture();await f.adapter.connect();f.adapter.disconnect();await f.adapter.connect(true);assert.equal(f.selections,1);f.adapter.disconnect();
});
test('invalid text never reaches GATT and retry preserves the caller message ID',async()=>{
  const f=fixture();await f.adapter.connect();const before=f.commands.length;
  assert.throws(()=>f.adapter.send('0123456789abcdef','🙂'.repeat(61)));assert.equal(f.commands.length,before);
  await f.adapter.send('0123456789abcdef','test');await f.adapter.send('0123456789abcdef','test');
  assert.equal(f.commands.at(-1).id,f.commands.at(-2).id);f.adapter.disconnect();
});
test('disconnect rejects pending work, clears identity and permits a different node',async()=>{
  const f=fixture();await f.adapter.connect();f.respond=false;const pending=f.adapter.snapshot();
  f.device.dispatchEvent(new Event('gattserverdisconnected'));await assert.rejects(pending,/disconnected/);
  assert.equal(f.adapter.state,'disconnected');f.respond=true;f.snapshot={...snapshot,node:'7ce8b1a777ec',role:'B'};
  assert.equal((await f.adapter.connect()).role,'B');f.adapter.disconnect();
});
test('a write failure is surfaced without replaying the operation',async()=>{
  const f=fixture();await f.adapter.connect();f.rejectWrite=true;
  await assert.rejects(f.adapter.send('0123456789abcdef','test'),/Adapter lost/);
  assert.equal(f.commands.length,1);assert.equal(f.adapter.state,'disconnected');
});
test('identity changes and manufactured delivery labels are rejected',async()=>{
  const f=fixture();await f.adapter.connect();f.snapshot={...snapshot,node:'7ce8b1a777ec'};
  await assert.rejects(f.adapter.snapshot(),/identity changed/);f.adapter.disconnect();
  assert.throws(()=>parseBluetoothSnapshot({...snapshot,messages:[{...snapshot.messages[0],state:'Sent · Demo'}]}));
});
test('timeout disconnects rather than automatically resending an ambiguous message',async t=>{
  const f=fixture();await f.adapter.connect();f.respond=false;t.mock.timers.enable({apis:['setTimeout']});
  const pending=f.adapter.send('0123456789abcdef','test');
  // Allow all fragment writes to finish before advancing the response deadline.
  await new Promise(resolve=>setImmediate(resolve));t.mock.timers.tick(45000);
  await assert.rejects(pending,/timed out/);assert.equal(f.commands.filter(c=>c.op==='send').length,1);assert.equal(f.adapter.state,'disconnected');
});
test('disconnect while the chooser is open cannot revive an abandoned connection',async()=>{
  let choose,connects=0;
  const device=Object.assign(new EventTarget(),{gatt:{connected:false,disconnect(){},connect(){connects++;throw new Error('Must not connect');}}});
  const adapter=new WebBluetoothAdapter({getAvailability:async()=>true,requestDevice:()=>new Promise(resolve=>{choose=resolve;})});
  const pending=adapter.connect();adapter.disconnect();choose(device);
  await assert.rejects(pending,/cancelled/);assert.equal(connects,0);assert.equal(adapter.state,'disconnected');
});
