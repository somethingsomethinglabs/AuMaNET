<script lang="ts">
  import HelpButton from './HelpButton.svelte';
  import {onMount} from 'svelte';
  import {formatAccuracy} from './appearance/distance';
  import type {Units} from './appearance/preferences';
  export let units:Units='Metric';
  import {locationView,type NativeLocationClient,type LocationSnapshot} from '@aumanet/core';
  import {LocateFixed,Square,MapPin} from '@lucide/svelte';
  export let client:NativeLocationClient;
  export let state:LocationSnapshot|undefined;
  export let sourceError='';
  export let sharingAvailable=false;
  export let sharingEnabled=false;
  export let onconnect:(()=>void)|undefined=undefined;
  export let onsharingchange:(enabled:boolean)=>Promise<unknown>=async()=>{throw new Error('Location sharing is unavailable.');};
  let busy=false,sharingBusy=false,sharingError='',error='',now=0,receivedAt=0;
  $: sharingHint=sharingBusy?'Updating location sharing…':sharingEnabled?'New position fixes are shared with the connected group, including while the screen is off. Turn sharing off or use Stop sharing in the Android notification to stop new updates.':!sharingAvailable?'Connect to a verified group to share your position.':sourceError?'Location status is unavailable. Wait for it to refresh before enabling sharing.':!state?'Loading location status…':state.backgroundSharing==='starting'?'Preparing location sharing…':'Sharing is off. Turn it on to request location access and share new fixes with the connected group.';
  $: if(state){receivedAt=performance.now();}
  $: view=locationView(state,Math.max(0,now-receivedAt));
  $: freshness=sourceError&&state?.fix?'stale':view.freshness;
  onMount(()=>{now=performance.now();const timer=setInterval(()=>now=performance.now(),500);return()=>clearInterval(timer);});
  async function run(action:()=>Promise<unknown>){
    if(busy)return;busy=true;error='';
    try{await action();}catch(e){error=e instanceof Error?e.message:String(e);}finally{busy=false;}
  }
  async function stop(){try{await client.stop();error='';}catch(e){error=e instanceof Error?e.message:String(e);}}
  async function changeSharing(input:HTMLInputElement){
    const enabled=input.checked;
    // A native permission prompt or rejected command must not leave an optimistic checkmark.
    input.checked=sharingEnabled;
    if(sharingBusy)return;
    sharingBusy=true;sharingError='';
    try{await onsharingchange(enabled);}
    catch(e){sharingError=e instanceof Error?e.message:String(e);}
    finally{sharingBusy=false;input.checked=sharingEnabled;}
  }
</script>

<section class="card native-location">
  <div class="panel-heading"><h2><MapPin size={22}/>Your location</h2></div>
  {#if error||sourceError}<p class="location-error" role="alert">{error||sourceError}</p>{/if}
  {#if state?.message}<p role="status">{state.message}</p>{/if}
  {#if state?.fix}
    <div class="position-state"><strong>{freshness==='fresh'?'Current observation':'Last-known position'}</strong><span>{state.permission==='approximate'?'Approximate permission':'Precise permission'}</span></div>
    <dl><div><dt>Coordinates</dt><dd>{state.fix.latitude.toFixed(6)}, {state.fix.longitude.toFixed(6)}</dd></div>
      <div><dt>Reported accuracy</dt><dd>±{formatAccuracy(state.fix.accuracy,units)}</dd></div>
      <div><dt>Fix age</dt><dd>{Math.floor((view.ageMs??0)/1000)} s · {freshness}</dd></div>
      <div><dt>Observed at</dt><dd>{new Date(state.fix.timestamp).toLocaleString()}</dd></div></dl>
    {#if state.fix.mock}<p role="status">Android labels this observation as a mock location.</p>{/if}

  {:else}<p>{state?.active?'Waiting for a location fix. A clear view of the sky may help GPS.':'No observed position. Start location to request access.'}</p>{/if}
  <div class="location-actions">
    {#if state?.active}<button class="outline" onclick={()=>void stop()}><Square size={18}/>Stop own location</button>
    {:else}<button class="primary" disabled={busy||!state} onclick={()=>void run(()=>client.start())}><LocateFixed size={18}/>{busy?'Starting location…':'Start own location'}</button>{/if}
    {#if state?.fix}<button class="outline" disabled={busy} onclick={()=>void run(()=>client.clear())}>Clear last-known position</button>{/if}
  </div>
  {#if busy}<button class="text-button" onclick={()=>void stop()}>Cancel / stop</button>{/if}
  {#if state?.permission==='denied'}<button class="text-button" onclick={()=>void run(()=>client.settings('app'))}>Open app location permissions</button>{/if}
  {#if state?.status==='provider-disabled'||state?.status==='unavailable'}<button class="text-button" onclick={()=>void run(()=>client.settings('location'))}>Open Android Location settings</button>{/if}
  <label class="switch-row sharing-row"><span>Share my position</span><input type="checkbox" aria-label="Share my position" aria-describedby="location-sharing-hint" checked={sharingEnabled}
    disabled={sharingBusy||(!sharingEnabled&&(!sharingAvailable||!state||!!sourceError))} onchange={event=>void changeSharing(event.currentTarget)}/></label>
  {#if sharingError}<p class="location-error" role="alert">{sharingError}</p>{/if}
  <p class="hint" id="location-sharing-hint" role="status">{sharingHint} No track is saved.</p>
  {#if onconnect&&!sharingAvailable&&!sharingEnabled&&!sharingBusy}
    <button class="outline" onclick={onconnect}>Open group connection</button>
  {/if}
  <div class="help-row"><span>Location &amp; privacy</span><HelpButton title="Location & privacy"><p>Your own map view uses location only while the app is open. Group sharing can continue with the screen off; the Android notification has a stop control.</p><p>Accuracy is Android’s estimate. Positions older than one minute, or from stopped updates, are shown as last known.</p></HelpButton></div>
</section>
<style>
  .native-location h2{display:flex;align-items:center;gap:8px}.position-state{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}.position-state span{font-size:0.75rem}.location-actions{display:flex;flex-wrap:wrap;gap:8px}.location-actions button{display:flex;align-items:center;justify-content:center;gap:8px;min-height:44px}.location-error{color:var(--error-ink);background:var(--error-bg);border-radius:8px;padding:10px}dl{margin:16px 0}dl div{display:flex;justify-content:space-between;gap:10px;padding:5px 0}dt{color:var(--muted)}dd{margin:0;text-align:right;overflow-wrap:anywhere}.hint{line-height:1.5}
  .sharing-row{margin-top:18px}
</style>
