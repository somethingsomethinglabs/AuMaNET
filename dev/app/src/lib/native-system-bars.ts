import {Capacitor,registerPlugin} from '@capacitor/core';

interface DisplayBarsBridge {setSurface(options:{token:string;active:boolean;dark:boolean;operation:number}):Promise<unknown>;}
const bridge=registerPlugin<DisplayBarsBridge>('AuMaNETAppearance');
let lastOperation=0;
const nextOperation=()=>lastOperation=Math.max(Date.now()*1000,lastOperation+1);

/** Temporary photo-viewer contrast only. Never saves an appearance preference. */
export function holdDarkSystemBars():()=>void{
  if(!Capacitor.isNativePlatform())return()=>{};
  const token=crypto.randomUUID().replaceAll('-','');let active=true;
  void bridge.setSurface({token,active:true,dark:true,operation:nextOperation()}).catch(()=>{});
  return()=>{if(!active)return;active=false;void bridge.setSurface({token,active:false,dark:true,operation:nextOperation()}).catch(()=>{});};
}
