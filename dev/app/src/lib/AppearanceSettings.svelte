<script lang="ts">
  import {onMount} from 'svelte';
  import {appearance,type AppearanceClient,type Theme,type Units} from './appearance';
  export let client:AppearanceClient=appearance;
  export let page=false;
  export let onback:()=>void=()=>{};
  let theme:Theme='Light',units:Units='Metric',editing=false;
  $: if(!editing){theme=$client.theme;units=$client.units;}
  onMount(()=>{if(!client.state.loaded)void client.load();});
  async function save(){try{await client.set({theme,units});}catch{/* The client exposes its storage error below. */}finally{theme=client.state.theme;units=client.state.units;editing=false;}}
</script>
<section class="card appearance-settings" aria-labelledby="appearance-title"><h2 id="appearance-title">Display</h2>
  <label class="field">Appearance<select aria-label="Appearance" bind:value={theme} onchange={()=>editing=true} disabled={!$client.loaded||!$client.writable||$client.busy}><option value="Light">Light</option><option value="Dark">Dark</option></select></label>
  <label class="field">Distance units<select aria-label="Distance units" bind:value={units} onchange={()=>editing=true} disabled={!$client.loaded||!$client.writable||$client.busy}><option value="Metric">Metric</option><option value="Imperial">Imperial</option></select></label>
  <button class="primary" disabled={!$client.loaded||!$client.writable||$client.busy} onclick={()=>void save()}>Save settings</button>
  {#if $client.error}<p class="appearance-error" role="alert">{$client.error}</p>{/if}
  {#if !$client.loaded||$client.busy}<p class="hint" role="status">{$client.busy?'Saving or loading display settings…':'Loading display settings…'}</p>{:else if ['invalid','unsupported'].includes($client.storage)}<button class="outline" onclick={()=>void client.reset()}>Reset appearance settings</button><p class="hint">Resets only appearance and units to Light and Metric.</p>{:else if $client.storage==='unavailable'}<button class="outline" onclick={()=>void client.load()}>Reload appearance settings</button>{/if}
  {#if page}<button class="text-button" onclick={onback}>Back to settings</button>{/if}
</section>
<style>.appearance-error{color:var(--error-ink);background:var(--error-bg);padding:12px;border-radius:11px;font-size:0.75rem;margin-top:12px}</style>
