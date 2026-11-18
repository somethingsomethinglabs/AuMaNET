<script lang="ts">
  import type {NativeVoiceLabClient,VoiceLabSnapshot} from '@aumanet/core';
  import BrandIcon from './BrandIcon.svelte';
  export let client:NativeVoiceLabClient;
  export let state:VoiceLabSnapshot;
  export let open:()=>void;
  export let onleave:(()=>Promise<unknown>)|undefined=undefined;
  export let sourceError='';
  export let waiting=false;
  let error='';
  $: status=error?'Action needs attention':sourceError?'Status unavailable':waiting?'Waiting for members':!state.audioFocus?'Interrupted':!state.routeReady?'Audio unavailable':state.deafened?'Sound off · muted':state.muted?'muted':state.transmitting?'Transmitting':state.inputMode==='always-on'?'Listening':'Ready to talk';
  async function mute(){try{await client.mute(true);error='';}catch{error='Mute not confirmed · open Voice';}}
  async function leave(){try{await (onleave?onleave():client.stop());error='';}catch{error='Leave not confirmed · open Voice';}}
</script>
<div class="voice-strip native-strip" aria-label="Active voice">
  <button class="strip-title" aria-label="Open native voice" onclick={open}><BrandIcon name={state.muted||state.deafened?'muted':'mic'} size={16}/><span role="status">Voice · {status}</span></button>
  <button class="strip-action" aria-label="Mute native microphone" onclick={()=>void mute()}>Mute</button>
  <button class="strip-action" aria-label="Leave voice" onclick={()=>void leave()}>Leave</button>
</div>
<style>.native-strip{display:flex;align-items:center;gap:2px;padding:0 12px;min-height:48px;background:var(--session);color:var(--session-ink);flex:none}.native-strip button{background:transparent;border:0;color:inherit;min-height:48px;font-size:0.75rem}.strip-title{display:flex;align-items:center;gap:8px;flex:1;min-width:0;text-align:left;padding:6px 2px}.strip-title span{overflow-wrap:anywhere}.strip-action{font-weight:600;min-width:48px;padding:6px}</style>
