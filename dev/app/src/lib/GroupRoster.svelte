<script lang="ts">
  import {Users,Search,ChevronRight,Mic,MapPin} from '@lucide/svelte';
  import type {GroupSnapshot} from '@aumanet/protocol';
  export let state:GroupSnapshot|undefined=undefined;
  export let sourceError='';
  export let onmember:(id:string)=>void;
  export let onmanage:()=>void;
  let search='',connectedOnly=false;
  function clearFilters(){search='';connectedOnly=false;}
  $: live=!!state&&!sourceError&&['hosting','connected'].includes(state.status);
  $: roster=state?.group?state.members:[];
  $: connectedCount=live?roster.filter(member=>member.connected).length:0;
  $: visible=roster.filter(member=>(!connectedOnly||(live&&member.connected))&&member.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
    .slice().sort((a,b)=>Number(live&&b.connected)-Number(live&&a.connected)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
</script>

<div class="title-row"><div><p class="eyebrow">{state?.group?.name||'YOUR PEOPLE'}</p><h1>Group</h1></div><Users size={28}/></div>
<section class="card roster-summary"><div><strong>{roster.length} {roster.length===1?'member':'members'}</strong><p class="hint" role="status">{connectedCount} connected{roster.length?` · ${roster.length-connectedCount} disconnected`:''}</p></div><button class="outline" onclick={onmanage}>{state?.group?'Manage group':'Create or join'}</button></section>
{#if sourceError}<p role="alert">{sourceError}</p>{/if}
{#if state?.group&&!live}<p class="hint" role="status">Group connection unavailable. Saved members are shown; live activity is unavailable.</p>{/if}
{#if roster.length}
  <label class="search"><Search size={19}/><input aria-label="Search group members" placeholder="Search members" bind:value={search}/></label>
  <label class="switch-row roster-filter"><span>Connected only</span><input type="checkbox" role="switch" bind:checked={connectedOnly}/></label>
  <div class="roster" aria-label="Group members">
    {#each visible as member(member.id)}
      {@const online=live&&member.connected}
      <button class="roster-member" onclick={()=>onmember(member.id)}>
        <span class="avatar" aria-hidden="true">{Array.from(member.name.trim())[0]?.toUpperCase()||'?'}</span>
        <span class="roster-text"><strong>{member.name}{member.id===state?.identity.id?' · You':''}</strong><small>{member.id===state?.group?.ownerId?'Group owner':'Member'}</small><span class="presence" class:online><i aria-hidden="true"></i>{online?'Connected':live?'Disconnected':'Connection unavailable'}</span>
          {#if online}<span class="activity"><span><Mic size={13}/>{member.voiceJoined?'In voice':'Not in voice'}</span><span><MapPin size={13}/>{member.sharingLocation?'Sharing location':'Location off'}</span></span>{/if}
        </span><ChevronRight size={18}/>
      </button>
    {:else}<div class="empty"><p role="status">No members match your filters.</p><button class="outline" onclick={clearFilters}>Clear filters</button></div>{/each}
  </div>
{:else}<section class="card empty"><Users size={32}/><p>{!state?'Group membership is unavailable on this device.':state.group?'No members available yet.':'Create a group or join with a private invitation to see everyone here.'}</p></section>{/if}

<style>
  .roster-summary{display:flex;align-items:center;justify-content:space-between;gap:12px}.roster-summary p{margin:5px 0 0}.roster-filter{margin-bottom:16px}.roster{border:1px solid var(--line);border-radius:16px;overflow:hidden;background:var(--card)}.roster-member{width:100%;display:flex;align-items:center;gap:12px;padding:16px 12px;text-align:left;background:transparent;border:0;color:inherit;min-height:88px}.roster-member+.roster-member{border-top:1px solid var(--line)}.roster-member:focus-visible{outline:3px solid #ad6b20;outline-offset:-3px}.roster-text{flex:1;min-width:0;overflow-wrap:anywhere}.roster-text strong{display:block;font-size:15px}.roster-text small{display:block;font-size:11px;margin:4px 0;color:var(--muted)}.presence{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted)}.presence i{width:7px;height:7px;background:currentColor;border-radius:50%}.presence.online{color:#367b3e}.activity{display:flex;flex-wrap:wrap;gap:6px 12px;margin-top:9px;color:var(--muted);font-size:11px}.activity>span{display:flex;align-items:center;gap:4px}:global(.dark) .presence.online{color:#a5d88b}
</style>
