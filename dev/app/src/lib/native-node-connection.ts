import {Capacitor,registerPlugin} from '@capacitor/core';
import {NodeConnectionClient,type NodeConnectionBridge} from './node-connection';
export function nativeNodeConnection(){
  if(Capacitor.getPlatform()!=='android'||!Capacitor.isPluginAvailable('AuMaNETNodeConnection'))return undefined;
  return new NodeConnectionClient(registerPlugin<NodeConnectionBridge>('AuMaNETNodeConnection'));
}
