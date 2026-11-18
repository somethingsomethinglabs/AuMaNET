<script lang="ts">
  import BrandIcon from './BrandIcon.svelte';
  import type {NetworkNode,DeviceSelection} from './network-topology';
  export let nodes:readonly NetworkNode[]=[];
  export let onselect:(selection:DeviceSelection)=>void;
</script>
<div class="node-list">

  {#each nodes as node(node.id)}<article class="known-node"><button class="node-summary" onclick={()=>onselect({kind:'node',id:node.id})}><span class="node-icon"><BrandIcon name="node" size={24}/></span><span><strong>{node.name}</strong><small>{node.phones.map(phone=>phone.name).join(', ')||'Phone assignment unavailable'}</small><small>{node.linkLabel} · {node.signalLabel}</small></span><BrandIcon name="chevron" size={18}/></button>
  </article>{:else}<p class="hint">No nodes have been identified yet. Connect to your group and check your node connection.</p>{/each}
</div>
<style>.node-list{background:var(--card);border-radius:14px;overflow:hidden}.known-node+.known-node{border-top:1px solid var(--line)}.node-summary{display:flex;align-items:center;gap:12px;width:100%;min-height:82px;padding:14px 12px;text-align:left;border:0;background:transparent;color:inherit}.node-summary>span:nth-child(2){flex:1;min-width:0;overflow-wrap:anywhere}.node-summary strong{font-size:.9375rem;font-weight:600}.node-summary small{display:block;font-size:.6875rem;color:var(--muted);margin-top:3px;line-height:1.5}.node-icon{width:44px;height:56px;background:var(--sage);color:var(--accent);border:1px solid var(--line);border-radius:12px;display:grid;place-items:center;flex:none}.hint{padding:16px;margin:0}</style>
