async (page) => {
  // Explicit fake GATT/board responses. This is browser/storage evidence, never physical BLE evidence.
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  const button=name=>page.getByRole('button',{name,exact:true});
  const nav=name=>page.getByRole('navigation').getByRole('button',{name,exact:true}).click();
  const origin=new URL(page.url()).origin;
  await page.addInitScript(()=>{
    const state=window.__bleFixture={node:'1cdbd47539c0',role:'A',failSend:false,commands:[],messages:[
      {id:'1111111111111111',from:'B',text:'Incoming fixture text',state:'received',uptime_ms:100}
    ]};
    const device=new EventTarget(),response=new EventTarget();
    let buffer='',decoder=new TextDecoder('utf-8',{fatal:true});
    response.startNotifications=async()=>{};
    const request=Object.assign(new EventTarget(),{writeValueWithResponse:async bytes=>{
      buffer+=decoder.decode(bytes,{stream:true});
      if(!buffer.endsWith('\n'))return;
      const command=JSON.parse(buffer);buffer='';state.commands.push(command);
      if(command.op==='send') {
        if(state.failSend)throw new Error('Fixture lost response');
        if(!state.messages.some(m=>m.id===command.id))state.messages.push({id:command.id,from:state.role,text:command.text,state:'delivered_to_peer',uptime_ms:200});
      }
      const snapshot={schema:'aumanet.ble.v1',node:state.node,name:'Fixture node',role:state.role,firmware:'0.5.0',uptime_ms:1000,radio_started:true,storage_ready:true,messages:state.messages.slice(-8)};
      const reply=new TextEncoder().encode(JSON.stringify({requestId:command.requestId,ok:true,snapshot})+'\n');
      for(let i=0;i<reply.length;i+=7) {
        const chunk=reply.slice(i,i+7);response.value=new DataView(chunk.buffer);response.dispatchEvent(new Event('characteristicvaluechanged'));
      }
    }});
    device.gatt={connected:false,disconnect(){this.connected=false;buffer='';decoder=new TextDecoder('utf-8',{fatal:true});},
      async connect(){this.connected=true;return {getPrimaryService:async()=>({getCharacteristic:async uuid=>uuid.startsWith('6ba10002')?request:response})};}};
    Object.defineProperty(navigator,'bluetooth',{configurable:true,value:{getAvailability:async()=>true,requestDevice:async()=>device}});
  });
  await page.goto(origin);
  // Clear only the isolated test browser's live store, leaving demo and actual user profiles alone.
  await page.evaluate(()=>new Promise((resolve,reject)=>{
    const open=indexedDB.open('aumanet-companion-messages',1);
    open.onsuccess=()=>{const db=open.result,tx=db.transaction(['nodes','metadata'],'readwrite');
      tx.objectStore('nodes').clear();tx.objectStore('metadata').clear();tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};
  }));
  await page.reload();await button('Connect a node').click();
  await page.getByText('1cdbd47539c0',{exact:true}).waitFor();
  await nav('Messages');await page.getByText('Incoming fixture text',{exact:true}).waitFor();
  const input=page.getByRole('textbox',{name:'Message peer node',exact:true});
  await input.fill('Offline draft 🙂');
  await page.getByText(/Saved on this device/).last().waitFor();
  await page.reload();await nav('Messages');
  check(await input.inputValue()==='Offline draft 🙂','Draft failed to survive reload');
  check(await button('Send message').isDisabled(),'Reload claimed a live connection');
  await input.fill('Edited while disconnected');await page.getByText(/Saved on this device/).last().waitFor();
  await nav('Network');await button('Connect a node').click();await page.getByText('1cdbd47539c0',{exact:true}).waitFor();
  await nav('Messages');
  check(await input.inputValue()==='Edited while disconnected','Reconnect overwrote draft');
  await page.evaluate(()=>{window.__bleFixture.failSend=true;});
  await button('Send message').click();await page.getByRole('heading',{name:'Unconfirmed messages'}).waitFor();
  check(await input.inputValue()==='','Immutable pending text did not leave the composer');
  const attempt=await page.evaluate(()=>window.__bleFixture.commands.find(c=>c.op==='send').id);
  await page.reload();await nav('Messages');await button('Retry message').waitFor();
  check(await button('Retry message').isDisabled(),'Restored retry was enabled before connection');
  await nav('Network');await button('Connect a node').click();await page.getByText('1cdbd47539c0',{exact:true}).waitFor();await nav('Messages');
  await button('Retry message').click();await page.getByText('Stored by peer node',{exact:true}).waitFor();
  check(await page.evaluate(()=>window.__bleFixture.commands.find(c=>c.op==='send').id)===attempt,'Retry ID changed after reload');
  await input.fill('Keep this draft');await page.getByText(/Saved on this device/).last().waitFor();
  await button('Clear local history').click();const dialog=page.getByRole('dialog',{name:'Clear local history?'});
  await dialog.waitFor();await page.keyboard.press('Escape');check(!await dialog.isVisible(),'Escape did not dismiss dialog');
  check(await page.getByText('Incoming fixture text',{exact:true}).isVisible(),'Cancel cleared history');
  await button('Clear local history').click();await button('Clear history on this device').click();
  await page.getByText('No local messages for this node.',{exact:true}).waitFor();
  await button('Refresh messages').click();await page.getByText('No local messages for this node.',{exact:true}).waitFor();
  check(await input.inputValue()==='Keep this draft','History deletion removed draft');
  await nav('Network');await button('Disconnect').click();
  await page.evaluate(()=>{window.__bleFixture.node='7ce8b1a777ec';window.__bleFixture.role='B';window.__bleFixture.messages=[];});
  await button('Connect a node').click();await page.getByText('7ce8b1a777ec',{exact:true}).waitFor();await nav('Messages');
  check(await input.inputValue()==='','Node B disclosed node A draft');
  check(!await page.getByText('Edited while disconnected',{exact:true}).count(),'Node B disclosed node A history');
  await input.fill('🙂'.repeat(61));check(await button('Send message').isDisabled(),'Oversized multibyte payload was enabled');
  for(const width of [320,360,412,1024]) {
    await page.setViewportSize({width,height:915});
    check(await page.locator('main').evaluate(el=>el.scrollWidth<=el.clientWidth),'Main overflow at '+width);
    check(await page.locator('.composer').evaluate(el=>el.scrollWidth<=el.clientWidth),'Composer overflow at '+width);
  }
  for(const [width,height] of [[1024,170],[360,300]]) {
    await page.setViewportSize({width,height});
    check(await button('Send message').evaluate(el=>{const b=el.getBoundingClientRect();return b.top>=0 && b.bottom<=innerHeight && b.left>=0 && b.right<=innerWidth;}),'Send clipped in keyboard-sized viewport '+width+'x'+height);
  }
  await page.setViewportSize({width:412,height:915});await input.fill('Node B draft');
  await page.screenshot({path:'output/playwright/handoff-live-messages.png',fullPage:true});
  // Inspect the actual browser database, rather than relying only on rendered values.
  const result=await page.evaluate(async()=>{
    const db=await new Promise(resolve=>{const r=indexedDB.open('aumanet-companion-messages',1);r.onsuccess=()=>resolve(r.result);});
    const read=node=>new Promise(resolve=>{const tx=db.transaction('nodes');tx.objectStore('nodes').get(node).onsuccess=e=>resolve(e.target.result);});
    const a=await read('1cdbd47539c0'),b=await read('7ce8b1a777ec');db.close();
    return {a:a.draft,b:b.draft};
  });
  check(result.a==='Keep this draft','Node A durable draft changed');
  // Corrupt data is preserved and surfaced, never silently reset to an empty history.
  await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('aumanet-companion-messages',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('nodes','readwrite');tx.objectStore('nodes').put({schema:'future-version'},'7ce8b1a777ec');tx.oncomplete=()=>{db.close();resolve();};};}));
  await page.reload();await page.getByRole('alert').filter({hasText:'Local message storage:'}).waitFor();
  return 'PASS: fixture BLE, IndexedDB reload, explicit stable-ID retry, offline draft, node isolation, deletion/cancel, UTF-8, narrow layouts and incompatible storage.';
}
