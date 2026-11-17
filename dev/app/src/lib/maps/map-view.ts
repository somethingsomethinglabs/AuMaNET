import type {MapMember,Position} from './format';

export const FRESH_POSITION_MS=60_000;
export function validPosition(p:Position|undefined):p is Position {
  return !!p&&Number.isFinite(p.latitude)&&Math.abs(p.latitude)<=85.05112878&&Number.isFinite(p.longitude)&&Math.abs(p.longitude)<=180&&Number.isFinite(p.accuracy)&&p.accuracy>=0&&p.accuracy<=100_000;
}
const fresh=(age:number)=>Number.isFinite(age)&&age>=0&&age<=FRESH_POSITION_MS;
/** View framing uses current participating observations; stale markers remain inspectable. */
export function freshGroupPositions(fix:Position|undefined,ageMs:number,active:boolean,members:readonly MapMember[]):Position[] {
  const positions:Position[]=[];
  if(active&&fresh(ageMs)&&validPosition(fix))positions.push(fix);
  for(const member of members)if(member.authorized&&member.connected&&member.locationActive!==false&&fresh(member.ageMs)&&validPosition(member.fix))positions.push(member.fix);
  return positions;
}

/** A navigation may await its first fix, but a user's viewport always wins. */
export class MapNavigationView {
  private navigation:unknown;
  private pending=false;
  private coverageShown=false;
  navigate(token:unknown){if(this.navigation!==token){this.navigation=token;this.pending=true;this.coverageShown=false;}}
  interact(){this.pending=false;}
  next(hasFreshPositions:boolean,hasCoverage:boolean):'group'|'coverage'|undefined {
    if(!this.pending)return;
    if(hasFreshPositions){this.pending=false;return'group';}
    if(hasCoverage&&!this.coverageShown){this.coverageShown=true;return'coverage';}
  }
}
