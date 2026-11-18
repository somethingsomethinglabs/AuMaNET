<script lang="ts">
  import {onMount,onDestroy} from 'svelte';
  import type {Position} from './format';
  import type {MapStore,MapProgress} from './store';
  import MapCentrePicker from './MapCentrePicker.svelte';
  import {currentMapPosition,cancelMapPosition} from './current-position';
  export let store:MapStore;
  export let fix:Position|undefined=undefined;
  export let disabled=false;
  export let busy=false;
  export let onready:()=>Promise<void>=async()=>{};
  let open=false,latitude=-37.814,longitude=144.963,radius=50,error='',finished=false;
  let progress:MapProgress|undefined,jobId='',observed='',starting=false,locating=false,alive=true,accuracy:number|undefined;
  function initialPosition(){if(fix){latitude=fix.latitude;longitude=fix.longitude;}}
  async function usePosition(){
    if(locating)return;locating=true;error='';
    try{const position=await currentMapPosition();if(!alive)return;latitude=position.latitude;longitude=position.longitude;accuracy=position.accuracy;}
    catch(e){if(alive)error=e instanceof Error?e.message:String(e);}finally{if(alive)locating=false;}
  }
  async function poll(){
    if(starting||!store.geoscienceStatus)return;
    const job=await store.geoscienceStatus();if(!alive||!job)return;
    jobId=job.id;progress=job.operation;busy=job.active;
    if(job.active){open=true;finished=false;return;}
    if(observed===job.id)return;observed=job.id;
    if(job.operation.phase==='ready'){finished=true;await onready();}
    else if(job.operation.phase==='failed'||job.operation.phase==='cancelled')error=job.operation.error||'Download cancelled.';
  }
  async function cancel(){try{if(jobId)await store.cancelGeoscience?.(jobId);}catch(e){error=e instanceof Error?e.message:String(e);}}
  async function download(){
    if(busy||disabled||!store.downloadGeoscience)return;
    busy=true;starting=true;error='';finished=false;progress=undefined;
    try{await store.downloadGeoscience({latitude,longitude,radius});starting=false;if(alive)await poll();}
    catch(e){if(alive){error=e instanceof Error?e.message:String(e);busy=false;}}
    finally{starting=false;}
  }
  onMount(()=>{void poll().catch(()=>{});const timer=setInterval(()=>{void poll().catch(()=>{});},700);return()=>clearInterval(timer);});
  onDestroy(()=>{alive=false;busy=false;if(locating)void cancelMapPosition().catch(()=>{});});
</script>

<section class="ga-maps" aria-label="Geoscience Australia maps">
  <button class="outline" disabled={disabled||busy} aria-expanded={open} onclick={()=>{open=!open;if(open)initialPosition();}}>Download Australian topo map</button>
  {#if open}
    <h4>Geoscience Australia · AUSTopo</h4>
    <p>Free Australian roads, waterways and terrain contours. Download a square around your chosen centre for offline use.</p>
    <p class="hint">Regional overview at 1:250,000. Generalised features; unsuitable for navigation or emergency decisions. Mainland Australia and Tasmania.</p>
    {#if store.downloadGeoscience}
      <form onsubmit={event=>{event.preventDefault();void download();}}>
        <fieldset disabled={disabled||busy||locating}>
          <button class="outline" type="button" onclick={()=>void usePosition()}>{locating?'Finding my location…':'Use my location'}</button>
          {#if accuracy!==undefined}<p class="hint" role="status">Location accuracy ±{Math.round(accuracy)} m. Adjust the pin if needed.</p>{/if}
          <MapCentrePicker {latitude} {longitude} {radius} disabled={disabled||busy||locating} onpick={(lat,lon)=>{latitude=lat;longitude=lon;accuracy=undefined;}}/>
          <label>Centre latitude<input type="number" min="-44" max="-10" step="any" required bind:value={latitude}/></label>
          <label>Centre longitude<input type="number" min="112" max="154" step="any" required bind:value={longitude}/></label>
          <label>Area size<select bind:value={radius}><option value={25}>50 × 50 km</option><option value={50}>100 × 100 km</option><option value={100}>200 × 200 km</option></select></label>
          <p class="hint">Internet required for download. Up to 512 MiB plus working space; four installed regions maximum. Downloads continue when you leave this screen or lock your phone. Android shows progress and Cancel in a notification. If Android stops the app or the connection fails, retry the download.</p>
          <button class="outline" type="submit">Download for offline use</button>
        </fieldset>
      </form>
    {:else}<p>In-app downloads are available in the Android app.</p>{/if}
    {#if busy}<div role="status"><p>Downloading and installing map{progress?.total?` · ${progress.completed} / ${progress.total} images`: '…'}</p><p class="hint">You can leave this screen. Download continues in the background.</p>{#if progress?.total}<progress max={progress.total} value={progress.completed}></progress>{/if}<button class="outline" onclick={()=>void cancel()}>Cancel download</button></div>{/if}
    {#if error}<p role="alert">{error}</p>{/if}
    {#if finished}<p role="status">Map installed and selected. Use Show map below to view it.</p>{/if}
    <p class="hint">© Commonwealth of Australia (Geoscience Australia). <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> · <a href="https://www.ga.gov.au/scientific-topics/national-location-information/topographic-maps" target="_blank" rel="noreferrer">Map source</a></p>
  {/if}
</section>

<style>
  .ga-maps{margin:14px 0;padding:14px 0;border-block:1px solid var(--line)}h4{margin:12px 0 8px;font-size:0.875rem}p{font-size:0.8125rem;line-height:1.5}.hint{font-size:0.75rem;color:var(--muted)}fieldset{border:0;padding:0;display:grid;gap:12px;min-width:0}label{display:grid;gap:6px;font-size:0.8125rem}input,select{box-sizing:border-box;width:100%;min-height:44px;padding:8px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:inherit;font:inherit}.outline{min-height:44px;border:1px solid var(--line);border-radius:12px;padding:9px 12px;background:transparent;color:inherit;font-weight:700;cursor:pointer}button:disabled{color:var(--disabled-ink);background:var(--disabled-bg);cursor:default}a{color:inherit}progress{width:100%}[role=alert]{color:var(--error-ink)}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid var(--focus);outline-offset:3px}
</style>
