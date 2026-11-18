<script lang="ts">
  import {Users,Search,ChevronRight,Mic,MapPin} from '@lucide/svelte';
  import type {GroupSnapshot} from '@aumanet/protocol';
  export let state:GroupSnapshot|undefined=undefined;
  export let sourceError='';
  export let onmember:(id:string)=>void;
  export let onmanage:()=>void;
  export let onnodes:()=>void=()=>{};
  export let nodeCount=0;
  let search='',connectedOnly=false;
  function clearFilters(){search='';connectedOnly=false;}
  $: live=!!state&&!sourceError&&['hosting','connected'].includes(state.status);
  $: roster=state?.group?state.members:[];
  $: connectedCount=live?roster.filter(member=>member.connected).length:0;
  $: visible=roster.filter(member=>(!connectedOnly||(live&&member.connected))&&member.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
    .slice().sort((a,b)=>Number(live&&b.connected)-Number(live&&a.connected)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
</script>

<div class="roster-summary"><small>{roster.length} / 5 members</small><button class="primary" onclick={onmanage}>{state?.group?'＋ Invite':'Create or join'}</button></div>
<div class="people-tabs"><button aria-current="page">People</button><button onclick={onnodes}>Nodes · {nodeCount}</button></div>
{#if sourceError}<p role="alert">{sourceError}</p>{/if}
{#if state?.group&&!live}<p class="hint" role="status">Group connection unavailable. Saved members are shown; live activity is unavailable.</p>{/if}
{#if roster.length}
  <div class="roster" aria-label="Group members">
    {#each visible as member(member.id)}
      {@const online=live&&member.connected}
      <button class="roster-member" onclick={()=>onmember(member.id)}>
        <span class="avatar" aria-hidden="true">{Array.from(member.name.trim())[0]?.toUpperCase()||'?'}</span>
        <span class="roster-text"><strong>{member.name}{member.id===state?.identity.id?' · You':''}</strong><span class="presence" class:online><i aria-hidden="true"></i>{member.id===state?.group?.ownerId?'Owner · ':''}{online?'Connected':live?'Away':'Status unavailable'}{online&&member.voiceJoined?' · On voice':''}</span>
        </span><ChevronRight size={18}/>
      </button>
    {:else}<div class="empty"><p role="status">No members match your filters.</p><button class="outline" onclick={clearFilters}>Clear filters</button></div>{/each}
  </div>
  <details class="roster-filters"><summary>Filter people</summary><label class="search"><Search size={19}/><input aria-label="Search group members" placeholder="Search members" bind:value={search}/></label>
  <label class="switch-row roster-filter"><span>Connected only</span><input type="checkbox" role="switch" bind:checked={connectedOnly}/></label></details>
{:else}<section class="card empty"><Users size={32}/><p>{!state?'Group membership is unavailable on this device.':state.group?'No members available yet.':'Create a group or join with a private invitation to see everyone here.'}</p></section>{/if}

<style>
.roster-summary{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.roster-filters{margin-top:16px}.roster{border:0;border-radius:14px;overflow:hidden;background:var(--card)}.roster-member{width:100%;display:flex;align-items:center;gap:12px;padding:14px;text-align:left;background:transparent;border:0;color:inherit;min-height:76px}.roster-member+.roster-member{border-top:1px solid var(--line)}.roster-member:focus-visible{outline-offset:-3px}.roster-text{flex:1;min-width:0;overflow-wrap:anywhere}.roster-text strong{display:block;font-size:0.9375rem;font-weight:600}.presence{display:flex;align-items:center;gap:6px;font-size:0.75rem;color:var(--muted);margin-top:3px}.presence i{width:6px;height:6px;background:currentColor;border-radius:50%}.presence.online i{background:var(--green)}.roster-member:nth-child(3n+2) .avatar{color:var(--rust-ink);background:var(--rust-bg)}.roster-member:nth-child(3n+3) .avatar{color:var(--blue-ink);background:var(--blue-bg)}
</style>
