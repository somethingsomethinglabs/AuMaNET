import trust from '../releases/trust.json' with {type:'json'};
import profile from '../releases/boards/xiao-esp32s3-halow-au.json?raw';
import {FLASH_BYTES,sha,verifyBundle,verifyImages,checkApplication,planWrites,checkedWrite} from './policy.mjs';
import {openNode} from './serial.mjs';
const $=id=>document.getElementById(id);
const profileSha=await sha(new TextEncoder().encode(profile));
let bundle,images,node,backup,backupRecord,recordRequested=false,backupHash='',busy=false,spent=false,sequenceFloor=0;
const supported=isSecureContext&&window.top===window.self&&typeof navigator.serial?.requestPort==='function'&&!!crypto.subtle;
$('support').textContent=supported?'Ready for USB · your browser will ask you to choose a port.':'Open this page over HTTPS in a desktop browser with Web Serial, such as Chrome or Edge. USB access is unavailable here.';
function refresh(){
  $('published').disabled=busy; $('files').disabled=busy; $('board').disabled=busy||!!node;
  $('connect').disabled=!supported||busy||!!node||!$('board').checked;
  $('disconnect').disabled=busy||!node;
  $('backup').disabled=busy||!node||spent; $('saved').disabled=busy||!backup||!recordRequested||spent;
  for(const id of ['backup-file','backup-record']){$(id).hidden=!backup;$(id).disabled=busy||!backup||spent;}
  $('confirm').disabled=busy||!backup||!bundle||spent;
  $('install').disabled=busy||spent||!node||!bundle||!backup||!recordRequested||!$('saved').checked||$('confirm').value!==node.mac;
  $('progress').hidden=!busy;
}
function error(message){$('error').textContent=message;$('error').hidden=!message;if(message)$('error').focus();}
async function action(work){if(busy)return;busy=true;error('');refresh();try{await work();}catch(e){if(!bundle)text('package-status','No verified firmware selected.');if(!node)text('node-status','No node connected.');error(e?.message||'The operation failed. Reconnect and inspect the node before another installation.');}finally{busy=false;refresh();}}
function text(id,value){$(id).textContent=value;}
function download(data,name,type='application/octet-stream'){
  const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function showPlan(){
  $('confirm').value='';
  if(!bundle||!backup)return;
  try{
    if(bundle.sequence<sequenceFloor)throw Error('This package is older than a package previously used with this node.');
    const plan=planWrites(bundle,backup);
    text('plan',bundle.purpose==='blank-install'?`Blank-node installation: bootloader, partition table and ${bundle.version}. Node ID: ${node.mac}.`:`Configuration-preserving update to ${bundle.version}. Node ID: ${node.mac}. Application slot at 0x${plan[0].address.toString(16)}. Keys and configuration regions are retained.`);
  }catch(e){backup=undefined;text('plan',e.message);error(e.message);}
}
async function load(envelope,files){
  bundle=undefined;images=undefined;refresh();
  const next=await verifyBundle(envelope,trust,profileSha),checked=await verifyImages(next,files);
  const identity=await checkApplication(checked.get('application'),next);
  bundle=next;images=checked;const info=$('package-info');info.replaceChildren();
  for(const [name,value] of [['Version',next.version],['Build',`${identity.channel} · ${identity.sourceStatus==='dirty'?'development snapshot (uncommitted source)':'clean source'}`],['Operation',next.purpose==='blank-install'?'Blank-board installation':'Preserve configuration'],['Publisher','AuMaNET pinned release key'],['Package expires',new Date(next.expiresAt*1000).toLocaleString()]]){
    const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=name;dd.textContent=value;info.append(dt,dd);
  }
  info.hidden=false;text('package-status','Publisher signature and every image verified.');showPlan();
}
$('files').addEventListener('change',()=>action(async()=>{
  bundle=undefined;images=undefined;$('package-info').hidden=true;text('package-status','Checking selected package…');
  const selected=Array.from($('files').files??[]),json=selected.filter(f=>f.name.endsWith('.json'));
  if(selected.length>4||json.length!==1||json[0].size>24000)throw Error('Select one installer JSON and its matching binary files.');
  const files=new Map();for(const file of selected.filter(f=>f!==json[0])){
    if(file.size>0x240000||files.has(file.name))throw Error('Invalid or duplicate package image.');files.set(file.name,new Uint8Array(await file.arrayBuffer()));
  }
  await load(JSON.parse(await json[0].text()),files);
}));
async function boundedFetch(url,max){
  const response=await fetch(url,{cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw Error('Published firmware is not available. Select a maintainer-signed installer package instead.');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>max)throw Error('Published file exceeds its size limit.');chunks.push(value);}}catch(e){await reader.cancel();throw e;}
  const result=new Uint8Array(size);let at=0;for(const chunk of chunks){result.set(chunk,at);at+=chunk.length;}return result;
}
$('published').addEventListener('click',()=>action(async()=>{
  bundle=undefined;images=undefined;$('package-info').hidden=true;text('package-status','Checking published firmware…');
  const base=new URL('./releases/stable/',location.href),raw=await boundedFetch(new URL('installer.json',base),24000);
  const envelope=JSON.parse(new TextDecoder().decode(raw)),next=await verifyBundle(envelope,trust,profileSha),files=new Map();
  for(const part of next.parts)files.set(part.file,await boundedFetch(new URL(part.file,base),part.bytes));
  await load(envelope,files);
}));
$('connect').addEventListener('click',()=>action(async()=>{
  // requestPort occurs directly under this explicit user gesture; no scanning.
  const port=await navigator.serial.requestPort({filters:[{usbVendorId:0x303a}]});
  text('node-status','Connecting to the USB loader…');
  node=await openNode(port);spent=false;backup=undefined;backupHash='';recordRequested=false;backupRecord=undefined;$('saved').checked=false;
  try{const old=localStorage.getItem('aumanet-usb-sequence-'+node.mac);sequenceFloor=old===null?0:Number(old);if(!Number.isSafeInteger(sequenceFloor)||sequenceFloor<0)throw Error();}
  catch{await node.close();node=undefined;throw Error('Local install-history storage is unavailable or invalid. Restore browser storage before installing.');}
  text('node-status',`ESP32-S3 · 8 MiB · Node ID: ${node.mac}`);text('backup-status','Ready to read a private recovery backup.');
}));
$('backup').addEventListener('click',()=>action(async()=>{
  backup=undefined;backupRecord=undefined;recordRequested=false;$('saved').checked=false;text('backup-status','Reading the first 8 MiB copy…');
  const first=await node.readFlash(0,FLASH_BYTES,(_,received,total)=>{$('progress').value=received/total*45;});
  if(first.length!==FLASH_BYTES)throw Error('The first backup read was incomplete. Nothing was written.');
  text('backup-status','Reading the second copy and comparing…');
  const second=await node.readFlash(0,FLASH_BYTES,(_,received,total)=>{$('progress').value=45+received/total*45;});
  const digest=await sha(first);if(second.length!==FLASH_BYTES||digest!==await sha(second)||await node.readMac()!==node.mac)throw Error('Backup verification failed. Nothing was written.');
  backup=first;backupHash=digest;showPlan();
  if(!backup)return;
  download(first,`aumanet-${node.mac}-private-backup.bin`);
  backupRecord={schema:'aumanet.usb-backup.v1',node:node.mac,bytes:FLASH_BYTES,sha256:digest,createdAt:new Date().toISOString()};
  text('backup-status',`Two complete reads match. Save the binary download, then download its SHA-256 record below. Backup SHA-256: ${digest}`);
}));
$('backup-file').addEventListener('click',()=>{if(backup&&node&&!busy&&!spent)download(backup,`aumanet-${node.mac}-private-backup.bin`);});
$('backup-record').addEventListener('click',()=>{if(backupRecord&&backup&&node&&!busy&&!spent){download(JSON.stringify(backupRecord,null,2),`aumanet-${node.mac}-backup-record.json`,'application/json');recordRequested=true;refresh();}});
$('install').addEventListener('click',()=>action(async()=>{
  if(!node||!bundle||!backup||!recordRequested||!$('saved').checked||$('confirm').value!==node.mac||spent)throw Error('Review the exact node and save its backup first.');
  // Persist the replay floor before any flash command; storage uncertainty blocks.
  if(bundle.sequence<sequenceFloor)throw Error('This install package is older than the saved sequence for this node.');
  const floor=Math.max(sequenceFloor,bundle.sequence),key='aumanet-usb-sequence-'+node.mac;
  localStorage.setItem(key,String(floor));if(localStorage.getItem(key)!==String(floor))throw Error('Install-history commit is unconfirmed. Nothing was written.');sequenceFloor=floor;
  // The package was frozen after signature verification; recheck its expiry.
  if(Math.floor(Date.now()/1000)>=bundle.expiresAt)throw Error('This install package expired. Select a current package.');
  spent=true;text('operation','Rechecking the node, writing firmware and verifying readback. Keep USB connected.');
  try{
    await checkedWrite({loader:node,bundle,images,backup,mac:node.mac,expectedMac:$('confirm').value,onprogress:(_,written,total)=>{$('progress').value=written/total*100;}});
    text('operation','Firmware bytes written and read back correctly; retained regions match the backup. Disconnect, restart the node and verify the running firmware and app connection.');
    download(JSON.stringify({schema:'aumanet.usb-install-result.v1',node:node.mac,version:bundle.version,sequence:bundle.sequence,purpose:bundle.purpose,backupSha256:backupHash,parts:bundle.parts,flashReadbackVerified:true,runningImageAuthenticated:false,physicalAcceptanceComplete:false,completedAt:new Date().toISOString()},null,2),`aumanet-${node.mac}-install-result.json`,'application/json');
  }catch(e){text('operation','Installation outcome needs recovery. Keep the private backup. No automatic retry will run.');throw e;}
}));
$('disconnect').addEventListener('click',()=>action(async()=>{await node.close();node=undefined;backup=undefined;backupHash='';$('saved').checked=false;$('confirm').value='';text('node-status','Disconnected. Press Reset on the node to return to its firmware.');text('backup-status','Connect a node first.');}));
for(const id of ['board','saved','confirm'])$(id).addEventListener('input',refresh);
navigator.serial?.addEventListener('disconnect',()=>{node=undefined;backup=undefined;spent=true;text('node-status','USB disconnected. Reconnect and inspect before another operation.');refresh();});
window.addEventListener('beforeunload',event=>{if(busy){event.preventDefault();event.returnValue='';}});
refresh();
