<script lang="ts">
  import HelpButton from "./HelpButton.svelte";
  import {Smartphone,Share2,Download,RefreshCw,ShieldCheck} from '@lucide/svelte';
  import type {GroupSnapshot} from '@aumanet/protocol';
  import type {InternetSharingClient,InternetState} from './internet-sharing/client';
  export let client:InternetSharingClient|undefined=undefined;
  export let state:InternetState|undefined=undefined;
  export let group:GroupSnapshot|undefined=undefined;
  export let groupUnavailable=false;
  export let onnotifications:()=>void=()=>{};
  let limitBytes=100_000_000,durationMs=7_200_000;
  $: snapshot=state?.snapshot;
  $: scopeMatches=!!group?.group&&snapshot?.scope?.groupId===group.group.id&&snapshot.scope.selfId===group.identity.id&&snapshot.scope.epoch===group.group.epoch;
  $: ready=!!client&&!!state?.loaded&&scopeMatches&&!groupUnavailable;
  $: donation=snapshot?.donation;
  $: consumption=snapshot?.consumption;
  $: shareActive=!!donation?.sessionId;
  $: useActive=!!consumption?.sessionId;
  $: shareStatus=!client?'Unavailable':!state?.loaded?(state?.reading?'Checking sharing status…':'Status unavailable'):donation?.state==='sharing'?'Sharing your mobile data':donation?.state==='starting'?'Preparing mobile data…':donation?.state==='unavailable'?'Sharing needs attention':'Off';
  $: useStatus=!client?'Unavailable':!state?.loaded?(state?.reading?'Checking connection…':'Status unavailable'):consumption?.state==='connected'?`Using ${donorName(consumption.donorId)}’s internet`:consumption?.state==='starting'?'Waiting for Android or the connection…':consumption?.state==='reconnecting'?'Connection interrupted':consumption?.state==='unavailable'?'Connection needs attention':'Off';
  function donorName(id:string|undefined){return group?.members.find(member=>member.id===id)?.name??'a group member';}
  function amount(bytes:number){return bytes>=1_000_000_000?`${(bytes/1_000_000_000).toFixed(1)} GB`:`${(bytes/1_000_000).toFixed(bytes>=10_000_000?0:1)} MB`;}
  function duration(ms:number){const minutes=Math.max(0,Math.ceil(ms/60000));return minutes>=60?`${Math.floor(minutes/60)} h ${minutes%60} min`:`${minutes} min`;}
</script>
<div class="internet-settings" aria-busy={state?.busy??false}>
  {#if !client}<section class="card"><h2>Shared internet unavailable</h2><p>Open AuMaNET on a supported Android phone to share mobile data or use another group member’s connection.</p></section>
  {:else}
    {#if state?.error}<p class="internet-error" role="alert">{state.error}</p>{/if}
    {#if state?.loaded&&!snapshot?.available}<p class="internet-note" role="status">{snapshot?.unavailableReason||'Internet sharing is unavailable on this phone.'}</p>
    {:else if state?.loaded&&!scopeMatches}<p class="internet-note" role="status">Connect to your approved group before starting internet sharing.</p>{/if}
    <section class="card internet-role" aria-labelledby="share-internet-title"><div class="role-heading"><Share2 size={24}/><div><h2 id="share-internet-title">Share my internet</h2><p>Let approved group members use this phone’s mobile data.</p></div></div>
      <p class="role-status" role="status">{shareStatus}</p>
      {#if shareActive&&donation}<p class="usage">{amount(donation.usedBytes)} used · {amount(donation.remainingBytes)} left</p><progress max={Math.max(1,donation.limitBytes)} value={donation.usedBytes} aria-label="Shared mobile data used"></progress><p class="hint">Up to {duration(donation.expiresInMs)} remaining in this session.</p>
        <button class="outline full" onclick={()=>void client?.stopSharing()}>Stop sharing my internet</button>
      {:else if ready}<div class="sharing-limits"><fieldset class="choice-field" disabled={!ready||!!state?.busy}><legend>Sharing limit</legend><div class="choice-control">{#each [{value:100_000_000,label:'100 MB'},{value:250_000_000,label:'250 MB'},{value:500_000_000,label:'500 MB'},{value:1_000_000_000,label:'1 GB'}] as option}<button type="button" aria-pressed={limitBytes===option.value} onclick={()=>limitBytes=option.value}>{option.label}</button>{/each}</div></fieldset><fieldset class="choice-field" disabled={!ready||!!state?.busy}><legend>Stop after</legend><div class="choice-control">{#each [{value:1_800_000,label:'30 min'},{value:3_600_000,label:'1 hour'},{value:7_200_000,label:'2 hours'}] as option}<button type="button" aria-pressed={durationMs===option.value} onclick={()=>durationMs=option.value}>{option.label}</button>{/each}</div></fieldset></div>
        <p class="hint">Stops at the data or time limit. Starting again requires your approval.</p>
        {#if ready&&!snapshot?.canShare&&snapshot?.shareUnavailableReason}<p class="internet-note" role="status">{snapshot.shareUnavailableReason}</p>{/if}
        <button class="primary full" disabled={!ready||!snapshot?.canShare||!!state?.busy} onclick={()=>void client?.share(limitBytes,durationMs)}>Start sharing my internet</button>
      {/if}
      {#if donation?.error}<p class="internet-error" role="status">{donation.error}</p>{/if}
    </section>
    <section class="card internet-role" aria-labelledby="use-internet-title"><div class="role-heading"><Download size={24}/><div><h2 id="use-internet-title">Use shared internet</h2><p>Choose a group member who is sharing mobile data.</p></div></div>
      <p class="role-status" role="status">{useStatus}</p>
      {#if useActive&&consumption}
        {#if consumption.vpnActive}<p class="hint"><ShieldCheck size={16}/>Android’s VPN connection is on for shared internet.</p>{/if}
        {#if consumption.blocksOtherInternet&&consumption.state!=='connected'}<p class="internet-note" role="status">Other internet traffic is blocked while this shared connection recovers. Stop using shared internet to return to your phone’s normal connection.</p>{/if}
        <button class="outline full" onclick={()=>void client?.stopConsuming()}>Stop using shared internet</button>
      {:else}
        {#each snapshot?.donors??[] as donor(donor.id)}<div class="internet-source"><Smartphone size={23}/><span><strong>{donorName(donor.id)}’s phone</strong><small>{amount(donor.remainingBytes)} available</small></span><button class="outline" disabled={!ready||!snapshot?.canConsume||!donor.eligible||donor.remainingBytes===0||donor.expiresInMs===0||!!state?.busy} onclick={()=>void client?.consume(donor.id)}>Use</button></div>
        {:else}<p class="hint">No group member is currently offering a shared connection. They can turn on Share my internet on their phone.</p>{/each}
        <p class="hint">After you choose Use, Android asks to allow a VPN connection. This lets other apps use the selected phone’s data. AuMaNET does not choose another donor automatically.</p>
      {/if}
      {#if consumption?.error}<p class="internet-error" role="status">{consumption.error}</p>{/if}
    </section>
    <button class="outline full check-internet" disabled={!!state?.reading} onclick={()=>void client?.refresh()}><RefreshCw size={18}/>{state?.reading?'Checking status…':'Check internet status'}</button>
    <div class="help-row"><span>How shared internet works</span><HelpButton title="How shared internet works"><p>Providing data and using someone else’s data are separate choices. Android shows a persistent notification while sharing is active, with controls to stop it.</p><p>This connection supports IPv4 traffic. IPv6 traffic is blocked. Some apps or networks may need to return to your phone’s normal connection.</p><p>Stopping internet sharing does not press any microphone or location-sharing control. Those features remain separate.</p><button class="text-button" onclick={onnotifications}>Notification settings</button></HelpButton></div>
  {/if}
</div>
<style>
  .internet-settings{min-width:0}.internet-role{min-width:0}.role-heading{display:flex;gap:12px;align-items:flex-start}.role-heading>:global(svg){flex-shrink:0}.role-heading>div{min-width:0}.role-heading h2{font-size:20px;margin:0}.role-heading p{font-size:13px;line-height:1.6;color:var(--muted);margin:5px 0 0}.role-status{font-size:14px;font-weight:700;line-height:1.5;margin:17px 0 12px}.sharing-limits{display:grid;grid-template-columns:1fr 1fr;gap:12px}.internet-error,.internet-note{padding:12px;border-radius:12px;font-size:13px;line-height:1.6;overflow-wrap:anywhere}.internet-error{background:var(--error-bg,#fff0e7);color:var(--error-ink,#9f301f)}.internet-note{background:var(--warning-bg,#f4efdd);color:var(--warning-ink,#75613c)}.usage{font-size:13px;margin:8px 0}.internet-role progress{width:100%;height:10px}.internet-role .hint{display:block;font-size:12px;line-height:1.6;color:var(--muted)}.internet-role .hint>:global(svg){vertical-align:middle}.internet-role button.full{min-height:44px;white-space:normal}.internet-source{display:flex;align-items:center;gap:10px;padding:13px 0;border-bottom:1px solid var(--line)}.internet-source>:global(svg){flex-shrink:0}.internet-source>span{flex:1;min-width:0;overflow-wrap:anywhere}.internet-source strong{font-size:14px}.internet-source small{font-size:11px;line-height:1.5;color:var(--muted);display:block;margin-top:4px}.internet-source button{min-height:44px;flex-shrink:0}.check-internet{margin-top:6px}@media(max-width:600px){.sharing-limits{grid-template-columns:1fr}}@media(max-width:350px){.internet-source{gap:7px}.internet-source strong{font-size:13px}}
</style>
