import type {Units} from './preferences';
/** GPS accuracy stays a linear reported radius; unit choice never changes coordinates or circle geometry. */
export function formatAccuracy(metres:number,units:Units='Metric'):string{
  if(!Number.isFinite(metres)||metres<0)return 'Unavailable';
  const value=units==='Imperial'?metres/0.3048:metres,label=units==='Imperial'?'ft':'m';
  // Do not round a positive sub-unit estimate down to a misleading zero radius.
  return value>0&&value<1?`<1 ${label}`:`${Math.round(value)} ${label}`;
}
export function formatDistance(metres:number,units:Units='Metric'):string{
  if(!Number.isFinite(metres)||metres<0)return 'Unavailable';
  if(units==='Imperial'&&metres>=1609.344)return `${(metres/1609.344).toFixed(1)} mi`;
  if(units==='Metric'&&metres>=1000)return `${(metres/1000).toFixed(1)} km`;
  return formatAccuracy(metres,units);
}
/** Great-circle estimate between actual fixes, not a walking/driving route. */
export function straightLineDistance(a:{latitude:number;longitude:number},b:{latitude:number;longitude:number}):number{
  if(![a.latitude,a.longitude,b.latitude,b.longitude].every(Number.isFinite)||Math.abs(a.latitude)>90||Math.abs(b.latitude)>90||Math.abs(a.longitude)>180||Math.abs(b.longitude)>180)return NaN;
  const radians=Math.PI/180,dLat=(b.latitude-a.latitude)*radians,dLon=(b.longitude-a.longitude)*radians;
  const h=Math.sin(dLat/2)**2+Math.cos(a.latitude*radians)*Math.cos(b.latitude*radians)*Math.sin(dLon/2)**2;
  return 6371008.8*2*Math.asin(Math.sqrt(Math.min(1,Math.max(0,h))));
}
