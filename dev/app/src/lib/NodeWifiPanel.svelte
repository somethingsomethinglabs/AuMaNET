<script lang="ts">
  import HelpButton from "./HelpButton.svelte";
  import {Wifi,RefreshCw} from '@lucide/svelte';
  import {wifiStatus,type NodeConnectionState} from './node-connection';
  export let state:NodeConnectionState|undefined;
  export let supported=false;
  export let groupStatus='No group connected';
  export let onrefresh:()=>void;
  export let onsettings:()=>void;
  export let ongroup:()=>void;
</script>
<section class="card node-wifi" aria-labelledby="node-wifi-title">
  <div class="title-row"><h2 id="node-wifi-title"><Wifi size={22}/>Node Wi-Fi</h2><button class="square" aria-label="Refresh Wi-Fi status" disabled={!supported||state?.reading} onclick={onrefresh}><RefreshCw size={19}/></button></div>
  <p role="status" class="wifi-status">{wifiStatus(state?.snapshot)}</p>
  
  <div class="connection-actions">{#if supported}<button class="primary" disabled={state?.opening} onclick={onsettings}>{state?.opening?'Opening settings…':'Open Wi-Fi settings'}</button>{/if}<button class="outline" onclick={ongroup}>Open group connection</button></div>
  {#if !supported}<p class="hint">Wi-Fi controls are unavailable in this app version. Open Android Settings → Wi-Fi directly.</p>{/if}
  {#if state?.error}<p role="alert" class="connection-error">{state.error}</p>{/if}
  <div class="info-row"><span>Local group</span><strong>{groupStatus}</strong></div>
  <div class="info-row"><span>Node identity / radio</span><strong>Unverified</strong></div>
  <div class="help-row"><span>Wi-Fi connection help</span><HelpButton title="Wi-Fi connection help"><p class="hint">Node Wi-Fi carries local group traffic. Keep cellular data enabled for your own internet. Android’s “stay connected” choice can change the internet route; check cellular access before a field test.</p><p class="hint">Wi-Fi availability does not verify node identity, the HaLow link or message delivery. Current gateway nodes use Wi-Fi; legacy Bluetooth bench controls are in Developer options.</p></HelpButton></div>
</section>
<style>
  .node-wifi{min-width:0}.node-wifi h2{display:flex;align-items:center;gap:10px}.node-wifi p{line-height:1.65}.node-wifi .title-row{gap:12px;flex-wrap:wrap}.wifi-status{font-weight:650}.connection-actions{display:flex;flex-wrap:wrap;gap:10px;margin:16px 0}.connection-actions button{min-height:44px;max-width:100%;white-space:normal}.connection-error{color:var(--error-ink,#9f301f);background:var(--error-bg,#fff0e7);padding:10px;border-radius:9px}.node-wifi .info-row{gap:12px;flex-wrap:wrap}.node-wifi strong{overflow-wrap:anywhere}
</style>
