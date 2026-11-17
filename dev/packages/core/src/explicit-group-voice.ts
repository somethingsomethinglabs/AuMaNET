import type {GroupSnapshot} from '@aumanet/protocol';
import type {TrustedConnectionClient} from './trusted-connection.js';

/** One explicit gesture, one owner. Observation failures and uncertain native
 * commands never fall through into a second call/start path. */
export async function joinGroupVoiceExplicit(current:()=>GroupSnapshot|undefined,trusted:TrustedConnectionClient|undefined,ordinaryJoin:()=>Promise<unknown>):Promise<void>{
  const requested=current();
  if(!requested?.group||requested.error||!['hosting','connected'].includes(requested.status))throw new Error('Connect to your group before joining voice.');
  const scope={groupId:requested.group.id,selfId:requested.identity.id},epoch=requested.group.epoch,process=requested.processId;
  const unchanged=()=>{const now=current();return !!now&&!now.error&&['hosting','connected'].includes(now.status)&&now.processId===process&&now.identity.id===scope.selfId&&now.group?.id===scope.groupId&&now.group.epoch===epoch;};
  if(trusted&&await trusted.joinVoiceMuted(scope,unchanged))return;
  if(!unchanged())throw new Error('The group changed while joining voice. Join again explicitly.');
  await ordinaryJoin();
}
