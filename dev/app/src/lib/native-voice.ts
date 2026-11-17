import {Capacitor,registerPlugin} from '@capacitor/core';
import {NativeVoiceLabClient,type NativeVoiceLabBridge} from '@aumanet/core';
let client:NativeVoiceLabClient|undefined;
export function nativeVoiceLab() {
  if(Capacitor.getPlatform()!=='android'||!Capacitor.isPluginAvailable('AuMaNETVoiceLab'))return undefined;
  return client??=new NativeVoiceLabClient(registerPlugin<NativeVoiceLabBridge>('AuMaNETVoiceLab'));
}
