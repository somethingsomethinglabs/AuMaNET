import {Capacitor,registerPlugin} from '@capacitor/core';
import {NativeGroupMessagesClient,type NativeGroupMessagesBridge} from '@aumanet/core';
let client:NativeGroupMessagesClient|undefined;
export function nativeGroupMessages(){
  if(Capacitor.getPlatform()!=='android'||!Capacitor.isPluginAvailable('AuMaNETGroupMessages'))return undefined;
  return client??=new NativeGroupMessagesClient(registerPlugin<NativeGroupMessagesBridge>('AuMaNETGroupMessages'));
}
