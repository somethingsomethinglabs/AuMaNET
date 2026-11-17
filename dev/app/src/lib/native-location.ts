import {Capacitor,registerPlugin} from '@capacitor/core';
import {NativeLocationClient,type NativeLocationBridge} from '@aumanet/core';
let client:NativeLocationClient|undefined;
export function nativeLocation(){
  if(Capacitor.getPlatform()!=='android'||!Capacitor.isPluginAvailable('AuMaNETLocation'))return undefined;
  return client??=new NativeLocationClient(registerPlugin<NativeLocationBridge>('AuMaNETLocation'));
}
