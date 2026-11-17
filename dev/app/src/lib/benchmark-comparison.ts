import {GATEWAY_RADIO_OPTIONS,GATEWAY_RADIO_REPORT_FRESH_MS,type LinkBenchmarkResult,type LinkBenchmarkObservations,type RadioSignal} from '@aumanet/protocol';
import {radioSettingLabel} from './radio-settings-view';
export type ObservationBoundary='start'|'end';
export type ComparisonAxis='distance'|'signal';
type Observations=LinkBenchmarkObservations;
export type ComparedBenchmark=LinkBenchmarkResult;
export interface ComparisonRow{readonly result:ComparedBenchmark;readonly number:number;readonly observations?:Observations;readonly signal?:RadioSignal;readonly distance?:number;readonly uncertainDistance:boolean;readonly configuration:string;}
export function recordedRadioSetting(result:ComparedBenchmark,boundary:ObservationBoundary):string|undefined{
  const reports=(boundary==='start'?result.observationsAtStart:result.observationsAtEnd)?.radioConfigurations;
  if(!reports?.length)return undefined;
  const qualifiers:string[]=[];
  if(reports.some(report=>report.reportAgeMs>=GATEWAY_RADIO_REPORT_FRESH_MS))qualifiers.push('Last reported');
  if(reports.some(report=>report.status!=='idle'))qualifiers.push('In transition');
  const label=(value:string)=>[...qualifiers,value].join(' · ');
  if(reports.some(report=>report.role==='station'&&!report.associated))return label('Following node not associated');
  if(reports.some(report=>report.role==='ap'&&!report.associated))return label('Main node not associated');
  if(reports.length!==2||reports.some(report=>report.catalogVersion!==1||report.actualOptionId===0))return label('Not verified on both nodes');
  if(reports[0].actualOptionId!==reports[1].actualOptionId)return label('Mixed node settings');
  const option=GATEWAY_RADIO_OPTIONS.find(option=>option.id===reports[0].actualOptionId);if(!option)return label('Not recorded');
  return label(radioSettingLabel(option));
}
/** Use the explicitly recorded boundary. A missing end must never borrow a
 * start/current reading. Legacy records without boundary metadata stay unknown. */
export function comparisonRows(results:readonly ComparedBenchmark[],boundary:ObservationBoundary,configuration:(result:ComparedBenchmark,boundary:ObservationBoundary)=>string|undefined=recordedRadioSetting):ComparisonRow[]{
  return results.slice(-100).map((result,index)=>{
    const observations=boundary==='start'?result.observationsAtStart:result.observationsAtEnd;
    const signal=observations?.radioSignals.find(signal=>signal.status==='available'&&result.selfId&&result.peerId&&((signal.receiverPhoneId===result.selfId&&signal.transmitterPhoneId===result.peerId)||(signal.receiverPhoneId===result.peerId&&signal.transmitterPhoneId===result.selfId)));
    const positions=observations?.positions,measured=observations?.phoneSeparationMeters;
    const distance=typeof measured==='number'&&Number.isFinite(measured)&&measured>=0&&positions?.own&&positions.peer&&!positions.own.mock&&!positions.peer.mock?measured:undefined;
    return{result,number:index+1,observations,signal,distance,uncertainDistance:distance!==undefined&&!!positions&&(positions.own!.accuracy>distance||positions.peer!.accuracy>distance),configuration:configuration(result,boundary)??'Not recorded'};
  });
}
export interface ComparisonPoint{readonly id:string;readonly number:number;readonly direction:'Upload'|'Download';readonly x:number;readonly bitsPerSecond:number;readonly uncertainDistance:boolean;readonly row:ComparisonRow;}
export function comparisonPoints(rows:readonly ComparisonRow[],axis:ComparisonAxis):ComparisonPoint[]{
  const points:ComparisonPoint[]=[];
  for(const row of rows){
    if(row.result.status!=='complete')continue;
    const x=axis==='distance'?row.distance:row.signal?.rssiDbm;
    if(x===undefined)continue;
    for(const[direction,measurement]of[['Upload',row.result.upload],['Download',row.result.download]] as const)if(measurement.complete)points.push({id:row.result.id+direction,number:row.number,direction,x,bitsPerSecond:measurement.goodputBitsPerSecond,uncertainDistance:axis==='distance'&&row.uncertainDistance,row});
  }
  return points;
}
export function comparisonScale(points:readonly ComparisonPoint[],axis:ComparisonAxis){
  const xs=points.map(p=>p.x),rates=points.map(p=>p.bitsPerSecond),maxRate=Math.max(0,...rates),unit=maxRate>=1e6?'Mbps':'kbps',divisor=unit==='Mbps'?1e6:1000;
  let minX=axis==='distance'?0:Math.min(...xs),maxX=Math.max(...xs);
  if(!points.length){minX=0;maxX=1;}else if(maxX<=minX){minX=axis==='distance'?0:minX-1;maxX=Math.max(maxX,minX+1);}
  return{minX,maxX:axis==='distance'?Math.max(1,maxX*1.05):maxX+1,maxY:Math.max(maxRate/divisor*1.12,0.1),unit,divisor};
}
