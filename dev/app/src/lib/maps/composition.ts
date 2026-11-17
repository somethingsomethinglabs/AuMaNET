import type {InstalledMap,OfflineMapManifest} from './format';

export const MAX_COMPOSED_REGIONS=4;
export type GeographicBounds=readonly[number,number,number,number];
export type MapViewportCoverage={coverageIds:string[];renderedIds:string[];zoom:number};
export function minimumDisplayZoom(manifest:OfflineMapManifest){return Math.max(2,manifest.minZoom-2);}
export function intersects(a:GeographicBounds,b:GeographicBounds){return a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];}

/** Bottom-to-top raster order. Changing focus never removes other installed sheets. */
export function composeInstalledMaps(regions:readonly InstalledMap[],focusId:string):InstalledMap[]{
  if(regions.length>MAX_COMPOSED_REGIONS)throw new Error('Offline rendering supports up to four installed map regions. Remove an extra region to continue.');
  if(new Set(regions.map(r=>r.instanceId)).size!==regions.length)throw new Error('Duplicate installed map identity');
  const ordered=[...regions].sort((a,b)=>a.installedAt-b.installedAt||a.instanceId.localeCompare(b.instanceId));
  const focus=ordered.find(r=>r.instanceId===focusId);
  return focus?[...ordered.filter(r=>r!==focus),focus]:ordered;
}

export function viewportCoverage(regions:readonly InstalledMap[],bounds:GeographicBounds,zoom:number):MapViewportCoverage{
  const covered=regions.filter(r=>intersects(r.manifest.bounds,bounds));
  return{coverageIds:covered.map(r=>r.instanceId),renderedIds:covered.filter(r=>zoom>=minimumDisplayZoom(r.manifest)&&zoom<=18).map(r=>r.instanceId),zoom};
}

/** Attribution follows every eligible sheet in view, including overlaps. */
export function visibleMapAttributions(regions:readonly InstalledMap[],ids:readonly string[]){
  const groups=new Map<string,{source:OfflineMapManifest['source'];titles:string[];instanceIds:string[]}>();
  for(const region of regions){
    if(!ids.includes(region.instanceId))continue;
    const source=region.manifest.source,key=JSON.stringify([source.name,source.url,source.attribution,source.license,source.licenseUrl]);
    let group=groups.get(key);if(!group){group={source,titles:[],instanceIds:[]};groups.set(key,group);}group.titles.push(region.manifest.title);group.instanceIds.push(region.instanceId);
  }
  return[...groups.values()];
}
