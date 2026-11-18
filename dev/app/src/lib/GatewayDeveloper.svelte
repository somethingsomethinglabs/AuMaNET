<script lang="ts">
  import {onMount} from 'svelte';
  import {nativeGatewayDeveloper} from './native-gateway';
  import type {GatewayDeveloperClient,GatewayDeveloperState} from './gateway-developer';
  export let client:GatewayDeveloperClient|undefined=nativeGatewayDeveloper();
  let state:GatewayDeveloperState|undefined=client?.state;
  $: snapshot=state?.snapshot;
  $: active=!!snapshot?.sessionId&&['starting','renewing','stopping'].includes(snapshot.state);
  onMount(()=>{if(!client)return;const unsubscribe=client.subscribe(value=>state=value);void client.refresh();return()=>{unsubscribe();client?.dispose();};});
</script>
{#if client}
<section class="card gateway-developer" aria-labelledby="gateway-developer-title">
  <h2 id="gateway-developer-title">Field node connection</h2>
  <p class="hint">Experimental two-node field session. Uses the previously checked configuration saved on this phone. Starting renews short signed leases for up to two hours; it does not enable voice or location sharing.</p>
  <p class="gateway-status" role="status">{#if state?.busy}Checking field session…{:else if !state?.loaded}Status unavailable{:else if snapshot?.state==='renewing'}Renewing leases · Node acceptance unverified{:else if snapshot?.state==='starting'}Starting · Node acceptance unverified{:else if snapshot?.state==='stopping'}Stopping · Node acceptance unverified{:else if snapshot?.state==='unavailable'}Native field session unavailable{:else}Field session off · Node acceptance unverified{/if}</p>
  {#if state?.error}<p class="gateway-error" role="alert">{state.error}</p>{/if}
  {#if snapshot?.hasError}<p class="hint">The native field session reported an interruption. Refresh and check the saved owner, Wi-Fi and node configuration before starting explicitly.</p>{/if}
  {#if state?.loaded&&snapshot&&!active}
    <p class="hint">{snapshot.configuration==='ready'?'Previously checked configuration available. Open the saved group as its owner to start.':snapshot.configuration==='empty'?'No checked node configuration is saved. Initial USB setup is required.':snapshot.configuration==='stale'?'The saved configuration no longer matches this group or network. Check it through the approved setup before starting.':'Saved configuration unavailable. Existing data has been preserved.'}</p>
  {/if}
  <div class="gateway-actions">
    <button class="outline" disabled={state?.busy} onclick={()=>void client?.refresh()}>Refresh field status</button>
    {#if active}<button class="outline" disabled={state?.busy||!state?.loaded} onclick={()=>void client?.stop()}>Stop field session</button>
    {:else}<button class="primary" disabled={state?.busy||!state?.loaded||!snapshot?.canStartConfigured} onclick={()=>void client?.startConfigured()}>Start configured field session</button>{/if}
  </div>
  <p class="hint">Status updates when you press Refresh. The saved setup was checked over USB; this manual panel does not confirm node acceptance. Resume connection verifies the current node boot before restoring group traffic. Missing or revoked acquisition permission needs checked setup repair. Stop ends renewal; existing node leases can remain valid for up to 30 seconds. Navigation never starts or restarts a session.</p>
</section>
{/if}
<style>.gateway-developer{min-width:0}.gateway-developer h2{margin-bottom:14px}.gateway-actions{display:flex;flex-wrap:wrap;gap:10px}.gateway-actions button{max-width:100%;white-space:normal;min-height:44px}.gateway-status{font-weight:650;overflow-wrap:anywhere}.gateway-error{background:var(--error-bg);color:var(--error-ink);padding:12px;border-radius:10px;overflow-wrap:anywhere}</style>
