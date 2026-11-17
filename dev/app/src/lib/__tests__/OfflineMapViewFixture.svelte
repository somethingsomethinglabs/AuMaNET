<script lang="ts">
  import OfflineMapPanel from '../OfflineMapPanel.svelte';
  import type {MapStore} from '../maps/store';
  import type {MapMember,Position} from '../maps/format';
  export let store:MapStore;
  export let privacy:()=>void;
  let navigationToken=1,focusRegionId='',management=false;
  let fix:Position|undefined={latitude:-37,longitude:145,accuracy:12,timestamp:1};
  let active=true;
  let members:MapMember[]=[{id:'peer',name:'Fresh peer',fix:{latitude:-37.015,longitude:145.025,accuracy:15,timestamp:1},ageMs:0,connected:true,authorized:true,locationActive:true},{id:'stale',name:'Stale peer',fix:{latitude:10,longitude:10,accuracy:20,timestamp:1},ageMs:60001,connected:true,authorized:true,locationActive:true}];
  export function update(){if(fix)fix={...fix,latitude:-37.03,longitude:145.06,timestamp:fix.timestamp+1};members=members.map(m=>m.id==='peer'?{...m,fix:{latitude:-37.05,longitude:145.08,accuracy:10,timestamp:2}}:m);}
  export function navigate(){focusRegionId='';navigationToken++;}
  export function manage(){management=true;}
  export function clear(){fix=undefined;active=false;members=[];navigationToken++;}
  export function firstFix(){fix={latitude:-37,longitude:145,accuracy:12,timestamp:3};active=true;}
</script>
<main class="map-view-fixture">{#if management}<OfflineMapPanel {store} managementOnly onshowmap={id=>{focusRegionId=id;navigationToken++;management=false;}}/>{:else}<OfflineMapPanel {store} {fix} {active} ageMs={0} {members} {navigationToken} {focusRegionId} onprivacysettings={privacy}/>{/if}</main>
<style>.map-view-fixture{max-width:900px;margin:auto;padding:10px;box-sizing:border-box}</style>
