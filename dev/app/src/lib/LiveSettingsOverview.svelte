<script lang="ts">
  import {Search,ChevronRight,Router,Users,AudioLines,Globe,Map,MapPin,Bell,Palette,Info} from '@lucide/svelte';
  export let profileName='';
  export let groupName='';
  export let onopen:(category:string)=>void;
  export let ondeveloper:()=>void;
  export let onprofile:()=>void=()=>onopen('Group & members');
  let search='';
  const categories=[
    {name:'Tools & checks',description:'Test connection, bandwidth planning, radio, voice and device diagnostics',icon:Router},
    {name:'Nodes',description:'Your node, connection and observed status',icon:Router},
    {name:'Group & members',description:'Your name, invitations, roles and membership',icon:Users},
    {name:'Voice & audio',description:'Input mode, detection and audio output',icon:AudioLines},
    {name:'Internet sharing',description:'Shared internet availability and support',icon:Globe},
    {name:'Maps & storage',description:'Offline regions, import and local history',icon:Map},
    {name:'Location & privacy',description:'Location permission, sharing and history',icon:MapPin},
    {name:'Notifications',description:'Group alerts and notification permission',icon:Bell},
    {name:'Appearance',description:'Light or dark theme and distance units',icon:Palette},
    {name:'Diagnostics & about',description:'Component versions, status and redacted export',icon:Info}
  ];
  $: query=search.trim().toLocaleLowerCase();
  $: shown=categories.filter(category=>`${category.name} ${category.description}`.toLocaleLowerCase().includes(query));
</script>

<section class="card settings-profile" aria-label="Local profile">
  <span class="avatar" aria-hidden="true">{Array.from(profileName.trim())[0]?.toLocaleUpperCase()??'?'}</span>
  <div><strong>{profileName||'Local name unavailable'}</strong><p>{groupName||'No selected group'}</p></div>
  <button class="outline" onclick={onprofile}>Edit profile</button>
</section>
<label class="settings-search"><Search size={19}/><input type="search" aria-label="Search settings" placeholder="Search settings" bind:value={search}/></label>
<div class="settings-categories" aria-label="Settings categories">
  {#each shown as category}<button class="setting-row card" data-settings-category={category.name} onclick={()=>onopen(category.name)}><svelte:component this={category.icon} size={24}/><span><strong>{category.name}</strong></span><ChevronRight size={19}/></button>{/each}
  {#if !shown.length}<p class="empty" role="status">No settings match “{search}”.</p>{/if}
</div>
<button class="outline full" onclick={ondeveloper}>Developer options</button>

<style>
  .settings-profile{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.settings-profile>div{flex:1;min-width:0}.settings-profile strong{overflow-wrap:anywhere}.settings-profile p{margin:3px 0 0}.settings-search{display:flex;align-items:center;gap:10px;background:var(--card);border:1px solid var(--control-line,var(--line));padding:0 12px;border-radius:13px;margin:18px 0}.settings-search input{border:0;background:transparent;color:inherit;min-width:0;width:100%;padding:13px 0}.setting-row{display:flex;align-items:center;gap:12px;text-align:left;width:100%;color:inherit}.setting-row>span{flex:1;min-width:0}.setting-row strong{font-size:14px}.setting-row>:global(svg){flex-shrink:0}@media(max-width:380px){.settings-profile .outline{width:100%}}
</style>
