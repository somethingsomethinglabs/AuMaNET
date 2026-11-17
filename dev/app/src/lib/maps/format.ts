/** Portable raster pack: AUMAP001, uint32-be JSON length, UTF-8 manifest, ordered tile bytes. */
export const MAP_MAGIC = 'AUMAP001';
export const MAX_PACK_BYTES = 512 * 1024 * 1024;
export const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
export const MAX_TILE_BYTES = 512 * 1024;
export type MapTile = {z:number;x:number;y:number;bytes:number;sha256:string};
export type Position={latitude:number;longitude:number;accuracy:number;timestamp:number;mock?:boolean};
export type MapMember={id:string;name:string;fix?:Position;ageMs:number;connected:boolean;authorized:boolean;locationActive?:boolean};
export type OfflineMapManifest = {
  schema:'aumanet.offline-map.v1';id:string;title:string;bounds:[number,number,number,number];
  minZoom:number;maxZoom:number;tileSize:256;format:'image/png';
  source:{name:string;url:string;fileName:string;sha256:string;attribution:string;license:string;licenseUrl:string;dataDate:string;preparedAt:string;changes:string};
  tiles:MapTile[];
};
export type InstalledMap = {instanceId:string;manifest:OfflineMapManifest;bytes:number;installedAt:number;basePath?:string};
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('Invalid map metadata');return v as Record<string,unknown>;};
function text(v:unknown,max=400){if(typeof v!=='string'||!v.trim()||v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))throw new Error('Invalid map text');return v;}
function int(v:unknown,min:number,max:number){if(typeof v!=='number'||!Number.isSafeInteger(v)||v<min||v>max)throw new Error('Invalid map number');return v;}
function digest(v:unknown){if(typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v))throw new Error('Invalid map checksum');return v;}
function url(v:unknown){const s=text(v,2000),parsed=new URL(s);if(parsed.protocol!=='https:'||!parsed.hostname||parsed.username||parsed.password)throw new Error('Map source links must use HTTPS without credentials');return s;}
export function parseMapManifest(raw:unknown):OfflineMapManifest {
  const v=object(raw),s=object(v.source);
  if(v.schema!=='aumanet.offline-map.v1'||typeof v.id!=='string'||! /^[a-z0-9][a-z0-9-]{0,79}$/.test(v.id)||v.tileSize!==256||v.format!=='image/png')throw new Error('Unsupported map pack');
  const minZoom=int(v.minZoom,0,18),maxZoom=int(v.maxZoom,minZoom,18);
  if(!Array.isArray(v.bounds)||v.bounds.length!==4||!v.bounds.every(x=>typeof x==='number'&&Number.isFinite(x)))throw new Error('Invalid geographic bounds');
  const [w,south,e,n]=v.bounds as number[];
  if(w < -180||e>180||south < -85.05112878||n>85.05112878||w>=e||south>=n)throw new Error('Invalid geographic coverage');
  if(!Array.isArray(v.tiles)||v.tiles.length===0||v.tiles.length>8192)throw new Error('Map must contain 1–8192 tiles');
  const seen=new Set<string>();let total=0;
  const tiles=v.tiles.map(rawTile=>{const t=object(rawTile),z=int(t.z,minZoom,maxZoom),x=int(t.x,0,2**z-1),y=int(t.y,0,2**z-1),bytes=int(t.bytes,8,MAX_TILE_BYTES),sha256=digest(t.sha256),key=`${z}/${x}/${y}`;if(seen.has(key))throw new Error('Duplicate map tile');seen.add(key);total+=bytes;return{z,x,y,bytes,sha256};});
  if(total>MAX_PACK_BYTES)throw new Error('Map exceeds the 512 MiB pack limit');
  let expected=0;for(let z=minZoom;z<=maxZoom;z++){const size=2**z,x0=Math.floor((w+180)/360*size),x1=Math.min(size-1,Math.ceil((e+180)/360*size)-1),toY=(latitude:number)=>(1-Math.asinh(Math.tan(latitude*Math.PI/180))/Math.PI)/2*size,y0=Math.max(0,Math.floor(toY(n))),y1=Math.min(size-1,Math.ceil(toY(south))-1);expected+=(x1-x0+1)*(y1-y0+1);if(expected>8192)throw new Error('Map coverage exceeds the tile limit');for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)if(!seen.has(`${z}/${x}/${y}`))throw new Error('Map index is incomplete for its declared coverage');}if(expected!==tiles.length)throw new Error('Map contains tiles outside its declared coverage');
  return{schema:'aumanet.offline-map.v1',id:v.id,title:text(v.title,120),bounds:[w,south,e,n],minZoom,maxZoom,tileSize:256,format:'image/png',source:{name:text(s.name,120),url:url(s.url),fileName:text(s.fileName,240),sha256:digest(s.sha256),attribution:text(s.attribution,2000),license:text(s.license,160),licenseUrl:url(s.licenseUrl),dataDate:text(s.dataDate,80),preparedAt:text(s.preparedAt,80),changes:text(s.changes,2000)},tiles};
}
export async function readMapHeader(file:Blob){
  if(file.size<12||file.size>MAX_PACK_BYTES+MAX_MANIFEST_BYTES+12)throw new Error('Invalid map pack size');
  const header=new Uint8Array(await file.slice(0,12).arrayBuffer());
  if(new TextDecoder().decode(header.slice(0,8))!==MAP_MAGIC)throw new Error('Choose a prepared .aumanet-map file');
  const length=new DataView(header.buffer).getUint32(8,false);
  if(length<2||length>MAX_MANIFEST_BYTES||12+length>file.size)throw new Error('Invalid map header length');
  const manifest=parseMapManifest(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await file.slice(12,12+length).arrayBuffer())));
  const payload=manifest.tiles.reduce((n,t)=>n+t.bytes,0);
  if(12+length+payload!==file.size)throw new Error('Map pack is truncated or contains unexpected data');
  return{manifest,offset:12+length,payload};
}
export function mapContains(m:OfflineMapManifest,latitude:number,longitude:number){const[w,s,e,n]=m.bounds;return longitude>=w&&longitude<=e&&latitude>=s&&latitude<=n;}
export function tileKey(t:Pick<MapTile,'z'|'x'|'y'>){return`${t.z}/${t.x}/${t.y}`;}
