<script lang="ts">
  import BrandIcon from './BrandIcon.svelte';
  import {onDestroy} from 'svelte';
  import type {NativeVoiceLabClient,VoiceLabSnapshot} from '@aumanet/core';
  import type {VoiceOutputPreference,GroupMember,GroupSnapshot} from '@aumanet/protocol';
  import {AudioLines,Users,Mic,MicOff,Headphones,Volume2,PhoneOff,Info,SlidersHorizontal} from '@lucide/svelte';
  import NativePtt from './NativePtt.svelte';
  import {voicePttReadiness} from '@aumanet/core';
  export let client:NativeVoiceLabClient;
  export let state:VoiceLabSnapshot|undefined;
  export let sourceError='';
  export let channelJoined=false;
  export let joining=false;
  export let onsettings:()=>void=()=>{};
  function shortName(name:string){const first=name.trim().split(/\s+/)[0]||name;const names=new Set([...Object.values(peerNames),...channelMembers.map(member=>member.name),peerName]);return [...names].filter(value=>value.trim().split(/\s+/)[0]===first).length>1?name:first;}
  const initials=(name:string)=>name.trim().split(/\s+/).slice(0,2).map(part=>Array.from(part)[0]?.toUpperCase()??'').join('');
  export let channelName='Group voice';
  export let peerName='Connected phone';
  export let peerNames:Readonly<Record<string,string>>={};
  export let channelMembers:readonly GroupMember[]=[];
  export let selfId='';
  export let channelAvailable=false;
  export let getGroup:(()=>GroupSnapshot|undefined)|undefined=undefined;
  export let onjoin:((isCurrent?:()=>boolean)=>Promise<unknown>)|undefined=undefined;
  export let onleave:(()=>Promise<unknown>)|undefined=undefined;
  let busy=false,error='',rejoinRevision=0;
  let statusDialog:HTMLDialogElement|undefined;
  onDestroy(()=>{rejoinRevision++;});
  $: joined=!!state?.joined;
  $: connected=!sourceError&&state?.connection==='connected'&&state.peerVerified;
  $: participating=joined||channelJoined;
  $: idlePreferences=!!state?.voicePreferences&&!state.voicePreferences.needsRepair&&client.synchronized&&!joined&&!sourceError;
  $: selectedInput=joined?state?.inputMode:state?.voicePreferences?.inputMode??state?.inputMode;
  const outputTypes:Readonly<Record<number,VoiceOutputPreference>>={1:'earpiece',2:'speaker',3:'wired-headset',4:'wired-headphones',22:'usb-headset',7:'bluetooth',26:'bluetooth',23:'hearing-aid'};
  const outputNames:Readonly<Record<VoiceOutputPreference,string>>={default:'Default',earpiece:'Earpiece',speaker:'Speaker','wired-headset':'Wired headset','wired-headphones':'Wired headphones','usb-headset':'USB headset',bluetooth:'Bluetooth call audio','hearing-aid':'Hearing aid'};
  $: idleOutputs=[...new Map((state?.routes??[]).filter(route=>outputTypes[route.type]).map(route=>[outputTypes[route.type]!,{preference:outputTypes[route.type]!,label:route.label}])).values()];
  $: telecom=state?.routeOwner==='telecom';
  $: audioManager=(state?.routeOwner??'audiomanager')==='audiomanager';
  $: telecomUsable=telecom&&state?.telecomState==='active'&&!state?.telecomSystemMuted&&!state?.telecomError;
  $: outputUnavailable=joined?telecom?!client.supportsTelecomEndpoints||!state?.telecomEndpoints?.some(endpoint=>!['streaming','unknown'].includes(endpoint.type)):!audioManager||!state?.routes.length:!audioManager||!idlePreferences;
  $: outputValue=joined&&telecom?state?.routeReady?state.telecomEndpointId??'':'':joined?state?.routeReady?String(state.effectiveRoute):'-1':state?.voicePreferences?.outputRoute??'default';
  async function selectMode(mode:'ptt'|'always-on'){await run(()=>joined?client.mode(mode):client.preferences({inputMode:mode,requireIdle:true}));}
  async function selectOutput(value:string){await run(()=>joined?telecom?client.requestTelecomEndpoint(value):client.route(Number(value)):client.preferences({outputRoute:value as VoiceOutputPreference,requireIdle:true}));}
  type Peer=NonNullable<VoiceLabSnapshot['peers']>[number];
  const peerConnected=(peer:Peer)=>!sourceError&&peer.connection==='connected'&&peer.peerVerified&&peer.pathVerified&&!peer.error;
  function peerSpeaking(peer:Peer,unavailable=sourceError){const incoming=peer.stats['inbound-rtp'];if(unavailable||!peerConnected(peer)||!incoming||typeof incoming!=='object')return false;const level=(incoming as Record<string,unknown>).audioLevel;return typeof level==='number'&&Number.isFinite(level)&&level>0.01&&level<=1;}
  const peerStatus=(peer:Peer,unavailable:string)=>unavailable?'Connection status unavailable':peer.error||['failed','closed','disconnected'].includes(peer.connection)?'Connection interrupted · Leave and rejoin to retry':peerConnected(peer)?peerSpeaking(peer)?'Speaking':'Connected':'Connecting…';
  $: connectedPeers=sourceError?0:state?.groupMode?(state.peers??[]).filter(peerConnected).length:connected?1:0;
  $: participants=participating?1+connectedPeers:0;
  $: pttReady=voicePttReadiness(state,client.synchronized);
  $: presentMembers=channelAvailable?channelMembers.filter(member=>member.id!==selfId&&member.connected&&member.voiceJoined):[];
  $: micState=!joined?channelJoined?'Waiting for other members':'Not joined':telecom&&state?.telecomSystemMuted?'Muted by Android':state?.muted?'Mic muted':state?.transmitting?'Transmitting':state?.inputMode==='always-on'?'Listening':'PTT armed · Hold to talk';
  $: peerInterrupted=(state?.peers??[]).some(peer=>!!peer.error||['failed','closed','disconnected'].includes(peer.connection));
  $: statusDetail=error||sourceError||state?.error||state?.detectorError||state?.interruption||state?.coordinatorError||state?.telecomError||'';
  $: statusText=error?'That action could not finish. See details.':sourceError?'Voice status unavailable. Reopen Voice.':state?.error?'Call interrupted. Leave and rejoin.':peerInterrupted?'A member’s voice connection was interrupted.':!joined?channelJoined?'Waiting for the call to connect.':'Join with your microphone muted.':telecom&&state?.telecomState==='held'?'Android call is on hold · microphone stays muted.':telecom&&state?.telecomState==='pending'?'Android is preparing call audio…':telecom&&state?.telecomState!=='active'?'Android call audio needs attention. Leave and rejoin.':telecom&&state?.telecomSystemMuted?'Android has muted call audio.':state?.deafened?'Deafened · microphone muted.':!state?.audioFocus?'Audio is in use. Return after your other call.':state.routeInitializing&&state.coordinatorStatus==='waiting'?'Waiting for other members.':!state.routeReady?state.routeInitializing?'Preparing audio output…':'Choose an output, then unmute.':state.coordinatorStatus==='waiting'?'Waiting for other members.':!connected?'Connecting to your group…':state.muted?'Your microphone is muted.':state.inputMode==='always-on'&&!state.detectorAvailable?'Speech detection unavailable. Select Push to talk.':state.transmitting?'You are transmitting.':state.inputMode==='always-on'?'Listening for speech.':'Ready · hold to talk.';
  $: statusProblem=!!(error||sourceError||state?.error||state?.telecomState==='held'||state?.coordinatorStatus==='interrupted'||joined&&(!state?.audioFocus||!state.routeReady));
  async function run(action:()=>Promise<unknown>){
    if(busy)return;busy=true;error='';
    try{await action();}catch(e){error=e instanceof Error?e.message:String(e);}finally{busy=false;void client.refresh().catch(e=>error=e instanceof Error?e.message:String(e));}
  }
  async function leave(){++rejoinRevision;error='';try{if(onleave)await onleave();else await client.stop();}catch(e){error=e instanceof Error?e.message:String(e);}}
  async function rejoinMuted(){
    if(busy)return;
    const originalClient=client,voice=originalClient.state,group=getGroup?.(),join=onjoin;
    if(!voice||voice.processId!==state?.processId||voice.sessionId!==state.sessionId)return;
    if(join&&(!group?.group||group.error||!['hosting','connected'].includes(group.status)))return;
    if(voice.groupMode&&group?.group&&(voice.groupId!==group.group.id||voice.groupEpoch!==group.group.epoch))return;
    const revision=++rejoinRevision;
    const isCurrent=()=>{
      if(revision!==rejoinRevision||client!==originalClient||client.state?.processId!==voice.processId)return false;
      if(!join)return true;
      if(!group?.group)return false;
      const current=getGroup?.();
      return !!current?.group&&!current.error&&['hosting','connected'].includes(current.status)&&
        current.processId===group.processId&&current.identity.id===group.identity.id&&
        current.group.id===group.group.id&&current.group.epoch===group.group.epoch;
    };
    await run(async()=>{
      if(onleave)await onleave();else await originalClient.stop(voice.sessionId);
      if(!isCurrent()||originalClient.state?.joined)return;
      if(join)await join(isCurrent);else await originalClient.start(undefined,true);
    });
  }
  async function control(action:()=>Promise<unknown>){try{await action();error='';}catch(e){error=e instanceof Error?e.message:String(e);}finally{void client.refresh().catch(e=>error=e instanceof Error?e.message:String(e));}}
</script>

<section class="voice-call" aria-label={channelName+' voice call'}>
  <div class="voice-information"><section class="call-roster" aria-label="Voice participants"><ul class="participant-list">
    {#each presentMembers as member(member.id)}{@const peer=state?.peers?.find(peer=>peer.peerId===member.id)}<li class="voice-person"><span class="avatar" class:speaking={peer&&peerSpeaking(peer,sourceError)}>{initials(member.name)}</span><strong title={member.name} aria-label={member.name}>{shortName(member.name)}</strong><small>{!participating?'In channel':peer?peerStatus(peer,sourceError):'Connecting…'}</small></li>{/each}
    {#if state?.groupMode}{#each (state.peers??[]).filter(peer=>!presentMembers.some(member=>member.id===peer.peerId)) as peer(peer.peerId)}<li class="voice-person"><span class="avatar" class:speaking={peerSpeaking(peer,sourceError)}>{initials(peerNames[peer.peerId]??'Group member')}</span><strong title={peerNames[peer.peerId]??'Group member'}>{shortName(peerNames[peer.peerId]??'Group member')}</strong><small>{peerStatus(peer,sourceError)}</small></li>{/each}
    {:else if participating&&state?.peerVerified&&!presentMembers.length}<li class="voice-person"><span class="avatar">{initials(peerName)}</span><strong title={peerName}>{shortName(peerName)}</strong><small>{connected?'Listening':'Connecting…'}</small></li>{/if}
    <li class="voice-person self"><span class="avatar" class:speaking={!sourceError&&state?.transmitting}>{initials(channelMembers.find(member=>member.id===selfId)?.name??'You')}</span><strong>You</strong><small>{participating?state?.muted?'Muted':micState:'Not joined'}</small></li>
  </ul><p class="roster-summary">{participating?`${participants} connected ${participants===1?'participant':'participants'}`:channelAvailable?`${presentMembers.length} in channel`:'Channel presence unavailable'}</p></section>
  <div class="voice-state" role="status" aria-live="polite"><span class="state-symbol"><BrandIcon name={!joined||state?.muted||state?.deafened?'muted':'mic'} size={40}/></span><h2>{!participating?'Voice is off':statusProblem?'Voice needs attention':state?.transmitting?'Transmitting':state?.muted||!joined?'Microphone muted':selectedInput==='always-on'?'Listening for speech':pttReady.ready?'Ready to talk':'Microphone not ready'}</h2><p>{statusProblem?statusText:!participating?'Join with your microphone muted.':!joined?'Waiting for other members':state?.muted?'Enable your microphone to speak':selectedInput!=='always-on'&&!pttReady.ready?pttReady.message:statusText}</p>{#if statusDetail}<button class="text-button" onclick={()=>statusDialog?.showModal()}>Voice needs attention · details</button>{/if}</div>
  </div><div class="voice-controls">
    {#if participating}<div class="call-tools">
      <button aria-label={state?.muted?'Unmute native microphone':'Mute native microphone'} aria-pressed={!(state?.muted??true)} disabled={!joined||!!state?.muted&&(!connected||!state.audioFocus||!state.routeReady||telecom&&!telecomUsable||busy||!!sourceError)} onclick={()=>void control(()=>client.mute(!state?.muted))}><BrandIcon name={state?.muted?'muted':'mic'} size={24}/><span>{state?.muted?'Enable mic':'Mute'}</span></button>
      <button aria-label={state?.deafened?'Undeafen native audio':'Deafen native audio'} aria-pressed={!(state?.deafened??false)} disabled={!joined||!!state?.deafened&&(busy||!!sourceError)} onclick={()=>void control(()=>client.deafen(!state?.deafened))}><BrandIcon name={state?.deafened?'volumeOff':'volume'} size={24}/><span>{state?.deafened?'Sound off':'Sound on'}</span></button>
      <button class="leave" aria-label={busy||joining?'Cancel joining voice':'Leave channel'} onclick={()=>void leave()}><BrandIcon name="close" size={24}/><span>{busy||joining?'Cancel':'Leave'}</span></button>
    </div>{/if}
    {#if !participating}<button class="primary join-call" disabled={busy||joining||!state||!!onjoin&&!channelAvailable} onclick={()=>void run(()=>onjoin?onjoin():client.start())}><BrandIcon name="headphones"/>{busy||joining?'Joining…':'Join voice, muted'}</button>
    {:else if (telecom&&state?.telecomState==='held')||state?.coordinatorStatus==='interrupted'}<button class="primary native-ptt" disabled={busy||joining||!!onjoin&&!channelAvailable} onclick={()=>void rejoinMuted()}>{state?.telecomState==='held'?'Rejoin held call · Muted':'Rejoin voice · Muted'}</button>
    {:else if telecom&&!telecomUsable}<button class="primary native-ptt" disabled aria-label="Hold native push to talk" title={statusText}>{state?.telecomState==='held'?'Call on hold':state?.telecomSystemMuted?'Android call muted':state?.telecomState==='pending'?'Preparing Android audio':'Android audio unavailable'}</button>
    {:else if selectedInput!=='always-on'}<NativePtt {client} {state} blocked={!!sourceError} onerror={message=>error=message}/>
    {:else}<div class="listening-state"><BrandIcon name="mic"/><strong>{micState}</strong></div>{/if}
    <button class="audio-summary" aria-label="Audio options" onclick={onsettings}>{selectedInput==='always-on'?'Hands-free':'Press and hold'} · {state?.routes?.find(route=>route.id===state?.effectiveRoute)?.label||outputNames[state?.voicePreferences?.outputRoute??'default']}<BrandIcon name="chevron" size={16}/></button>
  </div>
</section>
<dialog bind:this={statusDialog} aria-labelledby="voice-status-title"><h2 id="voice-status-title">Voice status</h2><p>{statusDetail||statusText}</p><p>Join starts microphone access with transmission muted. After an interruption, choose an output and enable your microphone explicitly. Leave ends this voice session.</p><form method="dialog"><button class="outline">Close</button></form></dialog>
<style>
.roster-summary{text-align:center;font-size:.75rem;color:var(--muted);margin:12px 0 0}.voice-call{width:100%;min-width:0;display:grid;grid-template-rows:minmax(0,1fr) auto;min-height:0;height:100%;gap:16px}.participant-list{display:flex;justify-content:center;gap:14px;list-style:none;padding:4px 0;margin:0;flex-wrap:wrap}.voice-person{display:flex;flex-direction:column;align-items:center;gap:7px;min-width:0;width:66px;text-align:center}.voice-person strong{font-size:0.875rem;font-weight:400;overflow-wrap:anywhere;max-width:100%}.voice-person small{font-size:0.75rem;overflow-wrap:anywhere}.voice-person.self{width:76px}.voice-person .avatar{width:56px;height:56px;font-size:1rem}.voice-person:nth-child(3n+1):not(.self) .avatar{background:var(--rust-bg);color:var(--rust-ink)}.voice-person:nth-child(3n+2):not(.self) .avatar{background:var(--blue-bg);color:var(--blue-ink)}.voice-person .speaking{outline:3px solid var(--green);outline-offset:3px}.voice-state{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:0;text-align:center;gap:16px}.voice-state h2{font-size:1.438rem;font-weight:600;line-height:1.3;letter-spacing:-.5px;margin:0}.voice-state p{font-size:0.75rem;color:var(--muted);margin:0;max-width:40ch}.state-symbol{display:grid;place-items:center;border-radius:50%;background:var(--sage);color:var(--accent);width:96px;height:96px;margin-bottom:4px}.voice-controls{display:grid;gap:12px}.call-tools{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.call-tools button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;border:0;background:transparent;min-height:66px;font-size:0.75rem;color:var(--green)}.call-tools button.leave{color:var(--error-ink)}.call-tools button:disabled{color:var(--disabled-ink)}.join-call{width:100%;min-height:56px}.voice-controls :global(.native-ptt){width:100%;min-height:66px;border-radius:18px;font-size:0.9375rem}.listening-state{display:flex;justify-content:center;align-items:center;gap:8px;min-height:66px;border-radius:18px;background:var(--sage);font-size:0.9375rem}.audio-summary{display:flex;align-items:center;justify-content:center;gap:8px;min-height:48px;font-size:0.75rem;color:var(--muted);border:0;background:transparent}.voice-information{display:flex;flex-direction:column;min-height:0;overflow:auto;overscroll-behavior:contain}.call-roster{flex:none}.voice-state{flex:1;min-height:180px;padding:16px 0}.call-roster:has(.participant-list:only-child){scrollbar-width:thin}
@media(min-width:600px) and (max-height:500px){.voice-call{grid-template-columns:1fr 1fr;grid-template-rows:minmax(0,1fr);gap:12px 24px}.voice-controls{grid-column:2;grid-row:1;align-self:center;gap:8px}.voice-state{gap:8px;min-height:96px;padding:8px 0}.voice-information{grid-column:1;grid-row:1}.voice-state h2{font-size:1.25rem}.state-symbol{display:none}.voice-person .avatar{width:44px;height:44px}.call-roster{flex:none}.participant-list{gap:12px}.voice-controls :global(.native-ptt){min-height:58px}.voice-person{gap:4px}.call-tools button{min-height:60px}}
@media(max-height:650px) and (orientation:portrait){.voice-call{gap:10px}.state-symbol{width:68px;height:68px}.voice-state{gap:10px}.voice-person .avatar{width:44px;height:44px}}
</style>
