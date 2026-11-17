const KEY='aumanet.map-layers.v1';
/** Visibility only; this never changes installed files, permissions or location consent. */
export function readHiddenMaps(storage:Pick<Storage,'getItem'>|undefined):string[]{
  try{const raw=storage?.getItem(KEY);if(!raw||raw.length>4096)return[];const v=JSON.parse(raw);return v.schema===KEY&&Array.isArray(v.hidden)&&v.hidden.length<=16&&v.hidden.every((id:unknown)=>typeof id==='string'&&id.length>0&&id.length<=160)?[...new Set<string>(v.hidden)]:[];}catch{return[];}
}
export function saveHiddenMaps(storage:Pick<Storage,'setItem'>|undefined,hidden:readonly string[]){try{storage?.setItem(KEY,JSON.stringify({schema:KEY,hidden:hidden.slice(0,16)}));}catch{/* A storage restriction leaves this view's choice in memory. */}}
