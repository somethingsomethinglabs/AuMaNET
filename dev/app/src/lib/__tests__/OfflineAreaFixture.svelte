<script lang="ts">
  import MapPanel from '../MapPanel.svelte';
  import {vectorMapsClient,type VectorState,type DownloadRequest} from '../maps/vector/downloads';
  let state:VectorState={schema:'aumanet.vector-maps.v1',ready:true,regions:[],job:null};
  const calls:Array<{method:string;request?:unknown}>=[];
  const bridge={async snapshot(){return structuredClone(state);},async download(request:any){calls.push({method:'download',request});state.job={id:'a'.repeat(32),active:true,phase:'downloading',name:request.name,completed:2,total:80,bytes:1000,error:'',request};return structuredClone(state);},async cancel(request:any){calls.push({method:'cancel',request});if(state.job)state.job={...state.job,active:false,phase:'cancelled'};return structuredClone(state);},async remove(request:any){calls.push({method:'remove',request});state.regions=[];return structuredClone(state);}};
  const client=vectorMapsClient(bridge);
  let manager=false,token=1,intent:{token:number;request?:DownloadRequest}|undefined;
  export function recorded(){return structuredClone(calls);}
  export function finish(){if(state.job)state.job={...state.job,active:false,phase:'ready',completed:80};}
  function choose(request?:DownloadRequest){manager=false;intent={token:++token,request};}
</script>
<main class="fixture">{#if manager}<MapPanel managementOnly mapClient={client} onchoosearea={choose} onshowmap={()=>manager=false}/>{:else}<MapPanel mapClient={client} downloadIntent={intent} navigationToken={token} fix={{latitude:-37.6535,longitude:145.5159,accuracy:5,timestamp:1}} active={true} ageMs={0} onmanage={()=>manager=true}/>{/if}</main>
<style>.fixture{max-width:700px;margin:auto;--card:#fffdf6;--line:#dfe1d5;--ink:#214c35;--muted:#65745f}:global(.fixture .map-surface){height:calc(100dvh - 35px);min-height:420px}</style>
