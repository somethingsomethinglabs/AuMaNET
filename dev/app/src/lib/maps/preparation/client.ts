import{Capacitor,registerPlugin}from'@capacitor/core';
import{NativePreparationController}from'./native-controller.mjs';
import type{PreparationPlugin,BinaryPreparationBridge}from'./types';
export function geoTiffPreparation(){
  const plugin=registerPlugin<PreparationPlugin>('AuMaNETGeoTiffPreparation');
  return{
    plugin,
    installed:()=>Capacitor.getPlatform()==='android'&&Capacitor.isPluginAvailable('AuMaNETGeoTiffPreparation'),
    controller:()=>{
      const binary=(window as unknown as{AuMaNETMapPreparationFiles?:BinaryPreparationBridge}).AuMaNETMapPreparationFiles;
      if(!binary)throw new Error('This Android WebView does not support local GeoTIFF preparation.');
      return new NativePreparationController({plugin,binary,convertFileSrc:Capacitor.convertFileSrc});
    }
  };
}
