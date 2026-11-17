<script lang="ts">
  import GeographicMap from '../maps/GeographicMap.svelte';
  import type {MapStore} from '../maps/store';
  import type {MapMember} from '../maps/format';
  export let store:MapStore;
  const own={latitude:-37,longitude:145,accuracy:12,timestamp:1};
  const peer={latitude:-37.0005,longitude:145.0005,accuracy:15,timestamp:1};
  let members:MapMember[]=[{id:'fixture-peer',name:'Fixture phone before rename',fix:peer,ageMs:0,connected:true,authorized:true,locationActive:true}];
  let selected='';
  export function rename(name:string){members=members.map(member=>({...member,name}));}
</script>
<main class="map-label-fixture"><h1>Map label fixture</h1><p>Synthetic positions and names; no GPS, device, storage or session access.</p>
  <div class="map-frame"><GeographicMap {store} fix={own} active={true} ageMs={0} {members} {selected} onselect={id=>selected=id}/></div>
  <p role="status">Selected: {selected||'none'}</p>
</main>
<style>.map-label-fixture{padding:16px;box-sizing:border-box;max-width:800px;margin:auto}.map-frame{height:430px;min-width:0}.map-label-fixture h1{font-size:20px}</style>
