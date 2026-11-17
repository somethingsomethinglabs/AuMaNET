import {Capacitor,registerPlugin} from '@capacitor/core';
import type {Position} from './format';
const location=registerPlugin<{currentPosition():Promise<Position>;cancelCurrentPosition():Promise<void>}>('AuMaNETLocation');
export async function currentMapPosition():Promise<Position>{
  if(Capacitor.getPlatform()==='android'&&Capacitor.isPluginAvailable('AuMaNETLocation'))return location.currentPosition();
  if(!navigator.geolocation)throw new Error('Current location is unavailable. Tap the map to choose a place.');
  return new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(value=>resolve({latitude:value.coords.latitude,longitude:value.coords.longitude,accuracy:value.coords.accuracy,timestamp:value.timestamp}),error=>reject(new Error(error.code===1?'Location permission was not allowed. Tap the map to choose a place.':'Could not get a location fix. Try outdoors, or tap the map to choose a place.')),{enableHighAccuracy:true,timeout:25000,maximumAge:0}));
}
export async function cancelMapPosition(){if(Capacitor.getPlatform()==='android'&&Capacitor.isPluginAvailable('AuMaNETLocation'))await location.cancelCurrentPosition();}
