import {mount,unmount} from 'svelte';
import DiagnosticsSettings from '../DiagnosticsSettings.svelte';
import {DiagnosticsClient,type DiagnosticExportBridge} from '../diagnostics';
import '../../styles.css';
import '../appearance/theme.css';

declare global {interface Window {__diagnosticExportFixture:ReturnType<typeof fixture>;}}
function fixture(){
  const calls:{json:string;acknowledgement:string}[]=[];let complete:((fail?:boolean)=>void)|undefined;
  const bridge:DiagnosticExportBridge={save:options=>{calls.push(options);return new Promise((resolve,reject)=>{complete=fail=>{complete=undefined;if(fail)reject(Error('PRIVATE_PROVIDER_PATH'));else resolve({schema:'aumanet.diagnostics-save.v1',source:'device',saved:true,collection:'downloads',displayName:'aumanet-diagnostics-12345678-1234-1234-1234-123456789abc.json',byteLength:new TextEncoder().encode(options.json).length});};});}};
  const host=document.createElement('main');document.body.replaceChildren(host);
  const client=new DiagnosticsClient({webVersion:'0.0.0',evidence:'fixture'});
  const mounted=mount(DiagnosticsSettings,{target:host,props:{client,evidence:'fixture',exportBridge:bridge}});
  return {calls,finish:(fail=false)=>complete?.(fail),destroy:async()=>{await unmount(mounted);host.remove();}};
}
window.__diagnosticExportFixture=fixture();
