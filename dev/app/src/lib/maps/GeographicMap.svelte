<script lang="ts">
  import {appearance} from '../appearance';
  import {mapAppearance,connectionAppearance} from './vector/appearance';
  import {onMount} from 'svelte';
  import {Map as VectorMap,setWorkerUrl} from 'maplibre-gl';
  import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import {previewProtocols} from './vector/protocol';
  import {outdoorStyle,downloadedStyle} from './vector/style';
  import {manifest} from './vector/archive';
  import {offlineCoverageLabel} from './coverage';
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
  let vectorContainer:HTMLDivElement,vector:VectorMap|undefined,protocols:ReturnType<typeof previewProtocols>|undefined;
  let vectorMode='',connectionDetail:MapConnection|undefined,detailDialog:HTMLDialogElement;
  function openConnection(id:string){connectionDetail=connections.find(item=>item.id===id);if(connectionDetail)detailDialog.showModal();}
  function startVector(){try{setWorkerUrl(mapWorkerUrl);vector=new VectorMap({container:vectorContainer,style:{version:8,sources:{},layers:[]},interactive:false,attributionControl:false,maxTileCacheSize:48});vector.on('style.load',()=>{if(!vector||!vectorMode.startsWith('online')||!vectorMode.endsWith('/dark'))return;for(const layer of vector.getStyle().layers){if(layer.type==='symbol'&&layer.layout?.['text-field']){vector.setPaintProperty(layer.id,'text-color','#EDF3E8');vector.setPaintProperty(layer.id,'text-halo-color','#182A24');vector.setPaintProperty(layer.id,'text-halo-width',1.6);}if(layer.type==='line'&&/road|highway|path|rail/i.test(layer.id)&&!/casing|case|tunnel/i.test(layer.id))vector.setPaintProperty(layer.id,'line-color','#C7D9AC');}});vector.on('error',(event)=>{if(String(event.error?.message).includes('Offline elevation coverage is unavailable'))return;onbasemap(vectorMode.startsWith('online')?'Online map unavailable · Check your internet connection':'Offline vector map unavailable');});}catch{vector?.remove();vector=undefined;protocols?.close();protocols=undefined;onbasemap('Vector map unavailable on this device');}}
  function syncVector(){
    if(!map||!vector)return;const center=map.getCenter(),[w,s,e,n]=manifest.bounds;
    const viewport=map.getBounds(),bounds:MapBounds=[viewport.getWest(),viewport.getSouth(),viewport.getEast(),viewport.getNorth()];
    const visible=visibleRegions(regions,bounds),region=visible[0],local=map.getZoom()>=11&&bounds[0]<=e&&bounds[2]>=w&&bounds[1]<=n&&bounds[3]>=s,root=region?regionSetRoot(regions):'',mode=(region?'regions/'+root:local?'local':'online')+($appearance.theme==='Dark'?'/dark':'/light');
    if(vectorMode!==mode){vectorMode=mode;protocols?.close();protocols=region||local?previewProtocols(region?{regionRoot:root,terrainTemplate:root+'/terrain/{z}/{x}/{y}.webp'}:{}):undefined;vector.setStyle(region?mapAppearance(downloadedStyle(regions),$appearance.theme==='Dark'):local?mapAppearance(outdoorStyle(protocols!.basemap,protocols!.terrain),$appearance.theme==='Dark'):$appearance.theme==='Dark'?'https://tiles.openfreemap.org/styles/dark':'https://tiles.openfreemap.org/styles/liberty',{diff:false});}
    vector.jumpTo({center:[center.lng,center.lat],zoom:map.getZoom()-1});
    onbasemap(region?offlineCoverageLabel(bounds,visible.map(area=>area.bounds),visible.length===1?region.name:undefined):local?offlineCoverageLabel(bounds,[manifest.bounds as MapBounds],'Outdoor map'):'Online map · Internet required');
  }
  import {LeafletMap,LatLngBounds,Circle,CircleMarker,Polyline,Popup,Rectangle,Marker,DivIcon} from 'leaflet';
  import 'leaflet/styles.css';
  import type {Position,MapMember} from './format';
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
  function reportCoverage(){syncVector();}
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
  onMount(()=>{let stopped=false,loading=false;const client=nativeVectorMaps();const refresh=async()=>{if(!client||loading)return;loading=true;try{const state=await client.snapshot();if(!stopped)regions=state.regions;}catch{}finally{loading=false;}};void refresh();const poll=setInterval(()=>void refresh(),5000);startVector();map=new LeafletMap(container,{zoomControl:false,attributionControl:false,minZoom:2,maxZoom:18,scrollWheelZoom:true,zoomAnimation:false,fadeAnimation:false});map.createPane('connections').style.zIndex='350';map.createPane('offline-area').style.zIndex='390';map.on('click',event=>{if((event.originalEvent?.target as Element)?.closest('.leaflet-interactive,.leaflet-tooltip,.leaflet-marker-icon'))return;const point={latitude:event.latlng.lat,longitude:event.latlng.lng};if(areaSelection){if(!areaLocked)onareapin?.(point);return;}const text=document.createElement('div');text.textContent=`${event.latlng.lat.toFixed(6)}, ${event.latlng.lng.toFixed(6)}`;text.setAttribute('aria-label','Pinned coordinates');if(onofflinepick){const button=document.createElement('button');button.textContent='Save this area offline';button.className='pin-save-area';button.addEventListener('click',()=>{map?.closePopup();onofflinepick?.(point);});text.append(document.createElement('br'),button);}new Popup({autoPanPaddingTopLeft:[16,104],autoPanPaddingBottomRight:[72,104]}).setLatLng(event.latlng).setContent(text).openOn(map!);});map.on('dragstart',interact);map.on('move zoom',syncVector);map.on('moveend zoomend',reportCoverage);const first=freshGroupPositions(fix,ageMs,active,members)[0];map.setView(first?[first.latitude,first.longitude]:[-25,135],first?15:4);syncConnections();syncMarkers();syncArea();defaultView();const observer=new ResizeObserver(()=>{map?.invalidateSize({pan:true,animate:false});vector?.resize();reportCoverage();});observer.observe(container);container.addEventListener('pointerdown',interact);container.addEventListener('wheel',interact,{passive:true});container.addEventListener('keydown',interact);return()=>{stopped=true;clearInterval(poll);container.removeEventListener('pointerdown',interact);container.removeEventListener('wheel',interact);container.removeEventListener('keydown',interact);observer.disconnect();vector?.remove();vector=undefined;protocols?.close();map?.remove();map=undefined;markers.clear();connectionLines.clear();};});
</script>
<div class="vector-background" bind:this={vectorContainer} aria-hidden="true"></div>
<div class="geographic-map" bind:this={container} aria-label="Geographic map and group positions"></div>
<dialog bind:this={detailDialog} aria-label="Connection signal" class="signal-detail"><button class="close-signal" onclick={()=>detailDialog.close()} aria-label="Close connection signal">Close</button>{#if connectionDetail}<h3>{connectionDetail.from.name} ↔ {connectionDetail.to.name}</h3><strong>{connectionDetail.strength}</strong><p>{connectionDetail.detail}</p>{/if}</dialog>
<style>.vector-background,.geographic-map{position:absolute;inset:0;height:100%;min-height:0}.geographic-map{background:transparent!important}.signal-detail{max-width:420px;width:calc(100% - 32px);border:1px solid var(--line);border-radius:22px;padding:22px;background:var(--card);color:var(--ink);box-shadow:0 12px 60px #0003}.signal-detail::backdrop{background:var(--scrim)}.signal-detail p{font-size:0.8125rem;line-height:1.6}.close-signal{float:right;border:0;background:transparent;color:inherit;min-height:44px;padding:8px}.signal-detail h3{font-size:1.125rem;clear:both}:global(.offline-area-pin){display:block;box-sizing:border-box;width:27px;height:27px;border:3px solid var(--raised);border-radius:50% 50% 50% 0;background:var(--accent);transform:rotate(-45deg);box-shadow:0 2px 7px #0004}:global(.pin-save-area){min-height:36px;margin-top:5px;border:0;border-radius:8px;padding:6px 10px;background:var(--green);color:var(--on-action);font:inherit;font-weight:700}:global(.leaflet-tooltip){font-family:inherit;border-radius:8px;color:var(--ink);background:var(--raised);border:1px solid var(--control-line);font-weight:700}:global(.leaflet-control-container){display:none}</style>
