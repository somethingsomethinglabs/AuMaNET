<script lang="ts">
  import {onMount} from 'svelte';
  import {Map as VectorMap,ScaleControl,NavigationControl,Marker,setWorkerUrl} from 'maplibre-gl';
  import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import '../../../styles.css';
  import {previewProtocols} from '$lib/maps/vector/protocol';
  import {outdoorStyle} from '$lib/maps/vector/style';
  import {manifest} from '$lib/maps/vector/archive';
  let surface:HTMLDivElement,map:VectorMap|undefined,ready=false,error='',hillshade=true,contours=true,details='',coordinates='',zoom=14;
  let pin:Marker|undefined;
  const areas=[{name:'Healesville streets',centre:[145.5159,-37.6535] as [number,number],zoom:16},{name:'Toolangi tracks',centre:[145.473,-37.534] as [number,number],zoom:15},{name:'Mount St Leonard ridge',centre:[145.528,-37.568] as [number,number],zoom:15}];
  const tests={errors:[] as string[],loadedAt:0};
  function toggleTerrain(){if(map?.isStyleLoaded())map.setLayoutProperty('hillshade','visibility',hillshade?'visible':'none');}
  function toggleContours(){if(map?.isStyleLoaded())for(const layer of ['contour-lines','contour-labels'])map.setLayoutProperty(layer,'visibility',contours?'visible':'none');}
  function go(index:number){const area=areas[index];details='';map?.jumpTo({center:area.centre,zoom:area.zoom});}
  function back(){location.href='/';}
  onMount(()=>{
    setWorkerUrl(mapWorkerUrl);
    const protocol=previewProtocols();
    try{
      map=new VectorMap({container:surface,style:outdoorStyle(protocol.basemap,protocol.terrain),center:areas[0].centre,zoom:16,minZoom:10,maxZoom:19,maxBounds:[[145.44,-37.69],[145.56,-37.51]],attributionControl:false,pitchWithRotate:false,dragRotate:false,renderWorldCopies:false,maxTileCacheSize:48,fadeDuration:0});
      map.addControl(new ScaleControl({unit:'metric',maxWidth:110}),'bottom-left');map.addControl(new NavigationControl({showCompass:false}),'top-right');
      map.on('load',()=>{ready=true;tests.loadedAt=performance.now();});
      map.on('zoomend',()=>zoom=map?.getZoom()??14);
      map.on('error',event=>{const message=event.error?.message??'Vector map failed';tests.errors.push(message);error='Some map detail could not load. See map details below.';});
      map.on('click',event=>{
        const {lng,lat}=event.lngLat;coordinates=`${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        pin??=new Marker({color:'#a23b45'});pin.setLngLat(event.lngLat).addTo(map!);
        const feature=map!.queryRenderedFeatures(event.point,{layers:['tracks','walking-paths','roads','restricted-access','buildings','outdoor-pois','place-labels']})[0];
        if(feature){const p=feature.properties;details=[p['name:en']||p.name||p.kind_detail||p.kind||'Mapped feature',p.access?`Mapped access: ${p.access}`:'Access not supplied',p.surface?`Surface: ${p.surface}`:'Surface not supplied'].join(' · ');}else details='Selected point';
      });
      const observer=new ResizeObserver(()=>map?.resize());observer.observe(surface);
      // Debug-only readback of public map data, used by browser and physical-device acceptance.
      (window as unknown as {__aumanetVectorPreview?:unknown}).__aumanetVectorPreview={go,state:()=>({ready,zoom:map?.getZoom(),centre:map?.getCenter().toArray(),features:ready?map?.queryRenderedFeatures().length:0,roads:map?.getLayer('tracks')?map.queryRenderedFeatures({layers:['tracks','walking-paths','roads']}).length:0,contourFeatures:map?.getLayer('contour-lines')?map.queryRenderedFeatures({layers:['contour-lines']}).length:0,contourLabels:map?.getLayer('contour-labels')?map.queryRenderedFeatures({layers:['contour-labels']}).length:0,errors:[...tests.errors],metrics:protocol.metrics(),loadedAt:tests.loadedAt}),map};
      return()=>{observer.disconnect();pin?.remove();map?.remove();map=undefined;protocol.close();delete(window as unknown as {__aumanetVectorPreview?:unknown}).__aumanetVectorPreview;};
    }catch(e){error=e instanceof Error?e.message:'Vector maps are unavailable on this device';protocol.close();}
  });
</script>

<svelte:head><title>Outdoor vector preview · AuMaNET</title></svelte:head>
<main class="vector-preview">
  <header><div><p class="eyebrow">AuMaNET · Map prototype</p><h1>Outdoor vector preview</h1></div><button class="outline" onclick={back}>Back to AuMaNET</button></header>
  <p class="intro">Built-in offline sample: Healesville, Toolangi and Mount St Leonard. Sharp vector roads and paths with optional terrain. Your group map remains available in AuMaNET.</p>
  <div class="area-controls" aria-label="Sample areas">{#each areas as area,index}<button class="outline" disabled={!ready} onclick={()=>go(index)}>{area.name}</button>{/each}</div>
  <div class="layer-controls"><label><input type="checkbox" style="width:43px;height:26px;margin:0" bind:checked={hillshade} onchange={toggleTerrain}/>Hill shading</label><label><input type="checkbox" style="width:43px;height:26px;margin:0" bind:checked={contours} onchange={toggleContours}/>Contours</label><span>Zoom {zoom.toFixed(1)}</span></div>
  <div class="vector-map" bind:this={surface} aria-label="Offline outdoor vector map"></div>
  {#if !ready&&!error}<p role="status">Opening the local vector map…</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
  <p class="legend"><span class="road">━━</span> Road <span class="track">┄┄</span> Vehicle track <span class="path">····</span> Walking path <span class="restricted">┄┄</span> Mapped access restriction</p>
  <p class="hint">Tap to drop a pin and read coordinates. Track type does not establish difficulty or current access.</p>
  {#if coordinates}<div class="selection" aria-live="polite"><strong>{coordinates}</strong><p>{details}</p></div>{/if}
  <p class="attribution">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a> · Protomaps · Natural Earth · <a href="https://mapterhorn.com/attribution/" target="_blank" rel="noreferrer">Mapterhorn and elevation contributors</a> · <a href="/maps/outdoor-preview/ATTRIBUTION.txt" target="_blank">Offline attribution</a></p>
  <details><summary>Map details and prototype limits</summary><p>OSM data: {manifest.sources.basemap.dataDate}. Source vector detail extends to zoom 15; higher zoom redraws that geometry. Terrain detail and capture dates vary by source. Contours use 20/100 m intervals at zoom 13 and 10/50 m at zoom 14 and above.</p><p>The sample and fonts are bundled with this build; no internet or login is needed. Group positions are shown on the main map, not this preview. Source fields missing from the sample stay unknown. This is a map-quality prototype, with no route guidance.</p><p>Sample size: {(Object.values(manifest.files).reduce((n,file)=>n+file.bytes,0)/1048576).toFixed(1)} MiB. Terrain is most of that size.</p></details>
</main>

<style>
  .vector-preview{max-width:1100px;margin:0 auto;padding:16px;color:var(--ink,#214c35)}header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}h1{font-size:24px;margin:3px 0}.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.08em;margin:0}.intro{font-size:13px;line-height:1.6}.outline{min-height:44px;border:1px solid var(--line,#dfe1d5);border-radius:12px;padding:9px 12px;background:var(--card,#fffdf6);color:inherit;font-weight:700;cursor:pointer}.outline:disabled{opacity:.5}.area-controls{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.layer-controls{display:flex;flex-wrap:wrap;align-items:center;gap:12px;font-size:13px;margin:10px 0}.layer-controls label{display:flex;align-items:center;gap:6px;min-height:40px}.layer-controls input{width:18px;height:18px}.vector-map{height:clamp(340px,65dvh,760px);width:100%;border:1px solid var(--line,#dfe1d5);border-radius:16px;overflow:hidden}.legend{display:flex;align-items:center;gap:7px;flex-wrap:wrap;font-size:11px}.road{color:#aaa18c}.track{color:#99704b}.path{color:#80543f}.restricted{color:#a44b51}.hint,.attribution,details{font-size:12px;line-height:1.6}.attribution{font-size:10px}a{color:inherit}.selection{padding:12px;background:var(--card,#fffdf6);border-radius:12px;font-size:13px}.selection p{margin:5px 0}summary{cursor:pointer;min-height:40px;padding:10px 0}[role=alert]{color:#9a3926}button:focus-visible,input:focus-visible,summary:focus-visible{outline:3px solid #ad6b20;outline-offset:3px}:global(.maplibregl-ctrl-scale){background:#fffdf4ee!important;color:#214c35!important}@media(max-width:400px){.vector-preview{padding:12px}h1{font-size:21px}.area-controls button{flex:1;font-size:12px}}
</style>
