import {Capacitor,registerPlugin} from '@capacitor/core';
import {TrustedConnectionClient,type TrustedConnectionBridge} from '@aumanet/core';
export function nativeTrustedConnection(){if(Capacitor.getPlatform()!=='android'||!Capacitor.isPluginAvailable('AuMaNETTrustedConnection'))return undefined;return new TrustedConnectionClient(registerPlugin<TrustedConnectionBridge>('AuMaNETTrustedConnection'));}
