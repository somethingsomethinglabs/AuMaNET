// Browser UI fixture only; does not emulate or accept native audio/DSP behavior.
import {mount,unmount} from 'svelte';
import NativeVoiceSettings from '../NativeVoiceSettings.svelte';
import '../../styles.css';
import type {NativeVoiceLabClient,VoiceLabSnapshot} from '@aumanet/core';
type Snapshot=VoiceLabSnapshot&{detectorSensitivity:number;detectorProfile:'low'|'balanced'|'high';detectorPreferenceNotice?:string};
const fresh=():Snapshot=>({joined:false,muted:true,detectorSensitivity:50,detectorProfile:'balanced'} as Snapshot);
const view=$state<{state:Snapshot;sourceError:string;sync:boolean}>({state:fresh(),sourceError:'',sync:true});
const calls:{method:string;sensitivity?:number}[]=[];
let component:ReturnType<typeof mount>|undefined,failSave=false,skipReadback=false;
function profile(value:number){return value<=33?'low':value<=66?'balanced':'high';}
const client={get state(){return view.state;},get synchronized(){return view.sync;},
  preferences:async({sensitivity}:{sensitivity:number})=>{calls.push({method:'preferences',sensitivity});if(failSave)throw new Error('Fixture native preference failure');if(!skipReadback)view.state={...view.state,muted:true,detectorSensitivity:sensitivity,detectorProfile:profile(sensitivity),detectorPreferenceNotice:''};return view.state;},
  refresh:async()=>{calls.push({method:'refresh'});view.sync=true;view.sourceError='';return view.state;}
} as unknown as NativeVoiceLabClient&{preferences(options:{sensitivity:number}):Promise<unknown>};
async function reset(joined=false){
  if(component)await unmount(component);calls.length=0;failSave=skipReadback=false;view.state={...fresh(),joined,muted:!joined};view.sync=true;view.sourceError='';
  document.body.innerHTML='<div class="app-shell"><main id="voice-settings-check"></main></div>';
  component=mount(NativeVoiceSettings,{target:document.getElementById('voice-settings-check')!,props:{client,get state(){return view.state;},get sourceError(){return view.sourceError;}}});
}
const fixture={reset,get calls(){return calls;},get state(){return view.state;},rejectSave(){failSave=true;},suppressReadback(){skipReadback=true;},loseState(){view.sync=false;view.sourceError='Fixture bridge unavailable';},
  repaired(){view.state={...view.state,detectorPreferenceNotice:'Saved sensitivity was invalid and reset to balanced (50).'};},async destroy(){if(component)await unmount(component);component=undefined;}};
Object.assign(window,{__voiceSettingsFixture:fixture});
await reset();
