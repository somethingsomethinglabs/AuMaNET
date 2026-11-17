<script lang="ts">
  import HelpButton from '../HelpButton.svelte';
  import type {MapConnection} from './connections';
  export let connections:readonly MapConnection[]=[];
</script>
{#if connections.length}
  <div class="help-row"><span>Connections · {connections.length}</span><HelpButton title="Map connections"><div class="connection-legend">
    <p>Lines show the group owner’s connected phones with known positions. They do not show radio mesh routes.</p>
    <div class="strength-legend" aria-label="Illustrative signal strength color scale: red at minus 100 dBm or weaker, yellow at minus 70 dBm, green at minus 40 dBm or stronger">
      <span>Weaker</span><span class="strength-ramp" aria-hidden="true"></span><span>Stronger</span>
    </div>
    <p>Signal strength scale: −100 to −40 dBm, clamped at each end. Color is illustrative; it does not predict delivery, range or distance. The radio’s cached RF sample age is unknown.</p>
    <p><span class="unknown-line" aria-hidden="true"></span>Gray dashed: unknown or stale signal, or last-known positions.</p>
    <ul>{#each connections as connection(connection.id)}<li><strong>{connection.from.name} ↔ {connection.to.name}</strong><span>{connection.detail}</span></li>{/each}</ul>
  </div></HelpButton></div>
{/if}
<style>
  .connection-legend{margin:8px 2px 12px;padding:10px 12px;border:1px solid var(--line,#dfe1d5);border-radius:12px;color:var(--ink,#214c35);background:var(--card,#fffdf6);font-size:12px;line-height:1.6}.connection-legend p{margin:8px 0;color:var(--muted,#73816e)}.strength-legend{display:flex;align-items:center;gap:9px;max-width:380px}.strength-ramp{height:7px;flex:1;min-width:40px;border-radius:4px;background:linear-gradient(90deg,#c83c32,#b28415,#248447)}.unknown-line{display:inline-block;width:30px;border-top:3px dashed #7b8085;vertical-align:middle;margin-right:6px}.connection-legend ul{padding-left:18px;margin-bottom:0}.connection-legend li{margin:10px 0;overflow-wrap:anywhere}.connection-legend li>span{display:block;color:var(--muted,#73816e)}
</style>
