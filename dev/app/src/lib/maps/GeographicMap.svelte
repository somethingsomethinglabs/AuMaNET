<script module lang="ts">
  import {Capacitor,registerPlugin} from '@capacitor/core';
  import type {Position} from './format';

  const navigation=registerPlugin<{openDestination(point:Pick<Position,'latitude'|'longitude'>):Promise<void>}>('AuMaNETMapNavigation');
</script>

<script lang="ts">
  import {appearance} from '../appearance';
  import {mapAppearance,onlineDarkAppearance,connectionAppearance} from './vector/appearance';
  import {onMount} from 'svelte';
  import {Map as VectorMap,setWorkerUrl} from 'maplibre-gl';
  import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import {previewProtocols} from './vector/protocol';
  import {outdoorStyle,downloadedStyle,mapBackground} from './vector/style';
  import {manifest} from './vector/archive';
  import {offlineCoverageLabel,viewportCovered} from './coverage';
  import {nativeVectorMaps,visibleRegions,regionSetRoot,downloadBounds,type VectorRegion,type MapBounds} from './vector/downloads';
  export let focusBounds:MapBounds|undefined=undefined;
  let regions:VectorRegion[]=[];
  export let areaSelection:{latitude:number;longitude:number;radiusKm:number}|undefined=undefined;
  export let areaLocked=false;
  export let onareapin:((point:{latitude:number;longitude:number})=>void)|undefined=undefined;
  export let onofflinepick:((point:{latitude:number;longitude:number})=>void)|undefined=undefined;
  let areaOutline:Rectangle|undefined,areaPin:Marker|undefined;
  function syncArea(){
    if(!map)return;if(!areaSelection){areaOutline?.remove();areaPin?.remove();areaOutline=undefined;areaPin=undefined;return;}
    const point:[number,number]=[areaSelection.latitude,areaSelection.longitude];
    try{const[w,s,e,n]=downloadBounds(...point,areaSelection.radiusKm),bounds=new LatLngBounds([s,w],[n,e]);
      if(!areaOutline)areaOutline=new Rectangle(bounds,{pane:'offline-area',color:'#a56627',weight:2.5,fillColor:'#c78a39',fillOpacity:.08,dashArray:'8 5',interactive:false,className:'offline-download-outline'}).addTo(map);else areaOutline.setBounds(bounds);
    }catch{areaOutline?.remove();areaOutline=undefined;}
    if(!areaPin){const icon=new DivIcon({className:'offline-area-marker',html:'<span class="offline-area-pin"></span>',iconSize:[28,36],iconAnchor:[14,32]});areaPin=new Marker(point,{icon,draggable:true,keyboard:true,title:'Download centre pin; drag to move'}).addTo(map);areaPin.on('dragend',()=>{const p=areaPin!.getLatLng();onareapin?.({latitude:p.lat,longitude:p.lng});});}else areaPin.setLatLng(point);
    if(areaLocked)areaPin.dragging?.disable();else areaPin.dragging?.enable();
  }

  export let onbasemap:(label:string)=>void=()=>{};
  let vectorContainer:HTMLDivElement,onlineContainer:HTMLDivElement;
  let vector:VectorMap|undefined,onlineVector:VectorMap|undefined;
  let protocols:ReturnType<typeof previewProtocols>|undefined;
  let vectorMode='',protocolRoot:string|undefined,offlineLabel='',offlineError=false;
  let onlineTheme:boolean|undefined,onlineReady=false,onlineFailed=false,onlineWanted=false;
  let lastOnlineView:{center:LatLng;zoom:number}|undefined;
  let connectionDetail:MapConnection|undefined,detailDialog:HTMLDialogElement;
  function openConnection(id:string){connectionDetail=connections.find(item=>item.id===id);if(connectionDetail)detailDialog.showModal();}

  function createVector(container:HTMLDivElement){
    return new VectorMap({container,interactive:false,attributionControl:false,maxTileCacheSize:48});
  }

  function reportBasemap(){
    if(onlineWanted&&onlineReady)onbasemap('Online map · Internet required');
    else if(offlineLabel)onbasemap(offlineError?'Offline vector map unavailable':offlineLabel);
    else if(onlineFailed)onbasemap('Online map unavailable · Check your internet connection');
    else onbasemap('Loading online map…');
  }

  function startVector(){
    try{
      setWorkerUrl(mapWorkerUrl);
      vector=createVector(vectorContainer);
      vector.on('error',event=>{
        // Missing elevation leaves a gap in shading while the basemap stays usable.
        if('sourceId' in event&&(event.sourceId==='terrain'||event.sourceId==='contours'))return;
        offlineError=true;
        reportBasemap();
      });
    }catch{
      onbasemap('Vector map unavailable on this device');
    }
  }

  function syncCamera(){
    if(!map)return;
    const center=map.getCenter();
    const camera={center:[center.lng,center.lat] as [number,number],zoom:map.getZoom()-1};
    vector?.jumpTo(camera);
    onlineVector?.jumpTo(camera);
  }

  function stopOnline(){
    onlineReady=false;
    onlineFailed=false;
    onlineTheme=undefined;
    lastOnlineView=undefined;
    const previous=onlineVector;
    onlineVector=undefined;
    previous?.remove();
  }

  function startOnline(dark:boolean){
    if(!map)return;
    stopOnline();
    onlineTheme=dark;
    const attemptedView={center:map.getCenter(),zoom:map.getZoom()};
    lastOnlineView=attemptedView;
    if(!navigator.onLine){onlineFailed=true;return;}
    try{
      const candidate=createVector(onlineContainer);
      onlineVector=candidate;
      syncCamera();
      candidate.on('error',()=>{
        if(onlineVector!==candidate)return;
        onlineReady=false;
        onlineFailed=true;
        reportBasemap();
      });
      // Wait for the style and its visible tiles before covering the saved map.
      candidate.on('idle',()=>{
        if(onlineVector!==candidate||onlineFailed||onlineReady||!candidate.isStyleLoaded()||!candidate.areTilesLoaded())return;
        onlineReady=true;
        reportBasemap();
      });
      candidate.setStyle('https://tiles.openfreemap.org/styles/'+(dark?'dark':'liberty'),{
        diff:false,transformStyle:(_,style)=>dark?onlineDarkAppearance(style):style,
      });
    }catch{
      stopOnline();
      onlineTheme=dark;
      lastOnlineView=attemptedView;
      onlineFailed=true;
    }
  }

  function syncVector(moved=false){
    if(!map||!vector)return;
    const [w,s,e,n]=manifest.bounds;
    const viewport=map.getBounds(),bounds:MapBounds=[viewport.getWest(),viewport.getSouth(),viewport.getEast(),viewport.getNorth()];
    const visible=visibleRegions(regions,bounds),region=visible[0];
    const local=map.getZoom()-1>=manifest.minZoom&&bounds[0]<=e&&bounds[2]>=w&&bounds[1]<=n&&bounds[3]>=s;
    const dark=$appearance.theme==='Dark';
    const areas=region?visible.map(area=>area.bounds):local?[manifest.bounds as MapBounds]:[];
    offlineLabel=areas.length?offlineCoverageLabel(bounds,areas,region?(visible.length===1?region.name:undefined):'Outdoor map'):'';
    if(region||local){
      const root=region?regionSetRoot(regions):'';
      const mode=root+(dark?'/dark':'/light');
      if(vectorMode!==mode){
        vectorMode=mode;
        offlineError=false;
        const sourceChanged=protocolRoot!==root;
        if(sourceChanged||!protocols){
          protocols?.close();
          protocols=previewProtocols(root?{regionRoot:root,terrainTemplate:root+'/terrain/{z}/{x}/{y}.webp'}:{});
          protocolRoot=root;
        }
        const style=region?downloadedStyle(regions):outdoorStyle(protocols.basemap);
        vector.setStyle(mapAppearance(style,dark),{diff:!sourceChanged});
      }
    }
    onlineWanted=!viewportCovered(bounds,areas);
    if(!onlineWanted)stopOnline();
    else{
      // After a provider failure, try once at the next distinct settled view.
      // Keep the saved map visible and avoid retrying on polling or duplicate events.
      const retry=moved&&onlineFailed&&navigator.onLine&&lastOnlineView
        &&(map.getZoom()!==lastOnlineView.zoom||!map.getCenter().equals(lastOnlineView.center));
      if(onlineTheme!==dark||retry)startOnline(dark);
    }
    reportBasemap();
  }
  import {LeafletMap,LatLngBounds,Circle,CircleMarker,Polyline,Popup,Rectangle,Marker,DivIcon,type LatLng} from 'leaflet';
  import 'leaflet/styles.css';
  import type {MapMember} from './format';
  import {freshGroupPositions,validPosition,MapNavigationView} from './map-view';
  import type {MapConnection} from './connections';
  export let fix:Position|undefined=undefined;
  export let ageMs=Infinity;
  export let active=false;
  export let members:MapMember[]=[];
  export let connections:readonly MapConnection[]=[];
  export let selected='';
  export let follow=false;
  export let navigationToken=0;
  export let onfollowcancel:()=>void=()=>{};
  export let onselect:(id:string)=>void=()=>{};
  export let onnameselect:((id:string)=>void)|undefined=undefined;
  export let nodeMemberIds:readonly string[]=[];
  let container:HTMLDivElement,map:LeafletMap|undefined;
  let lastFollow='';
  const viewport=new MapNavigationView();
  const markers=new Map<string,{point:CircleMarker;accuracy:Circle;label:HTMLSpanElement}>();
  const connectionLines=new Map<string,{line:Polyline;outline:Polyline;hit:Polyline;label:HTMLSpanElement}>();
  const valid=validPosition;
  function interact(){viewport.interact();onfollowcancel();}
  function framePositions(){if(!map)return;const points=freshGroupPositions(fix,ageMs,active,members).map(p=>[p.latitude,p.longitude] as [number,number]);if(points.length)map.fitBounds(new LatLngBounds(points),{animate:false,padding:[40,40],maxZoom:15});}
  function defaultView(){
    if(!map)return;viewport.navigate(navigationToken);
    if(focusBounds){if(viewport.next(false,true)==='coverage'){viewport.interact();const[w,s,e,n]=focusBounds;map.fitBounds(new LatLngBounds([s,w],[n,e]),{animate:false,padding:[18,18],maxZoom:16});}return;}
    if(viewport.next(freshGroupPositions(fix,ageMs,active,members).length>0,false)==='group')framePositions();
  }
  function reportCoverage(moved=false){syncCamera();syncVector(moved);}
  function activateMember(id:string,details=false){if(areaSelection){const p=markers.get(id)?.point.getLatLng();if(p&&!areaLocked)onareapin?.({latitude:p.lat,longitude:p.lng});}else (details?(onnameselect??onselect):onselect)(id);}
  function syncMarkers(){
    if(!map)return;const entries:Array<{id:string;name:string;fix:Position;fresh:boolean}>=[];
    if(valid(fix))entries.push({id:'self',name:'You',fix,fresh:active&&ageMs<=60000});
    for(const member of members)if(member.authorized&&valid(member.fix))entries.push({id:member.id,name:member.name,fix:member.fix,fresh:member.connected&&member.locationActive!==false&&member.ageMs<=60000});
    const keep=new Set(entries.map(e=>e.id));for(const[id,item]of markers)if(!keep.has(id)){item.point.remove();item.accuracy.remove();markers.delete(id);}
    for(const entry of entries){const p:[number,number]=[entry.fix.latitude,entry.fix.longitude],color=$appearance.theme==='Dark'?(entry.fresh?entry.id==='self'?'#BADEE8':'#B9D4A8':'#F1D49A'):entry.fresh?(entry.id==='self'?'#35535c':'#315e47'):'#735421';let item=markers.get(entry.id);
      if(!item){const point=new CircleMarker(p,{radius:entry.id==='self'?9:8,color:$appearance.theme==='Dark'?'#182A24':'#fffef8',weight:3,fillColor:color,fillOpacity:1}),accuracy=new Circle(p,{radius:entry.fix.accuracy,color,weight:1,fillColor:color,fillOpacity:.09,interactive:false});const label=document.createElement('span');label.textContent=entry.name;label.role='button';label.tabIndex=0;label.addEventListener('click',event=>{event.stopPropagation();activateMember(entry.id,true);});label.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();activateMember(entry.id,true);}});point.bindTooltip(label,{direction:entry.id==='self'?'top':'bottom',offset:entry.id==='self'?[0,-8]:[0,8],permanent:true,interactive:true});point.on('click',()=>activateMember(entry.id));accuracy.addTo(map);point.addTo(map);point.getElement()?.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();activateMember(entry.id);}});item={point,accuracy,label};markers.set(entry.id,item);}
      // A name edit keeps the same identity/marker. Update the existing label;
      // passing a string to Leaflet tooltip APIs would interpret names as HTML.
      const markerLabel=entry.name+(entry.fresh?'':' · Last known');if(item.label.textContent!==markerLabel)item.label.textContent=markerLabel;
      item.label.setAttribute('aria-label',nodeMemberIds.includes(entry.id)?entry.id==='self'?'View your node':`View ${entry.name}’s node`:`View ${entry.name} details`);
      const pointElement=item.point.getElement();if(pointElement){pointElement.setAttribute('role','button');pointElement.setAttribute('tabindex','0');pointElement.setAttribute('data-map-member',entry.id);pointElement.setAttribute('aria-label',`View ${entry.name} details`);}
      item.point.setLatLng(p);item.point.setStyle({color:$appearance.theme==='Dark'?'#182A24':'#fffef8',fillColor:color,radius:selected===entry.id?11:entry.id==='self'?9:8});item.accuracy.setLatLng(p);item.accuracy.setRadius(entry.fix.accuracy);item.accuracy.setStyle({color,fillColor:color});
    }
    if(follow&&active&&valid(fix)){const key=`${fix.latitude}/${fix.longitude}/${fix.timestamp}`;if(key!==lastFollow){map.panTo([fix.latitude,fix.longitude],{animate:false});lastFollow=key;}}else lastFollow='';
  }
  function syncConnections(){
    if(!map)return;const keep=new Set(connections.map(connection=>connection.id));
    for(const[id,item]of connectionLines)if(!keep.has(id)){item.line.remove();item.outline.remove();item.hit.remove();connectionLines.delete(id);}
    for(const connection of connections){
      const positions:[number,number][]=[[connection.from.fix.latitude,connection.from.fix.longitude],[connection.to.fix.latitude,connection.to.fix.longitude]];
      const text=`${connection.from.name} ↔ ${connection.to.name}. ${connection.detail}`;
      let item=connectionLines.get(connection.id);
      if(!item){
        const outline=new Polyline(positions,{pane:'connections',color:'#fffdf4',weight:6,opacity:.7,interactive:false}).addTo(map);
        const line=new Polyline(positions,{pane:'connections',color:connection.color,weight:2.5,opacity:.9,interactive:true}).addTo(map);
        const hit=new Polyline(positions,{pane:'connections',color:'#000',weight:24,opacity:0,interactive:true}).addTo(map);hit.on('click',()=>openConnection(connection.id));const label=document.createElement('span');line.bindTooltip(label,{sticky:true});line.on('click',()=>openConnection(connection.id));item={line,outline,hit,label};connectionLines.set(connection.id,item);
      }
      item.label.textContent=text;item.line.setLatLngs(positions);item.outline.setLatLngs(positions);item.hit.setLatLngs(positions);
      item.line.setStyle({color:connectionAppearance(connection,$appearance.theme==='Dark'),dashArray:connection.dashed?'7 6':undefined});
      item.outline.setStyle({color:$appearance.theme==='Dark'?'#182A24':'#fffef8',opacity:1,dashArray:connection.dashed?'7 6':undefined});
      const element=item.line.getElement();if(element){element.setAttribute('data-map-connection',connection.id);element.setAttribute('role','button');element.setAttribute('tabindex','0');element.onclick=()=>openConnection(connection.id);element.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openConnection(connection.id);}};element.setAttribute('aria-label',text);}
    }
  }
  $: if(connectionDetail){connectionDetail=connections.find(item=>item.id===connectionDetail?.id);if(!connectionDetail)detailDialog?.close();}
  $: if(map)syncMarkers();
  $: {fix;ageMs;active;members;selected;follow;nodeMemberIds;if(map)syncMarkers();}
  $: {connections;if(map)syncConnections();}
  $: {navigationToken;focusBounds;fix;ageMs;active;members;if(map)defaultView();}
  $: {regions;$appearance.theme;if(map){syncVector();syncMarkers();syncConnections();}}
  $: {areaSelection;areaLocked;if(map)syncArea();}
  export function fitDownloadArea(bounds:MapBounds,bottom=260){interact();if(!map)return;const[w,s,e,n]=bounds;map.fitBounds(new LatLngBounds([s,w],[n,e]),{animate:false,paddingTopLeft:[24,60],paddingBottomRight:[24,Math.min(bottom+18,Math.max(50,container.clientHeight-160))],maxZoom:16});}
  export function center(){const p=map?.getCenter();return p?{latitude:p.lat,longitude:p.lng}:undefined;}
  export function zoomIn(){interact();map?.zoomIn();}
  export function zoomOut(){interact();map?.zoomOut();}
  export function focusPosition(p:Position){interact();if(valid(p))map?.setView([p.latitude,p.longitude],Math.max(map?.getZoom()??0,14),{animate:false});}
  export function fitMembers(){interact();framePositions();}
  function openPin(event:{latlng:LatLng;originalEvent:Event}){
    if(!map||(event.originalEvent?.target as Element)?.closest('.leaflet-interactive,.leaflet-tooltip,.leaflet-marker-icon'))return;
    const pinMap=map;
    const {lat,lng}=pinMap.wrapLatLng(event.latlng);
    const point={latitude:lat,longitude:lng};
    if(areaSelection){
      if(!areaLocked)onareapin?.(point);
      return;
    }

    const content=document.createElement('div');
    const coordinates=document.createElement('div');
    const latitude=lat.toFixed(6),longitude=lng.toFixed(6);
    coordinates.textContent=`${latitude}, ${longitude}`;
    coordinates.setAttribute('aria-label','Pinned coordinates');
    const actions=document.createElement('div');
    actions.className='map-pin-actions';
    content.append(coordinates,actions);
    const popup=new Popup({className:'map-pin-popup'})
      .setLatLng(event.latlng).setContent(content);

    if(onofflinepick){
      const save=document.createElement('button');
      save.type='button';
      save.textContent='Save this area offline';
      save.className='map-pin-action pin-save-area';
      save.addEventListener('click',()=>{
        map?.closePopup();
        onofflinepick?.(point);
      });
      actions.append(save);
    }

    if(Capacitor.getPlatform()==='android'){
      const open=document.createElement('button');
      open.type='button';
      open.className='map-pin-action';
      open.textContent='Open in navigation';
      const status=document.createElement('div');
      status.className='map-pin-status';
      status.setAttribute('role','status');
      open.addEventListener('click',async()=>{
        open.disabled=true;
        status.textContent='';
        try{
          await navigation.openDestination(point);
        }catch(error){
          status.textContent=(error as {code?:string})?.code==='NO_MAP_APP'
            ?'No compatible map app is installed.'
            :'Could not open a map app.';
          popup.update();
        }finally{
          open.disabled=false;
        }
      });
      actions.append(open);
      content.append(status);
    }else{
      const open=document.createElement('a');
      open.className='map-pin-action';
      open.textContent='Open in navigation';
      open.href='https://www.google.com/maps/dir/?'+new URLSearchParams({api:'1',destination:`${latitude},${longitude}`});
      open.target='_blank';
      open.rel='noreferrer';
      actions.append(open);
    }

    function fitPopup(){
      const height=pinMap.getSize().y;
      // Keep room for the actions and feedback before reserving space for map controls.
      const padding=Math.max(8,Math.min(104,Math.floor((height-200)/2)));
      // Leaflet's wrapper, content margins and tip take 48 px beyond the scrollable content.
      popup.options.autoPanPaddingTopLeft=[16,padding];
      popup.options.autoPanPaddingBottomRight=[72,padding];
      popup.options.maxHeight=Math.max(1,height-2*padding-48);
      popup.update();
    }
    fitPopup();
    pinMap.on('resize',fitPopup);
    popup.on('remove',()=>pinMap.off('resize',fitPopup));
    popup.openOn(pinMap);
  }
  onMount(()=>{
    let stopped=false,loading=false;
    const client=nativeVectorMaps();
    const refresh=async()=>{
      if(!client||loading)return;
      loading=true;
      try{const state=await client.snapshot();if(!stopped)regions=state.regions;}catch{}finally{loading=false;}
    };
    void refresh();
    const poll=setInterval(()=>void refresh(),5000);
    startVector();
    map=new LeafletMap(container,{zoomControl:false,attributionControl:false,minZoom:2,maxZoom:18,scrollWheelZoom:true,zoomAnimation:false,fadeAnimation:false});
    map.createPane('connections').style.zIndex='350';
    map.createPane('offline-area').style.zIndex='390';
    map.on('click',openPin);
    map.on('dragstart',interact);
    map.on('move zoom',syncCamera);
    map.on('moveend',()=>reportCoverage(true));
    const first=freshGroupPositions(fix,ageMs,active,members)[0];
    map.setView(first?[first.latitude,first.longitude]:[-25,135],first?15:4);
    syncConnections();syncMarkers();syncArea();defaultView();
    const observer=new ResizeObserver(()=>{map?.invalidateSize({pan:true,animate:false});vector?.resize();onlineVector?.resize();reportCoverage();});
    observer.observe(container);
    container.addEventListener('pointerdown',interact);
    container.addEventListener('wheel',interact,{passive:true});
    container.addEventListener('keydown',interact);
    const reconnect=()=>{if(onlineWanted)startOnline($appearance.theme==='Dark');reportBasemap();};
    window.addEventListener('online',reconnect);
    window.addEventListener('offline',reconnect);
    return()=>{
      stopped=true;clearInterval(poll);
      container.removeEventListener('pointerdown',interact);
      container.removeEventListener('wheel',interact);
      container.removeEventListener('keydown',interact);
      window.removeEventListener('online',reconnect);
      window.removeEventListener('offline',reconnect);
      stopOnline();
      observer.disconnect();vector?.remove();vector=undefined;protocols?.close();
      map?.remove();map=undefined;markers.clear();connectionLines.clear();
    };
  });
</script>
<div class="vector-background" style:background-color={$appearance.theme==='Dark'?mapBackground.dark:mapBackground.light} aria-hidden="true">
  <div class="vector-background" bind:this={vectorContainer}></div>
  <div class="vector-background online-basemap" class:ready={onlineWanted&&onlineReady} bind:this={onlineContainer}></div>
</div>
<div class="geographic-map" bind:this={container} aria-label="Geographic map and group positions"></div>
<dialog bind:this={detailDialog} aria-label="Connection signal" class="signal-detail"><button class="close-signal" onclick={()=>detailDialog.close()} aria-label="Close connection signal">Close</button>{#if connectionDetail}<h3>{connectionDetail.from.name} ↔ {connectionDetail.to.name}</h3><strong>{connectionDetail.strength}</strong><p>{connectionDetail.detail}</p>{/if}</dialog>
<style>.vector-background,.geographic-map{position:absolute;inset:0;height:100%;min-height:0}.online-basemap{visibility:hidden}.online-basemap.ready{visibility:visible}.geographic-map{background:transparent!important}.signal-detail{max-width:420px;width:calc(100% - 32px);border:1px solid var(--line);border-radius:22px;padding:22px;background:var(--card);color:var(--ink);box-shadow:0 12px 60px #0003}.signal-detail::backdrop{background:var(--scrim)}.signal-detail p{font-size:0.8125rem;line-height:1.6}.close-signal{float:right;border:0;background:transparent;color:inherit;min-height:44px;padding:8px}.signal-detail h3{font-size:1.125rem;clear:both}:global(.offline-area-pin){display:block;box-sizing:border-box;width:27px;height:27px;border:3px solid var(--raised);border-radius:50% 50% 50% 0;background:var(--accent);transform:rotate(-45deg);box-shadow:0 2px 7px #0004}
:global(.map-pin-actions){display:grid;gap:5px;margin-top:5px}
:global(.leaflet-popup-content .map-pin-action){display:grid;place-items:center;min-height:44px;border:1px solid var(--control-line);border-radius:8px;padding:6px 10px;background:var(--raised);color:var(--ink);font:inherit;font-weight:700;text-decoration:none}
:global(.leaflet-popup-content .pin-save-area){background:var(--green);color:var(--on-action);border-color:transparent}
:global(.map-pin-status){max-width:175px}
:global(.map-pin-status:not(:empty)){margin-top:5px}
/* A short map can put the pin over the toolbars. Raise the Leaflet pane, keeping the map surface behind them. */
:global(.geographic-map:has(.map-pin-popup)){isolation:auto}
:global(.geographic-map:has(.map-pin-popup) > .leaflet-map-pane){z-index:520}
:global(.map-pin-popup .leaflet-popup-scrolled){overscroll-behavior:contain;touch-action:pan-y}
:global(.leaflet-tooltip){font-family:inherit;border-radius:8px;color:var(--ink);background:var(--raised);border:1px solid var(--control-line);font-weight:700}:global(.leaflet-control-container){display:none}</style>
