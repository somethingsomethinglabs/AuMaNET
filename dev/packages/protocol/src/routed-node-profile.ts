/** Opt-in routed-LAN contract. No active firmware protocol is selected by import. */
export const ROUTED_NODE_GRANT_BYTES=128;
export const NODE_LAN_CLIENT_LIMIT=16;
export const NODE_LAN_CLAIM_LIMIT=256;
export const NODE_LAN_NODE_LIMIT=64;
export interface RoutedNodeGrantBody {
  readonly schema:'aumanet.routed-node-grant.v1';
  readonly groupId:string;readonly nodeId:string;readonly ownerSpkiSha256:string;
  readonly epoch:number;readonly allocationRevision:number;
  readonly pool:string;readonly subnetIndex:number;
  readonly dhcpFirstHost:number;readonly dhcpLastHost:number;
  readonly issuedAtMs:number;readonly admissionNotAfterMs:number;
  readonly state:'active'|'retired';
}
export interface RoutedNodeGrant {
  readonly schema:'aumanet.routed-node-grant-envelope.v1';
  readonly bodyHex:string;readonly signatureDerHex:string;
}
export interface NodeLanView {
  readonly subnet:string;readonly gateway:string;readonly dhcpFirst:string;readonly dhcpLast:string;readonly clientCapacity:number;
}
export interface NodeLanAllocationView extends NodeLanView {
  readonly groupId:string;readonly nodeId:string;readonly ownerSpkiSha256:string;readonly epoch:number;
  readonly allocationRevision:number;readonly verified:true;readonly persisted:true;
}
const magic=Uint8Array.of(65,85,76,65,78,49,0,0); // AULAN1 plus two NULs
const keys=['schema','groupId','nodeId','ownerSpkiSha256','epoch','allocationRevision','pool','subnetIndex',
  'dhcpFirstHost','dhcpLastHost','issuedAtMs','admissionNotAfterMs','state'];
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Expected routed node object');return value as Record<string,unknown>;}
export function routedId(value:unknown,bytes=16):value is string{return typeof value==='string'&&new RegExp(`^[a-f0-9]{${bytes*2}}$`).test(value)&&!/^0+$/.test(value);}
function integer(value:unknown,min:number,max=Number.MAX_SAFE_INTEGER):value is number{return typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max;}
export function ipv4Number(value:string):number {
  if(typeof value!=='string'||!/^\d{1,3}(\.\d{1,3}){3}$/.test(value))throw Error('Invalid canonical IPv4 address');
  const parts=value.split('.').map(Number);
  if(parts.some((n,i)=>n>255||String(n)!==value.split('.')[i]))throw Error('Invalid canonical IPv4 address');
  return parts.reduce((n,b)=>n*256+b,0);
}
export function ipv4Text(value:number):string {
  if(!integer(value,0,0xffffffff))throw Error('Invalid IPv4 number');
  return [24,16,8,0].map(shift=>Math.floor(value/2**shift)%256).join('.');
}
export function parseIpv4Network(value:string):{network:number;prefix:number;last:number} {
  if(typeof value!=='string')throw Error('Expected IPv4 network');const parts=value.split('/');
  if(parts.length!==2||!/^([0-9]|[12][0-9]|3[0-2])$/.test(parts[1]!))throw Error('Invalid IPv4 prefix');
  const prefix=Number(parts[1]),network=ipv4Number(parts[0]!),size=2**(32-prefix);
  if(network%size)throw Error('IPv4 network has host bits');return {network,prefix,last:network+size-1};
}
export function privateNodePool(value:string):number {
  const pool=parseIpv4Network(value),n=pool.network;
  if(pool.prefix!==16||!((n>=0x0a000000&&n<=0x0aff0000)||(n>=0xac100000&&n<=0xac1f0000)||n===0xc0a80000))throw Error('Node pool must be an explicit private /16');
  return n;
}
export function networksOverlap(a:string,b:string):boolean{const x=parseIpv4Network(a),y=parseIpv4Network(b);return x.network<=y.last&&y.network<=x.last;}
export function parseRoutedNodeGrantBody(value:unknown):RoutedNodeGrantBody {
  const v=record(value);
  if(Object.keys(v).length!==keys.length||Object.keys(v).some(k=>!keys.includes(k))||v.schema!=='aumanet.routed-node-grant.v1'||
    !routedId(v.groupId)||!routedId(v.nodeId)||!routedId(v.ownerSpkiSha256,32)||!integer(v.epoch,1)||!integer(v.allocationRevision,1)||
    typeof v.pool!=='string'||!integer(v.subnetIndex,1,254)||!integer(v.dhcpFirstHost,16,239)||!integer(v.dhcpLastHost,16,239)||
    v.dhcpLastHost-v.dhcpFirstHost+1<2||v.dhcpLastHost-v.dhcpFirstHost+1>NODE_LAN_CLIENT_LIMIT||
    !integer(v.issuedAtMs,1)||!integer(v.admissionNotAfterMs,1)||v.admissionNotAfterMs<=v.issuedAtMs||
    v.admissionNotAfterMs-v.issuedAtMs>86400000||v.state!=='active'&&v.state!=='retired')throw Error('Invalid routed node subnet grant');
  privateNodePool(v.pool);
  return {schema:'aumanet.routed-node-grant.v1',groupId:v.groupId,nodeId:v.nodeId,ownerSpkiSha256:v.ownerSpkiSha256,
    epoch:v.epoch,allocationRevision:v.allocationRevision,pool:v.pool,subnetIndex:v.subnetIndex,
    dhcpFirstHost:v.dhcpFirstHost,dhcpLastHost:v.dhcpLastHost,issuedAtMs:v.issuedAtMs,
    admissionNotAfterMs:v.admissionNotAfterMs,state:v.state as 'active'|'retired'};
}
export function routedHex(value:Uint8Array):string{return Array.from(value,b=>b.toString(16).padStart(2,'0')).join('');}
export function routedBytes(value:string):Uint8Array {
  if(typeof value!=='string'||value.length%2||!/^[a-f0-9]*$/.test(value))throw Error('Invalid canonical hex');
  return Uint8Array.from(value.match(/../g)??[],b=>parseInt(b,16));
}
function putSafe(view:DataView,offset:number,value:number){view.setBigUint64(offset,BigInt(value));}
function getSafe(view:DataView,offset:number):number{const n=view.getBigUint64(offset);if(n>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Unsafe grant integer');return Number(n);}
export function encodeRoutedNodeGrant(value:RoutedNodeGrantBody):Uint8Array {
  const body=parseRoutedNodeGrantBody(value),out=new Uint8Array(ROUTED_NODE_GRANT_BYTES),view=new DataView(out.buffer);
  out.set(magic);view.setUint16(8,1);view.setUint16(10,body.state==='retired'?1:0);
  out.set(routedBytes(body.groupId),12);out.set(routedBytes(body.nodeId),28);out.set(routedBytes(body.ownerSpkiSha256),44);
  putSafe(view,76,body.epoch);putSafe(view,84,body.allocationRevision);view.setUint32(92,privateNodePool(body.pool));
  out[96]=16;out[97]=body.subnetIndex;out[98]=24;out[99]=1;out[100]=body.dhcpFirstHost;out[101]=body.dhcpLastHost;
  putSafe(view,104,body.issuedAtMs);putSafe(view,112,body.admissionNotAfterMs);return out;
}
export function decodeRoutedNodeGrant(input:Uint8Array):RoutedNodeGrantBody {
  if(!(input instanceof Uint8Array)||input.length!==ROUTED_NODE_GRANT_BYTES)throw Error('Wrong routed grant size');
  const bytes=new Uint8Array(input),view=new DataView(bytes.buffer),flags=view.getUint16(10);
  if(magic.some((b,i)=>bytes[i]!==b)||view.getUint16(8)!==1||flags>1||bytes[96]!==16||bytes[98]!==24||bytes[99]!==1||
    bytes[102]!==0||bytes[103]!==0||bytes.slice(120).some(Boolean))throw Error('Noncanonical routed grant');
  const body=parseRoutedNodeGrantBody({schema:'aumanet.routed-node-grant.v1',groupId:routedHex(bytes.slice(12,28)),nodeId:routedHex(bytes.slice(28,44)),
    ownerSpkiSha256:routedHex(bytes.slice(44,76)),epoch:getSafe(view,76),allocationRevision:getSafe(view,84),pool:ipv4Text(view.getUint32(92))+'/16',
    subnetIndex:bytes[97],dhcpFirstHost:bytes[100],dhcpLastHost:bytes[101],issuedAtMs:getSafe(view,104),admissionNotAfterMs:getSafe(view,112),state:flags?'retired':'active'});
  if(routedHex(encodeRoutedNodeGrant(body))!==routedHex(bytes))throw Error('Noncanonical routed grant bytes');return body;
}
export function parseRoutedNodeGrant(value:unknown):RoutedNodeGrant {
  const v=record(value);
  if(Object.keys(v).length!==3||v.schema!=='aumanet.routed-node-grant-envelope.v1'||typeof v.bodyHex!=='string'||v.bodyHex.length!==256||
    typeof v.signatureDerHex!=='string'||v.signatureDerHex.length<16||v.signatureDerHex.length>144||v.signatureDerHex.length%2||!/^[a-f0-9]+$/.test(v.signatureDerHex))throw Error('Invalid routed grant envelope');
  decodeRoutedNodeGrant(routedBytes(v.bodyHex));
  return {schema:'aumanet.routed-node-grant-envelope.v1',bodyHex:v.bodyHex,signatureDerHex:v.signatureDerHex};
}
export function nodeLanView(value:RoutedNodeGrantBody):NodeLanView {
  const body=parseRoutedNodeGrantBody(value),base=privateNodePool(body.pool)+body.subnetIndex*256;
  return Object.freeze({subnet:ipv4Text(base)+'/24',gateway:ipv4Text(base+1),dhcpFirst:ipv4Text(base+body.dhcpFirstHost),
    dhcpLast:ipv4Text(base+body.dhcpLastHost),clientCapacity:body.dhcpLastHost-body.dhcpFirstHost+1});
}
/** Domain bytes are part of the fixed body; no JSON text or host byte order is signed. */
export const ROUTED_NODE_GRANT_DOMAIN='AULAN1\0\0';
