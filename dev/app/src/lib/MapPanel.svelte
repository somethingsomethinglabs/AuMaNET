<script lang="ts">
  import BrandIcon from './BrandIcon.svelte';
  import {MapPin,LocateFixed,Navigation,Plus,Minus,Users,Map,X,Download} from '@lucide/svelte';
  import {onMount,tick} from 'svelte';
  import OfflineAreaPicker from './maps/OfflineAreaPicker.svelte';
  import {nativeVectorMaps,downloadBounds,type DownloadRequest,type VectorState,type VectorMapsClient} from './maps/vector/downloads';
  export let mapClient:VectorMapsClient|undefined=nativeVectorMaps();
  export let downloadIntent:{token:number;request?:DownloadRequest}|undefined=undefined;
  export let onchoosearea:((request?:DownloadRequest)=>void)|undefined=undefined;
  let selection:{latitude:number;longitude:number;radiusKm:number}|undefined,selectionInitial:DownloadRequest|undefined,pickerBusy=false,pickerSheet:HTMLDivElement,handledIntent=-1,downloadState:VectorState|undefined,feedback='';
  async function fitArea(){if(!selection)return;try{await tick();view?.fitDownloadArea(downloadBounds(selection.latitude,selection.longitude,selection.radiusKm),pickerSheet?.getBoundingClientRect().height??260);}catch{}}
  async function chooseArea(request?:DownloadRequest){follow=false;selectionInitial=request;const point=request??view?.center()??downloadCenter??fix??{latitude:-25,longitude:135};selection={latitude:point.latitude,longitude:point.longitude,radiusKm:request?.radiusKm??5};await fitArea();}
  $: if(downloadIntent&&view&&handledIntent!==downloadIntent.token){handledIntent=downloadIntent.token;void chooseArea(downloadIntent.request);}
  onMount(()=>{if(managementOnly)return;let stopped=false,loading=false;const client=mapClient;const poll=async()=>{if(!client||loading)return;loading=true;try{const next=await client.snapshot();if(!stopped)downloadState=next;}catch{}finally{loading=false;}};void poll();const timer=setInterval(()=>void poll(),1000);return()=>{stopped=true;clearInterval(timer);};});
  import VectorDownloads from './maps/VectorDownloads.svelte';
  import type {MapBounds} from './maps/vector/downloads';
  export let downloadCenter:{latitude:number;longitude:number}|undefined=undefined;
  export let focusBounds:MapBounds|undefined=undefined;
  import GeographicMap from './maps/GeographicMap.svelte';
  import MapConnectionsLegend from './maps/MapConnectionsLegend.svelte';
  import {formatAccuracy,formatDistance,straightLineDistance} from './appearance/distance';
  import type {Units} from './appearance/preferences';
  import type {Position,MapMember} from './maps/format';
  import type {GroupSnapshot} from '@aumanet/protocol';
  import {freshGroupPositions,mapLocationContext} from './maps/map-view';
  import {groupMapConnections} from './maps/connections';
  export let units:Units='Metric';
  export let managementOnly=false;
  export let onmanage:((center?:{latitude:number;longitude:number})=>void)|undefined=undefined;
  export let onshowmap:((bounds?:MapBounds)=>void)|undefined=undefined;
  export let group:GroupSnapshot|undefined=undefined;
  export let groupElapsedMs=0;
  export let groupUnavailable=false;
  export let fix:Position|undefined=undefined;
  export let ageMs=Infinity;
  export let active=false;
  export let sharing=false;
  export let locationStatus='Location is off';
  export let onprivacysettings:()=>void=()=>{};
  export let onmemberdetails:((id:string)=>void)|undefined=undefined;
  export let onmembernamedetails:((id:string)=>void)|undefined=undefined;
  export let nodeMemberIds:readonly string[]=[];
  export let navigationToken=0;
  export let members:MapMember[]=[];
  let coordinateDialog:HTMLDialogElement,latitude=0,longitude=0,coordinateError='';
  function coordinates(){const point=view?.center();latitude=point?.latitude??0;longitude=point?.longitude??0;coordinateError='';coordinateDialog.showModal();}
  function inspect(){if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>85||Math.abs(longitude)>180){coordinateError='Enter latitude between −85 and 85 and longitude between −180 and 180.';return;}follow=false;view?.focusPosition({latitude,longitude,accuracy:0,timestamp:Date.now()});coordinateDialog.close();}
  let view:GeographicMap,positionsDialog:HTMLDialogElement,selected='',follow=false,basemapLabel='Vector map';
  $: if(!active)follow=false;
  $: {navigationToken;follow=false;}
  $: roster=members.filter(member=>member.authorized);
  $: current=selected==='self'?{id:'self',name:'You',fix,ageMs,connected:active}:roster.find(member=>member.id===selected);
  $: freshPositions=freshGroupPositions(fix,ageMs,active,roster);
  $: locationContext=mapLocationContext(fix,ageMs,active,locationStatus,follow);
  $: connections=groupMapConnections(group,fix,ageMs,active,groupElapsedMs,groupUnavailable);
  function age(value:number){if(!Number.isFinite(value))return'Age unavailable';if(value<1000)return'Just now';if(value<60000)return Math.floor(value/1000)+'s ago';return Math.floor(value/60000)+'m ago';}
  function positionState(connected:boolean,value:number){return connected&&Number.isFinite(value)&&value>=0&&value<=60000?'Current fix':'Last known · Stale';}
  function select(id:string){selected=id;if(id!=='self')follow=false;const position=id==='self'?fix:roster.find(member=>member.id===id)?.fix;if(position)view?.focusPosition(position);if(onmemberdetails){positionsDialog?.close();onmemberdetails(id);}}
</script>

{#if managementOnly}
<section class="position-card" aria-label="Map settings"><VectorDownloads client={mapClient} {onshowmap} onchoose={onchoosearea}/>{#if onshowmap}<button class="map-outline" onclick={()=>onshowmap?.()}>Open map</button>{/if}</section>
{:else}
<section class="map-surface" aria-label="Map and group positions">
  <GeographicMap bind:this={view} areaSelection={selection} areaLocked={pickerBusy} onareapin={point=>{if(selection)selection={...selection,...point};}} onofflinepick={point=>void chooseArea({...point,radiusKm:5,name:'Weekend area',terrain:true})} {focusBounds} {navigationToken} {fix} {ageMs} {active} members={roster} {connections} {selected} {follow} onbasemap={label=>basemapLabel=label} onfollowcancel={()=>follow=false} onselect={id=>{selected=id;onmemberdetails?.(id);}} onnameselect={onmembernamedetails} {nodeMemberIds}/>
  <div class="map-top-tools"><button onclick={coordinates}><BrandIcon name="target"/><span>Coordinates</span><BrandIcon name="down" size={14}/></button><button onclick={()=>onmanage?.(view?.center())}><BrandIcon name="download"/><span>Offline maps</span></button></div>
  <div class="coverage-label" aria-label="Map availability"><span>{basemapLabel}</span><small>{locationContext}</small></div>
  <div class="map-actions"><button aria-label="Zoom in" onclick={()=>view?.zoomIn()}><BrandIcon name="plus"/></button><button aria-label="Zoom out" onclick={()=>view?.zoomOut()}><BrandIcon name="minus"/></button><button aria-label="Fit group positions" disabled={!freshPositions.length} onclick={()=>{follow=false;view?.fitMembers();}}><BrandIcon name="people"/></button><button aria-label={follow?'Stop following my position':'Follow my position'} aria-pressed={follow} disabled={!fix||!active} onclick={()=>{if(fix&&!follow)view?.focusPosition(fix);follow=!follow;}}><BrandIcon name="location"/></button><button aria-label="Recenter on my position" disabled={!fix} onclick={()=>{if(fix){view?.focusPosition(fix);}}}><BrandIcon name="target"/></button></div>
  {#if !selection}<div class="map-tools"><button onclick={onprivacysettings}><BrandIcon name="location" size={16}/><span>{sharing?'Sharing location':active?'Private location':fix?'Last known':'Location off'}</span></button><button aria-label="Open group positions" onclick={()=>positionsDialog.showModal()}><BrandIcon name="people" size={16}/>{roster.filter(member=>!!member.fix).length+(fix?1:0)} locations</button>{#if follow}<button aria-pressed="true" onclick={()=>follow=false}>Following · Stop</button>{/if}<button class="offline-select" aria-label="Choose area to download offline" onclick={()=>void chooseArea()}><BrandIcon name="download" size={16}/></button></div>{/if}
  {#if selection}<div class="offline-sheet" bind:this={pickerSheet}><OfflineAreaPicker client={mapClient} {selection} initial={selectionInitial} onradius={value=>{if(selection){selection={...selection,radiusKm:value};void fitArea();}}} oncentre={()=>{const point=view?.center();if(selection&&point)selection={...selection,...point};}} onfit={()=>void fitArea()} onclose={()=>selection=undefined} onbusy={busy=>pickerBusy=busy} onstarted={(request,state)=>{downloadState=state;selection=undefined;feedback='Download started for '+request.name;void tick().then(()=>view?.fitDownloadArea(downloadBounds(request.latitude,request.longitude,request.radiusKm),0));}}/></div>{:else if downloadState?.job?.active}<button class="download-chip" onclick={()=>onmanage?.(view?.center())}>Saving {downloadState.job.name} · {downloadState.job.completed}/{downloadState.job.total}</button>{:else if feedback}<div class="download-feedback" role="status">{downloadState?.job?.phase==='ready'?'Area is ready offline':['failed','cancelled','interrupted'].includes(downloadState?.job?.phase??'')?'Download '+downloadState?.job?.phase+' · Open Maps for details':feedback}<button aria-label="Dismiss download message" onclick={()=>feedback=''}><X size={15}/></button></div>{/if}
</section>
<dialog bind:this={coordinateDialog} aria-labelledby="coordinates-title"><h2 id="coordinates-title">Inspect coordinates</h2><p class="hint">A temporary point. Nothing is saved or shared.</p><form onsubmit={event=>{event.preventDefault();inspect();}}><label class="field">Latitude<input type="number" step="any" bind:value={latitude}/></label><label class="field">Longitude<input type="number" step="any" bind:value={longitude}/></label>{#if coordinateError}<p role="alert">{coordinateError}</p>{/if}<button class="primary" type="submit">Inspect point</button></form></dialog>
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
{#if !managementOnly}<p class="map-attribution"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a> · <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> / <a href="https://openmaptiles.org" target="_blank" rel="noreferrer">OpenMapTiles</a> · <a href="/maps/outdoor-preview/ATTRIBUTION.txt" target="_blank" rel="noreferrer">Terrain sources and licences</a></p>{/if}
<style>
.map-surface{position:relative;flex:1;min-height:0;height:100%;overflow:hidden;isolation:isolate}.map-top-tools{position:absolute;left:12px;right:12px;top:12px;display:flex;justify-content:space-between;gap:8px;z-index:500}.map-top-tools button,.map-actions button,.map-tools button{min-height:48px;min-width:48px;display:flex;align-items:center;justify-content:center;gap:8px;padding:10px 12px;background:var(--raised);color:var(--ink);border:1px solid var(--control-line);border-radius:12px;font-size:0.75rem}.map-top-tools{pointer-events:none}.map-top-tools button{pointer-events:auto;box-shadow:0 2px 14px #0000000a}.coverage-label small{display:block;font-size:.6875rem}.coverage-label{position:absolute;left:14px;top:68px;z-index:500;background:var(--raised);color:var(--muted);padding:3px 6px;font-size:0.6875rem;max-width:calc(100% - 28px);pointer-events:none}.map-actions{position:absolute;right:12px;bottom:76px;z-index:500;display:grid;gap:6px}.map-actions button{padding:10px;border-radius:50%;width:48px}.map-tools{position:absolute;left:12px;bottom:28px;right:12px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;z-index:500}.map-tools button{font-size:0.6875rem;padding:8px}.map-tools .offline-select{margin-left:auto}.map-tools button[aria-pressed=true]{background:var(--green);color:var(--on-action)}.map-attribution{margin:0;position:absolute;bottom:0;left:0;right:0;background:var(--raised);color:var(--muted);z-index:510;font-size:0.6875rem;line-height:1.4;padding:2px 8px}.map-attribution a{color:inherit}.offline-sheet{position:absolute;left:0;right:0;bottom:24px;z-index:550;max-width:600px;margin:0 auto;max-height:75%;overflow:auto;background:var(--raised);border-radius:24px 24px 0 0}.download-chip,.download-feedback{position:absolute;left:12px;bottom:84px;z-index:510;background:var(--raised);color:var(--ink);border:1px solid var(--control-line);border-radius:12px;padding:10px;font-size:0.75rem;max-width:calc(100% - 80px);min-height:48px}.download-feedback{display:flex;align-items:center;gap:8px}.download-feedback button{min-height:48px;min-width:48px;background:transparent;border:0;color:inherit}.position-card{border:0;padding:0;background:transparent}.manager-heading{display:flex;justify-content:space-between;align-items:center;gap:12px}.manager-heading h2{margin:0}.location-access{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:0.75rem;margin:12px 0}.location-access button{min-height:48px;background:transparent;color:var(--green);border:0}.member{width:100%;min-height:76px;border:0;border-bottom:1px solid var(--line);background:transparent;display:flex;align-items:center;gap:12px;text-align:left;padding:12px 0;color:inherit}.member>span:nth-child(2){flex:1;min-width:0}.member small{display:block;color:var(--muted);font-size:0.75rem}.member-avatar{display:grid;place-items:center;background:var(--sage);color:var(--accent);width:44px;height:44px;border-radius:50%;flex:none}.member-detail{font-size:0.75rem;padding:12px;background:var(--sage);border-radius:12px;overflow-wrap:anywhere}.peer-distance{display:block;margin-top:6px}.muted{color:var(--muted)}.map-top-tools button:disabled,.map-actions button:disabled{color:var(--disabled-ink);background:var(--disabled-bg)}
@media(min-width:600px) and (max-height:500px){.map-actions{display:flex;bottom:28px}.map-top-tools{right:16px}.coverage-label{top:64px}.offline-sheet{max-height:70%}}
</style>
