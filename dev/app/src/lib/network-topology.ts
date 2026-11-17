import type {GroupSnapshot,RadioSignal} from '@aumanet/protocol';
import {radioSignalView} from '@aumanet/core';
export type DeviceSelection={readonly kind:'phone'|'node';readonly id:string}|{readonly kind:'nodes';readonly id?:undefined};
export interface NetworkNode {
  readonly id:string;readonly name:string;readonly yours:boolean;
  readonly phones:readonly {id:string;name:string;connected:boolean;self:boolean}[];
  readonly signal?:RadioSignal;
  readonly signalLabel:string;readonly signalStale:boolean;
  readonly linkLabel:string;readonly receivingLabel:string;
}
/** A name opens only one exact checked assignment; ambiguous/unmapped stays a phone. */
export function mapNameSelection(nodes:readonly NetworkNode[],selfId:string,id:string):DeviceSelection{
  const phone=id==='self'?selfId:id,assigned=nodes.filter(node=>node.phones.some(member=>member.id===phone));
  return assigned.length===1?{kind:'node',id:assigned[0].id}:{kind:'phone',id:phone};
}
/** An inventory of nodes actually identified by checked reports. Configuration
 * phone assignments are not promoted into live OS attachment observations. */
export function networkNodes(group:GroupSnapshot|undefined,elapsedMs=0,unavailable=false):NetworkNode[]{
  if(!group?.group||unavailable)return[];
  const byId=new Map<string,{phoneId?:string;signal?:RadioSignal;conflict:boolean}>();
  for(const signal of group.radioSignals??[]){
    for(const[nodeId,phoneId]of[[signal.receiverNodeId,signal.receiverPhoneId],[signal.transmitterNodeId,signal.transmitterPhoneId]]){
      if(!nodeId)continue;
      const previous=byId.get(nodeId);
      const conflict=previous?.conflict===true||!!previous?.phoneId&&!!phoneId&&previous.phoneId!==phoneId;
      const nextSignal=signal.receiverNodeId===nodeId?signal:previous?.signal;
      byId.set(nodeId,{phoneId:conflict?undefined:phoneId??previous?.phoneId,signal:nextSignal,conflict});
    }
  }
  const active=['hosting','connected'].includes(group.status);
  const assigned=[...byId].sort(([a],[b])=>a.localeCompare(b)).map(([id,record],index)=>{
    const member=!record.conflict?group.members.find(value=>value.id===record.phoneId):undefined;
    const yours=!!member&&member.id===group.identity.id;
    return{id,name:yours?'Your node':member?`${member.name}’s node`:`Radio node ${index+1}`,yours,
      phones:member?[{id:member.id,name:yours?'You':member.name,connected:active&&member.connected,self:yours}]:[]};
  });
  return assigned.map(node=>{
    const observations=(group.radioSignals??[]).filter(signal=>signal.receiverNodeId===node.id||signal.transmitterNodeId===node.id);
    const signal=observations.find(value=>radioSignalView(value,elapsedMs).status==='available')??observations.find(value=>value.status==='available')??observations[0];
    const reading=signal?radioSignalView(signal,elapsedMs):undefined;
    const peerId=signal?(signal.receiverNodeId===node.id?signal.transmitterNodeId:signal.receiverNodeId):undefined;
    const peer=assigned.find(value=>value.id===peerId),receiver=assigned.find(value=>value.id===signal?.receiverNodeId);
    return{...node,signal,signalLabel:reading?.status==='available'&&active?reading.value:reading?.value&&signal?.status==='available'?`${reading.value} · Last known`:'Signal unavailable',signalStale:!active||!reading||reading.status!=='available',
      linkLabel:peer?`Link with ${peer.name}`:'Radio link',receivingLabel:receiver&&signal?.status==='available'?`Reading received at ${receiver.name}`:'No measurement available for this direction'};
  }).sort((a,b)=>Number(b.yours)-Number(a.yours)||a.name.localeCompare(b.name));
}
