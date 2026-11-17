<script lang="ts">
  import DiagnosticsSettings from '../DiagnosticsSettings.svelte';
  import type {DiagnosticsClient} from '../diagnostics';
  import '../appearance/theme.css';
  export let client:DiagnosticsClient;
  export let states:{group:unknown;voice:unknown;messages:unknown;node:unknown;location:unknown};
  let visible=true;
</script>
<div class="live-shell fixture-root"><h1>Diagnostics browser fixture</h1><p>Explicit synthetic data. No device or acoustic acceptance.</p>
  {#if visible}<DiagnosticsSettings {client} {...states} nodeConnected={true} evidence="fixture"/>{/if}
  <button class="outline" onclick={()=>visible=false}>Unmount diagnostics fixture</button>
</div>
<style>
  .fixture-root{box-sizing:border-box;min-width:0;width:100%;max-width:750px;padding:16px;margin:auto;--card:#fffdf6;--line:#dedfd2;--muted:#657367;--sage:#eaf1e3;--ink:#173e2c}.fixture-root h1{font-size:20px}.fixture-root>button{margin:20px 0;white-space:normal;max-width:100%}
</style>
