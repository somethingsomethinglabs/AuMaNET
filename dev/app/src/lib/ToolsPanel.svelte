<script lang="ts">
  import {Gauge,Radio,AudioLines,ClipboardCheck,ChevronRight} from '@lucide/svelte';
  export let onopen:(category:string)=>void;
  const tools=[
    {name:'Test connection',description:'Measure phone-to-phone upload and download; retain failed attempts.',icon:Gauge},
    {name:'Plan bandwidth',description:'Check whether text, positions, voice and downloads fit an assumed capacity.',icon:Gauge},
    {name:'Radio settings',description:'Inspect the radio configuration and compare channels with explicit test permission.',icon:Radio},
    {name:'Voice & audio',description:'Check input mode and audio output before a two-way listening trial.',icon:AudioLines},
    {name:'Diagnostics & about',description:'Inspect component versions and status, or export redacted diagnostics.',icon:ClipboardCheck},
  ];
</script>
<section aria-label="Device and use-case tools">
  <p>Check the devices first, measure the path, then plan your workload. Estimates help choose a trial; they do not mark a device or use case as passed.</p>
  {#each tools as tool}<button class="tool card" onclick={()=>onopen(tool.name)}><svelte:component this={tool.icon} size={23}/><span><strong>{tool.name}</strong><small>{tool.description}</small></span><ChevronRight size={18}/></button>{/each}
  <section class="card"><h2>Check your intended use</h2><ol><li>Confirm the correct phones and nodes, their versions and saved connection.</li><li>Run connection tests in both directions at the intended positions. Keep failures and repeat the nearby baseline.</li><li>Use those measured rates in Plan bandwidth. Include every member, simultaneous talker and background workload.</li><li>Try text delivery, position age and two-way voice while transferring a photo. Record gaps, outages and recovery.</li></ol><p>A speed result alone cannot pass voice quality, a location you have not tested or a multi-hop route. Never depend on this checklist as proof of emergency coverage.</p></section>
</section>
<style>
  p,li{font-size:13px;line-height:1.6;color:var(--muted)}.tool{width:100%;display:flex;align-items:center;gap:12px;text-align:left;color:inherit}.tool span{flex:1;min-width:0}.tool strong{font-size:15px}.tool small{display:block;margin-top:5px;font-size:12px;line-height:1.5;color:var(--muted)}.tool :global(svg){flex-shrink:0}h2{font-size:18px}ol{padding-left:22px}li{margin:9px 0}
</style>
