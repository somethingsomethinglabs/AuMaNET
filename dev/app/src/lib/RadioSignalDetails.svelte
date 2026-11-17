<script lang="ts">
  import {radioSignalView} from '@aumanet/core';
  import type {RadioSignal} from '@aumanet/protocol';
  export let signals:readonly RadioSignal[]=[];
  export let elapsedMs=0;
  export let frozen=false;
</script>

{#if !signals.length}<p class="radio-empty">No authenticated radio observation available.</p>
{:else}
  {#each signals as signal (signal.receiverNodeId)}
    {@const reading=radioSignalView(signal,frozen?0:elapsedMs)}
    <div class="radio-reading">
      <div class="radio-value"><strong>{reading.value}</strong><span>{reading.direction}</span>{#if reading.status==='stale'}<span class="radio-stale">Stale report</span>{/if}</div>
      <p>{reading.source}</p>
      <p>{frozen?reading.ageAtReceipt:reading.age} · {reading.sampleAge}</p>
      <small>{reading.verification}. {reading.note}</small>
    </div>
  {/each}
{/if}

<style>
  .radio-reading{padding:12px 0;border-bottom:1px solid var(--line);overflow-wrap:anywhere}.radio-reading:last-child{border-bottom:0}.radio-value{display:flex;align-items:baseline;flex-wrap:wrap;gap:7px 11px}.radio-value strong{font-size:18px;color:inherit;font-variant-numeric:tabular-nums}.radio-value>span{font-size:12px;color:var(--muted)}.radio-value .radio-stale{color:var(--warning-ink,#8b5a1f)}.radio-reading p{font-size:12px;line-height:1.5;margin:5px 0;color:var(--muted)}.radio-reading small,.radio-empty{font-size:11px;line-height:1.6;color:var(--muted)}:global(.dark) .radio-value .radio-stale{color:#f1d39c}
</style>
