<script lang="ts">
  import {Radio,X} from '@lucide/svelte';
  import {radioSignalView} from '@aumanet/core';
  import type {RadioSignal} from '@aumanet/protocol';
  import RadioSignalDetails from './RadioSignalDetails.svelte';
  export let signals:readonly RadioSignal[]=[];
  export let elapsedMs=0;
  export let phoneAttached=false;
  export let dark=false;
  export let ontest:()=>void=()=>{};
  let details:HTMLDialogElement;
  $: signal=signals.find(s=>s.status==='available');
  $: reading=signal?radioSignalView(signal,elapsedMs):undefined;
  $: label=reading?.status==='available'?`HaLow ${reading.value}`:reading?.status==='stale'?'HaLow stale':'HaLow unknown';
</script>
<button class="quality-status" aria-label={label+'. Open link quality details'} onclick={()=>details.showModal()}><Radio size={15}/><span>{label}</span></button>
<dialog class="live-appearance-dialog" class:dark bind:this={details} aria-labelledby="link-quality-title">
  <div class="quality-heading"><h2 id="link-quality-title">Link observations</h2><button class="square" aria-label="Close link observations" onclick={()=>details.close()}><X size={21}/></button></div>
  <p><strong>Phone → local node</strong><br/>{phoneAttached?'Saved node Wi-Fi attached; signal strength unavailable.':'Attachment not confirmed; signal strength unavailable.'}</p>
  <p><strong>Node → node HaLow</strong><br/>Directional cached observation; this is not mesh-wide quality.</p>
  <RadioSignalDetails {signals} {elapsedMs}/>
  <p><strong>End-to-end service</strong><br/>No live speed, latency or loss assessment. A signal number alone does not establish voice, message or internet reliability.</p>
  <button class="outline" onclick={()=>{details.close();ontest();}}>Open connection tests</button>
</dialog>
<style>
  .quality-status{display:flex;align-items:center;gap:5px;background:transparent;border:1px solid var(--line);border-radius:8px;padding:6px;font-size:11px;white-space:nowrap;color:var(--muted);min-height:38px}.quality-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.quality-heading h2{font-size:20px}dialog{box-sizing:border-box;width:min(480px,calc(100vw - 24px));max-height:85dvh;overflow:auto;padding:18px;border:1px solid var(--line);border-radius:16px;background:var(--surface,#fff);color:inherit}p{font-size:13px;line-height:1.6;color:var(--muted)}
</style>
