<script lang="ts">
  import {Gauge,Radio,AudioLines,ClipboardCheck,ChevronRight} from '@lucide/svelte';
  export let onopen:(category:string)=>void;
  const tools=[
    {name:'Test connection',description:'Measure upload and download between two phones.',icon:Gauge,section:'Connection and capacity'},
    {name:'Plan bandwidth',description:'Estimate room for messages, positions, voice and downloads.',icon:Gauge,section:'Connection and capacity'},
    {name:'Radio settings',description:'View your node’s channel and radio configuration.',icon:Radio,section:'Device settings'},
    {name:'Voice & audio',description:'Choose input mode and check audio output.',icon:AudioLines,section:'Device settings'},
    {name:'Diagnostics & about',description:'Check versions and status, or export redacted diagnostics.',icon:ClipboardCheck,section:'Device settings'},
  ];
</script>
<section aria-label="Device and use-case tools">
  <p>Measure your connection, plan what to share and check your devices.</p>
  {#each ['Connection and capacity','Device settings'] as section}<section aria-label={section}><h2>{section}</h2>{#each tools.filter(tool=>tool.section===section) as tool}<button class="tool card" onclick={()=>onopen(tool.name)}><svelte:component this={tool.icon} size={23}/><span><strong>{tool.name}</strong><small>{tool.description}</small></span><ChevronRight size={18}/></button>{/each}</section>{/each}
  <details class="card"><summary>Check your intended use</summary><ol><li>Confirm the correct phones and nodes, their versions and saved connection.</li><li>Run connection tests in both directions at the intended positions. Keep failures and repeat the nearby baseline.</li><li>Use those measured rates in Plan bandwidth. Include every member, simultaneous talker and background workload.</li><li>Try text delivery, position age and two-way voice while transferring a photo. Record gaps, outages and recovery.</li></ol><p>A speed result alone cannot pass voice quality, a location you have not tested or a multi-hop route. Never depend on this checklist as proof of emergency coverage.</p></details>
</section>
<style>
  p,li{font-size:0.8125rem;line-height:1.6;color:var(--muted)}.tool{width:100%;display:flex;align-items:center;gap:12px;text-align:left;color:inherit}.tool span{flex:1;min-width:0}.tool strong{font-size:0.9375rem}.tool small{display:block;margin-top:5px;font-size:0.75rem;line-height:1.5;color:var(--muted)}.tool :global(svg){flex-shrink:0}h2{font-size:0.875rem;margin:24px 0 10px;color:var(--muted)}summary{font-size:0.9375rem;font-weight:650;cursor:pointer;min-height:44px;align-content:center}ol{padding-left:22px}li{margin:9px 0}.tool:focus-visible,summary:focus-visible{outline:3px solid var(--focus);outline-offset:3px}
</style>
