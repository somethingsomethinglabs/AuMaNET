<script lang="ts">
  import HelpButton from "./HelpButton.svelte";
  import {tick} from 'svelte';
  import {X,Smartphone,Router,MapPin,ChevronRight,ArrowLeft} from '@lucide/svelte';
  import NodeList from './NodeList.svelte';
  import type {GroupSnapshot,NodeUpdateNode} from '@aumanet/protocol';
  import {firmwareSummary} from './node-updates-view';
  import type {DeviceSelection,NetworkNode} from './network-topology';
  import type {Position} from './maps/format';
  import {validPosition} from './maps/map-view';
  import {formatAccuracy,formatDistance,straightLineDistance} from './appearance/distance';
  import type {Units} from './appearance/preferences';
  import RadioSignalDetails from './RadioSignalDetails.svelte';
  export let selection:DeviceSelection|undefined=undefined;
  export let group:GroupSnapshot|undefined=undefined;
  export let nodes:readonly NetworkNode[]=[];
  export let ownFix:Position|undefined=undefined;
  export let ownAgeMs=Infinity;
  export let ownActive=false;
  export let elapsedMs=0;
  export let groupUnavailable=false;
  export let units:Units='Metric';
  export let dark=false;
  export let onselect:(selection:DeviceSelection)=>void=()=>{};
  export let onclose:()=>void=()=>{};
  export let firmwareNodes:readonly NodeUpdateNode[]=[];
  export let onupdate:((nodeId:string)=>void)|undefined=undefined;
  let dialog:HTMLDialogElement,shown='';
  $: member=selection?.kind==='phone'?group?.members.find(value=>value.id===selection!.id)??(group?.identity.id===selection.id?{id:group.identity.id,name:group.identity.name,connected:false,voiceJoined:false,sharingLocation:false}:undefined):undefined;
  $: node=selection?.kind==='node'?nodes.find(value=>value.id===selection!.id):undefined;
  $: firmware=node?firmwareNodes.find(value=>value.nodeId===node.id):undefined;
  $: own=member?.id===group?.identity.id;
  $: position=own?ownFix:member?.fix;
  $: positionAge=own?ownAgeMs:(member?.fix?.ageMs??Infinity)+elapsedMs;
  $: connected=!groupUnavailable&&!!member?.connected&&['hosting','connected'].includes(group?.status??'');
  $: current=(own?ownActive:connected&&member?.sharingLocation)&&Number.isFinite(positionAge)&&positionAge>=0&&positionAge<=60000;
  $: attachedNodes=member?nodes.filter(value=>value.phones.some(phone=>phone.id===member!.id)):[];
  $: listing=selection?.kind==='nodes';
  $: available=!!selection&&(listing||!!member||!!node);
  $: if(dialog){if(available){if(!dialog.open)dialog.showModal();const key=selection!.kind+selection!.id;if(key!==shown){shown=key;dialog.scrollTop=0;void tick().then(()=>dialog.querySelector<HTMLButtonElement>('[data-detail-close]')?.focus());}}else{shown='';if(dialog.open)dialog.close();}}
  // HTML dialog close events are queued. A preceding selection may close the
  // dialog, then a keyboard action reopen it before the old event dispatches.
  // That event must not clear the newer selection.
  function closed(){if(!dialog.open)onclose();}
  function age(milliseconds:number){if(!Number.isFinite(milliseconds)||milliseconds<0)return'Age unavailable';if(milliseconds<1000)return'Just now';if(milliseconds<60000)return`${Math.floor(milliseconds/1000)} seconds ago`;return`${Math.floor(milliseconds/60000)} minutes ago`;}
</script>
<dialog class="device-details live-appearance-dialog" class:dark bind:this={dialog} aria-labelledby="device-details-title" onclose={closed} oncancel={onclose}>
  <header><div>{#if node}<button class="square" aria-label="Show node list" onclick={()=>onselect({kind:'nodes'})}><ArrowLeft size={20}/></button>{:else if member}<Smartphone size={29}/>{:else}<Router size={31}/>{/if}<h2 id="device-details-title">{listing?'Nodes in your group':member?(own?'You':member.name):node?.name??'Device details'}</h2></div><button class="square" data-detail-close aria-label="Close device details" onclick={onclose}><X size={22}/></button></header>
  {#if listing}<NodeList {nodes} {onselect}/>
  {:else if member}
    <p class="device-role">{group?.group?'Group phone':'Your phone'}{own?' · This device':''}{member.id===group?.group?.ownerId?' · Group owner':''}</p>
    <dl><div><dt>Connection</dt><dd>{connected?'Connected to group':'Not connected'}</dd></div><div><dt>Group</dt><dd>{group?.group?.name??'Unavailable'}</dd></div><div><dt>Voice</dt><dd>{connected&&member.voiceJoined?'In the voice channel':'Not in voice'}</dd></div></dl>
    <section><h3><Router size={18}/>Node</h3>{#if attachedNodes.length}{#each attachedNodes as item}<button class="detail-link" onclick={()=>onselect({kind:'node',id:item.id})}><span>{item.name}<small>Assigned in checked group settings</small></span><ChevronRight size={19}/></button>{/each}{:else}<p class="hint">No checked node association is available for this phone.</p>{/if}</section>
    <section><h3><MapPin size={18}/>Position</h3>{#if validPosition(position)}<p>{current?'Current position':'Last-known position'} · {age(positionAge)}</p><p class="coordinate">{position.latitude.toFixed(6)}, {position.longitude.toFixed(6)}</p><p class="hint">Reported accuracy ±{formatAccuracy(position.accuracy,units)}{!own&&!member.sharingLocation?' · Sharing is off':''}</p>{#if !own&&validPosition(ownFix)}<p class="hint">Straight-line distance from you: {formatDistance(straightLineDistance(ownFix,position),units)}{!current||!ownActive||ownAgeMs>60000?' · Last-known positions':''}</p>{/if}{:else}<p class="hint">No position available. Opening these details does not turn location on.</p>{/if}</section>
    <div class="help-row"><span>Phone identity</span><HelpButton title="Phone identity"><p class="hint">Use this when comparing a membership request.</p><output>{member.id}</output></HelpButton></div>
  {:else if node}
    <p class="device-role">{node.yours?'Your radio node':'Group radio node'} · Identified by a checked report</p>
    <section><h3>Firmware</h3><p>{firmwareSummary(firmware)}</p>{#if firmware?.identityStatus==='unsupported'}<p class="hint">USB setup is required before this firmware supports wireless updates.</p>{/if}{#if onupdate}<button class="outline" onclick={()=>node&&onupdate?.(node.id)}>Firmware updates</button>{/if}</section>
    <section><h3>Phones assigned to this node</h3>{#each node.phones as phone}<button class="detail-link" onclick={()=>onselect({kind:'phone',id:phone.id})}><span>{phone.name}<small>{phone.connected?'Connected to group':'Not connected to group'}</small></span><ChevronRight size={19}/></button>{:else}<p class="hint">The attached phone is not identified by the available report.</p>{/each}<p class="hint">Assignments come from checked group settings. Remote Wi-Fi attachment and node battery are not reported here.</p></section>
    <section><h3>Radio connection</h3><p class="hint">{node.linkLabel}. {node.receivingLabel}.</p>{#if node.signal}<RadioSignalDetails signals={[node.signal]} {elapsedMs}/>{:else}<p class="hint">No measurement is available for this direction.</p>{/if}</section>
    <div class="help-row"><span>Node identity</span><HelpButton title="Node identity"><output>{node.id}</output></HelpButton></div>
  {/if}
</dialog>
<style>
  .device-details{max-width:500px;width:calc(100% - 28px);max-height:88dvh;overflow:auto;border:1px solid var(--line);border-radius:22px;padding:20px;color:var(--ink);background:var(--card)}.device-details::backdrop{background:#10291e88;backdrop-filter:blur(3px)}header{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:0!important;background:transparent!important}header>div{display:flex;align-items:center;gap:10px;min-width:0}header h2{font-size:21px;overflow-wrap:anywhere;margin:0}header button{flex-shrink:0;min-width:44px;min-height:44px}.device-role{font-size:12px;line-height:1.6;color:var(--muted);margin:8px 0 18px}dl{margin:0}dl>div{display:flex;justify-content:space-between;gap:18px;padding:11px 0;border-bottom:1px solid var(--line);font-size:13px}dt{color:var(--muted)}dd{margin:0;text-align:right;overflow-wrap:anywhere}section{margin-top:20px}h3{font-size:15px;margin:0 0 10px;display:flex;align-items:center;gap:7px}.detail-link{display:flex;align-items:center;gap:10px;justify-content:space-between;width:100%;min-height:50px;border:0;border-bottom:1px solid var(--line);background:transparent;text-align:left;color:inherit;padding:10px 0}.detail-link>span{min-width:0;overflow-wrap:anywhere;font-size:14px;font-weight:650}.detail-link small{display:block;margin-top:4px;font-size:12px;font-weight:400;color:var(--muted)}.hint{font-size:12px;line-height:1.6;color:var(--muted)}.coordinate{font-variant-numeric:tabular-nums;overflow-wrap:anywhere;font-size:14px}button:focus-visible{outline:3px solid #ad6b20;outline-offset:3px}@media(max-width:350px){.device-details{padding:15px}dl>div{flex-wrap:wrap;gap:6px}dd{text-align:left}}
</style>
