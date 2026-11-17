<script lang="ts">
  import { onMount } from 'svelte';
  import { LeafletMap, SimpleCRS, ImageOverlay, LatLngBounds, Marker, DivIcon } from 'leaflet';
  import 'leaflet/styles.css';
  export let zoom = 1;
  export let reset = 0;
  export let location = true;
  export let selected = '';
  export let onselect: (name: string) => void;
  let container: HTMLDivElement;
  let map: LeafletMap | undefined;
  let own: Marker;
  let baseZoom = 0;
  let lastZoom = 1;
  let lastReset = 0;
  let pins: Record<string, HTMLButtonElement> = {};
  const bounds = new LatLngBounds([0,0],[470,420]);
  $: if(map && zoom !== lastZoom) { map.setView([235,210],baseZoom + Math.log2(zoom), {animate:false}); lastZoom=zoom; }
  $: if(map && reset !== lastReset) { map.setView([235,210],baseZoom,{animate:false}); lastReset=reset; }
  $: if(map && own) { if(location) own.addTo(map); else own.remove(); }
  $: for(const [name,element] of Object.entries(pins)) element.classList.toggle('selected',name===selected);
  onMount(() => {
    map = new LeafletMap(container, {crs:SimpleCRS,zoomControl:false,attributionControl:false,minZoom:-1,maxZoom:2,zoomSnap:.1,scrollWheelZoom:false});
    new ImageOverlay('/demo-terrain.svg',bounds).addTo(map);
    const fit = () => { if(!map) return; map.invalidateSize(); baseZoom=map.getBoundsZoom(bounds); map.fitBounds(bounds,{animate:false}); lastZoom=1; };
    fit();
    for(const pin of [{name:'Rowan',position:[120,196]},{name:'Alex',position:[235,280]},{name:'Sam',position:[120,330]}]) {
      const element=document.createElement('button');
      element.className=pin.name==='Rowan'?'member-pin own-pin':'member-pin'; element.setAttribute('aria-label',`Show ${pin.name} on map`);
      element.innerHTML=`<b>${pin.name[0]}</b><small>${pin.name==='Rowan'?'You':pin.name}</small>`;
      element.addEventListener('click',()=>onselect(pin.name));
      pins[pin.name]=element;
      const marker=new Marker(pin.position as [number,number],{icon:new DivIcon({html:element,className:'map-member',iconSize:[60,64],iconAnchor:[30,32]}),keyboard:false});
      if(pin.name==='Rowan') { own=marker; if(location) marker.addTo(map); }
      else marker.addTo(map);
    }
    const observer=new ResizeObserver(fit); observer.observe(container);
    return () => { observer.disconnect(); map?.remove(); map=undefined; };
  });
</script>
<div class="terrain" aria-label="Illustrative offline map of the Victorian High Country">
  <div class="map-canvas" bind:this={container}></div>
  <span class="map-label">Offline region · Ready</span>
  <span class="map-credit">Leaflet · Illustrative terrain · Sample positions</span>
</div>
<style>
  .terrain{height:100%;min-height:350px;position:relative;overflow:hidden;background:#dce3b5;border-radius:22px;isolation:isolate}.map-canvas{position:absolute;inset:0 0 34px;background:#dce3b5;z-index:0}.map-label,.map-credit{position:absolute;left:12px;background:#fffdf0ed;padding:7px 10px;border-radius:9px;color:#345439;font-size:11px;z-index:500;pointer-events:none}.map-label{top:12px;font-weight:700}.map-credit{bottom:10px;font-size:9px}:global(.member-pin){background:transparent;border:0;padding:0;width:52px;min-height:58px;display:grid;justify-items:center;gap:3px;cursor:pointer}:global(.member-pin b){display:grid;place-items:center;background:#21583a;color:white;border:3px solid white;border-radius:50% 50% 50% 3px;width:35px;height:35px;font-size:14px;box-shadow:0 2px 5px #123f2b33}:global(.member-pin small){background:#fffdf3;color:#183f2b;padding:2px 7px;border-radius:6px;font-size:10px;font-weight:700}:global(.member-pin:focus-visible){outline:3px solid #ad6b20;border-radius:8px}
</style>
