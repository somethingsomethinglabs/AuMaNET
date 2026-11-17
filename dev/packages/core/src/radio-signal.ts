import type {RadioSignal,GroupSnapshot} from '@aumanet/protocol';
/** UI cache-read staleness only; this is NOT a physical RF sample freshness threshold. */
export const RADIO_READ_STALE_MS=30_000;
/** Illustrative RSSI color scale only. It is not calibrated link quality,
 * message delivery probability, range, or RF-sample freshness. */
export function radioSignalStrengthColor(signal:RadioSignal,elapsedSinceSnapshotMs=0):string|undefined{
  if(radioSignalView(signal,elapsedSinceSnapshotMs).status!=='available'||typeof signal.rssiDbm!=='number'||!Number.isInteger(signal.rssiDbm)||signal.rssiDbm< -127||signal.rssiDbm>=0)return;
  const amount=(Math.max(-100,Math.min(-40,signal.rssiDbm))+100)/60;
  const stops=[[200,60,50],[178,132,21],[36,132,71]] as const;
  const segment=amount<=.5?0:1,t=amount<=.5?amount*2:(amount-.5)*2;
  return'#'+stops[segment]!.map((value,index)=>Math.round(value+(stops[segment+1]![index]!-value)*t).toString(16).padStart(2,'0')).join('');
}
/** Same signed observation rebroadcast in a newer roster must never reset its read age. */
export function retainRadioReadAges(previous:GroupSnapshot|undefined,next:GroupSnapshot):GroupSnapshot{
  if(!previous||previous.processId!==next.processId||previous.identity.id!==next.identity.id||previous.group?.id!==next.group?.id||
    previous.group?.epoch!==next.group?.epoch||previous.group?.ownerId!==next.group?.ownerId||next.observedElapsedMs<previous.observedElapsedMs||!next.radioSignals)return next;
  const elapsed=next.observedElapsedMs-previous.observedElapsedMs;
  const radioSignals=next.radioSignals.map(signal=>{
    const old=previous.radioSignals?.find(old=>old.observationId===signal.observationId&&old.receiverNodeId===signal.receiverNodeId&&
      old.transmitterNodeId===signal.transmitterNodeId&&old.sourceRun===signal.sourceRun&&old.configRevision===signal.configRevision&&old.verification===signal.verification);
    if(!old)return signal;
    const age=old.readAgeMs+elapsed;if(!Number.isSafeInteger(age))throw new Error('Native radio read age overflow');
    const relayAge=old.relayAgeMs===undefined?undefined:old.relayAgeMs+elapsed;
    if(relayAge!==undefined&&!Number.isSafeInteger(relayAge))throw new Error('Native radio report age overflow');
    return{...signal,readAgeMs:Math.max(signal.readAgeMs,age),...(signal.verification==='owner-relayed'&&relayAge!==undefined?{relayAgeMs:Math.max(signal.relayAgeMs??0,relayAge)}:{})};
  });
  return{...next,radioSignals};
}
export function radioSignalView(signal:RadioSignal,elapsedSinceSnapshotMs=0){
  const relayed=signal.verification==='owner-relayed';
  const baseAge=relayed?signal.relayAgeMs:signal.readAgeMs;
  const validAge=Number.isFinite(elapsedSinceSnapshotMs)&&elapsedSinceSnapshotMs>=0&&typeof baseAge==='number'&&Number.isSafeInteger(baseAge)&&baseAge>=0&&
    baseAge+elapsedSinceSnapshotMs<=Number.MAX_SAFE_INTEGER;
  const ageMs=validAge?baseAge!+elapsedSinceSnapshotMs:undefined;
  const stale=signal.status==='available'&&(ageMs===undefined||ageMs>RADIO_READ_STALE_MS);
  const amount=ageMs===undefined?undefined:ageMs<60_000?`${relayed?Math.floor(ageMs/1000):Math.max(1,Math.ceil(ageMs/1000))} s`:
    ageMs<3_600_000?`${relayed?Math.floor(ageMs/60_000):Math.ceil(ageMs/60_000)} min`:`${relayed?Math.floor(ageMs/3_600_000):Math.ceil(ageMs/3_600_000)} h`;
  const age=amount===undefined?(relayed?'Owner report age unavailable':'Read age unavailable'):relayed?`Owner report received ${amount} ago`:`Read within last ${amount}`;
  const ageAtReceipt=amount===undefined?'Observation age at storage unavailable':relayed?`Report had been on this phone ${amount} when stored`:`Read within ${amount} before storage`;
  return{
    status:stale?'stale' as const:signal.status,
    value:signal.status==='available'&&signal.rssiDbm!==undefined?`${String(signal.rssiDbm).replace('-','−')} dBm`:signal.status==='unsupported'?'Not supported':'Unavailable',
    direction:signal.direction==='ap-to-station'?'AP → station':'Station → AP',
    source:'HaLow · Last known AP signal',
    verification:signal.verification==='pinned-node'?'Pinned node report verified on this phone':'Authenticated owner-relayed report',
    ...(relayed?{relayAgeMs:ageMs}:{readAgeMs:ageMs}),age,ageAtReceipt,sampleAge:'RF sample age unknown',
    note:signal.status==='unsupported'?'This radio does not provide the reverse-direction measurement.':
      'The radio reports its cached association reading. This is not the signal of an individual message.',
  };
}
