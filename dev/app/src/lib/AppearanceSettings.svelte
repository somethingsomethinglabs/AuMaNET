<script lang="ts">
  import PanelHeading from './PanelHeading.svelte';
  export let page=false;
  export let onback:()=>void=()=>{};
  import {onMount} from 'svelte';
  import HelpButton from './HelpButton.svelte';
  import {Palette} from '@lucide/svelte';
  import {appearance, type AppearanceClient,type Theme,type Units} from './appearance';
  export let client:AppearanceClient=appearance;
  onMount(()=>{if(!client.state.loaded)void client.load();});
  async function change(field:'theme'|'units',value:Theme|Units){
    try{await client.set(field==='theme'?{theme:value as Theme}:{units:value as Units});}
    catch{/* Keep the last confirmed preference visible. */}
  }
</script>

<section class="card appearance-settings" aria-labelledby={page?'live-settings-title':'appearance-title'}>
  <PanelHeading title="Appearance" id="appearance-title" icon={Palette} {page} {onback}><HelpButton title="Display settings"><p>Theme and units are saved on this device.</p><p>Metric uses metres and kilometres; Imperial uses feet and miles. Map artwork keeps its original colours and printed labels.</p></HelpButton></PanelHeading>
  <fieldset class="choice-field" disabled={!$client.loaded||!$client.writable||$client.busy}><legend>Theme</legend><div class="choice-control">{#each ['Light','Dark'] as value}<button type="button" aria-pressed={$client.theme===value} onclick={()=>void change('theme',value as Theme)}>{value}</button>{/each}</div></fieldset>
  <fieldset class="choice-field" disabled={!$client.loaded||!$client.writable||$client.busy}><legend>Units</legend><div class="choice-control">{#each ['Metric','Imperial'] as value}<button type="button" aria-pressed={$client.units===value} onclick={()=>void change('units',value as Units)}>{value}</button>{/each}</div></fieldset>
  {#if $client.error}<p class="appearance-error" role="alert">{$client.error}</p>{/if}
  {#if !$client.loaded||$client.busy}<p class="hint" role="status">{$client.busy?'Saving or loading display settings…':'Loading display settings…'}</p>
  {:else if ['invalid','unsupported'].includes($client.storage)}<button class="outline" onclick={()=>void client.reset()}>Reset appearance settings</button><p class="hint">Resets only Theme and Units to Light and Metric on this device.</p>
  {:else if $client.storage==='unavailable'}<button class="outline" onclick={()=>void client.load()}>Reload appearance settings</button>
  {/if}
</section>
<style>.appearance-error{color:var(--error-ink,#9f301f);background:var(--error-bg,#fff0e7);padding:12px;border-radius:10px;overflow-wrap:anywhere}.appearance-settings button{max-width:100%;white-space:normal}
</style>
