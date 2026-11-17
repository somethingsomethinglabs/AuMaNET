// Synthetic native storage results only. No file, Android or network operations.
import {Capacitor,registerPlugin} from '@capacitor/core';
const fixture={mode:'saved',calls:[] as {json:string;acknowledgement:string}[]};
Object.assign(window,{__scenarioExportFixture:fixture});
registerPlugin('AuMaNETScenarioExport',{web:()=>({save:async(options:{json:string;acknowledgement:string})=>{
  fixture.calls.push(options);return {schema:'aumanet.scenario-save.v1',source:'device',saved:fixture.mode==='saved',collection:'downloads',displayName:'aumanet-bandwidth-scenario-12345678-1234-1234-1234-123456789abc.json',byteLength:new TextEncoder().encode(options.json).length};
}})});
const available=Capacitor.isPluginAvailable;
Capacitor.isNativePlatform=()=>true;Capacitor.isPluginAvailable=name=>name==='AuMaNETScenarioExport'||available(name);
