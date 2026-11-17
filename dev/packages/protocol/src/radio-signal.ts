/** A native-verified association statistic, never an exact message/packet RSSI. */
export interface RadioSignal {
  readonly status:'available'|'unavailable'|'unsupported';
  readonly authenticated:true;
  readonly receiverNodeId:string;readonly transmitterNodeId:string;readonly sourceRun:string;
  /** Phone association from checked group configuration, not from the node signature. */
  readonly receiverPhoneId?:string;readonly transmitterPhoneId?:string;
  readonly observationId:string;
  readonly direction:'ap-to-station'|'station-to-ap';
  readonly verification:'pinned-node'|'owner-relayed';
  readonly rssiDbm?:number;
  readonly kind:'associated-ap-last-known';
  /** Direct query-send upper bound. On relayed evidence this owner-local estimate must not be treated as a cross-phone age bound. */
  readonly readAgeMs:number;readonly sampleAgeKnown:false;
  /** Required on owner-relayed evidence: residence on this phone since first receipt of observationId. */
  readonly relayAgeMs?:number;
  readonly observedElapsedMs:number;readonly configRevision:number;
}
const uint=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const id=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);
const phone=(value:unknown):value is string=>typeof value==='string'&&/^[A-F0-9]{64}$/.test(value);
export function parseRadioSignals(raw:unknown,maximumObservedElapsedMs?:number):readonly RadioSignal[]{
  if(maximumObservedElapsedMs!==undefined&&!uint(maximumObservedElapsedMs))throw new Error('Invalid native radio observation clock');
  if(!Array.isArray(raw)||raw.length>2)throw new Error('Invalid bounded native radio observations');
  const signals=raw.map(value=>{
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid native radio observation');
    const v=value as Record<string,unknown>;
    if(!['available','unavailable','unsupported'].includes(String(v.status))||v.authenticated!==true||
      !id(v.receiverNodeId)||!id(v.transmitterNodeId)||v.receiverNodeId===v.transmitterNodeId||!id(v.sourceRun)||typeof v.observationId!=='string'||!/^[A-F0-9]{64}$/.test(v.observationId)||
      !['ap-to-station','station-to-ap'].includes(String(v.direction))||!['pinned-node','owner-relayed'].includes(String(v.verification))||
      v.kind!=='associated-ap-last-known'||v.sampleAgeKnown!==false||!uint(v.readAgeMs)||!uint(v.observedElapsedMs)||
      maximumObservedElapsedMs!==undefined&&v.observedElapsedMs>maximumObservedElapsedMs||!uint(v.configRevision)||v.configRevision<1)
      throw new Error('Invalid native radio evidence');
    if(v.relayAgeMs!==undefined&&!uint(v.relayAgeMs)||v.verification==='owner-relayed'&&!uint(v.relayAgeMs))throw new Error('Invalid local radio report age');
    const mapped=v.receiverPhoneId!==undefined||v.transmitterPhoneId!==undefined;
    if(mapped&&(!phone(v.receiverPhoneId)||!phone(v.transmitterPhoneId)||v.receiverPhoneId===v.transmitterPhoneId))throw new Error('Invalid checked radio phone association');
    const available=v.status==='available';
    // SDK zero is an uninitialized cache, not a usable RF reading. AP-side reading is unsupported.
    if(available?(typeof v.rssiDbm!=='number'||!Number.isInteger(v.rssiDbm)||v.rssiDbm< -127||v.rssiDbm>=0||v.direction!=='ap-to-station'):
      v.rssiDbm!==undefined)throw new Error('Invalid native HaLow RSSI');
    return{status:v.status as RadioSignal['status'],authenticated:true as const,receiverNodeId:v.receiverNodeId,transmitterNodeId:v.transmitterNodeId,sourceRun:v.sourceRun,observationId:v.observationId,
      direction:v.direction as RadioSignal['direction'],verification:v.verification as RadioSignal['verification'],...(available?{rssiDbm:v.rssiDbm as number}:{}),
      ...(mapped?{receiverPhoneId:v.receiverPhoneId as string,transmitterPhoneId:v.transmitterPhoneId as string}:{}),
      kind:'associated-ap-last-known' as const,readAgeMs:v.readAgeMs,...(v.relayAgeMs!==undefined?{relayAgeMs:v.relayAgeMs as number}:{}),sampleAgeKnown:false as const,observedElapsedMs:v.observedElapsedMs,configRevision:v.configRevision};
  });
  if(new Set(signals.map(signal=>signal.receiverNodeId)).size!==signals.length)throw new Error('Duplicate receiving radio');
  if(signals.length===2){const [a,b]=signals;if(a!.receiverNodeId!==b!.transmitterNodeId||a!.transmitterNodeId!==b!.receiverNodeId||a!.direction===b!.direction||a!.configRevision!==b!.configRevision||a!.receiverPhoneId!==b!.transmitterPhoneId||a!.transmitterPhoneId!==b!.receiverPhoneId)throw new Error('Inconsistent native radio pair');}
  return signals;
}
