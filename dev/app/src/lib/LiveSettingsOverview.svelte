<script lang="ts">
  import {Search,X,ChevronRight,Router,Users,AudioLines,Globe,Map,MapPin,Bell,Palette,Info} from '@lucide/svelte';
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
    {name:'Maps & storage',description:'Vector maps and local history',icon:Map},
    {name:'Location & privacy',description:'Location permission, own position and group sharing',icon:MapPin},
    {name:'Notifications',description:'Group alerts and notification permission',icon:Bell},
    {name:'Appearance',description:'Light or dark theme and distance units',icon:Palette},
    {name:'Diagnostics & about',description:'Component versions, status and redacted export',icon:Info}
  ];
  $: query=search.trim().toLocaleLowerCase();
  $: terms=query.split(/\s+/).filter(Boolean);
  $: shown=categories.filter(category=>terms.every(term=>`${category.name} ${category.description}`.toLocaleLowerCase().includes(term)));
  let searchInput:HTMLInputElement;
  function clearSearch(){search='';searchInput?.focus();}
</script>

<section class="card settings-profile" aria-label="Local profile">
  <span class="avatar" aria-hidden="true">{Array.from(profileName.trim())[0]?.toLocaleUpperCase()??'?'}</span>
  <div><strong>{profileName||'Local name unavailable'}</strong><p>{groupName||'No selected group'}</p></div>
  <button class="outline" onclick={onprofile}>Edit profile</button>
</section>
<label class="settings-search"><Search size={19}/><input type="search" aria-label="Search settings" placeholder="Search settings" bind:this={searchInput} bind:value={search}/>{#if search}<button type="button" class="clear-search" aria-label="Clear settings search" onclick={clearSearch}><X size={18}/></button>{/if}</label>
<div class="settings-categories" aria-label="Settings categories">
  {#each shown as category}<button class="setting-row card" data-settings-category={category.name} onclick={()=>onopen(category.name)}><svelte:component this={category.icon} size={24}/><span><strong>{category.name}</strong><small>{category.description}</small></span><ChevronRight size={19}/></button>{/each}
  {#if !shown.length}<p class="empty" role="status">No settings match “{search}”.</p>{/if}
</div>
<button class="outline full" onclick={ondeveloper}>Developer options</button>

<style>
  .settings-profile{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.settings-profile>div{flex:1;min-width:0}.settings-profile strong{overflow-wrap:anywhere}.settings-profile p{margin:3px 0 0}.settings-search{display:flex;align-items:center;gap:10px;background:var(--card);border:1px solid var(--control-line,var(--line));padding:0 12px;border-radius:13px;margin:18px 0}.settings-search input{border:0;background:transparent;color:inherit;min-width:0;width:100%;padding:13px 0}.setting-row{display:flex;align-items:center;gap:12px;text-align:left;width:100%;color:inherit}.setting-row>span{flex:1;min-width:0}.setting-row strong{font-size:0.875rem}.setting-row small{display:block;margin-top:4px;color:var(--muted);font-size:0.75rem;font-weight:400;line-height:1.4}.settings-search .clear-search{display:flex;align-items:center;justify-content:center;flex-shrink:0;width:44px;min-height:44px;padding:0;border:0;background:transparent;color:inherit}.settings-search input::-webkit-search-cancel-button{appearance:none}.setting-row>:global(svg){flex-shrink:0}@media(max-width:380px){.settings-profile .outline{width:100%}}
</style>
