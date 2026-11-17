<script lang="ts">
  import {onMount} from 'svelte';
  import {LeafletMap,TileLayer,Marker,DivIcon,Rectangle,LatLngBounds} from 'leaflet';
  import 'leaflet/styles.css';
  export let latitude:number;
  export let longitude:number;
  export let radius:number;
  export let disabled=false;
  export let onpick:(latitude:number,longitude:number)=>void;
  let container:HTMLDivElement,map:LeafletMap|undefined,pin:Marker|undefined,area:Rectangle|undefined,error='';
  let last='';
  function selection(){
    if(!map||!pin||!area||!Number.isFinite(latitude)||!Number.isFinite(longitude))return;
    if(latitude< -44||latitude> -10||longitude<112||longitude>154)return;
    const key=`${latitude}/${longitude}/${radius}`;if(last===key)return;last=key;
    pin.setLatLng([latitude,longitude]);const dy=radius/111.32,dx=dy/Math.cos(latitude*Math.PI/180);
    area.setBounds(new LatLngBounds([latitude-dy,longitude-dx],[latitude+dy,longitude+dx]));
    if(!map.getBounds().contains([latitude,longitude]))map.panTo([latitude,longitude],{animate:false});
  }
  $: {latitude;longitude;radius;selection();}
  onMount(()=>{
    map=new LeafletMap(container,{zoomControl:false,attributionControl:false,minZoom:4,maxZoom:14});
    map.setView([latitude,longitude],8);
    const tiles=new TileLayer('https://services.ga.gov.au/gis/rest/services/NationalBaseMap/MapServer/tile/{z}/{y}/{x}',{maxZoom:14,keepBuffer:0});
    tiles.on('tileerror',()=>error='Map preview could not load. Check internet, or use your location or coordinates.');tiles.addTo(map);
    pin=new Marker([latitude,longitude],{interactive:false,icon:new DivIcon({className:'coverage-pin',html:'<span aria-hidden="true">📍</span>',iconSize:[30,36],iconAnchor:[15,34]})}).addTo(map);
    area=new Rectangle(new LatLngBounds([latitude-.1,longitude-.1],[latitude+.1,longitude+.1]),{color:'#21583a',weight:2,fillOpacity:.08,interactive:false}).addTo(map);
    map.on('click',event=>{if(disabled)return;const {lat,lng}=event.latlng;if(lat< -44||lat> -10||lng<112||lng>154){error='Choose a place in mainland Australia or Tasmania.';return;}error='';onpick(Number(lat.toFixed(6)),Number(lng.toFixed(6)));});
    selection();return()=>{map?.remove();map=undefined;};
  });
</script>

<div class="picker">
  <div class="centre-map" bind:this={container} aria-label="Tap map to drop download centre pin"></div>
  <div class="zoom"><button type="button" aria-label="Zoom in on area picker" onclick={()=>map?.zoomIn()}>+</button><button type="button" aria-label="Zoom out on area picker" onclick={()=>map?.zoomOut()}>−</button></div>
</div>
<p class="picker-help">Tap to drop or move the pin. Drag to explore. The outlined square is your download area. You can also enter coordinates below.</p>
{#if error}<p role="status" class="picker-help">{error}</p>{/if}
<p class="picker-source">Online preview: <a href="https://www.ga.gov.au/scientific-topics/national-location-information/topographic-maps" target="_blank" rel="noreferrer">© Geoscience Australia</a> · Leaflet</p>

<style>
  .picker{position:relative;isolation:isolate}.centre-map{height:270px;width:100%;border-radius:12px;border:1px solid var(--line,#dfe1d5);overflow:hidden}.zoom{position:absolute;right:10px;top:10px;z-index:500;display:grid;gap:6px}.zoom button{height:40px;width:40px;border:1px solid #dfe1d5;border-radius:10px;background:#fffdf6;color:#21583a;font-size:22px;cursor:pointer}.picker-help{font-size:12px;line-height:1.5;margin:8px 0}.picker-source{font-size:10px;line-height:1.5;margin:4px 0 10px}.picker-source a{color:inherit}:global(.coverage-pin){font-size:28px;line-height:36px;text-align:center;filter:drop-shadow(0 2px 2px #0005)}button:focus-visible{outline:3px solid #ad6b20;outline-offset:3px}
</style>
