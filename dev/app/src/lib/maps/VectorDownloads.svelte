<script lang="ts">
  import {onMount} from 'svelte';
  import {Trash2,MapPin,X} from '@lucide/svelte';
  import {nativeVectorMaps,type DownloadRequest,type VectorMapsClient,type VectorState,type MapBounds} from './vector/downloads';
  export let onchoose:((request?:DownloadRequest)=>void)|undefined=undefined;
  export let client:VectorMapsClient|undefined=nativeVectorMaps();
  export let onshowmap:((bounds?:MapBounds)=>void)|undefined=undefined;
  let state:VectorState|undefined,error='',pending=false;
  let removing:string|undefined,removeDialog:HTMLDialogElement;
  $: active=!!state?.job?.active;
  function size(bytes:number){return`${(bytes/1048576).toFixed(1)} MiB`;}
  function accept(next:VectorState){state=next;}
  async function run(action:()=>Promise<VectorState>){if(pending)return;pending=true;error='';try{accept(await action());}catch(e){error=e instanceof Error?e.message:'Offline map operation failed.';}finally{pending=false;}}
  onMount(()=>{let stopped=false,polling=false;const poll=async()=>{if(!client||polling)return;polling=true;try{const next=await client.snapshot();if(!stopped)accept(next);}catch(e){if(!stopped)error=e instanceof Error?e.message:'Offline map storage unavailable.';}finally{polling=false;}};void poll();const timer=setInterval(()=>void poll(),1000);return()=>{stopped=true;clearInterval(timer);};});
</script>

<section class="downloads" aria-label="Offline vector maps">
  <h2>Offline maps</h2>
  <p>Save roads, tracks and places with the same sharp detail as the map. Add terrain for hill shading and contours.</p>
  {#if !client}<p class="muted">Download offline areas in the Android app.</p>
  {:else}
    {#if onchoose}<button class="primary" disabled={!state?.ready||pending||active||(state?.regions.length??0)>=4} onclick={()=>onchoose?.()}><MapPin size={18}/>Choose area on map</button>{/if}
    <p class="muted">Drop a pin and choose how far to save around it. Downloads continue in the background.</p>
    {#if state?.job}{@const job=state.job}<div class="job" role="status"><strong>{job.name}</strong><p>{job.phase==='ready'?'Available offline':job.phase==='cancelling'?'Cancelling…':job.phase==='cancelled'?'Download cancelled':job.phase==='interrupted'?'Download interrupted':job.phase==='failed'?'Download failed':job.phase==='fonts'?'Saving map labels…':job.phase==='verifying'?'Finishing…':'Downloading…'} · {size(job.bytes)}</p>{#if job.active}<progress max={Math.max(1,job.total)} value={job.completed}></progress><p class="muted">{job.completed} / {job.total} files · Continues in the background</p><button class="outline" disabled={pending||job.phase==='cancelling'} onclick={()=>void run(()=>client!.cancel(job.id))}>Cancel download</button>{/if}{#if job.error}<p class="error">{job.error}</p>{/if}{#if !job.active&&['failed','interrupted','cancelled'].includes(job.phase)&&job.request}<button class="outline" disabled={pending} onclick={()=>onchoose?.(job.request)}>Retry download</button>{/if}</div>{/if}
    {#if error}<p role="alert" class="error">{error}</p>{/if}
    <h3>Saved areas</h3>
    {#each state?.regions??[] as region(region.id)}<article class="region"><div><strong>{region.name}</strong><small>{size(region.bytes)} · {region.terrain?'With terrain':'Roads and tracks'} · {region.dataDate.slice(0,10)}</small></div><div class="actions">{#if onshowmap}<button class="outline" onclick={()=>onshowmap?.(region.bounds)}><MapPin size={16}/>Show map</button>{/if}<button class="outline" aria-label={`Remove ${region.name}`} disabled={pending||active} onclick={()=>{removing=region.id;removeDialog.showModal();}}><Trash2 size={18}/></button></div></article>{:else}<p class="muted">No downloaded areas yet. The built-in Healesville–Toolangi map is always available.</p>{/each}
  {/if}
  <p class="muted">© OpenStreetMap contributors / Protomaps. Elevation: Mapterhorn and underlying sources. <a href="/maps/outdoor-preview/ATTRIBUTION.txt" target="_blank" rel="noreferrer">Sources and licences</a></p>
</section>
<dialog bind:this={removeDialog} aria-label="Remove offline area"><h3>Remove this offline area?</h3><p>You can download it again later. Group data and other maps stay unchanged.</p><div class="actions"><button class="outline" onclick={()=>removeDialog.close()}><X size={16}/>Keep area</button><button class="outline" onclick={()=>{const id=removing;removeDialog.close();if(id)void run(()=>client!.remove(id));}}>Remove area</button></div></dialog>
<style>
.downloads{color:var(--ink,#214c35)}h2{margin:0 0 10px;font-size:21px}h3{font-size:16px;margin:22px 0 10px}p{font-size:13px;line-height:1.6}.muted,small{font-size:12px;color:var(--muted,#73816e)}small{display:block;margin-top:6px;line-height:1.5}.primary,.outline{min-height:44px;padding:10px 12px;border:1px solid var(--line,#dfe1d5);border-radius:12px;display:inline-flex;align-items:center;justify-content:center;gap:7px;font-weight:700;cursor:pointer}.primary{background:#21583a;color:#fff}.outline{color:inherit;background:transparent}button:disabled{opacity:.5;cursor:default}.primary{width:100%}.job,.region{border-top:1px solid var(--line,#dfe1d5);margin-top:18px;padding-top:16px}.region{display:grid;gap:12px}.actions{display:flex;gap:8px;flex-wrap:wrap}.error{color:#a74431;overflow-wrap:anywhere}progress{width:100%;height:10px}dialog{max-width:400px;width:calc(100% - 32px);border:1px solid var(--line,#dfe1d5);border-radius:20px;padding:20px;background:var(--card,#fffdf6);color:var(--ink,#214c35)}dialog::backdrop{background:#10291e88}a{color:inherit}button:focus-visible{outline:3px solid #ad6b20;outline-offset:3px}
</style>
