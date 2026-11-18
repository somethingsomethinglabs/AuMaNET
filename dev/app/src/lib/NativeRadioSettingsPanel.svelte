<script lang="ts">
  import {onMount} from 'svelte';
  import type {NativeGatewayRadioSettingsClient,GatewayRadioSettingsView} from '@aumanet/core';
  import {GATEWAY_RADIO_REPORT_FRESH_MS,type GroupSnapshot} from '@aumanet/protocol';
  import RadioSettingsPanel from './RadioSettingsPanel.svelte';
  import type {RadioNodeView} from './radio-settings-view';
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
  $: names=networkNodes(group);
  $: nodes=(snapshot?.nodes??[]).map(node=>{
    const actual=snapshot?.options.find(option=>option.id===node.actualOptionId);
    const fresh=trusted&&node.reportAgeMs<GATEWAY_RADIO_REPORT_FRESH_MS;
    return{id:node.nodeId,name:names.find(value=>value.id===node.nodeId)?.name??(node.role==='ap'?'Main node':'Following node'),...(actual?{channel:actual.channel,bandwidthMHz:actual.bandwidthMHz,centerFrequencyHz:actual.centerFrequencyHz}:{}),fresh,associated:node.associated,reportLabel:`${node.verification==='owner-relayed'?'Verified through group owner':'Verified node report'} · received ${Math.ceil(node.reportAgeMs/1000)} s ago${!fresh?' · refresh to verify current settings':''}${node.role==='station'&&!node.associated?' · not associated':''}`};
  });
  async function run(work:()=>Promise<unknown>){try{await work();}catch{/* The scoped client publishes a fixed user-facing result; never replay. */}}
</script>
{#if client&&!group?.group}<section class="card"><h2>Radio settings</h2><p>Join or create your group in Network before reviewing its radio settings.</p></section>{:else}<RadioSettingsPanel supported={!!client} loaded={trusted} busy={optimising||(view?.busy??false)} available={trusted&&!!snapshot?.available} owner={snapshot?.owner??false} canChange={trusted&&!!snapshot?.canChange} state={snapshot?.state??'unavailable'} error={view?.error??''} notice={view?.notice??''} operationId={matching?snapshot?.operationId??'':''} trialRemainingMs={snapshot?.trialRemainingMs??0} options={matching?snapshot?.options??[]:[]} {nodes} onrefresh={()=>{if(client)void run(()=>client.refresh());}} onapply={optionId=>{if(client)void run(()=>client.beginTrial(optionId));}} oncommit={()=>{if(client)void run(()=>client.commitTrial());}} oncancel={()=>{if(client)void run(()=>client.cancel());}}/>{/if}

{#if client&&benchmark&&group?.group}<ChannelOptimisationPanel radio={client} {benchmark} {group} onrunning={running=>optimising=running}/>{/if}
