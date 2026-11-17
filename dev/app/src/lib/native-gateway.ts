import {Capacitor,registerPlugin} from '@capacitor/core';
import {GatewayDeveloperClient,type GatewayDeveloperBridge} from './gateway-developer';
export function nativeGatewayDeveloper(){
  if(Capacitor.getPlatform()!=='android'||!Capacitor.isPluginAvailable('AuMaNETGateway')||!Capacitor.isPluginAvailable('AuMaNETGroup'))return undefined;
  return new GatewayDeveloperClient(registerPlugin<GatewayDeveloperBridge>('AuMaNETGateway'),registerPlugin<{snapshot():Promise<unknown>}>('AuMaNETGroup'));
}
