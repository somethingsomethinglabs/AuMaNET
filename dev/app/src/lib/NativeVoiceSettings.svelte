<script lang="ts">
  import {onDestroy} from 'svelte';
  import type {NativeVoiceLabClient,VoiceLabSnapshot} from '@aumanet/core';
  import type {VoiceOutputPreference} from '@aumanet/protocol';
  export let client:NativeVoiceLabClient;
  export let state:VoiceLabSnapshot|undefined;
  export let sourceError='';
  let mode:'ptt'|'always-on'='ptt',output='default',sensitivity=50,editing=false,busy=false,error='',notice='',alive=true,operation=0;
  let editingScope='';
  $: {const next=state?`${state.processId}:${state.sessionId}`:'';if(next!==editingScope){editingScope=next;++operation;editing=false;busy=false;error='';notice='';}}
  const outputTypes:Readonly<Record<number,VoiceOutputPreference>>={1:'earpiece',2:'speaker',3:'wired-headset',4:'wired-headphones',22:'usb-headset',7:'bluetooth',26:'bluetooth',23:'hearing-aid'};
  const names:Readonly<Record<VoiceOutputPreference,string>>={default:'Default',earpiece:'Phone earpiece',speaker:'Phone speaker','wired-headset':'Wired headset','wired-headphones':'Wired headphones','usb-headset':'USB headset',bluetooth:'Bluetooth call audio','hearing-aid':'Hearing aid'};
  $: telecom=state?.routeOwner==='telecom';
  $: ready=!!state&&!sourceError&&client.synchronized;
  $: outputs=telecom?(state?.telecomEndpoints??[]).map(endpoint=>({value:endpoint.id,label:endpoint.label,disabled:['streaming','unknown'].includes(endpoint.type)})):[{value:'default',label:'Default',disabled:false},...new Map((state?.routes??[]).filter(route=>outputTypes[route.type]).map(route=>{const preference=outputTypes[route.type]!;return[preference,{value:preference,label:route.label||names[preference],disabled:false}];})).values()];
  $: if(state&&!editing&&!busy){mode=state.joined?state.inputMode:state.voicePreferences?.inputMode??state.inputMode;output=telecom?state.telecomEndpointId??'':state.voicePreferences?.outputRoute??'default';sensitivity=state.detectorSensitivity;}
  function edit(){editing=true;error='';notice='';}
  function discard(){editing=false;error='';notice='';}
  async function reload(){if(busy)return;try{await client.refresh();editing=false;error='';notice='Saved settings reloaded.';}catch{error='Saved settings are unavailable. Retry when the service is available.';}}
  async function apply(){
    if(!ready||busy||!state)return;const token=++operation,captured=state.sessionId,process=state.processId,inputMode=mode,selectedOutput=output,value=Number(sensitivity);busy=true;error='';notice='';
    const current=()=>alive&&token===operation&&client.state?.processId===process&&client.state.sessionId===captured;
    try{
      if(state.joined)await client.mute(true);
      if(!current())throw new Error('Voice session changed. Reload settings before applying.');
      await client.preferences({inputMode,sensitivity:value,...(!telecom&&selectedOutput!==(state.voicePreferences?.outputRoute??'default')?{outputRoute:selectedOutput as VoiceOutputPreference}:{}),...(state.voicePreferences?.needsRepair?{repair:true}:{})});
      if(!current())throw new Error('Voice session changed. Reload settings before applying.');
      if(telecom&&selectedOutput&&client.state?.telecomEndpointId!==selectedOutput){await client.requestTelecomEndpoint(selectedOutput);}
      const confirmed=client.state;
      if(!current())return;
      if(!confirmed||confirmed.detectorSensitivity!==value||confirmed.voicePreferences?.inputMode!==inputMode||confirmed.joined&&!confirmed.muted)throw new Error('Voice settings or microphone mute could not be confirmed. Reload before trying again.');
      editing=false;notice=confirmed.joined?'Settings saved. Your microphone is muted.':'Settings saved for your next voice session.';
    }catch(failure){if(alive&&token===operation)error=failure instanceof Error?failure.message:'Voice settings could not be confirmed.';}
    finally{if(alive&&token===operation)busy=false;}
  }
  onDestroy(()=>{alive=false;++operation;});
</script>
<section class="voice-preferences" aria-label="Voice settings" aria-busy={busy}>
  <p class="hint">Changes mute your microphone.</p>
  <label class="field">Input mode<select aria-label="Input mode" bind:value={mode} onchange={edit} disabled={!ready||busy}><option value="ptt">Press and hold</option><option value="always-on" disabled={!!state?.joined&&!state.detectorAvailable}>Hands-free</option></select></label>
  <label class="field">Audio output<select aria-label="Native audio output" bind:value={output} onchange={edit} disabled={!ready||busy||telecom&&!client.supportsTelecomEndpoints}>{#each outputs as route}<option value={route.value} disabled={route.disabled}>{route.label}</option>{/each}{#if !outputs.some(route=>route.value===output)}<option value={output} disabled>Saved output · unavailable</option>{/if}</select></label>
  <label class="field">Speech sensitivity<select aria-label="Speech sensitivity" value={String(sensitivity<=33?0:sensitivity<=66?50:100)} onchange={event=>{sensitivity=Number(event.currentTarget.value);edit();}} disabled={!ready||busy}><option value="0">Low</option><option value="50">Balanced</option><option value="100">High</option></select></label>
  {#if state?.detectorPreferenceNotice||state?.voicePreferences?.notice}<p class="hint" role="status">{state.detectorPreferenceNotice||state.voicePreferences?.notice}</p>{/if}
  {#if client.supportsBluetoothAudio}{#if state?.bluetoothPermission==='prompt'}<button class="text-button" disabled={busy} onclick={()=>void client.requestBluetooth().catch(()=>error='Bluetooth permission could not be requested.')}>Enable Bluetooth audio</button>{:else}<button class="text-button" disabled={busy} onclick={()=>void client.bluetoothSettings().catch(()=>error='Bluetooth settings could not be opened.')}>Connect Bluetooth audio</button>{/if}{/if}
  {#if error||sourceError}<p class="preferences-error" role="alert">{error||sourceError}</p><button class="outline" disabled={busy} onclick={()=>void reload()}>Reload saved settings</button>{/if}
  {#if notice}<p class="hint" role="status">{notice}</p>{/if}
  <button class="primary full" disabled={!ready||busy} onclick={()=>void apply()}>{busy?'Applying…':'Apply & mute'}</button>
  {#if editing}<button class="text-button" disabled={busy} onclick={discard}>Discard changes</button>{/if}
  <details><summary>Microphone & privacy</summary><p>Joining starts microphone access with transmission muted. Press and hold needs a fresh press; release or interruption stops it. Leave ends microphone access.</p><p>Hands-free detects speech locally. It cannot identify your voice or exclude other people. Low sensitivity may miss quiet speech; High may transmit nearby voices or noise. Press and hold works independently.</p><p>Sound off also mutes your microphone. Restoring sound keeps it muted. Saved output and Android’s actual output may differ; unavailable devices require your choice.</p>{#if telecom}<p>Android manages the current call output. Choose an available endpoint explicitly.</p>{/if}</details>
</section>
<style>.voice-preferences{min-width:0}.preferences-error{color:var(--error-ink);background:var(--error-bg);border-radius:11px;padding:12px;overflow-wrap:anywhere}.voice-preferences details{font-size:0.8125rem}.voice-preferences .full{margin-top:4px}</style>
