import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

// Exercise the actual core and IndexedDB implementation in Chromium. No fake IDB implementation.
const files=new Map([
  ['/core/indexeddb-messages.js',new URL('../packages/core/dist/indexeddb-messages.js',import.meta.url)],
  ['/core/companion-messages.js',new URL('../packages/core/dist/companion-messages.js',import.meta.url)],
  ...['index','bench','bluetooth','companion-messages'].map(name=>[
    `/protocol/${name}.js`,new URL(`../packages/protocol/dist/${name}.js`,import.meta.url)])
]);
const server=createServer(async(req,res)=>{
  try {
    if(req.url==='/') {res.setHeader('Content-Type','text/html');res.end('<title>AuMaNET storage contract test</title>');return;}
    const file=files.get(req.url);
    if(!file) {res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type','text/javascript');
    res.end((await readFile(fileURLToPath(file),'utf8')).replaceAll("'@aumanet/protocol'","'/protocol/index.js'"));
  } catch {res.writeHead(500);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try {
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const result=await page.evaluate(async()=>{
    const {IndexedDbMessageStore}=await import('/core/indexeddb-messages.js');
    const {CompanionMessages}=await import('/core/companion-messages.js');
    const check=(ok,message)=>{if(!ok)throw new Error(message);};
    const rejects=async(action,message)=>{
      let rejected=false;try {await action();}catch{rejected=true;}check(rejected,message);
    };
    const name='aumanet-storage-verification',node='1cdbd47539c0',id='0123456789abcdef';
    const snapshot={schema:'aumanet.ble.v1',node,name:'Fixture',firmware:'0.5.0',role:'A',uptime_ms:1,
      radio_started:true,storage_ready:true,messages:[]};
    let store=await IndexedDbMessageStore.open(indexedDB,name);
    let messages=new CompanionMessages(store,()=>id,()=>1000);
    await messages.observe(snapshot);await messages.saveDraft(node,'draft before interrupted send');
    let writes=0;
    await rejects(()=>messages.send(snapshot,{send:async()=>{writes++;throw new Error('Lost response');}}),'Lost response was swallowed');
    store.close();store=await IndexedDbMessageStore.open(indexedDB,name);messages=new CompanionMessages(store);
    check((await messages.restore()).pending[0].id===id,'Committed intent did not survive DB reopen');
    check(writes===1,'DB rehydration replayed the send');
    // Two independent clients share one serializable read/write boundary.
    const other=await IndexedDbMessageStore.open(indexedDB,name);
    await Promise.all([
      store.update(node,current=>({...current,draft:current.draft+'A'})),
      other.update(node,current=>({...current,draft:current.draft+'B'}))
    ]);
    const concurrent=(await store.read(node)).draft;
    check(concurrent==='AB'||concurrent==='BA','Concurrent transaction lost a draft change');
    other.close();
    await messages.saveDraft(node,'unsent quota test');
    const put=IDBObjectStore.prototype.put;
    let durability;
    IDBObjectStore.prototype.put=function(...args){
      durability=this.transaction.durability;
      throw new DOMException('Injected quota error','QuotaExceededError');
    };
    try {
      await rejects(()=>messages.send(snapshot,{send:async()=>{writes++;throw new Error('Should not run');}}),'Quota error was swallowed');
    } finally {IDBObjectStore.prototype.put=put;}
    check(durability==='strict','Send intent was not committed with strict durability');
    const unchanged=await store.read(node);
    check(unchanged.draft==='unsent quota test' && unchanged.pending.length===1,'Aborted write changed durable records');
    check(writes===1,'Quota failure allowed a BLE write');
    // Store limits are checked in the same transaction as insertion.
    for(let i=1;i<16;i++)await messages.observe({...snapshot,node:i.toString(16).padStart(12,'0')});
    const overflow='ffffffffffff';
    await rejects(()=>messages.observe({...snapshot,node:overflow}),'Node capacity limit was ignored');
    check(await store.read(overflow)===undefined,'Rejected node insertion was committed');
    const raw=await new Promise(resolve=>{const r=indexedDB.open(name,1);r.onsuccess=()=>resolve(r.result);});
    await new Promise(resolve=>{
      const tx=raw.transaction('nodes','readwrite');tx.objectStore('nodes').put({schema:'future-version'},node);tx.oncomplete=resolve;
    });
    await rejects(()=>store.read(node),'Corrupt records were accepted');
    await rejects(()=>store.update(node,()=>unchanged),'Corrupt records were overwritten');
    const preserved=await new Promise(resolve=>{
      const tx=raw.transaction('nodes');tx.objectStore('nodes').get(node).onsuccess=e=>resolve(e.target.result);
    });
    check(preserved.schema==='future-version','Corrupt data was silently erased');
    raw.close();store.close();
    const future=await new Promise(resolve=>{const r=indexedDB.open(name,2);r.onsuccess=()=>resolve(r.result);});future.close();
    await rejects(()=>IndexedDbMessageStore.open(indexedDB,name),'Future database version was silently downgraded');
    return {result:'PASS',cases:['strict durable intent/reopen','no implicit retry','concurrent updates','quota rollback/no BLE write',
      'atomic capacity bound','corrupt record preservation','future schema rejection'],browser:navigator.userAgent};
  });
  console.log(JSON.stringify(result,null,2));
} finally {
  await browser?.close();await new Promise(resolve=>server.close(resolve));
}
