<script lang="ts">
  import {afterUpdate,onDestroy,onMount} from 'svelte';
  import type {NativeVoiceLabClient,VoiceLabSnapshot} from '@aumanet/core';
  import type {VoiceOutputPreference,GroupMember,GroupSnapshot} from '@aumanet/protocol';
  import {AudioLines,Users,Mic,MicOff,Headphones,Volume2,PhoneOff,Info,SlidersHorizontal} from '@lucide/svelte';
  import NativePtt from './NativePtt.svelte';
  export let client:NativeVoiceLabClient;
  export let state:VoiceLabSnapshot|undefined;
  export let sourceError='';
  export let channelJoined=false;
  export let joining=false;
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
  let audioDialog:HTMLDialogElement|undefined,compactCall=true;
  let rosterElement:HTMLDivElement|undefined,rosterOverflows=false;
  function measureRoster(){if(rosterElement)rosterOverflows=rosterElement.scrollHeight>rosterElement.clientHeight+1;}
  afterUpdate(measureRoster);
  onDestroy(()=>{rejoinRevision++;});
  onMount(()=>{const observer=new ResizeObserver(measureRoster);if(rosterElement)observer.observe(rosterElement);const media=matchMedia('(orientation:landscape) and (max-height:560px)');const update=()=>{audioDialog?.close();compactCall=true;};update();media.addEventListener('change',update);return()=>{observer.disconnect();media.removeEventListener('change',update);};});
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
  $: presentMembers=channelAvailable?channelMembers.filter(member=>member.id!==selfId&&member.connected&&member.voiceJoined):[];
  $: micState=!joined?channelJoined?'Waiting for other members':'Not joined':telecom&&state?.telecomSystemMuted?'Muted by Android':state?.muted?'Mic muted':state?.transmitting?'Transmitting':state?.inputMode==='always-on'?'Listening':'PTT armed · Hold to talk';
  $: peerInterrupted=(state?.peers??[]).some(peer=>!!peer.error||['failed','closed','disconnected'].includes(peer.connection));
  $: statusDetail=error||sourceError||state?.error||state?.detectorError||state?.interruption||state?.coordinatorError||state?.telecomError||'';
  $: statusText=error?'That action could not finish. See details.':sourceError?'Voice status unavailable. Reopen Voice.':state?.error?'Call interrupted. Leave and rejoin.':peerInterrupted?'A member’s voice connection was interrupted.':!joined?channelJoined?'Waiting for the call to connect.':'Join with your microphone muted.':telecom&&state?.telecomState==='held'?'Android call is on hold · microphone stays muted.':telecom&&state?.telecomState==='pending'?'Android is preparing call audio…':telecom&&state?.telecomState!=='active'?'Android call audio needs attention. Leave and rejoin.':telecom&&state?.telecomSystemMuted?'Android has muted call audio.':state?.deafened?'Deafened · microphone muted.':!state?.audioFocus?'Audio is in use. Return after your other call.':state.routeInitializing&&state.coordinatorStatus==='waiting'?'Waiting for other members.':!state.routeReady?state.routeInitializing?'Preparing audio output…':'Choose an output, then unmute.':state.coordinatorStatus==='waiting'?'Waiting for other members.':!connected?'Connecting to your group…':state.muted?'Your microphone is muted.':state.inputMode==='always-on'&&!state.detectorAvailable?'Speech detection unavailable. Select Push to talk.':state.transmitting?'You are transmitting.':state.inputMode==='always-on'?'Listening for speech.':'Ready · hold to talk.';
  $: statusProblem=!!(error||sourceError||state?.error||joined&&(!state?.audioFocus||!state.routeReady));
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

{#snippet audioControls()}
  <div class="call-preferences">
    <div class="segments" role="group" aria-label="Input mode"><button class:active={selectedInput!=='always-on'} aria-pressed={selectedInput!=='always-on'} disabled={busy||!!sourceError||!joined&&!idlePreferences} onclick={()=>void selectMode('ptt')}>Push to talk</button><button class:active={selectedInput==='always-on'} aria-pressed={selectedInput==='always-on'} disabled={busy||!!sourceError||!joined&&!idlePreferences||joined&&!state?.detectorAvailable} title={joined&&!state?.detectorAvailable?'Speech detection is unavailable for this session':undefined} onclick={()=>void selectMode('always-on')}>Always on</button></div>
    <label class="call-output"><Volume2 size={18}/><span class="visually-hidden">Audio output</span><select aria-label="Native audio output" disabled={busy||!!sourceError||outputUnavailable} value={outputValue} onchange={event=>void selectOutput(event.currentTarget.value)}>
      {#if joined&&telecom}
        {#if !state?.routeReady||!state.telecomEndpoints?.some(endpoint=>endpoint.id===state?.telecomEndpointId)}<option value="" disabled>Choose Android call output</option>{/if}
        {#each state?.telecomEndpoints??[] as endpoint(endpoint.id)}<option value={endpoint.id} disabled={['streaming','unknown'].includes(endpoint.type)}>{endpoint.label}{['streaming','unknown'].includes(endpoint.type)?' · unavailable':''}</option>{/each}
      {:else if joined&&audioManager}
        {#if !state?.routeReady||!state.routes.some(route=>route.id===state?.effectiveRoute)}<option value="-1" disabled>Choose output</option>{/if}
        {#each state?.routes??[] as route(route.id)}<option value={String(route.id)}>{route.label}</option>{/each}
      {:else if !joined&&audioManager}
        <option value="default">Default</option>{#each idleOutputs as route(route.preference)}<option value={route.preference}>{route.label}</option>{/each}
        {#if state?.voicePreferences&&state.voicePreferences.outputRoute!=='default'&&!idleOutputs.some(route=>route.preference===state!.voicePreferences!.outputRoute)}<option value={state.voicePreferences.outputRoute} disabled>Saved {outputNames[state.voicePreferences.outputRoute]} · unavailable</option>{/if}
      {:else}<option value="" disabled>Audio output unavailable</option>{/if}
    </select></label>
    {#if telecom}<p class="hint">Android manages these call outputs. Choosing an output keeps the microphone muted.</p>{/if}
    {#if client.supportsBluetoothAudio}
      {#if state?.bluetoothPermission==='prompt'}<button class="text-button" disabled={busy} onclick={()=>void run(()=>client.requestBluetooth())}>Enable Bluetooth audio</button>
      {:else if telecom?!state?.telecomEndpoints?.some(endpoint=>endpoint.type==='bluetooth'):!(state?.routes??[]).some(route=>[7,26,23].includes(route.type))}<button class="text-button" disabled={busy} onclick={()=>void run(()=>client.bluetoothSettings())}>Connect Bluetooth audio</button>{/if}
    {/if}
  </div>
{/snippet}

<section class="voice-call" aria-label="Group voice call">
<div class="call-heading"><Users size={25}/><div><h1 title={channelName}>{channelName}</h1><small>Group voice</small></div><span class="pill">{participating?'Joined':'Not joined'}</span></div>
<div class:problem={statusProblem} class="call-status" role="status" aria-live="polite"><span>{statusText}</span>{#if statusDetail}<button class="status-details" aria-label="Show voice status details" onclick={()=>statusDialog?.showModal()}><Info size={18}/></button>{/if}</div>
<section class="participants call-roster" aria-label="Call participants">
  <div class="roster-heading"><h2>{#if participating}{participants} connected {participants===1?'participant':'participants'}{:else if channelAvailable}{presentMembers.length} in channel{:else}Channel presence unavailable{/if}</h2>{#if rosterOverflows}<small class="overflow-notice">More participants · scroll</small>{/if}</div>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex (Scrollable participant region must be reachable for keyboard scrolling.) -->
  <div bind:this={rosterElement} class="roster-scroll" role="region" aria-label="Voice participants" tabindex="0"><ul class="participant-list">
    {#if !participating}
      {#each presentMembers as member(member.id)}<li class="member-row"><span class="avatar"><Users size={21}/></span><div><strong title={member.name}>{member.name}</strong><small>In channel</small></div></li>{/each}
      {#if channelAvailable&&!presentMembers.length}<li class="channel-empty">No one is in the voice channel yet.</li>{/if}
    {:else}
    <li class="member-row" class:speaking={!sourceError&&state?.transmitting}><span class="avatar" class:speaking={!sourceError&&state?.transmitting}><Mic size={21}/></span><div><strong>You</strong><small>{micState}</small></div></li>
    {#if state?.groupMode}
      {#each state.peers??[] as peer(peer.peerId)}<li class="member-row" class:speaking={peerSpeaking(peer,sourceError)}><span class="avatar" class:speaking={peerSpeaking(peer,sourceError)}>{#if peerSpeaking(peer,sourceError)}<AudioLines size={21}/>{:else}<Users size={21}/>{/if}</span><div><strong title={peerNames[peer.peerId]??'Group member'}>{peerNames[peer.peerId]??'Group member'}</strong><small title={peerStatus(peer,sourceError)}>{peerStatus(peer,sourceError)}</small></div></li>{/each}
    {:else if state?.peerVerified}<li class="member-row" class:speaking={connected&&(state?.playbackLevel??0)>0.01}><span class="avatar"><Users size={21}/></span><div><strong title={peerName}>{peerName}</strong><small>{!connected?'Connecting…':(state.playbackLevel??0)>0.01?'Speaking':'Listening / quiet'}</small></div></li>{/if}
    {/if}
  </ul></div>
</section>
<div class="call-deck voice-controls" aria-label="Call controls">
  {#if !compactCall}{@render audioControls()}{/if}
  <div class="call-tools">
    <div class="call-transmit">
      {#if !participating}<button class="primary join-call" disabled={busy||joining||!state||!!onjoin&&!channelAvailable} onclick={()=>void run(()=>onjoin?onjoin():client.start())}>{busy||joining?'Joining…':'Join channel · Muted'}</button>
      {:else if telecom&&state?.telecomState==='held'||state?.coordinatorStatus==='interrupted'}<button class="primary native-ptt" disabled={busy||joining||!!onjoin&&!channelAvailable} onclick={()=>void rejoinMuted()}>{state?.telecomState==='held'?'Rejoin held call · Muted':'Rejoin voice · Muted'}</button>
      {:else if telecom&&!telecomUsable}<button class="primary native-ptt" disabled aria-label="Hold native push to talk" title={statusText}>{state?.telecomSystemMuted?'Android call muted':state?.telecomState==='pending'?'Preparing Android audio':'Android audio unavailable'}</button>
      {:else if selectedInput!=='always-on'}<NativePtt {client} {state} blocked={!!sourceError} onerror={message=>error=message}/>
      {:else}<div class="listening-state"><AudioLines size={24}/><strong>{micState}</strong></div>{/if}
    </div>
  <button class="outline" aria-label={state?.muted?'Unmute native microphone':'Mute native microphone'} aria-pressed={state?.muted??true}
    disabled={!joined||!!state?.muted&&(!connected||!state.audioFocus||!state.routeReady||telecom&&!telecomUsable||busy||!!sourceError)} onclick={()=>void control(()=>client.mute(!state?.muted))}>
    {#if state?.muted}<MicOff size={20}/><span class="tool-label">Unmute</span>{:else}<Mic size={20}/><span class="tool-label">Mute</span>{/if}</button>
  <button class="outline" aria-label={state?.deafened?'Undeafen native audio':'Deafen native audio'} aria-pressed={state?.deafened??false}
    disabled={!joined||!!state?.deafened&&(busy||!!sourceError)} onclick={()=>void control(()=>client.deafen(!state?.deafened))}><Headphones size={20}/><span class="tool-label">{state?.deafened?'Sound on':'Sound off'}</span></button>
  {#if compactCall}<button class="outline audio-options" aria-label="Audio options" title="Audio options" aria-haspopup="dialog" onclick={()=>audioDialog?.showModal()}><SlidersHorizontal size={20}/><span class="tool-label">Audio</span></button>{/if}
  <button class="danger" aria-label={busy||joining?'Cancel joining voice':'Leave channel'} disabled={!participating&&!busy&&!joining} onclick={()=>void leave()}><PhoneOff size={20}/><span class="tool-label">{busy||joining?'Cancel':'Leave'}</span></button>
  </div>
</div>
</section>
{#if compactCall}<dialog bind:this={audioDialog} class="voice-status-dialog audio-dialog" aria-labelledby="voice-audio-title"><h2 id="voice-audio-title">Audio options</h2>{@render audioControls()}<p>Changing input mode or output keeps transmission muted. Unmute explicitly when ready.</p><form method="dialog"><button class="outline">Done</button></form></dialog>{/if}
<dialog bind:this={statusDialog} class="voice-status-dialog" aria-labelledby="voice-status-title"><h2 id="voice-status-title">Voice status</h2><p>{statusDetail||statusText}</p><p>Join starts microphone access with transmission muted. After an interruption, choose an output and unmute explicitly. Leave ends this voice session.</p><form method="dialog"><button class="outline">Close</button></form></dialog>

<style>
.call-tools{grid-template-columns:repeat(4,minmax(0,1fr))}.call-tools>.outline,.call-tools>.danger,.status-details,.audio-dialog button,.audio-dialog select{min-height:48px}.call-tools .tool-label{font-size:12px}.status-details{min-width:48px}.call-preferences .segments button{min-height:48px!important}

.voice-call{font-size:.875rem;width:100%;display:flex;flex-direction:column;min-height:0;height:100%;gap:8px;color:inherit}.call-heading{display:flex;align-items:center;gap:10px;background:var(--green,#164b32);color:var(--bg,#fffdf6);padding:12px;border-radius:16px;flex:none;min-width:0}.call-heading>div{min-width:0;flex:1}.call-heading h1{font-size:1.15em;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:0}.call-heading small{display:block;color:inherit;opacity:.85;font-size:.78em}.call-heading .pill{background:var(--bg,#fffdf6);color:var(--green,#164b32);font-size:.72em}.call-status{display:flex;align-items:center;gap:6px;min-height:32px;flex:none;padding:0 3px;font-size:.85em;color:var(--muted);min-width:0}.call-status>span{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.call-status.problem{color:#923e20}.status-details{display:grid;place-items:center;min-width:36px;min-height:32px;padding:4px;background:transparent;border:0;border-radius:8px;color:inherit}.call-roster{padding:4px 2px;display:flex;flex-direction:column;flex:1;min-height:0;min-width:0}.roster-heading{display:flex;justify-content:space-between;gap:6px;align-items:start;flex:none}.overflow-notice{font-size:.72em;color:var(--muted);white-space:nowrap}.call-roster h2{font-size:.85em;line-height:1.25;margin:0 0 10px;color:var(--muted);flex:none}.channel-empty{grid-column:1/-1;color:var(--muted);padding:10px 0;font-size:.9em;list-style:none}.roster-scroll:focus-visible{outline:3px solid #bd751f;outline-offset:1px}.roster-scroll{min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin}.participant-list{list-style:none;margin:0;padding:3px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;overflow:auto;overscroll-behavior:contain;align-content:start;min-height:0;scrollbar-width:thin}.member-row{border:1px solid var(--line);border-radius:12px;display:flex;gap:9px;min-width:0;padding:6px 8px;background:var(--card);align-items:center}.member-row:last-of-type{border:1px solid var(--line)}.member-row.speaking{border-color:#649347;background:var(--sage)}.member-row .avatar{width:32px;height:32px;flex:none}.member-row>div{min-width:0;flex:1}.member-row strong{font-size:.88em;line-height:1.25;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.member-row small{font-size:.75em;line-height:1.4;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:4px}.call-deck{flex:none;border-top:1px solid var(--line);padding-top:12px;display:grid;gap:10px;min-width:0;background:var(--bg)}.call-preferences{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:8px;min-width:0}.call-preferences .segments{min-width:0;padding:3px;gap:2px}.call-preferences .segments button{font-size:.8em;min-height:44px;padding:6px 3px;line-height:1.2}.call-output{display:flex;align-items:center;gap:5px;min-width:0}.call-output :global(svg){flex:none}.call-output select{font-size:.85em;min-height:46px;width:100%;max-width:none;padding:8px 6px}.call-tools{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;min-width:0}.call-transmit{grid-column:1/-1;min-width:0}.call-transmit :global(.native-ptt),.join-call,.listening-state{width:100%;min-height:62px;font-size:1.05em;white-space:normal;line-height:1.2;padding:12px}.call-tools>.outline,.call-tools>.danger{min-width:0;min-height:46px;padding:10px 5px;gap:6px;font-size:.85em}.listening-state{display:flex;justify-content:center;align-items:center;gap:10px;border-radius:13px;background:var(--sage)}.voice-status-dialog{width:calc(100% - 32px);max-width:440px;max-height:85dvh;overflow:auto;border:1px solid var(--line);border-radius:16px;background:var(--card,#fffdf6);color:inherit;padding:20px}.voice-status-dialog::backdrop{background:#10291e88}.voice-status-dialog p{font-size:14px;overflow-wrap:anywhere}.voice-status-dialog h2{font-size:20px;margin-bottom:12px}.visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(orientation:landscape) and (max-height:560px){.voice-call{gap:4px}.call-heading{padding:7px 10px;border-radius:12px}.call-heading>div>small{display:none}.call-heading h1{font-size:1em}.call-status{min-height:25px}.status-details{min-height:25px}.call-roster{padding:1px 2px}.call-roster h2{margin-bottom:5px;font-size:.78em}.participant-list{grid-template-columns:repeat(5,minmax(0,1fr));gap:5px}.member-row{flex-direction:column;text-align:center;gap:5px;padding:6px 3px}.member-row .avatar{display:none}.member-row>div{width:100%}.member-row strong{font-size:.85em}.member-row small{font-size:.75em;margin-top:1px}.call-deck{gap:6px;padding-top:6px}.call-tools{grid-template-columns:minmax(115px,1fr) repeat(4,48px);gap:6px}.call-transmit{grid-column:auto}.call-transmit :global(.native-ptt),.join-call,.listening-state{min-height:48px;padding:8px;font-size:.9em}.call-tools .tool-label{display:none}.call-preferences{grid-template-columns:minmax(0,1.2fr) minmax(0,1fr)}.call-preferences .segments button{min-height:36px}.call-output select{min-height:44px}}
.audio-dialog .call-preferences{grid-template-columns:1fr}.audio-dialog .call-preferences .segments button{min-height:44px}.audio-dialog form{margin-top:16px}:global(.app-shell.dark) .call-status.problem{color:#ffc58e}
.call-status>span{white-space:normal;overflow:visible;overflow-wrap:anywhere;line-height:1.4}
@media(prefers-reduced-motion:reduce){.voice-call *{transition:none}}
</style>
