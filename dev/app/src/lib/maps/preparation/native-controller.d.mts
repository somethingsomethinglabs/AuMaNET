import type {GeoTiffSource,PreparationOptions,PreparationProgress,PreparationResult,PreparationPlugin,BinaryPreparationBridge} from './types';
/** Typed public boundary for the separately contract-tested JavaScript worker runtime. */
export class NativePreparationController{
  constructor(options:{plugin:PreparationPlugin;binary:BinaryPreparationBridge;convertFileSrc:(path:string)=>string});
  run(source:GeoTiffSource,options:PreparationOptions,onProgress?:(progress:PreparationProgress)=>void):Promise<PreparationResult>;
  cancel():Promise<void>;
}
