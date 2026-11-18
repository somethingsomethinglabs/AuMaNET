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

  {#if !client}<p class="muted">Download offline areas in the Android app.</p>
  {:else}
    <div class="download-head"><small>{state?.regions.length??0} / 4 areas</small>{#if onchoose}<button class="primary" aria-label="Choose area on map" disabled={!state?.ready||pending||active||(state?.regions.length??0)>=4} onclick={()=>onchoose?.()}><MapPin size={18}/><span>Add area</span></button>{/if}</div>

    {#if !state&&!error}<p class="muted" role="status">Checking offline map storage…</p>{:else if state&&!state.ready}<p class="muted" role="status">Offline map storage is not ready. Keep Maps open while it becomes available.</p>{:else if (state?.regions.length??0)>=4}<p class="muted">Four areas are saved. Remove an area below before choosing another.</p>{/if}
    {#if state?.job}{@const job=state.job}<div class="job" role="status"><strong>{job.name}</strong><p>{job.phase==='ready'?'Available offline':job.phase==='cancelling'?'Cancelling…':job.phase==='cancelled'?'Download cancelled':job.phase==='interrupted'?'Download interrupted':job.phase==='failed'?'Download failed':job.phase==='fonts'?'Saving map labels…':job.phase==='verifying'?'Finishing…':'Downloading…'} · {size(job.bytes)}</p>{#if job.active}<progress max={Math.max(1,job.total)} value={job.completed}></progress><p class="muted">{job.completed} / {job.total} files · Continues in the background</p><button class="outline" disabled={pending||job.phase==='cancelling'} onclick={()=>void run(()=>client!.cancel(job.id))}>Cancel download</button>{/if}{#if job.error}<p class="error">{job.error}</p>{/if}{#if !job.active&&['failed','interrupted','cancelled'].includes(job.phase)&&job.request}<button class="outline" disabled={pending} onclick={()=>onchoose?.(job.request)}>Retry download</button>{/if}</div>{/if}
    {#if error}<p role="alert" class="error">{error}</p>{/if}
    {#if state}
    {#each state.regions as region(region.id)}<article class="region"><div><strong>{region.name}</strong><small>{size(region.bytes)} · {region.terrain?'With terrain':'Roads and tracks'} · {region.dataDate.slice(0,10)}</small></div><details><summary>Area details</summary><p class="muted">Bounds: {region.bounds.join(', ')} · Installed {new Date(region.installedAt).toLocaleDateString()}</p></details><div class="actions">{#if onshowmap}<button class="outline" onclick={()=>onshowmap?.(region.bounds)}><MapPin size={16}/>Show map</button>{/if}<button class="outline" aria-label={`Remove ${region.name}`} disabled={pending||active} onclick={()=>{removing=region.id;removeDialog.showModal();}}><Trash2 size={18}/></button></div></article>{:else}<p class="muted">No downloaded areas yet. The built-in Healesville–Toolangi map is always available.</p>{/each}{/if}
  {/if}
  <p class="muted">© OpenStreetMap contributors / Protomaps. Elevation: Mapterhorn and underlying sources. <a href="/maps/outdoor-preview/ATTRIBUTION.txt" target="_blank" rel="noreferrer">Sources and licences</a></p>
</section>
<dialog bind:this={removeDialog} aria-label="Remove offline area"><h3>Remove this offline area?</h3><p>You can download it again later. Group data and other maps stay unchanged.</p><div class="actions"><button class="outline" onclick={()=>removeDialog.close()}><X size={16}/>Keep area</button><button class="outline" onclick={()=>{const id=removing;removeDialog.close();if(id)void run(()=>client!.remove(id));}}>Remove area</button></div></dialog>
<style>.download-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}.download-head .primary{width:auto}.region{border:1px solid var(--line)!important;border-radius:16px;padding:16px!important;background:var(--card);margin-bottom:14px}.region>div>strong{font-size:1.0625rem;font-weight:600}.region details{margin-top:0}.region details p{font-size:.75rem}

.downloads{color:var(--ink)}h3{font-size:1rem;margin:22px 0 10px}p{font-size:0.8125rem;line-height:1.6}.muted,small{font-size:0.75rem;color:var(--muted)}small{display:block;margin-top:6px;line-height:1.5}.primary,.outline{min-height:44px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;display:inline-flex;align-items:center;justify-content:center;gap:7px;font-weight:700;cursor:pointer}.primary{background:var(--green);color:var(--on-action)}.outline{color:inherit;background:transparent}button:disabled{color:var(--disabled-ink);background:var(--disabled-bg);cursor:default}.primary{width:100%}.job,.region{border-top:1px solid var(--line);margin-top:18px;padding-top:16px}.region{display:grid;gap:12px}.actions{display:flex;gap:8px;flex-wrap:wrap}.error{color:var(--error-ink);overflow-wrap:anywhere}progress{width:100%;height:10px}dialog{max-width:400px;width:calc(100% - 32px);border:1px solid var(--line);border-radius:20px;padding:20px;background:var(--card);color:var(--ink)}dialog::backdrop{background:var(--scrim)}a{color:inherit}button:focus-visible{outline:3px solid var(--focus);outline-offset:3px}
</style>
