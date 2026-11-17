/** Native own-location observations and explicit background-sharing ownership. No persistent track. */
export const LOCATION_SCHEMA = 'aumanet.location.v1';
/** Provisional display threshold, not an accuracy or transport guarantee. */
export const LOCATION_STALE_MS = 60_000;
export interface LocationFix {
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracy: number;
  readonly timestamp: number;
  readonly observedElapsedMs: number;
  readonly provider: string;
  readonly mock: boolean;
}
export interface LocationSnapshot {
  readonly schema: typeof LOCATION_SCHEMA;
  readonly source: 'device';
  readonly processId: string;
  readonly sequence: number;
  readonly observedElapsedMs: number;
  readonly active: boolean;
  readonly status: 'idle'|'acquiring'|'active'|'stopped'|'permission-denied'|'provider-disabled'|'unavailable';
  readonly permission: 'prompt'|'denied'|'approximate'|'precise';
  readonly publication: 'unavailable'|'off'|'starting'|'sharing';
  readonly ownership?: 'none'|'foreground'|'sharing';
  readonly backgroundSharing?: 'off'|'starting'|'active'|'interrupted';
  readonly message: string;
  readonly error: string;
  readonly fix?: LocationFix;
}
function object(value: unknown): Record<string,unknown> {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Expected a native location object');
  return value as Record<string,unknown>;
}
function uint(value: unknown): value is number {return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;}
function finite(value: unknown): value is number {return typeof value==='number'&&Number.isFinite(value);}
export function parseLocationSnapshot(raw: unknown): LocationSnapshot {
  const v=object(raw);
  if(v.schema!==LOCATION_SCHEMA||v.source!=='device'||typeof v.processId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v.processId))throw new Error('Invalid native location source');
  if(!uint(v.sequence)||!uint(v.observedElapsedMs)||typeof v.active!=='boolean')throw new Error('Invalid native location observation');
  if(!['idle','acquiring','active','stopped','permission-denied','provider-disabled','unavailable'].includes(String(v.status))||
     !['prompt','denied','approximate','precise'].includes(String(v.permission))||!['unavailable','off','starting','sharing'].includes(String(v.publication)))throw new Error('Unsupported location policy');
  if(v.ownership!==undefined&&!['none','foreground','sharing'].includes(String(v.ownership))||
     v.backgroundSharing!==undefined&&!['off','starting','active','interrupted'].includes(String(v.backgroundSharing)))throw new Error('Unsupported location ownership');
  if(v.publication==='sharing'&&(v.ownership!=='sharing'||v.backgroundSharing!=='active'||!['precise','approximate'].includes(String(v.permission))))throw new Error('Location publication has no authorized background owner');
  if(v.publication==='starting'&&v.backgroundSharing!=='starting'||v.backgroundSharing==='active'&&v.ownership!=='sharing'||
     v.ownership==='sharing'&&v.backgroundSharing!=='active')throw new Error('Inconsistent location sharing ownership');
  for(const key of ['message','error'])if(typeof v[key]!=='string'||v[key].length>240)throw new Error('Invalid location message');
  if(v.active&&(!['acquiring','active'].includes(String(v.status))||!['precise','approximate'].includes(String(v.permission))))throw new Error('Inconsistent active location state');
  if(!v.active&&['acquiring','active'].includes(String(v.status)))throw new Error('Inactive location is not observing');
  let fix: LocationFix|undefined;
  if(v.fix!==undefined) {
    const f=object(v.fix);
    if(!finite(f.latitude)||Math.abs(f.latitude)>90||!finite(f.longitude)||Math.abs(f.longitude)>180||!finite(f.accuracy)||f.accuracy<0||f.accuracy>40_100_000||
       !uint(f.timestamp)||!uint(f.observedElapsedMs)||f.observedElapsedMs>v.observedElapsedMs||typeof f.provider!=='string'||f.provider.length>40||typeof f.mock!=='boolean')throw new Error('Invalid observed location fix');
    if(v.permission==='denied'||v.permission==='prompt')throw new Error('Location retained without permission');
    fix={latitude:f.latitude,longitude:f.longitude,accuracy:f.accuracy,timestamp:f.timestamp,observedElapsedMs:f.observedElapsedMs,provider:f.provider,mock:f.mock};
  }
  if(v.status==='active'&&!fix)throw new Error('Active location has no actual fix');
  return {schema:LOCATION_SCHEMA,source:'device',processId:v.processId,sequence:v.sequence,observedElapsedMs:v.observedElapsedMs,active:v.active,
    status:v.status as LocationSnapshot['status'],permission:v.permission as LocationSnapshot['permission'],publication:v.publication as LocationSnapshot['publication'],
    ...(v.ownership!==undefined?{ownership:v.ownership as NonNullable<LocationSnapshot['ownership']>}:{}),
    ...(v.backgroundSharing!==undefined?{backgroundSharing:v.backgroundSharing as NonNullable<LocationSnapshot['backgroundSharing']>}:{}),
    message:v.message as string,error:v.error as string,...(fix?{fix}:{})};
}
/** Additional elapsed time is measured by the UI's monotonic clock since receipt. */
export function locationView(snapshot: LocationSnapshot|undefined, elapsedSinceSnapshotMs=0): {ageMs:number|undefined;freshness:'fresh'|'stale'|'unavailable'} {
  if(!snapshot?.fix)return {ageMs:undefined,freshness:'unavailable'};
  const ageMs=Math.max(0,snapshot.observedElapsedMs-snapshot.fix.observedElapsedMs)+Math.max(0,Number.isFinite(elapsedSinceSnapshotMs)?elapsedSinceSnapshotMs:0);
  return {ageMs,freshness:snapshot.active&&snapshot.status==='active'&&ageMs<=LOCATION_STALE_MS?'fresh':'stale'};
}
