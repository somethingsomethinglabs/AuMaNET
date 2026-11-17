<script lang="ts">
  import RadioSettingsPanel from '../RadioSettingsPanel.svelte';
  import type {RadioSettingOption,RadioNodeView} from '../radio-settings-view';
  export let dark=false,owner=true,state='idle',busy=false;
  export let options:readonly RadioSettingOption[]=[];
  export let nodes:readonly RadioNodeView[]=[];
  export let onapply:(id:number)=>void;
  export let oncancel:()=>void;
  export let onrefresh:()=>void;
</script>
<main class="app-shell radio-fixture" class:dark><h1>Radio settings fixture</h1><p>Synthetic readbacks only. No radio control or native authorization.</p><RadioSettingsPanel loaded available {owner} {busy} {state} {options} {nodes} operationId={state==='trial'?'a'.repeat(32):''} trialRemainingMs={state==='trial'?30000:0} canChange {onapply} {oncancel} {onrefresh}/></main>
<style>.radio-fixture{height:auto;min-height:100dvh;padding:16px;max-width:700px;margin:auto;--ink:#174d35;--muted:#65745f;--card:#fffdf6;--line:#dfe1d5;--bg:#f7f5eb;background:var(--bg);color:var(--ink)}.radio-fixture.dark{--ink:#e8efdf;--muted:#b9c6b5;--card:#20362b;--line:#4f6255;--bg:#16291f}h1{font-size:21px}main>p{font-size:12px}</style>
