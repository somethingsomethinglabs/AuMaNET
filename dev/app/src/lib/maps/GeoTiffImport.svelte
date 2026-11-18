<script lang="ts">
  import{onMount}from'svelte';
  import{Download}from'@lucide/svelte';
  import{geoTiffPreparation}from'./preparation/client';
  import type{GeoTiffSource,PreparationProgress,SourceAttribution}from'./preparation/types';
  import type{NativePreparationController}from'./preparation/native-controller.mjs';
  export let busy=false;
  export let disabled=false;
  export let onready:()=>Promise<void>=async()=>{};
  const native=geoTiffPreparation();
  let available=false,alive=true,source:GeoTiffSource|undefined,runner:NativePreparationController|undefined;
  let phase='idle',error='',title='',suggestedGetlost=false;
  let details:SourceAttribution={name:'',url:'',attribution:'',license:'',licenseUrl:'',dataDate:'Unknown'};
  let progress:PreparationProgress|undefined;
  let requestedCancel=false;
  function message(value:unknown){const text=value instanceof Error?value.message:String(value);return /acknowledgement|generation|bounded query read|failed to fetch|source is unavailable/i.test(text)?'The selected GeoTIFF could not be read or saved. Choose the file again and retry.':text;}
  async function choose(){
    if(disabled||busy)return;busy=true;error='';requestedCancel=false;progress=undefined;phase='choosing';
    try{
      const chosen=await native.plugin.chooseSource();
      if(!alive){await native.plugin.cancel();return;}
      if('cancelled'in chosen){busy=false;phase='idle';return;}
      source=chosen;title=chosen.fileName.replace(/\.tiff?$/i,'').replace(/_/g,' ').slice(0,120);
      const getlost=/_GetlostMap_V[\d\w]+\.tiff?$/i.test(chosen.fileName);
      suggestedGetlost=getlost;
      details=getlost?{name:'Getlost Maps',url:'https://www.getlost.com.au/current-map-information/',attribution:'Getlost Maps; OpenStreetMap contributors and Victorian Government/DELWP; source data modified by Getlost Maps.',license:'CC BY-NC-ND 4.0',licenseUrl:'https://creativecommons.org/licenses/by-nc-nd/4.0/',dataDate:'Unknown'}:{name:'',url:'',attribution:'',license:'',licenseUrl:'',dataDate:'Unknown'};
      phase='details';
    }catch(e){error=requestedCancel?'':message(e);phase=requestedCancel?'cancelled':'failed';busy=false;}
  }
  async function prepare(event:SubmitEvent){
    event.preventDefault();if(!source||phase!=='details')return;phase='preparing';error='';
    try{
      runner=native.controller();
      const slug=source.fileName.replace(/\.tiff?$/i,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,65)||source.sha256.slice(0,12);
      await runner.run(source,{id:`geotiff-${slug}`,title:title.trim(),source:{...details,dataDate:details.dataDate.trim()||'Unknown'}},value=>progress=value);
      source=undefined;phase='ready';await onready();
    }catch(e){if(!requestedCancel)await native.plugin.cancel().catch(()=>{});source=undefined;phase=requestedCancel?'cancelled':'failed';if(!requestedCancel)error=message(e);}
    finally{runner=undefined;if(!requestedCancel)busy=false;}
  }
  async function cancel(){
    requestedCancel=true;phase='cancelling';
    try{if(runner)await runner.cancel();else await native.plugin.cancel();source=undefined;phase='cancelled';error='';}
    catch(e){error=message(e);}
    finally{busy=false;runner=undefined;}
  }
  onMount(()=>{
    alive=true;let timer:ReturnType<typeof setTimeout>|undefined;
    async function probe(attempt=0){if(!native.installed())return;try{const state=await native.plugin.snapshot();if(!alive)return;available=state.available;if(!available&&attempt<10)timer=setTimeout(()=>void probe(attempt+1),200);}catch{available=false;}}
    void probe();return()=>{alive=false;if(timer)clearTimeout(timer);if(busy)void cancel();};
  });
</script>

{#if available}
  <button class="prepare-button" disabled={disabled||busy} onclick={()=>void choose()}><Download size={18}/>Prepare GeoTIFF</button>
  <p class="hint">Prepare a local GeoTIFF on this phone. The source can be up to 256 MiB; the offline map can use up to 512 MiB plus working space. Colours are preserved.</p>
  {#if phase==='choosing'}<div role="status"><p>Choose a GeoTIFF file. Copying the source may take a moment.</p><button class="prepare-button" onclick={()=>void cancel()}>Cancel preparation</button></div>{/if}
  {#if phase==='details'&&source}
    <form onsubmit={prepare} class="source-details">
      <h4>Map source and terms</h4>
      <p class="hint">{source.fileName} · {(source.bytes/1048576).toFixed(1)} MiB. {#if suggestedGetlost} Suggested Getlost details below come from the filename; the publisher identity has not been verified. Their published licence permits private, non-commercial preparation.{:else} Add the source details and attribution to keep them with the offline map.{/if}</p>
      <label>Map name<input required maxlength="120" bind:value={title}/></label>
      <label>Publisher or source<input required maxlength="120" bind:value={details.name}/></label>
      <label>Source information link<input required type="url" pattern="https://.*" maxlength="2000" placeholder="https://…" bind:value={details.url}/></label>
      <label>Attribution<textarea required maxlength="2000" rows="3" bind:value={details.attribution}></textarea></label>
      <label>Licence<input required maxlength="160" bind:value={details.license}/></label>
      <label>Licence link<input required type="url" pattern="https://.*" maxlength="2000" placeholder="https://…" bind:value={details.licenseUrl}/></label>
      <label>Original map date<input maxlength="80" bind:value={details.dataDate}/></label>
      <p class="hint">Leave the original map date as Unknown if it has not been verified. Preparation adds local tiles, resampling and overview levels; these changes and the original source checksum are retained with the map.</p>
      {#if details.url.startsWith('https://')}<p><a href={details.url} target="_blank" rel="noreferrer">Read source information</a>{#if details.licenseUrl.startsWith('https://')} · <a href={details.licenseUrl} target="_blank" rel="noreferrer">Read licence</a>{/if}</p>{/if}
      <div class="form-actions"><button class="prepare-button" type="submit">Prepare map</button><button class="prepare-button" type="button" onclick={()=>void cancel()}>Cancel</button></div>
    </form>
  {/if}
  {#if phase==='preparing'}<div role="status"><p>Preparing offline map{progress?.total?` · ${progress.completed??0} / ${progress.total} tiles`:'…'}</p>{#if progress?.total}<progress max={progress.total} value={progress.completed??0}></progress>{/if}<p class="hint">Keep AuMaNET open while the map is prepared. Previously installed maps remain available.</p><button class="prepare-button" onclick={()=>void cancel()}>Cancel preparation</button></div>{/if}
  {#if phase==='cancelling'}<p role="status">Cancelling preparation…</p>{/if}
  {#if phase==='cancelled'}<p role="status">Preparation cancelled. Previously installed maps are unchanged.</p>{/if}
  {#if phase==='ready'}<p role="status">Offline map prepared and selected.</p>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
{/if}

<style>
  .prepare-button{border:1px solid var(--line);border-radius:12px;color:var(--green);background:transparent;min-height:40px;padding:9px 12px;display:inline-flex;align-items:center;justify-content:center;gap:8px;font-weight:700;cursor:pointer;margin-top:8px}.prepare-button:disabled{color:var(--disabled-ink);background:var(--disabled-bg);cursor:default}.hint{font-size:0.75rem;line-height:1.6;color:var(--muted);overflow-wrap:anywhere}.source-details{border-top:1px solid var(--line);margin-top:16px;padding-top:8px}.source-details h4{font-size:0.875rem}.source-details label{display:grid;gap:6px;font-size:0.75rem;font-weight:600;margin:12px 0}.source-details input,textarea{box-sizing:border-box;width:100%;min-width:0;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--ink);padding:10px;font:inherit;font-weight:400}.form-actions{display:flex;gap:8px;flex-wrap:wrap}.error{color:var(--error-ink);background:var(--error-bg);padding:12px;border-radius:12px;overflow-wrap:anywhere;font-size:0.75rem}progress{width:100%}a{color:var(--green);font-size:0.75rem}button:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid var(--focus);outline-offset:3px}
</style>
