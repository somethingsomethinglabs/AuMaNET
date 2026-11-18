import {Capacitor,registerPlugin} from '@capacitor/core';
import {AppearanceClient,type AppearanceBridge} from './appearance/preferences';
import {BrowserAppearanceBridge} from './appearance/browser';
export {AppearanceClient,type AppearanceState,type Theme,type Units} from './appearance/preferences';
let bridge:AppearanceBridge|undefined;
function storage(){
  if(bridge)return bridge;
  if(Capacitor.getPlatform()==='android'){
    if(!Capacitor.isPluginAvailable('AuMaNETAppearance'))throw Error('Appearance storage is unavailable in this app build');
    return bridge=registerPlugin<AppearanceBridge>('AuMaNETAppearance');
  }
  return bridge=new BrowserAppearanceBridge(()=>window.localStorage);
}
/** Importing/subscribing does not start native sessions or request permissions. Parent calls load on mount. */
declare global {interface Window {__aumanetBootAppearance?:'Light'|'Dark';}}
const device=Capacitor.getPlatform()==='android';
export const appearance=new AppearanceClient(storage,device?'device':'browser',device&&typeof window!=='undefined'&&window.__aumanetBootAppearance==='Dark'?'Dark':'Light');
