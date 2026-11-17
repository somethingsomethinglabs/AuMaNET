<script lang="ts">
  import {Router,Smartphone,ChevronRight} from '@lucide/svelte';
  import type {NetworkNode,DeviceSelection} from './network-topology';
  export let nodes:readonly NetworkNode[]=[];
  export let onselect:(selection:DeviceSelection)=>void;
</script>
<div class="node-list">
  
  {#each nodes as node(node.id)}<article class="known-node"><button class="node-summary" onclick={()=>onselect({kind:'node',id:node.id})}><Router size={27}/><span><strong>{node.name}</strong><small>{node.linkLabel} · {node.signalLabel}</small></span><ChevronRight size={18}/></button>
    {#each node.phones as phone}<button class="assigned-phone" onclick={()=>onselect({kind:'phone',id:phone.id})}><Smartphone size={17}/><span>{phone.name}<small class="phone-status" class:connected={phone.connected}><i aria-hidden="true"></i>{phone.connected?'Connected to group':'Not connected to group'}</small></span><ChevronRight size={16}/></button>{:else}<p class="hint unassigned">Phone assignment unavailable</p>{/each}
  </article>{:else}<p class="hint">No nodes have been identified yet. Connect to your group and check your node connection.</p>{/each}
</div>
<style>.node-list{min-width:0}.hint{font-size:12px;line-height:1.6;color:var(--muted)}.known-node{border:1px solid var(--line);border-radius:15px;margin:12px 0;overflow:hidden;background:var(--card)}.node-summary,.assigned-phone{display:flex;align-items:center;gap:10px;width:100%;min-height:54px;padding:12px 14px;text-align:left;border:0;background:transparent;color:inherit}.node-summary>span,.assigned-phone>span{flex:1;min-width:0;overflow-wrap:anywhere}.node-summary strong{font-size:14px}.node-summary small,.assigned-phone small{display:block;font-size:11px;color:var(--muted);margin-top:4px;line-height:1.5}.assigned-phone{padding:10px 14px 10px 30px;min-height:48px;font-size:13px;border-top:1px dashed var(--line)}.unassigned{padding:0 14px}.node-summary:focus-visible,.assigned-phone:focus-visible{outline:3px solid #ad6b20;outline-offset:-3px}.assigned-phone .phone-status{display:flex;align-items:center;gap:6px;color:#bb3d38}.assigned-phone .phone-status.connected{color:#367b3e}.phone-status i{width:6px;height:6px;border-radius:50%;background:currentColor;flex-shrink:0}:global(.dark) .assigned-phone .phone-status{color:#ff9d95}:global(.dark) .assigned-phone .phone-status.connected{color:#a5d88b}</style>
