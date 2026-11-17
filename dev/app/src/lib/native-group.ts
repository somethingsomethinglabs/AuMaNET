import {Capacitor,registerPlugin} from '@capacitor/core';
import {NativeGroupClient,type NativeGroupBridge} from '@aumanet/core';
let client:NativeGroupClient|undefined;
export function nativeGroup(){if(Capacitor.getPlatform()!=='android'||!Capacitor.isPluginAvailable('AuMaNETGroup'))return undefined;return client??=new NativeGroupClient(registerPlugin<NativeGroupBridge>('AuMaNETGroup'));}
