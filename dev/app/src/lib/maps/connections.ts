import type {GroupSnapshot,RadioSignal} from '@aumanet/protocol';
import {radioSignalStrengthColor,radioSignalView,RADIO_READ_STALE_MS} from '@aumanet/core';
import type {Position} from './format';
import {validPosition,FRESH_POSITION_MS} from './map-view';

export const UNKNOWN_CONNECTION_COLOR='#7b8085';
export interface MapConnection {
  readonly id:string;
  readonly from:{readonly id:string;readonly name:string;readonly fix:Position};
  readonly to:{readonly id:string;readonly name:string;readonly fix:Position};
  readonly color:string;readonly dashed:boolean;
  readonly strength:string;readonly detail:string;
  readonly signal?:RadioSignal;
}
const fresh=(active:boolean,age:number)=>active&&Number.isFinite(age)&&age>=0&&age<=FRESH_POSITION_MS;
const pair=(signal:RadioSignal,a:string,b:string)=>signal.receiverPhoneId===a&&signal.transmitterPhoneId===b||signal.receiverPhoneId===b&&signal.transmitterPhoneId===a;

/** Current owner-star control connections, never an inferred radio mesh.
 * GPS coordinates identify endpoints only; they are never used to infer RF.
 * No bridge, permissions, storage or transport work occurs in this function. */
export function groupMapConnections(group:GroupSnapshot|undefined,fix:Position|undefined,ageMs:number,active:boolean,elapsedMs:number,unavailable=false):MapConnection[]{
  if(!group?.group||unavailable||!['hosting','connected'].includes(group.status))return[];
  const elapsed=Number.isFinite(elapsedMs)&&elapsedMs>=0?elapsedMs:Infinity;
  const scopeCurrent=elapsed<=RADIO_READ_STALE_MS;
  const positions=new Map(group.members.filter(member=>member.connected).flatMap(member=>{
    const self=member.id===group.identity.id,p=self?fix:member.fix;
    if(!validPosition(p))return[];
    return[[member.id,{id:member.id,name:self?'You':member.name,fix:p,current:fresh(self?active:member.sharingLocation,self?ageMs:(member.fix?.ageMs??Infinity)+elapsed)}] as const];
  }));
  const owner=positions.get(group.group.ownerId);if(!owner)return[];
  return group.members.filter(member=>member.connected&&member.id!==group.group!.ownerId).flatMap(member=>{
    const target=positions.get(member.id);if(!target)return[];
    const observations=(group.radioSignals??[]).filter(signal=>pair(signal,owner.id,target.id));
    // One directional SDK reading may be available while the reverse is unsupported.
    const signal=observations.find(value=>value.status==='available')??observations[0];
    const reading=signal?radioSignalView(signal,elapsed):undefined;
    const nodeName=(id:string|undefined)=>id===group.identity.id?'Your node':`${group.members.find(value=>value.id===id)?.name??'Connected phone'}’s node`;
    const color=signal&&scopeCurrent&&owner.current&&target.current?radioSignalStrengthColor(signal,elapsed):undefined;
    const strength=color?`${reading!.value} · Signal strength`:!scopeCurrent?'Stale group observation':!owner.current||!target.current?'Last-known positions':reading?.status==='stale'?'Stale signal report':signal?'Signal unavailable':'Signal not mapped to these phones';
    const detail=[strength,signal?`${reading!.direction}. Radio: ${nodeName(signal.transmitterPhoneId)} → ${nodeName(signal.receiverPhoneId)}. ${reading!.verification}. ${reading!.age}. RF sample age unknown. Phone association from checked group configuration.`:'No checked radio observation identifies this phone pair.',
      'Line shows a group connection, not a measured radio path.'].join(' ');
    return[{id:`${owner.id}:${target.id}`,from:owner,to:target,color:color??UNKNOWN_CONNECTION_COLOR,dashed:!color,strength,detail,...(signal?{signal}:{})}];
  });
}
