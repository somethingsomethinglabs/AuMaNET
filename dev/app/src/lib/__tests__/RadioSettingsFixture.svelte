<script lang="ts">
  import RadioSettingsPanel from '../RadioSettingsPanel.svelte';
  import type {RadioSettingOption,RadioNodeView} from '../radio-settings-view';
  export let dark=false,owner=true,state='idle',busy=false;
  export let options:readonly RadioSettingOption[]=[];
  export let nodes:readonly RadioNodeView[]=[];
  export let onapply:(id:number)=>void;
  export let oncommit:()=>void;
  export let oncancel:()=>void;
  export let onrefresh:()=>void;
</script>
<main class="app-shell radio-fixture" class:dark><h1>Radio settings fixture</h1><p>Synthetic readbacks only. No radio control or native authorization.</p><RadioSettingsPanel loaded available {owner} {busy} {state} {options} {nodes} operationId={['trial','awaiting-commit'].includes(state)?'a'.repeat(32):''} trialRemainingMs={['trial','awaiting-commit'].includes(state)?30000:0} canChange {onapply} {oncommit} {oncancel} {onrefresh}/></main>
<style>.radio-fixture{height:100dvh;overflow:auto;padding:16px;max-width:700px}h1{font-size:1.312rem}main>p{font-size:.75rem}</style>
