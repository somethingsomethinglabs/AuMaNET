import type {GroupSnapshot} from '@aumanet/protocol';
import type {MapMember} from './format';

/** Native ages are measured at snapshot time. Continue ageing cached observations
 * while the bridge is silent; device wall clocks are not comparable here. */
export function groupMapMembers(group:GroupSnapshot|undefined,elapsedSinceSnapshot:number,unavailable=false):MapMember[]{
  if(!group?.group)return [];
  const elapsed=Number.isFinite(elapsedSinceSnapshot)&&elapsedSinceSnapshot>=0?elapsedSinceSnapshot:Infinity;
  const live=!unavailable&&['hosting','connected'].includes(group.status);
  return group.members.filter(member=>member.id!==group.identity.id).map(member=>({
    id:member.id,name:member.name,fix:member.fix,authorized:true,
    ageMs:member.fix&&Number.isFinite(elapsed)?Math.min(Number.MAX_SAFE_INTEGER,member.fix.ageMs+elapsed):Infinity,
    connected:live&&member.connected,locationActive:live&&member.sharingLocation
  }));
}
