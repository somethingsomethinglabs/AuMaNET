export type GeoTiffSource={sourceId:string;fileName:string;bytes:number;sha256:string;url:string};
export type SourceAttribution={name:string;url:string;attribution:string;license:string;licenseUrl:string;dataDate:string};
export type PreparationOptions={id:string;title:string;source:SourceAttribution};
export type PreparationMetrics={sourceReadCalls:number;sourceRequestedBytes:number;maxSourceRangeBytes:number;maxRasterBandBytes:number;maxEncodedTileBytes:number;outputBytes:number};
export type PreparationProgress={kind:'plan'|'progress'|'complete'|'error'|'cancelled';completed?:number;total?:number;message?:string;metrics?:PreparationMetrics;result?:{instanceId:string};elapsedMs?:number};
export type PreparationResult=PreparationProgress&{kind:'complete';result:{instanceId:string};metrics:PreparationMetrics;elapsedMs:number};
export interface PreparationPlugin{
  snapshot():Promise<{available:boolean;phase:string;error:string}>;
  chooseSource():Promise<GeoTiffSource|{cancelled:true}>;
  begin(options:{sourceId:string;id:string;title:string;source:SourceAttribution;mercatorBounds:number[];minZoom:number;maxZoom:number}):Promise<{sessionId:string;total:number;payloadLimitBytes:number}>;
  childPath(options:{sessionId:string;z:number;x:number;y:number}):Promise<{url:string}>;
  finish(options:{sessionId:string}):Promise<{instanceId:string}>;
  cancel():Promise<void>;
}
export type BinaryPreparationBridge={postMessage(frame:ArrayBuffer):void;onmessage:((event:{data:string})=>void)|null};
