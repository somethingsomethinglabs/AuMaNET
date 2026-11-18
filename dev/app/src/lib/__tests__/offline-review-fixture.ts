// Passive synthetic storage for visual review, never imported by product code.
import {Capacitor,registerPlugin} from '@capacitor/core';
Capacitor.getPlatform=()=> 'android';
Capacitor.isNativePlatform=()=>false;
Capacitor.isPluginAvailable=name=>name==='AuMaNETVectorMaps';
registerPlugin('AuMaNETVectorMaps',{web:()=>({snapshot:async()=>({schema:'aumanet.vector-maps.v1',ready:true,job:null,regions:[{id:'a'.repeat(32),key:'synthetic-area',name:'Ridge walk',bounds:[145.5,-37.7,145.6,-37.6],bytes:14680064,installedAt:1794916800000,terrain:true,dataDate:'2026-11-14'}]})})});
await import('./brand-experience-fixture');
