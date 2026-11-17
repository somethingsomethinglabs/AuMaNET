import {Capacitor,registerPlugin} from '@capacitor/core';
import {NativeGatewayRadioSettingsClient,type NativeGatewayRadioSettingsBridge} from '@aumanet/core';
export function createNativeGatewayRadioSettingsClient(){return Capacitor.getPlatform()==='android'&&Capacitor.isPluginAvailable('AuMaNETRadioSettings')?new NativeGatewayRadioSettingsClient(registerPlugin<NativeGatewayRadioSettingsBridge>('AuMaNETRadioSettings')):undefined;}
