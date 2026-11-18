<script lang="ts">
 import {onMount} from 'svelte';
 import type {NativeGatewayRadioSettingsClient,GatewayRadioSettingsView} from '@aumanet/core';
 import type {GroupSnapshot} from '@aumanet/protocol';
 import {ChannelOptimisation,type ChannelOptimisationState} from './channel-optimisation';
 import {goodput,type LinkBenchmarkClient,type LinkBenchmarkState} from './link-benchmark';
 export let radio:NativeGatewayRadioSettingsClient;
 export let benchmark:LinkBenchmarkClient;
 export let group:GroupSnapshot|undefined;
 export let onrunning:(running:boolean)=>void=()=>{};
 const optimiser=new ChannelOptimisation(radio,benchmark);
 let state:ChannelOptimisationState=optimiser.state,bench:LinkBenchmarkState=benchmark.state,radioView:GatewayRadioSettingsView=radio.state,peerId='';
 let context='';
 $: scope=group?.group?`${group.group.id}:${group.identity.id}:${group.group.epoch}`:'';
 $: sameScope=context===scope;
 $: peers=bench.snapshot?.peers??[];
 $: owner=!!group?.group&&group.group.ownerId===group.identity.id;
 $: if(state.running&&context!==scope)optimiser.stop();
 $: onrunning(state.running);
 $: recommended=radioView.snapshot?.options.find(o=>o.id===state.recommendationId);
 function name(id:string){return group?.members.find(m=>m.id===id)?.name??'Other group phone';}
 async function start(){context=scope;await optimiser.run(peerId);}
 onMount(()=>{
  const a=optimiser.subscribe(s=>state=s),b=benchmark.subscribe(s=>bench=s),c=radio.subscribe(s=>radioView=s);
  const hide=()=>{if(document.hidden&&optimiser.state.running)optimiser.stop();};
  document.addEventListener('visibilitychange',hide);
  return()=>{optimiser.stop();a();b();c();onrunning(false);document.removeEventListener('visibilitychange',hide);};
 });
</script>
<section class="card channel-optimisation" aria-label="Channel optimisation">
 <h2>Optimise channel</h2>
 <p>Compare permitted channels at your current width and power. Short tests measure three seconds in each direction and include your antennas, the radio path and both phones’ Wi-Fi.</p>
 <p class="hint">Keep both nodes and antennas in fixed positions. Stay on this screen and stop shared internet first. Comparing channels pauses transfers and may end group calls.</p>
 {#if !owner}<p>Run optimisation from the group owner’s phone. On this phone, open Tools → Connection tests and allow tests.</p>
 {:else}
  {#if !bench.snapshot?.armed}<button class="outline full" disabled={state.running||!bench.loaded||!bench.snapshot?.canArm||bench.busy} onclick={()=>void benchmark.arm()}>Allow connection tests for 15 minutes</button>{/if}
  <p class="hint">A full comparison can take up to 14 minutes. After the starting channel is confirmed again, you can choose to apply the recommendation. If you leave early, return here and refresh radio status to check which channel is active.</p>
  {#if radioView.loaded&&!radioView.snapshot?.fieldSessionId}<p>Connect the owner’s phone and both nodes before comparing channels.</p>{/if}
  <label class="field">Test with<select bind:value={peerId} disabled={state.running}><option value="">Choose an armed phone</option>{#each peers as peer}<option value={peer.peerId}>{name(peer.peerId)}</option>{/each}</select></label>
  {#if !state.running&&bench.loaded}
   {#if !bench.snapshot?.armed}
    <p class="hint">{bench.snapshot?.canArm?'Allow connection tests on this phone using the button above.':'This phone cannot allow connection tests right now.'}</p>
   {/if}
   {#if !peers.length}<p class="hint">No other phone is ready. On the other phone, open Tools → Connection tests and allow tests, then return here.</p>
   {:else if !peers.some(p=>p.peerId===peerId)}<p class="hint">Choose a ready phone under Test with to compare channels.</p>{/if}
  {/if}
  {#if bench.error}<p role="alert">{bench.error}</p>{/if}
  {#if state.running}<p role="status">{state.phase}</p><p>{state.samples.length} tests recorded</p><button class="outline full" onclick={()=>optimiser.stop()}>Stop and restore starting channel</button>
  {:else}<button class="primary full" disabled={!peerId||!peers.some(p=>p.peerId===peerId)||!bench.loaded||!bench.snapshot?.armed||bench.busy||!radioView.loaded||!radioView.snapshot?.owner||!radioView.snapshot?.fieldSessionId} onclick={()=>void start()}>Compare channels</button>{/if}
 {/if}
 {#if sameScope&&state.error}<p role="alert">{state.error}</p>{/if}
 {#if sameScope&&state.samples.length}
  <p role="status">{state.running?'Comparison in progress':state.phase}</p>
  <div class="results"><table><caption>Reliability first, then median speed in the slower direction</caption><thead><tr><th>Channel</th><th>Verified complete</th><th>Speed</th></tr></thead><tbody>{#each state.rankings as row}<tr><td>{radioView.snapshot?.options.find(o=>o.id===row.optionId)?.channel??'Unknown'}</td><td>{row.successes}/{row.attempts}</td><td>{row.successes?goodput(row.rate):'Unavailable'}</td></tr>{/each}</tbody></table></div>
  <p class="hint">All attempts count, including failures and missing channel observations. The best two channels receive repeat tests, and the starting channel is retested to check for changing conditions. A channel needs at least three verified completions and no failed attempts to qualify for a recommendation. Detailed results are in Connection tests → Test history.</p>
  {#if !state.running&&state.complete&&state.restored&&recommended}<p><strong>Recommended: channel {recommended.channel} · {recommended.centerFrequencyHz/1e6} MHz</strong></p><p class="hint">Best consistent result in this comparison, at this location and time. This is a link-performance test; noise floor and channel occupancy are not measured.</p><button class="primary full" onclick={()=>void optimiser.applyRecommendation()}>Apply recommended channel</button>
  {:else if !state.running&&state.appliedId}<p>Recommended channel verified on both nodes.</p>
  {:else if !state.running&&state.complete}<p>No recommendation is available. Review radio status before repeating the comparison.</p>{/if}
 {/if}
</section>
<style>
 h2{font-size:1.25rem;margin:0 0 12px}p{font-size:0.8125rem;line-height:1.6}.hint{font-size:0.75rem;color:var(--muted)}select,button{min-height:44px;width:100%}label{margin:14px 0}.results{overflow-x:auto}table{width:100%;font-size:0.75rem;border-collapse:collapse}caption{text-align:left;margin:12px 0;line-height:1.5}th,td{text-align:left;padding:10px 5px;border-bottom:1px solid var(--line)}[role=alert]{color:var(--error-ink)}
</style>
