import type {MapBounds} from './vector/downloads';

/** Every strip of the viewport must be covered; corners alone miss gaps between packs. */
export function viewportCovered(view:MapBounds,areas:readonly MapBounds[]):boolean {
  const [west,south,east,north]=view;
  if(!view.every(Number.isFinite)||west>=east||south>=north)return false;
  const clipped=areas.map(([w,s,e,n])=>[Math.max(w,west),Math.max(s,south),Math.min(e,east),Math.min(n,north)] as MapBounds).filter(([w,s,e,n])=>w<e&&s<n);
  const edges=[...new Set([west,east,...clipped.flatMap(([w,,e])=>[w,e])])].sort((a,b)=>a-b);
  for(let i=1;i<edges.length;i++){
    const x=(edges[i-1]+edges[i])/2;
    const spans=clipped.filter(([w,,e])=>w<=x&&e>=x).map(([,s,,n])=>[s,n]).sort((a,b)=>a[0]-b[0]);
    let reached=south;
    for(const [s,n] of spans){if(s>reached)return false;reached=Math.max(reached,n);}
    if(reached<north)return false;
  }
  return true;
}

export function offlineCoverageLabel(view:MapBounds,areas:readonly MapBounds[],name?:string):string {
  const covered=viewportCovered(view,areas);
  if(!covered)return name==='Outdoor map'?'Outdoor map · Partial offline coverage':'Saved maps · Partial offline coverage';
  return name==='Outdoor map'?'Offline outdoor map':name?'Offline · '+name:'Offline · Saved maps';
}
