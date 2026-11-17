<script lang="ts">
  import {MapPin,LocateFixed,Navigation,Plus,Minus,Users,Map,X} from '@lucide/svelte';
  import GeographicMap from './maps/GeographicMap.svelte';
  import MapConnectionsLegend from './maps/MapConnectionsLegend.svelte';
  import {formatAccuracy,formatDistance,straightLineDistance} from './appearance/distance';
  import type {Units} from './appearance/preferences';
  import type {Position,MapMember} from './maps/format';
  import type {GroupSnapshot} from '@aumanet/protocol';
  import {freshGroupPositions} from './maps/map-view';
  import {groupMapConnections} from './maps/connections';
  export let units:Units='Metric';
  export let managementOnly=false;
  export let onmanage:(()=>void)|undefined=undefined;
  export let onshowmap:(()=>void)|undefined=undefined;
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
  export let navigationToken=0;
  export let members:MapMember[]=[];
  let view:GeographicMap,positionsDialog:HTMLDialogElement,selected='',follow=false,basemapLabel='Vector map';
  $: if(!active)follow=false;
  $: {navigationToken;follow=false;}
  $: roster=members.filter(member=>member.authorized);
  $: current=selected==='self'?{id:'self',name:'You',fix,ageMs,connected:active}:roster.find(member=>member.id===selected);
  $: freshPositions=freshGroupPositions(fix,ageMs,active,roster);
  $: connections=groupMapConnections(group,fix,ageMs,active,groupElapsedMs,groupUnavailable);
  function age(value:number){if(!Number.isFinite(value))return'Age unavailable';if(value<1000)return'Just now';if(value<60000)return Math.floor(value/1000)+'s ago';return Math.floor(value/60000)+'m ago';}
  function positionState(connected:boolean,value:number){return connected&&Number.isFinite(value)&&value>=0&&value<=60000?'Current fix':'Last known · Stale';}
  function select(id:string){selected=id;if(id!=='self')follow=false;const position=id==='self'?fix:roster.find(member=>member.id===id)?.fix;if(position)view?.focusPosition(position);if(onmemberdetails){positionsDialog?.close();onmemberdetails(id);}}
</script>

{#if managementOnly}
<section class="position-card" aria-label="Map settings"><h2>Maps</h2><p>Roads, tracks and places use vector maps that stay sharp as you zoom.</p><p>Outdoor terrain is available offline around Healesville and Toolangi. Maps in other areas need an internet connection.</p>{#if onshowmap}<button class="map-outline" onclick={onshowmap}>Open map</button>{/if}</section>
{:else}
<section class="map-surface" aria-label="Map and group positions">
  <GeographicMap bind:this={view} {navigationToken} {fix} {ageMs} {active} members={roster} {connections} {selected} {follow} onbasemap={label=>basemapLabel=label} onfollowcancel={()=>follow=false} onselect={id=>{selected=id;onmemberdetails?.(id);}} onnameselect={onmembernamedetails} {nodeMemberIds}/>
  <div class="coverage-label" aria-label="Map availability"><Map size={16}/><span>{basemapLabel}</span></div>
  <div class="map-actions"><button aria-label="Zoom in" onclick={()=>view?.zoomIn()}><Plus size={20}/></button><button aria-label="Zoom out" onclick={()=>view?.zoomOut()}><Minus size={20}/></button><button aria-label="Recenter on my position" disabled={!fix} onclick={()=>fix&&view?.focusPosition(fix)}><LocateFixed size={20}/></button></div>
  <div class="map-tools">{#if onmemberdetails}<button aria-label="Follow my position" aria-pressed={follow} disabled={!fix||!active} onclick={()=>follow=!follow}><Navigation size={18}/></button>{/if}<button aria-label="Fit group positions" disabled={!freshPositions.length} onclick={()=>{follow=false;view?.fitMembers();}}><LocateFixed size={18}/>Show group</button><button aria-label="Open group positions" onclick={()=>positionsDialog.showModal()}><Users size={18}/>{roster.length+1}</button>{#if onmanage}<button onclick={onmanage}><Map size={18}/>Maps</button>{/if}</div>
</section>
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
<p class="map-attribution"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a> · <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> / <a href="https://openmaptiles.org" target="_blank" rel="noreferrer">OpenMapTiles</a> · <a href="/maps/outdoor-preview/ATTRIBUTION.txt" target="_blank" rel="noreferrer">Terrain sources and licences</a></p>
<style>
.map-surface{height:clamp(330px,62dvh,680px);position:relative;border:1px solid var(--line,#dfe1d5);border-radius:22px;overflow:hidden;isolation:isolate}.coverage-label{position:absolute;left:10px;right:58px;top:10px;display:flex;gap:6px;align-items:center;background:#fffdf2f2;color:#21583a;padding:8px 10px;border-radius:10px;font-size:12px;font-weight:700;z-index:500;pointer-events:none}.map-actions{position:absolute;right:10px;top:10px;z-index:500;display:grid;gap:7px}.map-actions button,.map-tools button{background:#fffdf4;color:#21583a;border:1px solid #dce0d1;border-radius:12px;min-width:40px;min-height:40px;display:flex;align-items:center;justify-content:center;gap:7px;padding:8px}.map-actions button:disabled,.map-tools button:disabled{opacity:.45}.map-tools{position:absolute;bottom:10px;right:10px;left:10px;display:flex;justify-content:flex-end;gap:8px;z-index:500}.map-tools button{font-weight:700}.map-people-dialog{max-width:480px;width:calc(100% - 24px);max-height:85dvh;overflow:auto;background:var(--card,#fffdf6);color:var(--ink,#173e2c);border:1px solid var(--line);border-radius:20px;padding:16px}.map-people-dialog::backdrop{background:#10291e99}.manager-heading{display:flex;justify-content:space-between;align-items:center;gap:12px}.manager-heading h2{font-size:21px}.position-card{background:var(--card,#fffdf6);border:1px solid var(--line,#dfe1d5);padding:16px;border-radius:20px;margin-top:14px;color:var(--ink,#214c35)}.map-people-dialog .position-card{border:0;padding:0}.position-card p{font-size:13px;line-height:1.6}.map-outline{border:1px solid #dfe1d5;border-radius:12px;color:inherit;background:transparent;min-height:40px;padding:9px 12px;display:inline-flex;align-items:center;justify-content:center;gap:8px;font-weight:700}.location-access{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:8px 2px;color:var(--muted,#73816e);font-size:12px}.location-access button{min-height:40px;background:transparent;color:inherit;border:0;text-decoration:underline}.member{width:100%;border:0;background:transparent;display:flex;align-items:center;gap:10px;text-align:left;color:inherit;padding:12px 0;border-bottom:1px solid #e3e5d9}.member>span:nth-child(2){flex:1}.member small,.muted{display:block;color:var(--muted,#73816e);margin-top:4px;font-size:12px}.member-avatar{border-radius:50%;background:#e2edcd;display:grid;place-items:center;width:36px;height:36px;font-weight:700}.member.selected .member-avatar{outline:2px solid #21583a}.member-detail{background:var(--surface,#f0f3e5);border-radius:12px;padding:12px;font-size:12px;overflow-wrap:anywhere}.peer-distance{display:block;margin-top:6px}.map-attribution{font-size:10px;line-height:1.6;color:var(--muted,#73816e);margin:12px 3px}.map-attribution a{color:inherit}button{cursor:pointer}button:disabled{cursor:default}button:focus-visible{outline:3px solid #ad6b20;outline-offset:3px}@media(max-width:360px){.map-surface{height:365px}.map-tools{gap:6px}.map-tools button{padding:7px}}@media(max-height:450px){.map-surface{height:calc(100dvh - 126px);min-height:180px}}
</style>
