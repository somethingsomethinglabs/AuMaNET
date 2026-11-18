<script lang="ts">
  import HelpButton from "./HelpButton.svelte";
  import {onMount} from 'svelte';
  import {Gauge,RefreshCw,Square,Download} from '@lucide/svelte';
  import type {GroupSnapshot,LinkBenchmarkResult,LinkBenchmarkDirection} from '@aumanet/protocol';
  import {type LinkBenchmarkClient,type LinkBenchmarkState,benchmarkRunning,goodput,benchmarkCapHit} from './link-benchmark';
  import {radioSignalView} from '@aumanet/core';
  import RadioSignalDetails from './RadioSignalDetails.svelte';
  import BenchmarkComparison from './BenchmarkComparison.svelte';
  import {formatDistance,formatAccuracy} from './appearance/distance';
  import type {Units} from './appearance/preferences';
  export let client:LinkBenchmarkClient|undefined=undefined;
  export let group:GroupSnapshot|undefined=undefined;
  export let units:Units='Metric';
  export let onplan:((result:LinkBenchmarkResult)=>void)|undefined=undefined;
  export let ontools:(()=>void)|undefined=undefined;
  let state:LinkBenchmarkState|undefined,peerId='',showHistory=false;
  onMount(()=>client?.subscribe(next=>state=next));
  $: snapshot=state?.snapshot;
  $: historyUnavailable=snapshot?.errorCode==='LINK_TEST_HISTORY_UNAVAILABLE';
  $: running=benchmarkRunning(snapshot);
  $: latest=snapshot?.result??snapshot?.results.at(-1);
  $: latestSignal=latest?.radioSignals.find(signal=>signal.status==='available');
  $: latestReading=latestSignal?radioSignalView(latestSignal,0):undefined;
  $: peers=snapshot?.peers??[];
  $: if(peerId&&!peers.some(peer=>peer.peerId===peerId))peerId='';
  $: selected=!!group?.group&&snapshot?.scope?.groupId===group.group.id&&snapshot.scope.selfId===group.identity.id&&snapshot.scope.epoch===group.group.epoch;
  $: average=snapshot&&snapshot.phaseElapsedMs>0?snapshot.phaseBytes*8000/snapshot.phaseElapsedMs:undefined;
  const phaseNames:Record<string,string>={idle:'Not armed',armed:'Ready for a test',preparing:'Preparing both phones', 'warmup-upload':'Warming up upload',upload:'Measuring upload','warmup-download':'Warming up download',download:'Measuring download',complete:'Test complete',interrupted:'Test interrupted'};
  function name(id:string){return group?.members.find(member=>member.id===id)?.name??'Approved group phone';}
  function when(value:number){const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString():'Date unavailable';}
  function resultRate(direction:LinkBenchmarkDirection){return direction.complete?goodput(direction.goodputBitsPerSecond):direction.receivedBytes&&direction.elapsedMs?`Partial · ${goodput(direction.goodputBitsPerSecond)}`:'Not measured';}
  function positionLabel(result:LinkBenchmarkResult){return result.phoneSeparationMeters===undefined?'Phone separation unavailable':`${formatDistance(result.phoneSeparationMeters,units)} between phones`;}
</script>
<section class="link-test" aria-label="Connection test">
  {#if state?.error}<p class="test-error" role="alert">{state.error}</p>{/if}{#if state?.notice}<p role="status">{state.notice}</p>{/if}
  {#if showHistory&&historyUnavailable}<p role="alert">Result history is unavailable. Existing files have been preserved.</p>{/if}
  <div class="test-navigation"><button class:active={!showHistory} aria-pressed={!showHistory} onclick={()=>showHistory=false}>Run test</button><button class:active={showHistory} aria-pressed={showHistory} onclick={()=>showHistory=true}>Test history ({snapshot?.results.length??0})</button></div>
  {#if ontools}<button class="outline" onclick={ontools}>All tools &amp; checks</button>{/if}
  {#if showHistory&&latest&&!running}<section class="card latest-result" aria-labelledby="latest-test-title"><div class="test-heading"><h2 id="latest-test-title">Latest result</h2><span class="hint">{latest.status==='complete'?'Complete':latest.status==='cancelled'?'Stopped':'Failed'}</span></div>
    <div class="latest-rates"><div><small>Upload</small><strong>{resultRate(latest.upload)}</strong>{#if benchmarkCapHit(latest.upload)}<small class="cap-note">Byte limit reached; link capacity may be higher.</small>{/if}</div><div><small>Download</small><strong>{resultRate(latest.download)}</strong>{#if benchmarkCapHit(latest.download)}<small class="cap-note">Byte limit reached; link capacity may be higher.</small>{/if}</div></div>
    {#if latest.testProfile==='channel-comparison'}<p class="hint">Short channel-comparison test · three-second measurements in each direction.</p>{/if}
    <p class="latest-signal">Radio at test end: <strong>{latestReading?.value??'Unavailable'}</strong>{#if latestReading} · {latestReading.direction}{/if}</p><p class="hint">Cached directional reading; RF sample age unknown.</p>
    <p class="latest-distance">{positionLabel(latest)}</p><p class="hint">Phone GPS accuracy: {latest.positions?.own?'±'+formatAccuracy(latest.positions.own.accuracy,units):'Your fix unavailable'} / {latest.positions?.peer?'±'+formatAccuracy(latest.positions.peer.accuracy,units):'Peer fix unavailable'}. Nodes are assumed carried with phones.</p><p class="hint">{when(latest.completedAt)}{snapshot?.results.some(row=>row.id===latest.id)?'':' · Not confirmed saved'}</p>
    {#if onplan&&state?.loaded&&selected&&!historyUnavailable&&latest.status==='complete'&&latest.upload.complete&&latest.download.complete&&latest.upload.goodputBitsPerSecond>0&&latest.download.goodputBitsPerSecond>0}
      <button class="outline" onclick={()=>onplan?.(latest)}>Plan use cases with these rates</button><p class="hint">Copies this historical test's speeds into the estimator. Other workloads and quality checks remain assumptions.</p>
    {/if}
  </section>{/if}
  {#if !showHistory||running}<section class="card"><div class="test-heading"><Gauge size={26}/><h2>Test connection</h2></div><p class="test-warning">Pauses calls and transfers on both phones. Microphones return muted.</p>
    {#if !client}<p role="status">Connection testing is unavailable in this version. Open a supported Android build.</p>{:else}

      <div class="test-status"><p class="phase" role="status">{state?.loaded?snapshot?.errorCode==='LINK_TEST_CANCELLED'?'Test stopped':phaseNames[snapshot?.state??'idle']:'Checking test status…'}</p>{#if snapshot?.armId}<button class="outline" onclick={()=>void client?.stop()}><Square size={17}/>{running?'Stop test':'Stop accepting tests'}</button>{/if}</div>
      {#if snapshot?.errorCode}<p class="hint">{snapshot.errorCode==='LINK_TEST_CANCELLED'?'Stopped by request. Allow tests again when ready.':historyUnavailable?'Result history is unavailable. Existing files have been preserved; new results cannot be saved.':'The test could not continue. Check the group connection, stop shared internet and arm both phones again.'}</p>{/if}
      {#if state?.loaded&&!snapshot?.available}<p class="hint">Connect to your approved group before allowing tests.</p>{:else if state?.loaded&&!snapshot?.armed&&!snapshot?.canArm&&!historyUnavailable}<p class="hint">Testing is unavailable right now. Stop shared internet and check the group connection, then refresh.</p>{/if}
      {#if snapshot?.armed}<p class="hint armed-remaining">Accepting tests for up to {Math.ceil(snapshot.armRemainingMs/60000)} more minutes.</p>{/if}
      {#if running&&snapshot}<progress max={['upload','download'].includes(snapshot.state)?10000:2000} value={Math.min(snapshot.phaseElapsedMs,['upload','download'].includes(snapshot.state)?10000:2000)} aria-label="Current test phase progress"></progress><p class="live-rate">{!state?.loaded?'Last observed: ':''}{(snapshot.phaseBytes/1e6).toFixed(2)} MB · {(snapshot.phaseElapsedMs/1000).toFixed(1)} s{#if average!==undefined} · {goodput(average)} average so far{/if}</p>
      {:else}
        {#if !snapshot?.armed}<button class="outline full" disabled={!state?.loaded||!snapshot?.canArm||!!state?.busy} onclick={()=>void client?.arm()}>Allow tests for 15 minutes</button>{/if}
        <label class="field">Test with<select bind:value={peerId} disabled={!state?.loaded||!!state?.busy}><option value="">Choose an armed phone</option>{#each peers as peer(peer.peerId)}<option value={peer.peerId}>{name(peer.peerId)}</option>{/each}</select></label>
        {#if !peers.length}<p class="hint">Ask the other person to open Test connection and allow tests.</p>{/if}
        <button class="primary full" disabled={!state?.loaded||!selected||!snapshot?.armed||!peerId||!!state?.busy} onclick={()=>void client?.start(peerId)}>Pause traffic &amp; start test</button>
      {/if}
      <button class="text-button refresh-test" onclick={()=>void client?.refresh()}><RefreshCw size={16}/>Refresh test status</button>
    {/if}
    <div class="help-row"><span>About this test</span><HelpButton title="About this test"><p>Measure usable application payload goodput: phone → node → radio → node → phone. This is not the radio’s raw maximum. Small connection and security control messages continue.</p><p>Tell the other person before starting. Allow tests on both phones; only currently approved members with active test permission appear. Arming does not start a test by itself. Check Voice afterwards and unmute explicitly when ready.</p><p>Each direction has a 2-second warmup and up to 10 seconds of measurement. Measurement is bounded to 45 seconds, plus up to 20 seconds of preparation. At most 32 MiB of payload. A direction that reaches its byte limit may have a higher actual link capacity.</p><p>Results use existing shared phone fixes; opening this panel starts no GPS. Phone separation is a proxy, not node GPS or an exact RF path length. An interrupted direction is partial, never a successful zero-speed measurement.</p></HelpButton></div>
  </section>
  {/if}
  {#if showHistory}<BenchmarkComparison results={snapshot?.results??[]} {units}/>
  <section class="card result-history"><details class="saved-results"><summary>Saved results ({snapshot?.results.length??0})</summary><p class="hint">Up to 100 results on this phone. Upload and download are from this phone’s perspective.</p>
    {#if snapshot?.results.length}<div class="test-table"><table><thead><tr><th>Finished</th><th>Upload</th><th>Download</th><th>Outcome</th></tr></thead><tbody>{#each [...snapshot.results].reverse() as result(result.id)}<tr><td>{when(result.completedAt)}</td><td>{resultRate(result.upload)}{#if benchmarkCapHit(result.upload)}<small class="cap-note">Byte limit reached; link capacity may be higher.</small>{/if}</td><td>{resultRate(result.download)}{#if benchmarkCapHit(result.download)}<small class="cap-note">Byte limit reached; link capacity may be higher.</small>{/if}</td><td>{result.status==='complete'?'Complete':result.status==='cancelled'?'Stopped':'Failed'}</td></tr>{/each}</tbody></table></div>
      {#each [...snapshot.results].reverse() as result(result.id)}<details class="test-result"><summary>{when(result.completedAt)} · {positionLabel(result)}</summary><p class="hint">Measured {when(result.startedAt)} → {when(result.completedAt)}. Counts are receiver-confirmed payload bytes; interrupted directions are partial.</p><RadioSignalDetails signals={result.radioSignals}/><p class="hint">Radio readings are directional cached observations. A recent report does not establish the RF sample age; unsupported directions remain unavailable.</p><p>{positionLabel(result)}</p><p class="hint">Phone GPS separation; nodes are assumed carried with their phones. This is not a node GPS measurement.</p>{#each [['Your phone',result.positions?.own],['Other phone',result.positions?.peer]] as entry}{@const fix=entry[1]}{#if fix&&typeof fix!=='string'}<p class="hint">{entry[0]}: ±{formatAccuracy(fix.accuracy,units)} · {when(fix.timestamp)} · {Math.ceil(fix.ageMs/1000)} s old when recorded{fix.mock?' · Mock location':''}</p>{/if}{/each}</details>{/each}
    {:else}<p class="hint">{historyUnavailable?'Saved results cannot be read right now. Existing files have been kept.':'No saved connection tests yet.'}</p>{/if}
  </details>
  {#if snapshot?.results.length}<div class="test-exports"><button class="outline" disabled={!state?.loaded||!!state?.busy||historyUnavailable} onclick={()=>void client?.export('json')}><Download size={17}/>Export JSON</button><button class="outline" disabled={!state?.loaded||!!state?.busy||historyUnavailable} onclick={()=>void client?.export('csv')}><Download size={17}/>Export CSV</button></div><p class="hint">Exports saved history, including shared phone positions and device identifiers. Choose the destination in Android’s sharing menu.</p>{:else if historyUnavailable}<p class="hint">Saved results cannot be read right now. Existing files have been kept.</p>{/if}
  </section>
{/if}
</section>
<style>
.test-navigation{display:flex;gap:8px;margin-bottom:16px;border-bottom:1px solid var(--line)}.test-navigation button{flex:1;border:0;border-bottom:3px solid transparent;background:transparent;color:var(--muted);padding:12px;font-weight:650}.test-navigation button.active{border-bottom-color:var(--green);color:var(--ink)}

.test-heading{display:flex;align-items:center;gap:10px}.test-heading h2{margin:0}.test-heading .hint{margin-left:auto}.test-status{display:flex;align-items:center;gap:12px;justify-content:space-between}.test-status button{flex-shrink:0}.latest-rates{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:15px}.latest-rates small{display:block;font-size:0.75rem;color:var(--muted)}.latest-rates strong{display:block;margin-top:5px;font-size:1.375rem;line-height:1.3;overflow-wrap:anywhere}.latest-result p{margin:8px 0}.latest-result .latest-signal,.latest-result .latest-distance{margin-top:15px}.saved-results>summary{min-height:44px;align-content:center;cursor:pointer;font-size:0.875rem;font-weight:650}.result-history .test-exports{margin-top:12px}.link-test{min-width:0}.link-test p{font-size:0.8125rem;line-height:1.65}.test-warning{padding:12px;background:var(--warning-bg);color:var(--warning-ink);border-radius:12px}.link-test .hint{font-size:0.75rem;color:var(--muted)}.phase{font-weight:700}.link-test progress{width:100%}.link-test button{min-height:44px;white-space:normal}.link-test select{width:100%;max-width:100%;min-width:0}.link-test .field{margin:16px 0}.refresh-test{display:flex;gap:7px;align-items:center;margin-top:8px}.test-error{color:var(--error-ink);overflow-wrap:anywhere}.test-table{overflow:auto;max-height:330px}.test-table table{border-collapse:collapse;min-width:400px;width:100%;font-size:0.75rem}.test-table th,.test-table td{padding:10px 8px;text-align:left;border-bottom:1px solid var(--line)}.cap-note{display:block;max-width:160px;margin-top:5px;white-space:normal;font-size:0.6875rem;color:var(--muted)}.test-result{margin:14px 0;border-bottom:1px solid var(--line);padding-bottom:10px}.test-result summary{min-height:44px;align-content:center;cursor:pointer;font-size:0.8125rem;overflow-wrap:anywhere}.test-exports{display:flex;gap:10px;flex-wrap:wrap}.test-exports button{flex:1}.test-result p{overflow-wrap:anywhere}
</style>
