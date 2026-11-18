<script lang="ts">
  import {networkOverview,type NetworkOverviewInput} from './network-overview';
  import type {DeviceSelection,NetworkNode} from './network-topology';
  import BrandIcon from './BrandIcon.svelte';
  import RadioSignalDetails from './RadioSignalDetails.svelte';
  export let state:NetworkOverviewInput={};
  export let dark=false;
  export let compact=false;
  export let identifiedNodes:readonly NetworkNode[]|undefined=undefined;
  export let onstop:(()=>void)|undefined=undefined;
  export let onresume:(()=>void)|undefined=undefined;
  export let ongroup:()=>void;
  export let onmessages:()=>void;
  export let oninternet:()=>void;
  export let onbenchmark:()=>void=()=>{};
  export let ontools:(()=>void)|undefined=undefined;
  export let onradiosettings:()=>void=()=>{};
  export let ondevice:((selection:DeviceSelection)=>void)|undefined=undefined;
  let options:HTMLDialogElement;
  export function closeOptions(){options?.close();}
  $: view=networkOverview(state);
  $: wifi=state.wifi?.error?'Unknown':state.wifi?.snapshot?.wifi==='available'?'Available':state.wifi?.snapshot?.wifi==='unavailable'?'Unavailable':'Unknown';
  $: facts=[{label:'Wi-Fi',icon:'wifi',value:wifi},{label:'Verified node',icon:'node',value:view.attached?'Available':view.wifiAttached?'Verifying':'Unverified'},{label:'Group membership',icon:'people',value:view.groupLive?'Available':state.group?.group?'Saved · disconnected':'Unavailable'},{label:'Radio link',icon:'radio',value:view.radioValue},{label:'Message transfers',icon:'chat',value:view.transferTitle},{label:'Internet',icon:'globe',value:view.internetDetail}];
</script>
<section class="card connection-summary" aria-label={compact?'Your connection':'Connection overview'}><h2 role="status">{view.summaryTitle}</h2>{#if view.summaryDetail}<p class="hint">{view.summaryDetail}</p>{/if}<div class="live-actions">{#if onstop&&view.active}<button class="danger" disabled={!view.canStop} onclick={onstop}>Disconnect</button>{/if}{#if onresume&&state.trusted?.loaded&&(state.trusted.snapshot?.canConnect||state.trusted.snapshot?.state==='attention')}<button class="primary" disabled={state.trusted.busy} onclick={onresume}>{state.trusted.snapshot?.state==='attention'?'Recheck connection':'Resume connection'}</button>{/if}<button class="outline" onclick={()=>options.showModal()}>Saved connection</button></div></section>
<section class="card connection-facts" aria-label="Connection checks">{#each facts as fact}<div class="connection-fact"><span class="icon-tile"><BrandIcon name={fact.icon}/></span><strong>{fact.label}</strong><span class="fact-value">{fact.value}</span></div>{/each}</section>
<details><summary>Saved connection & recovery</summary><button class="outline" onclick={()=>options.showModal()}>Review saved connection</button><div class="destination-list"><button class="destination-row" onclick={ongroup}>Group membership<BrandIcon name="chevron"/></button><button class="destination-row" onclick={onmessages}>Saved messages<BrandIcon name="chevron"/></button><button class="destination-row" onclick={oninternet}>Shared internet<BrandIcon name="chevron"/></button><button class="destination-row" onclick={onradiosettings}>Radio settings<BrandIcon name="chevron"/></button><button class="destination-row" onclick={onbenchmark}>Connection tests<BrandIcon name="chevron"/></button>{#if ondevice}<button class="destination-row" onclick={()=>ondevice?.({kind:'nodes'})}>Identified nodes · {identifiedNodes?.length??0}<BrandIcon name="chevron"/></button>{/if}{#if ontools}<button class="destination-row" onclick={ontools}>All tools<BrandIcon name="chevron"/></button>{/if}</div></details>
<details><summary>Last signal report</summary><RadioSignalDetails signals={view.radioSignals} elapsedMs={state.radioElapsedMs??0}/></details>
<dialog bind:this={options} class:dark aria-label="Saved connection"><h2>Saved connection</h2><slot/></dialog>
<style>.connection-fact{display:flex;align-items:center;gap:12px;min-height:66px;border-bottom:1px solid var(--line);padding:10px 0}.connection-fact:last-child{border:0}.connection-fact strong{font-size:0.8125rem;font-weight:600}.fact-value{margin-left:auto;font-size:0.6875rem;max-width:45%;text-align:right;overflow-wrap:anywhere;color:var(--muted)}.connection-summary h2{font-size:1.062rem}.connection-facts{padding:8px 16px}</style>
