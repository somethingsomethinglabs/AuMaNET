import {Capacitor,registerPlugin} from '@capacitor/core';
import {InternetSharingClient,type InternetBridge} from './internet-sharing/client';
export function nativeInternetSharing(){
  if(Capacitor.getPlatform()!=='android'||!Capacitor.isPluginAvailable('InternetSharing'))return undefined;
  return new InternetSharingClient(registerPlugin<InternetBridge>('InternetSharing'));
}
