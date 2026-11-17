import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalGroupVoiceCoordinator} from '../packages/core/dist/local-group-voice.js';

const low='AA'.repeat(32),high='BB'.repeat(32),groupId='a'.repeat(32),sessionId='c'.repeat(32),fingerprint='DD'.repeat(32);
const signal=(type,id=sessionId)=>({schema:'aumanet.voice-lab.signal.v1',sessionId:id,type,fingerprint,createdAt:Date.now(),sdp:'fixture only'});
const empty={joined:false,sessionId:'',connection:'idle',groupId:'',groupEpoch:0,groupPeerId:'',groupMode:false,peers:[],remoteFingerprint:'',peerVerified:false,error:''};
const peerState=(peerId,pairSessionId,patch={})=>({peerId,pairSessionId,connection:'new',peerVerified:false,pathVerified:false,localFingerprint:fingerprint,remoteFingerprint:'',error:'',stats:{},...patch});
function fixture(self=low,peer=high){
  const ownershipCalls=[],calls=[],groupListeners=new Set(),voiceListeners=new Set();let time=0,pairCounter=BigInt(`0x${sessionId}`);
  const group={synced:true,state:{schema:'aumanet.group.v1',source:'device',processId:'fixture',sequence:1,observedElapsedMs:0,status:'connected',role:self===low?'owner':'member',identity:{id:self,name:'Self'},group:{id:groupId,name:'Group',epoch:1,ownerId:low},
    voiceConsentRevision:0,members:[{id:self,name:'Self',connected:true,voiceJoined:false,sharingLocation:false},{id:peer,name:'Peer',connected:true,voiceJoined:false,sharingLocation:false}],pending:[],sharingLocation:false,voiceJoined:false,signals:[],error:''},
    subscribe(fn){groupListeners.add(fn);fn(this.state);return()=>groupListeners.delete(fn);},onError(){return()=>{};},async refresh(){return this.state;},
    async voice(joined,expected){ownershipCalls.push({method:'voice',joined,expected});if(expected!==undefined&&expected!==this.state.voiceConsentRevision)throw new Error('Voice consent ownership changed');calls.push(['presence',joined]);updateGroup({voiceConsentRevision:this.state.voiceConsentRevision+1,voiceJoined:joined,signals:joined?this.state.signals:[],members:this.state.members.map(m=>m.id===self?{...m,voiceJoined:joined}:m)});return this.state;},
    async sendSignal(to,value,voiceRevision){calls.push(['send',to,value,voiceRevision]);},async ackSignals(ids){calls.push(['ack',ids]);updateGroup({signals:this.state.signals.filter(s=>!ids.includes(s.id))});return this.state;}};
  const voice={supportsGroupMesh:true,synchronized:true,state:{...empty},subscribe(fn){voiceListeners.add(fn);fn(this.state);return()=>voiceListeners.delete(fn);},onError(){return()=>{};},
    async refresh(){return this.state;},async start(id=sessionId){calls.push(['start',id]);updateVoice({...empty,joined:true,sessionId:id,connection:'ready',muted:true});return this.state;},
    async stop(expected){ownershipCalls.push({method:'stop',expected});calls.push(['stop']);if(expected!==undefined&&this.state.sessionId!==expected)return this.state;updateVoice({...empty});return this.state;},
    async groupBind(id,epoch,expected){if(expected!==group.state.voiceConsentRevision)throw new Error('Voice consent ownership changed before bind');calls.push(['bind',id,epoch,peer]);updateVoice({groupId:id,groupEpoch:epoch,groupPeerId:'',groupMode:true,groupVoiceConsentRevision:expected});return this.state;},
    async peerAdd(peerId,pairSessionId){calls.push(['add',peerId,pairSessionId]);updateVoice({peers:[...this.state.peers,peerState(peerId,pairSessionId)]});return this.state;},
    async peerRemove(peerId,pairSessionId){calls.push(['remove',peerId,pairSessionId]);const peers=this.state.peers.filter(p=>p.peerId!==peerId||p.pairSessionId!==pairSessionId);updateVoice({peers,connection:peers.length?(peers.every(peer=>peer.connection==='connected')?'connected':'connecting'):'ready'});return this.state;},
    async peerCreateOffer(peerId,pairSessionId){calls.push(['offer',peerId,pairSessionId]);return signal('offer',pairSessionId);},
    async peerApplySignal(peerId,pairSessionId,value,pin){calls.push(['apply',value,pin,peerId]);updateVoice({remoteFingerprint:pin,peerVerified:true,connection:'connected',peers:this.state.peers.map(p=>p.peerId===peerId?{...p,remoteFingerprint:pin,peerVerified:true,pathVerified:true,connection:'connected'}:p)});return signal(value.type==='offer'?'answer':'offer',pairSessionId);}};
  function updateGroup(patch){group.state={...group.state,...patch};for(const fn of groupListeners)fn(group.state);}
  function updateVoice(patch){voice.state={...voice.state,...patch};for(const fn of voiceListeners)fn(voice.state);}
  const coordinator=new LocalGroupVoiceCoordinator(group,voice,()=>time,()=> (pairCounter++).toString(16).padStart(32,'0'));
  const unsubscribe=coordinator.subscribe(()=>{});
  const settle=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
  return {calls,ownershipCalls,group,voice,coordinator,updateGroup,updateVoice,settle,set time(value){time=value;},peerJoin(){updateGroup({members:group.state.members.map(m=>m.id===peer?{...m,voiceJoined:true}:m)});},
    event(type='offer',id='e'.repeat(32),from=peer){updateGroup({signals:[{id,from,to:self,signal:signal(type,voice.state.peers.find(value=>value.peerId===from)?.pairSessionId??sessionId),receivedElapsedMs:0}]});},dispose(){unsubscribe();coordinator.dispose();}};
}

test('read-only observation cannot start a microphone or join a channel',async()=>{
  const f=fixture();f.peerJoin();await f.settle();assert.deepEqual(f.calls,[]);assert.equal(f.coordinator.state.status,'idle');f.dispose();
});

test('remembered native voice remains observation-only across group loss and fresh master recovery',async()=>{
  const f=fixture();try{
    f.updateGroup({voiceJoined:true,voiceConsentRevision:3});
    f.updateVoice({...empty,joined:true,trustedConnectionOwned:true,nativeCoordinatorAvailable:true,coordinatorOwner:'native',groupMode:true,sessionId,groupId,groupEpoch:1,groupVoiceConsentRevision:3,coordinatorStatus:'connected'});
    await f.settle();assert.deepEqual(f.calls,[]);assert.equal(f.coordinator.state.status,'connected');
    f.updateGroup({status:'interrupted',voiceJoined:false,voiceConsentRevision:4});await f.settle();assert.deepEqual(f.calls,[]);assert.equal(f.voice.state.joined,true);assert.equal(f.coordinator.state.status,'interrupted');
    f.updateGroup({status:'connected',voiceJoined:true,voiceConsentRevision:5});f.updateVoice({sessionId:'d'.repeat(32),groupVoiceConsentRevision:5,coordinatorStatus:'waiting'});await f.settle();assert.deepEqual(f.calls,[]);assert.equal(f.coordinator.state.status,'waiting');
    await assert.rejects(()=>f.coordinator.join(),/remembered connection owns/);assert.deepEqual(f.calls,[]);
    await f.coordinator.leave();assert.equal(f.group.state.voiceJoined,false);assert.equal(f.voice.state.joined,false);assert.equal(f.calls.filter(call=>call[0]==='stop').length,1);
  }finally{f.dispose();}
});

test('explicit caller join waits for an actual peer, binds authorization then offers once',async()=>{
  const f=fixture();await f.coordinator.join();await f.settle();assert.equal(f.calls.filter(c=>c[0]==='start').length,0);assert.equal(f.coordinator.state.status,'waiting');
  f.peerJoin();await f.settle();assert.equal(f.calls.filter(c=>c[0]==='start').length,1);assert.equal(f.calls.filter(c=>c[0]==='offer').length,1);
  assert.deepEqual(f.calls.find(c=>c[0]==='bind'),['bind',groupId,1,high]);assert.equal(f.calls.find(c=>c[0]==='send')[1],high);
  for(let i=0;i<4;i++)f.coordinator.reconcile(f.group.state);await f.settle();assert.equal(f.calls.filter(c=>c[0]==='offer').length,1);
  f.event('answer');await f.settle();assert.equal(f.coordinator.state.status,'connected');assert.equal(f.calls.filter(c=>c[0]==='apply').length,1);
  assert.ok(f.calls.findIndex(c=>c[0]==='apply')<f.calls.findIndex(c=>c[0]==='ack'),'authenticate/apply before acknowledgement');f.dispose();
});

test('receiver opens only a consented authenticated offer, answers, and deduplicates stable event IDs',async()=>{
  const f=fixture(high,low);f.peerJoin();await f.coordinator.join();await f.settle();assert.equal(f.calls.filter(c=>c[0]==='start').length,0);
  f.event();await f.settle();assert.equal(f.calls.filter(c=>c[0]==='start').length,1);assert.equal(f.calls.filter(c=>c[0]==='apply').length,1);assert.equal(f.calls.find(c=>c[0]==='send')[2].type,'answer');
  f.event();await f.settle();assert.equal(f.calls.filter(c=>c[0]==='apply').length,1);assert.equal(f.calls.filter(c=>c[0]==='start').length,1);f.dispose();
});

test('leave while native startup is pending cannot issue a later offer or resurrect consent',async()=>{
  const f=fixture();let finishStart;f.voice.start=id=>{f.calls.push(['start',id]);return new Promise(resolve=>finishStart=resolve);};
  f.peerJoin();await f.coordinator.join();await new Promise(resolve=>setImmediate(resolve));assert.ok(finishStart);
  await f.coordinator.leave();finishStart({...empty,joined:true,sessionId});await f.settle();
  assert.equal(f.group.state.voiceJoined,false);assert.equal(f.coordinator.state.status,'idle');assert.equal(f.calls.some(c=>c[0]==='offer'),false);f.dispose();
});

test('wrong sender, wrong session and excessive voice participants fail closed',async()=>{
  const f=fixture();f.peerJoin();await f.coordinator.join();await f.settle();f.event('answer','e'.repeat(32),'CC'.repeat(32));await f.settle();
  assert.equal(f.coordinator.state.status,'interrupted');assert.match(f.coordinator.state.error,/different group peer/);assert.equal(f.voice.state.joined,false);f.dispose();
  const g=fixture();g.peerJoin();await g.coordinator.join();await g.settle();g.updateGroup({signals:[{id:'e'.repeat(32),from:high,to:low,signal:{...signal('answer'),sessionId:'f'.repeat(32)},receivedElapsedMs:0}]});await g.settle();assert.match(g.coordinator.state.error,/active native caller/);g.dispose();
  const h=fixture();h.peerJoin();h.updateGroup({members:[...h.group.state.members,...['CC','DD','EE','FF'].map(id=>({id:id.repeat(32),name:'Extra',connected:true,voiceJoined:true,sharingLocation:false}))]});await h.coordinator.join();await h.settle();assert.equal(h.coordinator.state.status,'failed');assert.match(h.coordinator.state.error,/at most five participants/);assert.equal(h.calls.some(c=>c[0]==='start'),false);h.dispose();
});

test('WebView reload hydrates the existing bound session and native interruption cannot restart capture',async()=>{
  const f=fixture();f.dispose();f.group.state={...f.group.state,voiceJoined:true,voiceConsentRevision:2,members:f.group.state.members.map(m=>({...m,voiceJoined:true}))};
  f.voice.state={...empty,joined:true,sessionId,groupId,groupEpoch:1,groupPeerId:'',groupMode:true,groupVoiceConsentRevision:2,peers:[peerState(high,sessionId,{connection:'connected',peerVerified:true,pathVerified:true,remoteFingerprint:fingerprint})],connection:'connected',peerVerified:true,remoteFingerprint:fingerprint};
  const restored=new LocalGroupVoiceCoordinator(f.group,f.voice);const unsub=restored.subscribe(()=>{});await f.settle();assert.equal(restored.state.status,'connected');assert.equal(f.calls.some(c=>c[0]==='start'),false);
  f.updateVoice({...empty});await f.settle();assert.equal(restored.state.status,'interrupted');for(let i=0;i<3;i++)restored.reconcile(f.group.state);await f.settle();assert.equal(f.calls.some(c=>c[0]==='start'),false);unsub();restored.dispose();
});

test('failed media withdraws group presence before stopping capture',async()=>{
  const f=fixture();f.peerJoin();await f.coordinator.join();await f.settle();
  const before=f.calls.length;f.updateVoice({connection:'failed',error:'Fixture media failure'});await f.settle();
  assert.equal(f.group.state.voiceJoined,false);assert.equal(f.coordinator.state.status,'interrupted');
  const cleanup=f.calls.slice(before);
  assert.deepEqual(cleanup.slice(0,2),[['presence',false],['stop']]);
  assert.equal(f.calls.some(call=>call[0]==='command'&&call[1]?.muted===false),false);
  f.dispose();
});

test('delayed failure cleanup cannot stop or overwrite a newer explicit Join',async()=>{
  const f=fixture();f.peerJoin();await f.coordinator.join();await f.settle();
  const original=f.group.voice;let releaseFailure;
  f.group.voice=async (enabled,expected)=>{
    const state=await original.call(f.group,enabled,expected);
    if(!enabled&&!releaseFailure)await new Promise(resolve=>releaseFailure=resolve);
    return state;
  };
  f.updateVoice({connection:'failed',error:'Old failure'});await new Promise(resolve=>setImmediate(resolve));
  assert.ok(releaseFailure);await f.coordinator.join();
  const stopsBefore=f.calls.filter(call=>call[0]==='stop').length;
  releaseFailure();await f.settle();
  assert.equal(f.calls.filter(call=>call[0]==='stop').length,stopsBefore,'Old failure stopped the newer join');
  assert.equal(f.group.state.voiceJoined,true);assert.notEqual(f.coordinator.state.status,'interrupted');
  assert.equal(f.coordinator.state.error,'');f.dispose();
});

test('observing channel presence without a master cannot withdraw another UI pending Join',async()=>{
  const f=fixture();f.dispose();f.group.state={...f.group.state,voiceJoined:true,voiceConsentRevision:2};
  const restored=new LocalGroupVoiceCoordinator(f.group,f.voice);const unsub=restored.subscribe(()=>{});await f.settle();
  assert.equal(f.group.state.voiceJoined,true);assert.equal(restored.state.status,'interrupted');assert.equal(f.calls.some(call=>call[0]==='presence'),false,'An observer must not withdraw another UI pending join');
  assert.equal(f.calls.some(call=>call[0]==='start'),false);unsub();restored.dispose();
});

test('a delayed Leave result cannot stop the next explicitly joined call',async()=>{
  const f=fixture();f.peerJoin();await f.coordinator.join();await f.settle();
  const original=f.group.voice;let releaseLeave;
  f.group.voice=async (enabled,expected)=>{
    const state=await original.call(f.group,enabled,expected);
    if(!enabled&&!releaseLeave)await new Promise(resolve=>releaseLeave=resolve);
    return state;
  };
  const leaving=f.coordinator.leave();await new Promise(resolve=>setImmediate(resolve));
  assert.ok(releaseLeave);await f.coordinator.join();
  const stopsBefore=f.calls.filter(call=>call[0]==='stop').length;
  releaseLeave();await leaving;await f.settle();
  assert.equal(f.calls.filter(call=>call[0]==='stop').length,stopsBefore);
  assert.equal(f.group.state.voiceJoined,true);assert.notEqual(f.coordinator.state.status,'idle');f.dispose();
});

test('a failed consent bridge does not prevent independent native media stop',async()=>{
  const f=fixture();f.peerJoin();await f.coordinator.join();await f.settle();
  f.group.voice=async()=>{throw new Error('Group bridge unavailable');};
  f.updateVoice({connection:'failed',error:'Media failure'});await f.settle();
  assert.equal(f.voice.state.joined,false);assert.equal(f.coordinator.state.status,'interrupted');
  assert.match(f.coordinator.state.error,/Media failure/);f.dispose();
});




function mesh(size){
  const ids=Array.from({length:size},(_,i)=>(i+1).toString(16).toUpperCase().padStart(2,'0').repeat(32));
  const calls=[],nodes=[],joined=new Set();let revision=1,counter=1,broadcasting=false;
  const nextId=()=> (counter++).toString(16).padStart(32,'0');
  function notify(node){for(const listener of node.groupListeners)listener(node.group.state);}
  function roster(){
    for(const node of nodes){node.group.state={...node.group.state,voiceRevision:revision,voiceJoined:joined.has(node.id),signals:[],members:ids.map(id=>({id,name:id.slice(0,2),connected:true,voiceJoined:joined.has(id),sharingLocation:false}))};notify(node);}
  }
  function presence(node,on){const changed=joined.has(node.id)!==on;if(on)joined.add(node.id);else joined.delete(node.id);if(changed)revision++;
    node.group.state={...node.group.state,voiceJoined:on,members:node.group.state.members.map(member=>member.id===node.id?{...member,voiceJoined:on}:member),signals:on?node.group.state.signals:[]};notify(node);if(broadcasting&&changed)roster();}
  for(const id of ids){
    const node={id,groupListeners:new Set(),voiceListeners:new Set()};nodes.push(node);
    function voicePatch(patch){node.voice.state={...node.voice.state,...patch};for(const fn of node.voiceListeners)fn(node.voice.state);}
    node.group={synced:true,state:{schema:'aumanet.group.v1',source:'device',status:id===ids[0]?'hosting':'connected',identity:{id,name:id.slice(0,2)},group:{id:groupId,epoch:1,ownerId:ids[0],name:'Group'},voiceRevision:revision,voiceConsentRevision:0,voiceJoined:false,signals:[],members:ids.map(id=>({id,connected:true,voiceJoined:false}))},
      subscribe(fn){node.groupListeners.add(fn);fn(this.state);return()=>node.groupListeners.delete(fn);},onError(){return()=>{};},async refresh(){return this.state;},
      async voice(on,expected){if(expected!==undefined&&expected!==this.state.voiceConsentRevision)throw new Error('Voice consent ownership changed');this.state={...this.state,voiceConsentRevision:this.state.voiceConsentRevision+1};calls.push([id,'presence',on]);presence(node,on);return this.state;},
      async ackSignals(eventIds){calls.push([id,'ack',...eventIds]);this.state={...this.state,signals:this.state.signals.filter(event=>!eventIds.includes(event.id))};notify(node);return this.state;},
      async sendSignal(to,signal,voiceRevision){assert.equal(voiceRevision,this.state.voiceRevision);calls.push([id,'send',to,signal,voiceRevision]);const receiver=nodes.find(node=>node.id===to);assert.ok(receiver);const event={id:nextId(),from:id,to,signal,receivedElapsedMs:0,voiceRevision:this.state.voiceRevision};receiver.group.state={...receiver.group.state,signals:[...receiver.group.state.signals,event]};notify(receiver);}};
    node.voice={supportsGroupMesh:true,synchronized:true,state:{...empty},subscribe(fn){node.voiceListeners.add(fn);fn(this.state);return()=>node.voiceListeners.delete(fn);},onError(){return()=>{};},async refresh(){return this.state;},
      async start(masterId){calls.push([id,'start']);voicePatch({...empty,joined:true,sessionId:masterId,connection:'ready',muted:true});return this.state;},
      async stop(expected){calls.push([id,'stop']);if(expected!==undefined&&this.state.sessionId!==expected)return this.state;voicePatch({...empty});return this.state;},
      async groupBind(group,epoch,expected){if(expected!==node.group.state.voiceConsentRevision)throw new Error('Voice consent ownership changed before bind');calls.push([id,'bind']);voicePatch({groupId:group,groupEpoch:epoch,groupMode:true,groupVoiceConsentRevision:expected});return this.state;},
      async peerAdd(peerId,pairSessionId){assert.ok(this.state.joined&&this.state.groupMode);assert.ok(!this.state.peers.some(peer=>peer.peerId===peerId),'Must retire the old PC before replacement');assert.ok(this.state.peers.length<4);calls.push([id,'add',peerId,pairSessionId]);voicePatch({muted:true,peers:[...this.state.peers,peerState(peerId,pairSessionId)]});return this.state;},
      async peerRemove(peerId,pairSessionId){calls.push([id,'remove',peerId,pairSessionId]);voicePatch({muted:true,peers:this.state.peers.filter(peer=>peer.peerId!==peerId||peer.pairSessionId!==pairSessionId)});return this.state;},
      async peerCreateOffer(peerId,pairSessionId){assert.ok(id<peerId,'Exactly the lower identity is caller');calls.push([id,'offer',peerId,pairSessionId]);return signal('offer',pairSessionId);},
      async peerApplySignal(peerId,pairSessionId,value){assert.equal(value.sessionId,pairSessionId);assert.ok(this.state.peers.some(peer=>peer.peerId===peerId&&peer.pairSessionId===pairSessionId));calls.push([id,'apply',peerId,pairSessionId,value.type]);voicePatch({peers:this.state.peers.map(peer=>peer.peerId===peerId?{...peer,connection:'connected',peerVerified:true,pathVerified:true,remoteFingerprint:fingerprint}:peer)});return signal(value.type==='offer'?'answer':'offer',pairSessionId);}};
    node.coordinator=new LocalGroupVoiceCoordinator(node.group,node.voice,()=>0,nextId);node.coordinator.subscribe(()=>{});
  }
  return {nodes,calls,async joinAll(){await Promise.all(nodes.map(node=>node.coordinator.join()));broadcasting=true;roster();await this.settle();},
    async settle(){for(let i=0;i<40;i++)await new Promise(resolve=>setImmediate(resolve));},
    bumpRevision(){revision++;roster();},dispose(){for(const node of nodes)node.coordinator.dispose();},pairIds(){return new Set(nodes.flatMap(node=>node.voice.state.peers.map(peer=>peer.pairSessionId)));},
    inject(node,event){node.group.state={...node.group.state,signals:[...node.group.state.signals,event]};notify(node);}};
}

test('five explicitly joined phones form exactly ten independent bounded pairs',async()=>{
  const f=mesh(5);try{await f.joinAll();assert.equal(f.pairIds().size,10);
    for(const node of f.nodes){assert.equal(node.voice.state.peers.length,4);assert.equal(node.coordinator.state.status,'connected');assert.equal(node.coordinator.state.connectedPeers,4);assert.equal(node.voice.state.muted,true);}
    const offers=f.calls.filter(call=>call[1]==='offer');assert.equal(offers.length,10);assert.equal(new Set(offers.map(call=>call[3])).size,10);
    assert.equal(f.calls.filter(call=>call[1]==='start').length,5);assert.equal(f.calls.filter(call=>call[1]==='apply').length,20);
    for(const node of f.nodes)for(const peer of node.voice.state.peers){const other=f.nodes.find(value=>value.id===peer.peerId);assert.ok(other.voice.state.peers.some(link=>link.peerId===node.id&&link.pairSessionId===peer.pairSessionId));}
  }finally{f.dispose();}
});

test('recipient revision ABA retires all PCs and old queued pairs cannot be reused',async()=>{
  const f=mesh(3);try{await f.joinAll();const old=f.pairIds(),starts=f.calls.filter(call=>call[1]==='start').length;
    const offer=f.calls.find(call=>call[1]==='send'&&call[3].type==='offer');const receiver=f.nodes.find(node=>node.id===offer[2]);
    f.bumpRevision();await f.settle();assert.equal(f.pairIds().size,3);assert.ok([...f.pairIds()].every(id=>!old.has(id)));assert.equal(f.calls.filter(call=>call[1]==='start').length,starts);
    const applied=f.calls.filter(call=>call[1]==='apply').length;f.inject(receiver,{id:'f'.repeat(32),from:offer[0],to:receiver.id,signal:offer[3],receivedElapsedMs:0,voiceRevision:receiver.group.state.voiceRevision});await f.settle();
    assert.equal(f.calls.filter(call=>call[1]==='apply').length,applied);assert.equal(receiver.coordinator.state.status,'connected');
  }finally{f.dispose();}
});

test('a participant leaves and explicitly rejoins with fresh pairs while survivors remain muted',async()=>{
  const f=mesh(5);try{await f.joinAll();const old=f.pairIds(),departing=f.nodes[2];await departing.coordinator.leave();await f.settle();
    assert.equal(departing.voice.state.joined,false);assert.equal(f.pairIds().size,6);for(const node of f.nodes.filter(node=>node!==departing)){assert.equal(node.voice.state.peers.length,3);assert.equal(node.coordinator.state.status,'connected');assert.equal(node.voice.state.muted,true);}
    await departing.coordinator.join();await f.settle();assert.equal(f.pairIds().size,10);assert.ok([...f.pairIds()].every(id=>!old.has(id)));for(const node of f.nodes)assert.equal(node.coordinator.state.status,'connected');
  }finally{f.dispose();}
});

test('Leave during an asynchronous answer cannot send a late answer or rejoin presence',async()=>{
  const f=fixture(high,low);let release;f.voice.peerApplySignal=async()=>new Promise(resolve=>release=resolve);
  try{f.peerJoin();await f.coordinator.join();f.event();await new Promise(resolve=>setImmediate(resolve));assert.ok(release);await f.coordinator.leave();release(signal('answer'));await f.settle();
    assert.equal(f.group.state.voiceJoined,false);assert.equal(f.coordinator.state.status,'idle');assert.equal(f.calls.some(call=>call[0]==='send'),false);
  }finally{f.dispose();}
});

test('wrong group or epoch interrupts the current mesh and cannot start replacement capture',async()=>{
  for(const patch of [{id:'f'.repeat(32)},{epoch:2}]){const f=fixture();try{f.peerJoin();await f.coordinator.join();await f.settle();const starts=f.calls.filter(call=>call[0]==='start').length;
    f.updateGroup({group:{...f.group.state.group,...patch}});await f.settle();assert.equal(f.coordinator.state.status,'interrupted');assert.equal(f.group.state.voiceJoined,!!patch.id,'A different group owns its own consent');assert.equal(f.voice.state.joined,false);assert.equal(f.calls.filter(call=>call[0]==='start').length,starts);
  }finally{f.dispose();}}
});


test('recipient changes during master startup bind once then reconcile without reopening capture',async()=>{
  const f=fixture();const start=f.voice.start;let release;
  f.voice.start=async()=>{const value=await start.call(f.voice);await new Promise(resolve=>release=resolve);return value;};
  try{f.peerJoin();await f.coordinator.join();await new Promise(resolve=>setImmediate(resolve));assert.ok(release);
    f.updateGroup({members:[...f.group.state.members,{id:'CC'.repeat(32),name:'Third',connected:true,voiceJoined:true}]});release();await f.settle();
    assert.equal(f.calls.filter(call=>call[0]==='start').length,1);assert.equal(f.calls.filter(call=>call[0]==='bind').length,1);assert.equal(f.voice.state.peers.length,2);assert.equal(f.coordinator.state.status,'connecting');assert.equal(f.group.state.voiceJoined,true);
  }finally{f.dispose();}
});

test('an event from a stale owner recipient revision cannot start capture',async()=>{
  const f=fixture(high,low);try{f.peerJoin();await f.coordinator.join();await f.settle();f.updateGroup({voiceRevision:2,signals:[{id:'e'.repeat(32),from:low,to:high,signal:signal('offer'),receivedElapsedMs:0,voiceRevision:1}]});await f.settle();
    assert.equal(f.coordinator.state.status,'interrupted');assert.match(f.coordinator.state.error,/stale group recipient revision/);assert.equal(f.calls.some(call=>call[0]==='start'),false);
  }finally{f.dispose();}
});


test('an individual transport failure retires only its pair and cannot restart the master in a loop',async()=>{
  const f=fixture();const third='CC'.repeat(32);try{f.peerJoin();f.updateGroup({members:[...f.group.state.members,{id:third,name:'Third',connected:true,voiceJoined:true}]});await f.coordinator.join();await f.settle();f.event('answer');await f.settle();
    const starts=f.calls.filter(call=>call[0]==='start').length,adds=f.calls.filter(call=>call[0]==='add').length;
    f.updateVoice({connection:'failed',error:'',peers:f.voice.state.peers.map(peer=>peer.peerId===third?{...peer,connection:'failed',error:'Transport unavailable'}:peer)});await f.settle();
    assert.equal(f.group.state.voiceJoined,true);assert.equal(f.voice.state.joined,true);assert.equal(f.voice.state.peers.length,1);assert.equal(f.coordinator.state.connectedPeers,1);assert.match(f.coordinator.state.error,/Transport unavailable/);
    for(let i=0;i<5;i++)f.coordinator.reconcile(f.group.state);await f.settle();assert.equal(f.calls.filter(call=>call[0]==='start').length,starts);assert.equal(f.calls.filter(call=>call[0]==='add').length,adds);
  }finally{f.dispose();}
});


test('an asynchronously exported old-cohort offer is discarded before transport send',async()=>{
  const f=fixture();const offer=f.voice.peerCreateOffer;let release,first=true;
  f.voice.peerCreateOffer=async(...args)=>{const value=await offer.apply(f.voice,args);if(first){first=false;await new Promise(resolve=>release=resolve);}return value;};
  try{f.updateGroup({voiceRevision:1});f.peerJoin();await f.coordinator.join();await new Promise(resolve=>setImmediate(resolve));assert.ok(release);
    const oldPair=f.voice.state.peers[0].pairSessionId;f.updateGroup({voiceRevision:2});release();await f.settle();const sends=f.calls.filter(call=>call[0]==='send');
    assert.equal(sends.length,1);assert.notEqual(sends[0][2].sessionId,oldPair);assert.equal(sends[0][3],2);assert.equal(f.group.state.voiceJoined,true);
  }finally{f.dispose();}
});

test('fatal master errors always withdraw consent even when a peer has already failed',async()=>{
  const f=fixture();try{f.peerJoin();await f.coordinator.join();await f.settle();const before=f.calls.length;
    f.updateVoice({connection:'failed',error:'Audio focus lost',peers:f.voice.state.peers.map(peer=>({...peer,connection:'failed',error:'Peer transport failed'}))});await f.settle();
    assert.equal(f.coordinator.state.status,'interrupted');assert.match(f.coordinator.state.error,/Audio focus lost/);assert.equal(f.group.state.voiceJoined,false);assert.equal(f.voice.state.joined,false);assert.deepEqual(f.calls.slice(before, before+2),[['presence',false],['stop']]);
  }finally{f.dispose();}
});

test('native grant failure refreshes a newer roster before renegotiating fresh peer pairs',async()=>{
  const f=fixture();try{f.updateGroup({voiceRevision:1});f.peerJoin();await f.coordinator.join();await f.settle();const old=f.voice.state.peers[0].pairSessionId;
    f.group.refresh=async()=>{f.calls.push(['refresh-roster']);f.updateGroup({voiceRevision:2});return f.group.state;};const before=f.calls.length;
    f.updateVoice({connection:'failed',error:'',peers:f.voice.state.peers.map(peer=>({...peer,connection:'failed',error:'Peer authorization changed; reconnect this peer'}))});await f.settle();
    const changes=f.calls.slice(before),refresh=changes.findIndex(call=>call[0]==='refresh-roster'),add=changes.findIndex(call=>call[0]==='add');assert.ok(refresh>=0&&add>refresh);
    const send=changes.find(call=>call[0]==='send');assert.ok(send);assert.equal(send[3],2);assert.notEqual(send[2].sessionId,old);assert.equal(f.group.state.voiceJoined,true);assert.equal(f.calls.filter(call=>call[0]==='start').length,1);
  }finally{f.dispose();}
});

test('coalesced stale roster refresh waits without a retry loop until the revision actually advances',async()=>{
  const f=fixture();try{f.updateGroup({voiceRevision:1});f.peerJoin();await f.coordinator.join();await f.settle();let refreshes=0;f.group.refresh=async()=>{refreshes++;return f.group.state;};const adds=f.calls.filter(call=>call[0]==='add').length;
    f.updateVoice({connection:'failed',error:'',peers:f.voice.state.peers.map(peer=>({...peer,connection:'failed',error:'Peer authorization changed; reconnect this peer'}))});await f.settle();
    assert.equal(refreshes,1);assert.equal(f.voice.state.peers.length,0);assert.equal(f.group.state.voiceJoined,true);assert.match(f.coordinator.state.error,/Waiting for updated/);
    for(let i=0;i<5;i++)f.coordinator.reconcile(f.group.state);await f.settle();assert.equal(refreshes,1);assert.equal(f.calls.filter(call=>call[0]==='add').length,adds);
    f.updateGroup({voiceRevision:2});await f.settle();assert.equal(f.calls.filter(call=>call[0]==='add').length,adds+1);assert.equal(f.calls.findLast(call=>call[0]==='send')[3],2);
  }finally{f.dispose();}
});



test('delayed cleanup from an older coordinator cannot withdraw or stop a newer human Join',async()=>{
  const f=fixture();let newer,unsub,release;try{f.peerJoin();await f.coordinator.join();await f.settle();const oldMaster=f.voice.state.sessionId,oldConsent=f.group.state.voiceConsentRevision,original=f.group.voice;
    f.group.voice=async(joined,expected)=>{if(!joined&&expected===oldConsent)await new Promise(resolve=>release=resolve);return original.call(f.group,joined,expected);};
    f.updateVoice({error:'Old audio interruption',connection:'failed'});await new Promise(resolve=>setImmediate(resolve));assert.ok(release);
    let next=BigInt('0x'+'d'.repeat(32));newer=new LocalGroupVoiceCoordinator(f.group,f.voice,()=>0,()=> (next++).toString(16).padStart(32,'0'));unsub=newer.subscribe(()=>{});await newer.join();await f.settle();
    const newMaster=f.voice.state.sessionId,newConsent=f.group.state.voiceConsentRevision;assert.notEqual(newMaster,oldMaster);assert.notEqual(newConsent,oldConsent);assert.equal(f.group.state.voiceJoined,true);
    release();await f.settle();assert.equal(f.voice.state.sessionId,newMaster);assert.equal(f.voice.state.joined,true);assert.equal(f.group.state.voiceJoined,true);assert.equal(f.group.state.voiceConsentRevision,newConsent);assert.equal(newer.state.status,'connecting');
    assert.ok(f.ownershipCalls.some(call=>call.method==='voice'&&call.expected===oldConsent));assert.equal(f.ownershipCalls.findLast(call=>call.method==='stop').expected,oldMaster);
  }finally{release?.();unsub?.();newer?.dispose();f.dispose();}
});

test('a fresh observer hydrates owned native consent/master without opening another microphone',async()=>{
  const f=fixture();let restored,unsub;try{f.peerJoin();await f.coordinator.join();await f.settle();f.event('answer');await f.settle();const starts=f.calls.filter(call=>call[0]==='start').length,master=f.voice.state.sessionId,revision=f.group.state.voiceConsentRevision;
    f.dispose();restored=new LocalGroupVoiceCoordinator(f.group,f.voice);unsub=restored.subscribe(()=>{});await f.settle();assert.equal(restored.state.status,'connected');assert.equal(f.calls.filter(call=>call[0]==='start').length,starts);
    f.updateVoice({error:'Hydrated call stopped',connection:'failed'});await f.settle();assert.equal(f.ownershipCalls.findLast(call=>call.method==='voice').expected,revision);assert.equal(f.ownershipCalls.findLast(call=>call.method==='stop').expected,master);assert.equal(f.group.state.voiceJoined,false);
  }finally{unsub?.();restored?.dispose();f.dispose();}
});

test('normal startup preallocates its master ownership and requires native idle',async()=>{
  const f=fixture();const start=f.voice.start;let options;f.voice.start=async(...args)=>{options=args;return start.apply(f.voice,args);};try{f.peerJoin();await f.coordinator.join();await f.settle();assert.deepEqual(options,[f.voice.state.sessionId,true]);
  }finally{f.dispose();}
});



test('polls straddling two consent owners only hydrate after immutable native/group revisions agree',async()=>{
  for(const order of ['group-first','native-first']){const f=fixture();let observer,unsub;try{f.dispose();const newRevision=7,oldRevision=5;
    f.group.state={...f.group.state,voiceJoined:true,voiceConsentRevision:order==='group-first'?newRevision:oldRevision,members:f.group.state.members.map(member=>({...member,voiceJoined:true}))};
    f.voice.state={...empty,joined:true,sessionId,groupId,groupEpoch:1,groupMode:true,groupVoiceConsentRevision:order==='group-first'?oldRevision:newRevision,connection:'connected',peers:[peerState(high,sessionId,{connection:'connected',peerVerified:true,pathVerified:true,remoteFingerprint:fingerprint})]};
    observer=new LocalGroupVoiceCoordinator(f.group,f.voice);unsub=observer.subscribe(()=>{});await f.settle();assert.equal(observer.state.status,'interrupted');assert.deepEqual(f.calls,[],'A mixed-owner snapshot performed cleanup or opened audio');
    if(order==='group-first')f.updateVoice({groupVoiceConsentRevision:newRevision,sessionId:'d'.repeat(32)});else f.updateGroup({voiceConsentRevision:newRevision});await f.settle();
    assert.equal(observer.state.status,'connected');assert.deepEqual(f.calls,[],'Hydration opened a microphone or toggled consent');assert.equal(f.group.state.voiceJoined,true);
  }finally{unsub?.();observer?.dispose();f.dispose();}}
});

test('a native bind returning a different immutable consent cannot create or signal a peer',async()=>{
  const f=fixture();try{f.peerJoin();f.voice.groupBind=async(id,epoch,expected)=>{f.updateVoice({groupId:id,groupEpoch:epoch,groupMode:true,groupVoiceConsentRevision:expected+1});return f.voice.state;};await f.coordinator.join();await f.settle();
    assert.equal(f.coordinator.state.status,'interrupted');assert.match(f.coordinator.state.error,/owned consent/);assert.equal(f.calls.some(call=>call[0]==='add'||call[0]==='offer'||call[0]==='send'),false);
  }finally{f.dispose();}
});

function nativeFixture(){
  const f=fixture(),processId='12345678-1234-1234-1234-123456789abc';
  const capability={nativeCoordinatorAvailable:true,coordinatorOwner:'javascript',coordinatorStatus:'waiting',coordinatorError:'',coordinatorRevision:0,processId};
  f.updateVoice(capability);const originalStart=f.voice.start,originalStop=f.voice.stop;
  f.voice.start=async(...args)=>{await originalStart.apply(f.voice,args);f.updateVoice(capability);return f.voice.state;};
  f.voice.stop=async(...args)=>{await originalStop.apply(f.voice,args);if(!f.voice.state.joined)f.updateVoice(capability);return f.voice.state;};
  f.voice.groupBind=async(id,epoch,expected,controller)=>{
    assert.equal(controller,'native');assert.equal(expected,f.group.state.voiceConsentRevision);f.calls.push(['bindNative',id,epoch,expected]);
    f.updateVoice({groupId:id,groupEpoch:epoch,groupPeerId:'',groupMode:true,groupVoiceConsentRevision:expected,coordinatorOwner:'native',coordinatorStatus:'waiting',coordinatorRevision:f.group.state.voiceRevision??1,coordinatorError:''});return f.voice.state;
  };
  for(const name of ['peerAdd','peerRemove','peerCreateOffer','peerApplySignal'])f.voice[name]=async()=>{f.calls.push([`unexpected-${name}`]);throw new Error('JavaScript must not negotiate a native-owned call');};
  f.group.sendSignal=async()=>{f.calls.push(['unexpected-send']);throw new Error('JavaScript must not send native-owned SDP');};
  f.group.ackSignals=async()=>{f.calls.push(['unexpected-ack']);throw new Error('JavaScript must not consume native-owned SDP');};
  return f;
}
const controllerWrites=calls=>calls.filter(call=>['add','remove','offer','apply','send','ack'].includes(call[0])||String(call[0]).startsWith('unexpected-'));

test('explicit native Join starts one guarded muted master even alone and JS never negotiates cohort peers',async()=>{
  const f=nativeFixture();try{await f.coordinator.join();await f.settle();const master=f.voice.state.sessionId;
    assert.equal(f.calls.filter(call=>call[0]==='start').length,1);assert.equal(f.calls.filter(call=>call[0]==='bindNative').length,1);assert.equal(f.voice.state.joined,true);assert.equal(f.voice.state.muted,true);assert.equal(f.coordinator.state.status,'waiting');
    f.peerJoin();f.updateGroup({voiceRevision:2,signals:[{id:'e'.repeat(32),from:high,to:low,signal:signal('offer'),receivedElapsedMs:0,voiceRevision:2}]});
    f.updateVoice({connection:'connected',peerVerified:true,pathVerified:true,coordinatorStatus:'connected',coordinatorRevision:2,peers:[peerState(high,'f'.repeat(32),{connection:'connected',peerVerified:true,pathVerified:true})]});await f.settle();
    assert.equal(f.coordinator.state.status,'connected');assert.equal(f.coordinator.state.connectedPeers,1);assert.deepEqual(controllerWrites(f.calls),[]);assert.equal(f.group.state.signals.length,1,'JS poll must not ack native-owned events');
    f.updateGroup({voiceRevision:3,members:f.group.state.members.map(member=>member.id===high?{...member,voiceJoined:false}:member),signals:[]});f.updateVoice({connection:'ready',coordinatorStatus:'waiting',coordinatorRevision:3,peers:[]});await f.settle();
    assert.equal(f.voice.state.sessionId,master);assert.equal(f.voice.state.joined,true);assert.equal(f.calls.filter(call=>call[0]==='start').length,1);assert.equal(f.calls.filter(call=>call[0]==='stop').length,1,'Only explicit Join startup cleanup may stop');assert.equal(f.coordinator.state.status,'waiting');
  }finally{f.dispose();}
});

test('native cohort ABA and isolated errors are reflected read-only without restarting or withdrawing the master',async()=>{
  const f=nativeFixture();try{await f.coordinator.join();await f.settle();const before=f.calls.length;
    f.peerJoin();f.updateGroup({voiceRevision:4});f.updateVoice({coordinatorRevision:4,coordinatorStatus:'interrupted',coordinatorError:'Peer connection interrupted',connection:'failed',peers:[peerState(high,'e'.repeat(32),{connection:'failed',error:'Peer transport failed'})]});await f.settle();
    assert.equal(f.coordinator.state.status,'interrupted');assert.equal(f.coordinator.state.error,'Peer connection interrupted');assert.equal(f.group.state.voiceJoined,true);assert.equal(f.voice.state.joined,true);assert.deepEqual(f.calls.slice(before),[]);
    f.updateGroup({voiceRevision:6});f.updateVoice({coordinatorRevision:6,coordinatorStatus:'connecting',coordinatorError:'',connection:'connecting',peers:[peerState(high,'f'.repeat(32))]});await f.settle();assert.equal(f.coordinator.state.status,'connecting');assert.deepEqual(f.calls.slice(before),[]);
  }finally{f.dispose();}
});

test('new-capability manual runner masters are observation-only and are never adopted or controlled',async()=>{
  const f=nativeFixture();let observer,unsub;try{f.dispose();f.group.state={...f.group.state,voiceJoined:true,voiceConsentRevision:5,members:f.group.state.members.map(member=>({...member,voiceJoined:true}))};
    f.voice.state={...f.voice.state,joined:true,sessionId,groupId,groupEpoch:1,groupMode:true,groupVoiceConsentRevision:5,coordinatorOwner:'javascript',peers:[]};
    observer=new LocalGroupVoiceCoordinator(f.group,f.voice);unsub=observer.subscribe(()=>{});await f.settle();assert.equal(observer.state.status,'interrupted');assert.deepEqual(f.calls,[]);
    f.updateGroup({voiceRevision:8});f.event('offer');await f.settle();assert.deepEqual(f.calls,[]);assert.equal(f.voice.state.sessionId,sessionId);assert.equal(f.group.state.voiceJoined,true);
  }finally{unsub?.();observer?.dispose();f.dispose();}
});

test('matching native-owned consent hydrates on UI reload without start, grant, bind or peer commands',async()=>{
  const f=nativeFixture();let observer,unsub;try{await f.coordinator.join();await f.settle();f.dispose();const before=f.calls.length;
    observer=new LocalGroupVoiceCoordinator(f.group,f.voice);unsub=observer.subscribe(()=>{});await f.settle();assert.equal(observer.state.status,'waiting');assert.deepEqual(f.calls.slice(before),[]);
    f.peerJoin();f.updateGroup({voiceRevision:2});f.updateVoice({coordinatorStatus:'connecting',coordinatorRevision:2});await f.settle();assert.equal(observer.state.status,'connecting');assert.deepEqual(f.calls.slice(before),[]);
  }finally{unsub?.();observer?.dispose();f.dispose();}
});

test('native fatal master failure closes captured consent/session exactly once without automatic resurrection',async()=>{
  const f=nativeFixture();try{await f.coordinator.join();await f.settle();const old=f.voice.state.sessionId,revision=f.group.state.voiceConsentRevision,before=f.calls.length;
    f.updateVoice({error:'Native audio focus interrupted',connection:'failed',coordinatorStatus:'interrupted'});await f.settle();assert.equal(f.coordinator.state.status,'interrupted');assert.equal(f.group.state.voiceJoined,false);assert.equal(f.voice.state.joined,false);
    assert.equal(f.ownershipCalls.findLast(call=>call.method==='voice').expected,revision);assert.equal(f.ownershipCalls.findLast(call=>call.method==='stop').expected,old);
    for(let i=0;i<4;i++)f.coordinator.reconcile(f.group.state);await f.settle();assert.equal(f.calls.slice(before).some(call=>call[0]==='start'),false);assert.deepEqual(controllerWrites(f.calls),[]);
  }finally{f.dispose();}
});

test('replacement native process/master is preserved even if a stale group poll has the old consent token',async()=>{
  const f=nativeFixture();try{await f.coordinator.join();await f.settle();const before=f.calls.length;
    f.updateVoice({processId:'22345678-1234-1234-1234-123456789abc',sessionId:'d'.repeat(32),coordinatorStatus:'waiting'});await f.settle();
    assert.equal(f.coordinator.state.status,'interrupted');assert.equal(f.group.state.voiceJoined,true);assert.equal(f.voice.state.joined,true);assert.equal(f.voice.state.sessionId,'d'.repeat(32));assert.deepEqual(f.calls.slice(before),[]);
  }finally{f.dispose();}
});

test('Leave during native master start cannot bind a coordinator or grant a later consent',async()=>{
  const f=nativeFixture();const original=f.voice.start;let release;f.voice.start=async(...args)=>{const value=await original.apply(f.voice,args);await new Promise(resolve=>release=resolve);return value;};
  try{await f.coordinator.join();await new Promise(resolve=>setImmediate(resolve));assert.ok(release);await f.coordinator.leave();release();await f.settle();assert.equal(f.group.state.voiceJoined,false);assert.equal(f.voice.state.joined,false);assert.equal(f.calls.some(call=>call[0]==='bindNative'),false);assert.deepEqual(controllerWrites(f.calls),[]);
  }finally{release?.();f.dispose();}
});

test('native capability is read before Join chooses a controller instead of guessed from bridge methods',async()=>{
  const f=nativeFixture();let release;f.updateVoice({nativeCoordinatorAvailable:undefined});f.voice.refresh=async()=>new Promise(resolve=>release=()=>{f.updateVoice({nativeCoordinatorAvailable:true});resolve(f.voice.state);});
  try{const joining=f.coordinator.join();await new Promise(resolve=>setImmediate(resolve));assert.ok(release);assert.equal(f.calls.length,0);release();await joining;await f.settle();assert.equal(f.calls.filter(call=>call[0]==='start').length,1);assert.equal(f.calls.filter(call=>call[0]==='bindNative').length,1);assert.deepEqual(controllerWrites(f.calls),[]);
  }finally{f.dispose();}
});


test('idle native observation and repeated navigation-style refreshes cannot grant consent or start capture',async()=>{
  const f=nativeFixture();try{await f.settle();for(let i=0;i<4;i++){await f.voice.refresh();await f.group.refresh();f.coordinator.reconcile(f.group.state);}await f.settle();assert.equal(f.coordinator.state.status,'idle');assert.equal(f.group.state.voiceJoined,false);assert.equal(f.voice.state.joined,false);assert.deepEqual(f.calls,[]);
  }finally{f.dispose();}
});

test('native consent replacement preserves the new native controller and only attempts exact old-session cleanup',async()=>{
  const f=nativeFixture();try{await f.coordinator.join();await f.settle();const old=f.voice.state.sessionId,before=f.calls.length;f.updateGroup({voiceConsentRevision:4,voiceJoined:true});f.updateVoice({sessionId:'e'.repeat(32),groupVoiceConsentRevision:4,coordinatorStatus:'waiting'});await f.settle();
    assert.equal(f.coordinator.state.status,'interrupted');assert.equal(f.group.state.voiceJoined,true);assert.equal(f.voice.state.joined,true);assert.equal(f.voice.state.sessionId,'e'.repeat(32));assert.equal(f.calls.slice(before).some(call=>call[0]==='presence'),false);assert.equal(f.ownershipCalls.findLast(call=>call.method==='stop').expected,old);assert.deepEqual(controllerWrites(f.calls),[]);
  }finally{f.dispose();}
});

test('membership epoch change ends native master ownership instead of JS rebind or peer recreation',async()=>{
  const f=nativeFixture();try{await f.coordinator.join();await f.settle();const starts=f.calls.filter(call=>call[0]==='start').length,binds=f.calls.filter(call=>call[0]==='bindNative').length;f.updateGroup({group:{...f.group.state.group,epoch:2}});await f.settle();assert.equal(f.coordinator.state.status,'interrupted');assert.equal(f.group.state.voiceJoined,false);assert.equal(f.voice.state.joined,false);assert.equal(f.calls.filter(call=>call[0]==='start').length,starts);assert.equal(f.calls.filter(call=>call[0]==='bindNative').length,binds);assert.deepEqual(controllerWrites(f.calls),[]);
  }finally{f.dispose();}
});

test('a Join cannot grant or start another group after capability hydration races a scope change',async()=>{
  for(const change of ['group','epoch','process']){const f=nativeFixture();let release;f.voice.refresh=async()=>new Promise(resolve=>release=()=>resolve(f.voice.state));
    try{const joining=f.coordinator.join();await new Promise(resolve=>setImmediate(resolve));assert.ok(release);
      f.updateGroup(change==='group'?{group:{...f.group.state.group,id:'f'.repeat(32)}}:change==='epoch'?{group:{...f.group.state.group,epoch:2}}:{processId:'new-group-process'});release();await joining;await f.settle();assert.equal(f.coordinator.state.status,'failed');assert.match(f.coordinator.state.error,/Group changed while joining/);assert.equal(f.group.state.voiceJoined,false);assert.deepEqual(f.calls,[]);
    }finally{release?.();f.dispose();}
  }
});
