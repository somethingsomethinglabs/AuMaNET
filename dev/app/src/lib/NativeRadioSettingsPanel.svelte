<script lang="ts">
  import {onMount} from 'svelte';
  import type {NativeGatewayRadioSettingsClient,GatewayRadioSettingsView} from '@aumanet/core';
  import {GATEWAY_RADIO_REPORT_FRESH_MS,type GroupSnapshot} from '@aumanet/protocol';
  import RadioSettingsPanel from './RadioSettingsPanel.svelte';
  import {radioChangeBlocker,type RadioNodeView} from './radio-settings-view';
  import {networkNodes} from './network-topology';
  import ChannelOptimisationPanel from './ChannelOptimisationPanel.svelte';
  import type {LinkBenchmarkClient} from './link-benchmark';
  export let client:NativeGatewayRadioSettingsClient|undefined=undefined;
  export let benchmark:LinkBenchmarkClient|undefined=undefined;
  export let group:GroupSnapshot|undefined=undefined;
  let view:GatewayRadioSettingsView|undefined=client?.state;
  let nodes:readonly RadioNodeView[]=[];
  let optimising=false;
  onMount(()=>client?.subscribe(next=>view=next));
  $: snapshot=view?.snapshot;
  $: matching=!!group?.group&&snapshot?.scope?.groupId===group.group.id&&snapshot.scope.selfId===group.identity.id&&snapshot.scope.epoch===group.group.epoch;
  $: trusted=!!view?.loaded&&!view.error&&matching;
  $: delegated=matching&&snapshot?.delegated===true;
  $: names=networkNodes(group);
  $: nodes=(snapshot?.nodes??[]).map(node=>{
    const actual=snapshot?.options.find(option=>option.id===node.actualOptionId);
    const fresh=trusted&&node.reportAgeMs<GATEWAY_RADIO_REPORT_FRESH_MS;
    return{id:node.nodeId,name:names.find(value=>value.id===node.nodeId)?.name??(node.role==='ap'?'Main node':'Following node'),...(actual?{channel:actual.channel,bandwidthMHz:actual.bandwidthMHz,centerFrequencyHz:actual.centerFrequencyHz}:{}),fresh,associated:node.associated,reportAgeMs:node.reportAgeMs,reportLabel:`Checked ${Math.ceil(node.reportAgeMs/1000)} s ago${node.role==='station'&&!node.associated?' · not associated':''}`};
  });
  async function run(work:()=>Promise<unknown>){try{await work();}catch{/* The scoped client publishes a fixed user-facing result; never replay. */}}
  function verifyCurrentChannel(){const source=client;if(source)void run(()=>source.prepareComparison());}
</script>
{#if client&&!group?.group}
  <section class="card"><h2>Radio settings</h2><p>Join or create a group before checking its radio settings.</p></section>
{:else}
  <RadioSettingsPanel supported={!!client} loaded={trusted} busy={optimising||(view?.busy??false)}
    operator={matching&&!!(snapshot?.owner||delegated)} explicitCommit={!delegated}
    canChange={trusted&&!!snapshot?.canChange}
    changeBlocker={trusted&&snapshot?radioChangeBlocker(snapshot):''}
    state={snapshot?.state??'unavailable'} error={view?.error??''} notice={view?.notice??''}
    operationId={matching?snapshot?.operationId??'':''} trialRemainingMs={snapshot?.trialRemainingMs??0}
    options={matching?snapshot?.options??[]:[]} {nodes}
    onrefresh={()=>{if(client)void run(()=>client.refresh());}}
    onverify={matching&&snapshot?.fieldSessionId&&client?verifyCurrentChannel:undefined}
    onapply={optionId=>{if(client)void run(()=>delegated?client.apply(optionId):client.beginTrial(optionId));}}
    oncommit={()=>{if(client)void run(()=>client.commitTrial());}}
    oncancel={()=>{if(client)void run(()=>client.cancel());}}/>
{/if}

{#if client&&benchmark&&group?.group}<ChannelOptimisationPanel radio={client} {benchmark} {group} onrunning={running=>optimising=running}/>{/if}
