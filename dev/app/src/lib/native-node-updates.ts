import {Capacitor,registerPlugin} from '@capacitor/core';
import {NativeNodeUpdatesClient,type NativeNodeUpdatesBridge} from '@aumanet/core';
export function nativeNodeUpdates(){return Capacitor.getPlatform()==='android'&&Capacitor.isPluginAvailable('AuMaNETNodeUpdates')?new NativeNodeUpdatesClient(registerPlugin<NativeNodeUpdatesBridge>('AuMaNETNodeUpdates')):undefined;}
