<script lang="ts">
  import {onMount} from 'svelte';
  import {Download,Trash2,MapPin,X} from '@lucide/svelte';
  import {nativeVectorMaps,downloadBounds,type DownloadRequest,type VectorMapsClient,type VectorState,type MapBounds} from './vector/downloads';
  export let center:{latitude:number;longitude:number}|undefined=undefined;
  export let client:VectorMapsClient|undefined=nativeVectorMaps();
  export let onshowmap:((bounds?:MapBounds)=>void)|undefined=undefined;
  let state:VectorState|undefined,error='',pending=false,latitude=center?.latitude?.toFixed(6)??'',longitude=center?.longitude?.toFixed(6)??'',name='Offline area',radiusKm=5,terrain=true;
  let removing:string|undefined,removeDialog:HTMLDialogElement;
  $: valid=latitude.trim()!==''&&longitude.trim()!==''&&!!name.trim()&&name.trim().length<=64&&Number.isFinite(Number(latitude))&&Number.isFinite(Number(longitude))&&Math.abs(Number(latitude))<=80&&Math.abs(Number(longitude))<=180;
  $: active=!!state?.job?.active;
  function size(bytes:number){return`${(bytes/1048576).toFixed(1)} MiB`;}
  async function refresh(){if(client)state=await client.snapshot();}
  async function run(action:()=>Promise<VectorState>){if(pending)return;pending=true;error='';try{state=await action();}catch(e){error=e instanceof Error?e.message:'Offline map operation failed.';}finally{pending=false;}}
  async function download(request?:DownloadRequest){if(!client)return;const next=request??{latitude:Number(latitude),longitude:Number(longitude),radiusKm:Number(radiusKm),name,terrain};try{downloadBounds(next.latitude,next.longitude,next.radiusKm);}catch(e){error=(e as Error).message;return;}await run(()=>client!.download(next));}
  onMount(()=>{let stopped=false,polling=false;const poll=async()=>{if(!client||polling)return;polling=true;try{const next=await client.snapshot();if(!stopped)state=next;}catch(e){if(!stopped)error=e instanceof Error?e.message:'Offline map storage unavailable.';}finally{polling=false;}};void poll();const timer=setInterval(()=>void poll(),1000);return()=>{stopped=true;clearInterval(timer);};});
</script>

<section class="downloads" aria-label="Offline vector maps">
  <h2>Offline maps</h2>
  <p>Save roads, tracks and places with the same sharp detail as the map. Add terrain for hill shading and contours.</p>
  {#if !client}<p class="muted">Download offline areas in the Android app.</p>
  {:else}
    <form onsubmit={event=>{event.preventDefault();if(valid&&!active)void download();}}>
      <label>Area name<input maxlength="64" bind:value={name} disabled={pending||active}/></label>
      <div class="coordinates"><label>Latitude<input type="text" inputmode="decimal" bind:value={latitude} disabled={pending||active}/></label><label>Longitude<input type="text" inputmode="decimal" bind:value={longitude} disabled={pending||active}/></label></div>
      <p class="muted">Centred on the map you were viewing. To choose another area, return to the map and move it, or enter coordinates.</p>
      <label>Area size<select bind:value={radiusKm} disabled={pending||active}><option value={2}>4 × 4 km</option><option value={5}>10 × 10 km</option><option value={10}>20 × 20 km</option></select></label>
      <label class="terrain"><input type="checkbox" bind:checked={terrain} disabled={pending||active}/>Include terrain and contours</label>
      <p class="muted">Up to 256 MiB per area · Four saved areas. Downloads use internet and continue when you leave this screen. Android may interrupt a download; Retry starts it again.</p>
      <button class="primary" type="submit" disabled={!state?.ready||!valid||pending||active||(state?.regions.length??0)>=4}><Download size={18}/>{pending&&!active?'Starting…':'Download area'}</button>
    </form>
    {#if state?.job}{@const job=state.job}<div class="job" role="status"><strong>{job.name}</strong><p>{job.phase==='ready'?'Available offline':job.phase==='cancelling'?'Cancelling…':job.phase==='cancelled'?'Download cancelled':job.phase==='interrupted'?'Download interrupted':job.phase==='failed'?'Download failed':job.phase==='fonts'?'Saving map labels…':job.phase==='verifying'?'Finishing…':'Downloading…'} · {size(job.bytes)}</p>{#if job.active}<progress max={Math.max(1,job.total)} value={job.completed}></progress><p class="muted">{job.completed} / {job.total} files · Continues in the background</p><button class="outline" disabled={pending||job.phase==='cancelling'} onclick={()=>void run(()=>client!.cancel(job.id))}>Cancel download</button>{/if}{#if job.error}<p class="error">{job.error}</p>{/if}{#if !job.active&&['failed','interrupted','cancelled'].includes(job.phase)&&job.request}<button class="outline" disabled={pending} onclick={()=>void download(job.request)}>Retry download</button>{/if}</div>{/if}
    {#if error}<p role="alert" class="error">{error}</p>{/if}
    <h3>Saved areas</h3>
    {#each state?.regions??[] as region(region.id)}<article class="region"><div><strong>{region.name}</strong><small>{size(region.bytes)} · {region.terrain?'With terrain':'Roads and tracks'} · {region.dataDate.slice(0,10)}</small></div><div class="actions">{#if onshowmap}<button class="outline" onclick={()=>onshowmap?.(region.bounds)}><MapPin size={16}/>Show map</button>{/if}<button class="outline" aria-label={`Remove ${region.name}`} disabled={pending||active} onclick={()=>{removing=region.id;removeDialog.showModal();}}><Trash2 size={18}/></button></div></article>{:else}<p class="muted">No downloaded areas yet. The built-in Healesville–Toolangi map is always available.</p>{/each}
  {/if}
  <p class="muted">© OpenStreetMap contributors / Protomaps. Elevation: Mapterhorn and underlying sources. <a href="/maps/outdoor-preview/ATTRIBUTION.txt" target="_blank" rel="noreferrer">Sources and licences</a></p>
</section>
<dialog bind:this={removeDialog} aria-label="Remove offline area"><h3>Remove this offline area?</h3><p>You can download it again later. Group data and other maps stay unchanged.</p><div class="actions"><button class="outline" onclick={()=>removeDialog.close()}><X size={16}/>Keep area</button><button class="outline" onclick={()=>{const id=removing;removeDialog.close();if(id)void run(()=>client!.remove(id));}}>Remove area</button></div></dialog>
<style>
.downloads{color:var(--ink,#214c35)}h2{margin:0 0 10px;font-size:21px}h3{font-size:16px;margin:22px 0 10px}p{font-size:13px;line-height:1.6}label{display:grid;gap:7px;margin:14px 0;font-size:13px;font-weight:700}input:not([type=checkbox]),select{box-sizing:border-box;min-width:0;width:100%;min-height:44px;padding:10px;border:1px solid var(--line,#dfe1d5);border-radius:12px;background:var(--card,#fffdf6);color:inherit}.coordinates{display:grid;grid-template-columns:1fr 1fr;gap:12px}.terrain{display:flex;align-items:center;gap:10px}.terrain input{width:43px;height:26px;flex-shrink:0}.muted,small{font-size:12px;color:var(--muted,#73816e)}small{display:block;margin-top:6px;line-height:1.5}.primary,.outline{min-height:44px;padding:10px 12px;border:1px solid var(--line,#dfe1d5);border-radius:12px;display:inline-flex;align-items:center;justify-content:center;gap:7px;font-weight:700;cursor:pointer}.primary{background:#21583a;color:#fff}.outline{color:inherit;background:transparent}button:disabled{opacity:.5;cursor:default}.primary{width:100%}.job,.region{border-top:1px solid var(--line,#dfe1d5);margin-top:18px;padding-top:16px}.region{display:grid;gap:12px}.actions{display:flex;gap:8px;flex-wrap:wrap}.error{color:#a74431;overflow-wrap:anywhere}progress{width:100%;height:10px}dialog{max-width:400px;width:calc(100% - 32px);border:1px solid var(--line,#dfe1d5);border-radius:20px;padding:20px;background:var(--card,#fffdf6);color:var(--ink,#214c35)}dialog::backdrop{background:#10291e88}a{color:inherit}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #ad6b20;outline-offset:3px}
</style>
