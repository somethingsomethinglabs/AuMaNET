<script lang="ts">
  import AppearanceSettings from '../AppearanceSettings.svelte';
  import NativeLocationPanel from '../NativeLocationPanel.svelte';
  import MapPanel from '../MapPanel.svelte';
  import '../appearance/theme.css';
  import type {AppearanceClient} from '../appearance/preferences';
  import type {NativeLocationClient,LocationSnapshot} from '@aumanet/core';
  export let client:AppearanceClient;
  export let location:LocationSnapshot;
  export let locationClient:NativeLocationClient;
  let tab='Appearance';
  const tabs=['Appearance','Map','Location'];
</script>
<div class="app-shell live-shell" class:dark={$client.theme==='Dark'}>
  <header><div class="brandline"><a href="#fixture"><img class="brand-logo" src={$client.theme==='Dark'?'/brand/aumanet-mark-light.svg':'/brand/aumanet-mark.svg'} alt=""/><strong>AuMaNET</strong></a></div><p class="hint">Appearance test fixture · Synthetic coordinates</p></header>
  <main>
    {#if tab==='Appearance'}<AppearanceSettings {client}/>
    {:else if tab==='Map'}<MapPanel fix={{latitude:-37.8,longitude:145,accuracy:12,timestamp:Date.now()}} active={true} ageMs={0} units={$client.units} onprivacysettings={()=>tab='Location'}
      members={[{id:'fixture-peer',name:'Fixture peer',fix:{latitude:-37.799,longitude:145,accuracy:6,timestamp:Date.now()},ageMs:0,connected:true,authorized:true,locationActive:true}]}/>
    {:else}<NativeLocationPanel client={locationClient} state={location} units={$client.units}/>{/if}
  </main>
  <nav aria-label="Appearance fixture navigation">{#each tabs as name}<button class:active={tab===name} onclick={()=>tab=name}>{name}</button>{/each}</nav>
</div>

<style>header{padding:12px 16px;flex:none}header p{display:none}.brandline a{display:flex;align-items:center;gap:10px}.brand-logo{width:32px;height:32px}main:has(:global(.map-surface)){position:relative;display:flex;overflow:hidden}</style>
