<script lang="ts">
  import NativeLocationPanel from '../NativeLocationPanel.svelte';
  import '../appearance/theme.css';
  import type {NativeLocationClient,LocationSnapshot} from '@aumanet/core';
  let sharingEnabled=false,sharingAvailable=true,sourceError='',dark=false;
  let outcome='success',calls=0,pending:((failure?:boolean)=>void)|undefined;
  const state:LocationSnapshot={schema:'aumanet.location.v1',source:'device',processId:'12345678-1234-1234-1234-123456789abc',sequence:1,observedElapsedMs:0,active:false,status:'stopped',permission:'prompt',publication:'off',backgroundSharing:'off',message:'',error:''};
  const client={start:async()=>{},stop:async()=>{},clear:async()=>{},settings:async()=>{}} as unknown as NativeLocationClient;
  async function change(enabled:boolean){
    calls++;
    if(outcome==='failure')throw new Error('Location permission was denied. Open Android permissions and try again.');
    if(outcome==='pending')await new Promise<void>((resolve,reject)=>{pending=failure=>{pending=undefined;failure?reject(new Error('Sharing was cancelled.')):resolve();};});
    sharingEnabled=enabled;
  }
</script>
<div class="app-shell live-shell" class:dark>
  <main>
    <p>Isolated UI test fixture · No location or device access</p>
    <label>Command outcome <select bind:value={outcome}><option value="success">Success</option><option value="failure">Failure</option><option value="pending">Pending</option></select></label>
    <button onclick={()=>pending?.()}>Complete command</button>
    <button onclick={()=>pending?.(true)}>Reject command</button>
    <button onclick={()=>sharingAvailable=!sharingAvailable}>Toggle group availability</button>
    <button onclick={()=>sourceError=sourceError?'':'Location readback unavailable'}>Toggle location error</button>
    <button onclick={()=>dark=!dark}>Toggle dark theme</button>
    <p>Sharing commands: {calls}</p>
    <NativeLocationPanel {client} {state} {sourceError} {sharingEnabled} {sharingAvailable} onsharingchange={change}/>
    <label class="switch-row">Reference setting <input type="checkbox" aria-label="Reference setting"/></label>
    <label>Consent choice <input type="checkbox" aria-label="Consent choice"/></label>
  </main>
</div>
