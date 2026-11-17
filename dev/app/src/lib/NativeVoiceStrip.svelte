<script lang="ts">
  import type {NativeVoiceLabClient,VoiceLabSnapshot} from '@aumanet/core';
  import {AudioLines,Mic,MicOff} from '@lucide/svelte';
  import NativePtt from './NativePtt.svelte';
  export let client:NativeVoiceLabClient;
  export let state:VoiceLabSnapshot;
  export let open:()=>void;
  export let sourceError='';
  export let waiting=false;
  let error='';
  $: status=error?'Action failed · open Voice':sourceError?'Status unavailable · open Voice':waiting?'Waiting for members':!state.audioFocus?'Audio interrupted':state.routeInitializing&&state.coordinatorStatus==='waiting'?'Waiting for other members':!state.routeReady?state.routeInitializing?'Preparing audio':'Choose audio output':state.deafened?'Deafened':state.muted?'Mic muted':state.transmitting?'Transmitting':state.inputMode==='always-on'?'Listening':'Hold to talk';
  async function mute(){try{await client.mute(!state.muted);error='';}catch(e){error=e instanceof Error?e.message:String(e);}}
</script>
<div class="voice-strip native-strip">
  <button class="strip-title" aria-label="Open native voice" onclick={open}><AudioLines size={22}/><span><strong>Group voice</strong><small role="status" title={status}>{status}</small></span></button>
  <button class="strip-mic" aria-label={state.muted?'Unmute native microphone':'Mute native microphone'} aria-pressed={state.muted} disabled={!state.joined||state.muted&&(!!sourceError||state.connection!=='connected'||state.deafened||!state.audioFocus||!state.routeReady)} onclick={()=>void mute()}>{#if state.muted}<MicOff size={21}/>{:else}<Mic size={21}/>{/if}</button>
  {#if !waiting&&state.inputMode==='ptt'}<NativePtt {client} {state} blocked={!!sourceError} onerror={message=>error=message}/>{/if}
</div>
<style>.native-strip{display:grid;grid-template-columns:minmax(0,1fr) 44px minmax(112px,1fr);flex-wrap:nowrap;gap:6px;flex:none;min-width:0}.native-strip:not(:has(:global(.native-ptt))){grid-template-columns:minmax(0,1fr) 44px}.native-strip .strip-title{min-width:0;padding:3px;gap:6px;overflow:hidden}.strip-title>span{min-width:0;overflow:hidden}.strip-title strong,.strip-title small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}.strip-title strong{font-size:.8rem}.strip-title small{font-size:.7rem}.native-strip :global(.native-ptt){min-width:0;width:100%;min-height:44px;padding:8px;font-size:.8rem;white-space:normal;line-height:1.2}@media(max-height:320px){.native-strip{padding:4px;margin:0}}</style>
