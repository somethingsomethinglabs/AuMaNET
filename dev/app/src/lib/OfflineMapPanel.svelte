<script lang="ts">
  import HelpButton from "./HelpButton.svelte";
  import {onMount,tick} from 'svelte';
  import {formatAccuracy,formatDistance,straightLineDistance} from './appearance/distance';
  import type {Units} from './appearance/preferences';
  export let units:Units='Metric';
  export let managementOnly=false;
  export let onmanage:(()=>void)|undefined=undefined;
  let positionsDialog:HTMLDialogElement;
  let showRaster=false,basemapLabel='Offline outdoor vectors';
  import {MapPin,LocateFixed,Navigation,Plus,Minus,Users,Map,Download,Trash2,X} from '@lucide/svelte';
  import GeographicMap from './maps/GeographicMap.svelte';
  import GeoTiffImport from './maps/GeoTiffImport.svelte';
  import GeoscienceDownload from './maps/GeoscienceDownload.svelte';
  import {offlineMapStore,type MapStore,type MapProgress} from './maps/store';
  import {mapContains,type InstalledMap,type Position,type MapMember} from './maps/format';
  import {freshGroupPositions} from './maps/map-view';
  import {readHiddenMaps,saveHiddenMaps} from './maps/view-preferences';
  import {visibleMapAttributions,type MapViewportCoverage} from './maps/composition';
  import type {GroupSnapshot} from '@aumanet/protocol';
  import {groupMapConnections} from './maps/connections';
  import MapConnectionsLegend from './maps/MapConnectionsLegend.svelte';
  export let group:GroupSnapshot|undefined=undefined;
  export let groupElapsedMs=0;
  export let groupUnavailable=false;
  export let fix:Position|undefined=undefined;
  export let ageMs=Infinity;
  export let active=false;
  export let locationStatus='Location is off';
  export let onprivacysettings:()=>void=()=>{};
  export let onmemberdetails:((id:string)=>void)|undefined=undefined;
  export let onmembernamedetails:((id:string)=>void)|undefined=undefined;
  export let nodeMemberIds:readonly string[]=[];
  export let onshowmap:((id:string)=>void)|undefined=undefined;
  export let navigationToken=0;
  export let focusRegionId='';
  export let store:MapStore=offlineMapStore();
  export let members:MapMember[]=[];
  let regions:InstalledMap[]=[],region:InstalledMap|undefined,selected='',error='',storageReady=false,busy=false,controller:AbortController|undefined;
  let progress:MapProgress={phase:'idle',completed:0,total:0,error:''};
  let preparing=false,downloading=false,managerOpen=false,hidden:string[]=[];
  let manager:HTMLElement,mapSurface:HTMLElement;
  let view:GeographicMap,input:HTMLInputElement,follow=false;
  let viewCoverage:MapViewportCoverage={coverageIds:[],renderedIds:[],zoom:4};
  $: if(focusRegionId)showRaster=focusRegionId!=='__bundled-outdoor';
  $: if(!active)follow=false;
  $: {navigationToken;follow=false;managerOpen=false;}
  $: roster=members.filter(m=>m.authorized);
  $: current=selected==='self'?{id:'self',name:'You',fix,ageMs,connected:active}:roster.find(m=>m.id===selected);
  $: outside=!!regions.length&&!!fix&&!regions.some(item=>mapContains(item.manifest,fix!.latitude,fix!.longitude));
  $: enabledRegions=regions.filter(item=>!hidden.includes(item.instanceId));
  $: displayRegion=enabledRegions.find(item=>item.instanceId===region?.instanceId)??enabledRegions[0];
  $: freshPositions=freshGroupPositions(fix,ageMs,active,roster);
  $: connections=groupMapConnections(group,fix,ageMs,active,groupElapsedMs,groupUnavailable);
  $: visibleRegions=regions.filter(item=>viewCoverage.renderedIds.includes(item.instanceId));
  $: attributions=visibleMapAttributions(regions,viewCoverage.renderedIds);
  $: coverageLabel=!storageReady?'Loading offline maps…':!regions.length?'No offline map installed':!enabledRegions.length?'Offline map layers hidden':!viewCoverage.coverageIds.length?'Outside installed map coverage':!visibleRegions.length?'Zoom in for offline map detail':visibleRegions.length===1?visibleRegions[0].manifest.title:`${visibleRegions.length} offline maps in view`;
  function age(value:number){if(!Number.isFinite(value))return'Age unavailable';if(value<1000)return'Just now';if(value<60000)return`${Math.floor(value/1000)}s ago`;return`${Math.floor(value/60000)}m ago`;}
  function positionState(connected:boolean,value:number){return connected&&Number.isFinite(value)&&value>=0&&value<=60000?'Current fix':'Last known · Stale';}
  async function refresh(){regions=await store.list();hidden=hidden.filter(id=>regions.some(item=>item.instanceId===id));saveVisibility();const id=await store.active();region=regions.find(r=>r.instanceId===id)??regions[0];if(region&&region.instanceId!==id)await store.select(region.instanceId);storageReady=true;}
  async function importMap(file?:File){if(busy)return;busy=true;error='';progress={phase:store.native?'choosing':'verifying',completed:0,total:0,error:''};controller=new AbortController();try{await store.import(file,p=>progress=p,controller.signal);await refresh();}catch(e){if(e instanceof DOMException&&e.name==='AbortError')progress={...progress,phase:'cancelled'};else error=e instanceof Error?e.message:String(e);}finally{busy=false;controller=undefined;if(input)input.value='';}}
  async function showBundled(){showRaster=false;follow=false;if(onshowmap){onshowmap('__bundled-outdoor');}else{managerOpen=false;await tick();view?.fitBundled();}}
  async function choose(id:string){showRaster=true;error='';try{await store.select(id);region=regions.find(r=>r.instanceId===id);hidden=hidden.filter(value=>value!==id);saveVisibility();follow=false;if(onshowmap){onshowmap(id);}else{managerOpen=false;await tick();view?.fitCoverage(region);mapSurface?.scrollIntoView({block:'start'});}}catch(e){error=e instanceof Error?e.message:String(e);}}
  async function remove(item:InstalledMap){if(!window.confirm(`Remove “${item.manifest.title}” from this device? This does not delete the original map file.`))return;error='';try{await store.remove(item.instanceId);await refresh();}catch(e){error=e instanceof Error?e.message:String(e);}}
  function saveVisibility(){try{saveHiddenMaps(window.localStorage,hidden);}catch{}}
  function visibility(id:string,visible:boolean){hidden=visible?hidden.filter(value=>value!==id):[...new Set([...hidden,id])];saveVisibility();}
  async function closeMaps(){managerOpen=false;await tick();mapSurface?.scrollIntoView({block:'start'});}
  async function openMaps(){if(onmanage){onmanage();return;}managerOpen=true;await tick();manager?.scrollIntoView({block:'start',behavior:'smooth'});}
  function select(id:string){selected=id;if(id!=='self')follow=false;const p=id==='self'?fix:roster.find(m=>m.id===id)?.fix;if(p)view?.focusPosition(p);if(onmemberdetails){positionsDialog?.close();onmemberdetails(id);}}
  onMount(()=>{
    try{hidden=readHiddenMaps(window.localStorage);if(!focusRegionId)showRaster=window.localStorage.getItem('aumanet.map.raster-overlay')==='true';}catch{}void refresh().catch(e=>error=e instanceof Error?e.message:String(e));
    let observed='',polling=false;
    const poll=async()=>{if(polling||!store.geoscienceStatus)return;polling=true;try{const job=await store.geoscienceStatus();downloading=!!job?.active;if(job&&!job.active&&job.operation.phase==='ready'&&observed!==job.id){observed=job.id;await refresh();}}catch{}finally{polling=false;}};
    void poll();const timer=setInterval(()=>void poll(),1000);return()=>{clearInterval(timer);controller?.abort();};
  });
</script>

{#if !managementOnly}
<section class="map-surface" bind:this={mapSurface} aria-label="Map and group positions">
  <GeographicMap bind:this={view} {showRaster} onbasemap={label=>basemapLabel=label} {store} region={displayRegion} installed={enabledRegions} {navigationToken} {focusRegionId} {storageReady} {fix} {ageMs} {active} members={roster} {connections} {selected} {follow} oncoverage={coverage=>viewCoverage=coverage} onfollowcancel={()=>follow=false} onselect={id=>{selected=id;if(onmemberdetails){positionsDialog?.close();onmemberdetails(id);}}} onnameselect={onmembernamedetails} {nodeMemberIds} onerror={message=>error=message}/>
  <div class="coverage-label" aria-label="Offline coverage status"><Map size={16}/><span>{showRaster?coverageLabel:basemapLabel}</span></div>
  <div class="map-actions"><button aria-label="Zoom in" onclick={()=>view?.zoomIn()}><Plus size={20}/></button><button aria-label="Zoom out" onclick={()=>view?.zoomOut()}><Minus size={20}/></button><button aria-label="Recenter on my position" disabled={!fix} onclick={()=>fix&&view?.focusPosition(fix)}><LocateFixed size={20}/></button></div>
  <div class="map-tools">{#if onmemberdetails}<button aria-label="Follow my position" title="Follow my position" aria-pressed={follow} disabled={!fix||!active} onclick={()=>follow=!follow}><Navigation size={18}/></button>{/if}<button aria-label="Fit group positions" disabled={!freshPositions.length} onclick={()=>{follow=false;view?.fitMembers();}}><LocateFixed size={18}/>Show group</button><button aria-label="Open group positions" onclick={()=>positionsDialog.showModal()}><Users size={18}/>{roster.length+1}</button><button aria-expanded={managerOpen} onclick={()=>void openMaps()}><Map size={18}/>Maps</button></div>
  
</section>
{#if outside&&showRaster}<p class="notice">Your position is outside installed map coverage. Import a map for your area, or view your coordinates below.</p>{/if}

<dialog bind:this={positionsDialog} class="map-people-dialog" aria-labelledby="map-people-title"><div class="manager-heading"><h2 id="map-people-title">Group positions</h2><button class="map-outline" aria-label="Close group positions" onclick={()=>positionsDialog.close()}><X size={20}/></button></div>
<div class="location-access"><span>{fix?positionState(active,ageMs):locationStatus==='idle'?'Location is off':locationStatus}</span><button onclick={()=>{positionsDialog.close();onprivacysettings();}}>Location settings</button></div>
<MapConnectionsLegend {connections}/>

<section class="position-card">
  <button class="member" class:selected={selected==='self'} onclick={()=>select('self')}><span class="member-avatar">Y</span><span><strong>You</strong><small>{fix?`${positionState(active,ageMs)} · ${age(ageMs)}`:'No location fix'}</small></span><MapPin size={18}/></button>
  {#each roster as member(member.id)}<button class="member" class:selected={selected===member.id} onclick={()=>select(member.id)}><span class="member-avatar">{member.name.slice(0,1).toUpperCase()}</span><span><strong>{member.name}</strong><small>{!member.fix?'Position unavailable':`${positionState(member.connected&&member.locationActive!==false,member.ageMs)} · ${age(member.ageMs)}`}</small></span><MapPin size={18}/></button>{/each}
  {#if !roster.length}<p class="muted">No verified peer positions are available yet.</p>{/if}
  {#if current&&!onmemberdetails}<div class="member-detail" aria-live="polite"><strong>{current.name}</strong>{#if current.fix}<p>{current.fix.latitude.toFixed(6)}, {current.fix.longitude.toFixed(6)}</p><small>Reported accuracy ±{formatAccuracy(current.fix.accuracy,units)} · {age(current.ageMs)}</small>{#if current.id==='self'}<button class="map-outline" aria-pressed={follow} disabled={!active} onclick={()=>follow=!follow}><Navigation size={16}/>Follow my position</button>{/if}{#if current.id!=='self'&&fix}<small class="peer-distance">Straight-line distance from you: {formatDistance(straightLineDistance(fix,current.fix),units)}{!active||ageMs>60000||!current.connected||current.ageMs>60000||('locationActive' in current&&current.locationActive===false)?' · Last-known positions':''}</small>{/if}{:else}<p>No shared position available.</p>{/if}</div>{/if}
</section>

</dialog>
{/if}
{#if error}<p class="map-error" role="alert">{error}</p>{/if}
{#if managementOnly||managerOpen}<section class="position-card maps-manager" bind:this={manager} aria-label="Offline maps"><div class="manager-heading"><h3><Map size={20}/>Offline maps <span>{regions.length} installed</span></h3>{#if !managementOnly}<button class="map-outline" onclick={()=>void closeMaps()}>Back to map</button>{/if}</div>
  
  <label class="layer-toggle"><input type="checkbox" bind:checked={showRaster} onchange={event=>{try{window.localStorage.setItem('aumanet.map.raster-overlay',String(event.currentTarget.checked));}catch{}}}/>Show downloaded raster maps over vectors</label>
  <p class="muted">Vector maps are the default. Healesville–Toolangi terrain is bundled offline; other areas use OpenFreeMap online. Download Geoscience maps for offline coverage elsewhere.</p>
  <button class="map-outline" onclick={()=>void showBundled()}>Show bundled outdoor area</button>
  <input class="file-input" bind:this={input} type="file" accept=".aumanet-map,application/octet-stream" aria-label="Offline map file" onchange={event=>void importMap(event.currentTarget.files?.[0])}/>
  <button class="map-outline" disabled={busy||preparing||downloading||!storageReady} onclick={()=>store.native?void importMap():input.click()}><Download size={18}/>Import offline map</button>
  <GeoTiffImport bind:busy={preparing} disabled={busy||downloading||!storageReady} onready={refresh}/>
  <GeoscienceDownload {store} {fix} bind:busy={preparing} disabled={busy||!storageReady} onready={refresh}/>
  <button class="map-outline" disabled={busy||preparing||downloading} onclick={()=>location.href='/maps/vector-preview/'}>Try outdoor vector preview</button>
  <p class="muted">Built-in offline sample of Healesville and Toolangi, with sharp roads, tracks, contours and hill shading.</p>
  <div class="help-row"><span>Map formats and storage</span><HelpButton title="Map formats and storage"><p class="muted">Import a prepared .aumanet-map file, up to 512 MiB per map. Prepare GeoTIFF converts a local source file. Visible regions join as you move; Show map fits a region and prioritizes it where maps overlap.</p></HelpButton></div>
  {#if busy}<div role="status"><p>{progress.phase==='choosing'?'Choose a map file…':`Checking and installing map${progress.total?` · ${progress.completed} / ${progress.total} tiles`: '…'}`}</p>{#if progress.total}<progress max={progress.total} value={progress.completed}></progress>{/if}<button class="cancel-import" onclick={()=>controller?.abort()}>Cancel import</button></div>{/if}
  {#if progress.phase==='cancelled'}<p role="status">Import cancelled. Previously installed maps are unchanged.</p>{/if}
  {#each regions as item(item.instanceId)}<article class="installed-region"><h4>{item.manifest.title}</h4><p class="muted">{item.manifest.source.dataDate} · {(item.bytes/1048576).toFixed(1)} MiB · Zoom {item.manifest.minZoom}–{item.manifest.maxZoom}</p><label class="layer-toggle"><input type="checkbox" checked={!hidden.includes(item.instanceId)} onchange={event=>visibility(item.instanceId,event.currentTarget.checked)}/>Show tiles on map</label><div class="region-actions"><button class="map-outline" onclick={()=>void choose(item.instanceId)}>Show map</button><button class="map-remove" aria-label={`Remove ${item.manifest.title}`} disabled={busy||preparing} onclick={()=>void remove(item)}><Trash2 size={18}/></button></div><div class="help-row"><span>Map source and licence</span><HelpButton title="Map source and licence"><p class="muted">{item.manifest.source.attribution}</p><p><a href={item.manifest.source.url} target="_blank" rel="noreferrer">{item.manifest.source.name}</a> · <a href={item.manifest.source.licenseUrl} target="_blank" rel="noreferrer">{item.manifest.source.license}</a></p><p class="muted">{item.manifest.source.changes}</p></HelpButton></div></article>{/each}
  {#if !store.native}<p class="muted">Browser storage may be cleared or evicted. Keep the original map files for reimporting.</p>{/if}
</section>{/if}
<p class="map-attribution">Vector maps: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a> · <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> / <a href="https://openmaptiles.org" target="_blank" rel="noreferrer">OpenMapTiles</a>. Offline terrain: Mapterhorn / Protomaps. <a href="/maps/outdoor-preview/ATTRIBUTION.txt" target="_blank" rel="noreferrer">Sources and licences</a></p>
{#if attributions.length}<div aria-label="Visible map sources">{#each attributions as attribution}<p class="map-attribution"><strong>{attribution.titles.join(' · ')}</strong><br/>{attribution.source.attribution} <a href={attribution.source.url} target="_blank" rel="noreferrer">Map source</a> · <a href={attribution.source.licenseUrl} target="_blank" rel="noreferrer">Licence</a> · Leaflet</p>{/each}</div>{/if}

<style>
  .map-people-dialog{max-width:480px;width:calc(100% - 24px);max-height:85dvh;overflow:auto;background:var(--card,#fffdf6);color:var(--ink,#173e2c);border:1px solid var(--line);border-radius:20px;padding:16px}.map-people-dialog::backdrop{background:#10291e99}.map-people-dialog .manager-heading{display:flex;justify-content:space-between;align-items:center;gap:12px}.map-people-dialog h2{font-size:21px}.map-people-dialog .position-card{border:0;padding:0}
  .map-surface{height:clamp(330px,62dvh,680px);min-height:0;position:relative;border:1px solid var(--line,#dfe1d5);border-radius:22px;overflow:hidden;isolation:isolate}.coverage-label{position:absolute;left:10px;right:58px;top:10px;display:flex;gap:6px;align-items:center;background:#fffdf2f2;color:#21583a;padding:8px 10px;border-radius:10px;font-size:12px;font-weight:700;z-index:500;pointer-events:none}.map-actions{position:absolute;right:10px;top:10px;z-index:500;display:grid;gap:7px}.map-actions button{background:#fffdf4;color:#21583a;border:1px solid #dce0d1;border-radius:12px;width:40px;height:40px;display:grid;place-items:center;box-shadow:0 2px 5px #0001}.map-actions button:disabled{opacity:.45}.position-card{background:var(--card,#fffdf6);border:1px solid var(--line,#dfe1d5);padding:16px;border-radius:20px;margin-top:14px;color:var(--ink,#214c35)}.position-card>div:first-child,.position-card h3{display:flex;align-items:center;gap:8px}.position-card h3{font-size:16px;margin:0}.muted{font-size:12px;line-height:1.6;color:var(--muted,#73816e)}.map-outline,.cancel-import{border:1px solid #dfe1d5;border-radius:12px;color:#21583a;background:transparent;min-height:40px;padding:9px 12px;display:inline-flex;align-items:center;justify-content:center;gap:8px;font-weight:700}.map-outline:disabled{opacity:.5}.member{width:100%;border:0;background:transparent;display:flex;align-items:center;gap:10px;text-align:left;color:inherit;padding:12px 0;border-bottom:1px solid #e3e5d9}.member:last-of-type{border-bottom:0}.member>span:nth-child(2){flex:1}.member small{display:block;color:#73816e;margin-top:4px;font-size:11px}.member-avatar{border-radius:50%;background:#e2edcd;display:grid;place-items:center;width:36px;height:36px;font-weight:700}.member.selected .member-avatar{outline:2px solid #21583a}.member-detail{display:block!important;background:#f0f3e5;border-radius:12px;padding:12px;font-size:12px;overflow-wrap:anywhere}.member-detail p{margin:6px 0}.peer-distance{display:block;margin-top:6px}.file-input{display:none}.installed-region{padding-top:16px;margin-top:14px;border-top:1px solid #e3e5d9}.installed-region h4{margin:0;font-size:14px}.region-actions{display:flex;gap:8px;margin:12px 0}.region-actions>button:first-child{flex:1}.map-remove{border:1px solid #dac5b4;color:#9a4938;background:transparent;border-radius:12px;width:44px;display:grid;place-items:center}.map-attribution{font-size:10px;line-height:1.6;color:#73816e;margin:12px 3px}.map-attribution a,.position-card a{color:#21583a}.map-error{color:#9a3926;background:#fff0e5;padding:12px;border-radius:12px;overflow-wrap:anywhere}.notice{font-size:12px;line-height:1.5;color:#75613c;background:#f4efdd;padding:12px;border-radius:12px}progress{width:100%;height:10px}button{cursor:pointer}button:disabled{cursor:default}button:focus-visible{outline:3px solid #ad6b20;outline-offset:3px}@media(max-width:360px){.position-card{padding:12px}.position-card h3{font-size:14px}.map-surface{height:365px}}@media(max-height:450px){.map-surface{height:calc(100dvh - 126px);min-height:180px}.map-actions{top:8px;right:8px;gap:4px}.map-actions button{width:36px;height:36px}.coverage-label{padding:6px 8px;max-width:70%;font-size:11px}}
.map-tools{position:absolute;bottom:10px;right:10px;left:10px;display:flex;justify-content:flex-end;gap:8px;z-index:500}.map-tools button{display:flex;align-items:center;gap:7px;min-height:40px;padding:8px 12px;border:1px solid #dce0d1;border-radius:12px;background:#fffdf4;color:#21583a;font-weight:700}.map-tools button:disabled{opacity:.55}.location-access{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:8px 2px;color:var(--muted,#73816e);font-size:12px}.location-access button{min-height:40px;background:transparent;color:var(--ink,#214c35);border:0;text-decoration:underline;font-weight:700}.manager-heading{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}.manager-heading h3{flex:1}.manager-heading h3 span{font-size:11px;font-weight:400;white-space:nowrap}.layer-toggle{display:flex;align-items:center;gap:8px;font-size:12px;min-height:40px}.layer-toggle input{width:43px;height:26px}.member-detail .map-outline{margin-top:10px;display:flex}</style>
