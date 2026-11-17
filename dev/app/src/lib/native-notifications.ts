import {Capacitor,registerPlugin} from '@capacitor/core';
import {NotificationClient,type NotificationBridge} from './notifications/preferences';
export {NotificationClient,type NotificationState} from './notifications/preferences';
let client:NotificationClient|undefined;
export function nativeNotifications(){
  if(Capacitor.getPlatform()!=='android'||!Capacitor.isPluginAvailable('AuMaNETNotifications'))return undefined;
  return client??=new NotificationClient(registerPlugin<NotificationBridge>('AuMaNETNotifications'));
}
