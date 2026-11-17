import {Capacitor,registerPlugin} from '@capacitor/core';
import appPackage from '../../package.json';
import {DiagnosticsClient,type DiagnosticsBridge,type DiagnosticCapability} from './diagnostics';
const pluginNames:Record<DiagnosticCapability,string>={diagnostics:'AuMaNETDiagnostics',bluetooth:'BluetoothLe',group:'AuMaNETGroup',messages:'AuMaNETGroupMessages',voice:'AuMaNETVoiceLab',location:'AuMaNETLocation',offlineMaps:'AuMaNETOfflineMaps',mapPreparation:'AuMaNETGeoTiffPreparation'};
export function nativeDiagnostics(){
  const supported=Capacitor.getPlatform()==='android'&&Capacitor.isPluginAvailable(pluginNames.diagnostics);
  return new DiagnosticsClient({webVersion:appPackage.version,...(supported?{bridge:registerPlugin<DiagnosticsBridge>(pluginNames.diagnostics)}:{}),
    capabilities:()=>Object.fromEntries(Object.entries(pluginNames).map(([key,name])=>[key,Capacitor.isPluginAvailable(name)]))});
}
