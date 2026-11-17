import type {StyleSpecification,ExpressionSpecification,LayerSpecification} from 'maplibre-gl';
import {manifest} from './archive';
const name:ExpressionSpecification=['coalesce',['get','name:en'],['get','name'],''];
const font=['Noto Sans Regular'];
const walking:ExpressionSpecification=['in',['get','kind_detail'],['literal',['footway','path','steps','bridleway','pedestrian','sidewalk','crossing']]];
const track:ExpressionSpecification=['==',['get','kind_detail'],'track'];
const road:ExpressionSpecification=['all',['!',walking],['!',track],['!=',['get','kind'],'rail']];
const width:ExpressionSpecification=['interpolate',['linear'],['zoom'],10,1,13,2.5,16,5,19,10];
export function outdoorStyle(basemap:string,terrain:string):StyleSpecification {
  const layers:LayerSpecification[]=[
    {id:'background',type:'background',paint:{'background-color':'#f3f0e5'}},
    {id:'landuse',type:'fill',source:'base','source-layer':'landuse',paint:{'fill-color':['match',['get','kind'],'forest','#d5e3cb','wood','#d5e3cb','nature_reserve','#e0e9d3','park','#e0e9d3','grass','#e6ebd5','farmland','#eee9cd','residential','#e9e5dd','#e9e8d7'],'fill-opacity':.65}},
    {id:'hillshade',type:'hillshade',source:'terrain',paint:{'hillshade-exaggeration':.25,'hillshade-shadow-color':'#626d61','hillshade-highlight-color':'#fffdf5','hillshade-accent-color':'#8a937c'}},
    {id:'water',type:'fill',source:'base','source-layer':'water',filter:['==',['geometry-type'],'Polygon'],paint:{'fill-color':'#aed5e0'}},
    {id:'waterways',type:'line',source:'base','source-layer':'water',filter:['==',['geometry-type'],'LineString'],paint:{'line-color':'#639fb4','line-width':['interpolate',['linear'],['zoom'],10,.5,16,1.8]}},
    {id:'contour-lines',type:'line',source:'contours','source-layer':'contours',minzoom:13,paint:{'line-color':'#81775f','line-opacity':.5,'line-width':['case',['>', ['get','level'],0],1,.45]}},
    {id:'buildings',type:'fill',source:'base','source-layer':'buildings',minzoom:14,paint:{'fill-color':'#cbc4b8','fill-outline-color':'#a99f91'}},
    {id:'road-casing',type:'line',source:'base','source-layer':'roads',filter:road,layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#b6ac94','line-width':['interpolate',['linear'],['zoom'],10,2.4,13,3.9,16,6.4,19,11.4]}},
    {id:'roads',type:'line',source:'base','source-layer':'roads',filter:road,layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['match',['get','kind'],'highway','#e4bf79','major_road','#edcf98','#fffdf7'],'line-width':width}},
    {id:'tracks',type:'line',source:'base','source-layer':'roads',filter:track,layout:{'line-join':'round'},paint:{'line-color':'#99704b','line-width':['interpolate',['linear'],['zoom'],10,1,15,2.1,19,4],'line-dasharray':[4,1.5]}},
    {id:'walking-paths',type:'line',source:'base','source-layer':'roads',filter:walking,layout:{'line-cap':'round'},paint:{'line-color':'#80543f','line-width':['interpolate',['linear'],['zoom'],10,.8,15,1.6,19,3],'line-dasharray':[1,2]}},
    {id:'restricted-access',type:'line',source:'base','source-layer':'roads',filter:['in',['get','access'],['literal',['private','no']]],paint:{'line-color':'#a44b51','line-width':1.3,'line-dasharray':[2,3]}},
    {id:'road-labels',type:'symbol',source:'base','source-layer':'roads',minzoom:12,layout:{'symbol-placement':'line','text-field':name,'text-font':font,'text-size':['interpolate',['linear'],['zoom'],12,10,17,13],'text-max-angle':35,'symbol-spacing':300},paint:{'text-color':'#494b3d','text-halo-color':'#fffdf3','text-halo-width':1.6}},
    {id:'contour-labels',type:'symbol',source:'contours','source-layer':'contours',minzoom:13,filter:['>', ['get','level'],0],layout:{'symbol-placement':'line','text-field':['concat',['to-string',['get','ele']],' m'],'text-font':font,'text-size':10,'symbol-spacing':250},paint:{'text-color':'#786c55','text-halo-color':'#f6f3e9','text-halo-width':1}},
    {id:'housenumbers',type:'symbol',source:'base','source-layer':'buildings',minzoom:17,layout:{'text-field':['coalesce',['get','addr_housenumber'],''],'text-font':font,'text-size':10},paint:{'text-color':'#756858'}},
    {id:'outdoor-pois',type:'circle',source:'base','source-layer':'pois',minzoom:12,filter:['in',['get','kind'],['literal',['camp_site','campground','drinking_water','toilets','shelter','peak','alpine_hut','wilderness_hut','picnic_site','viewpoint','fuel']]],paint:{'circle-color':'#426d55','circle-radius':3,'circle-stroke-width':1.2,'circle-stroke-color':'#fffdf3'}},
    {id:'outdoor-poi-labels',type:'symbol',source:'base','source-layer':'pois',minzoom:14,filter:['in',['get','kind'],['literal',['camp_site','campground','drinking_water','toilets','shelter','peak','alpine_hut','wilderness_hut','picnic_site','viewpoint','fuel']]],layout:{'text-field':name,'text-font':font,'text-size':11,'text-anchor':'top','text-offset':[0,.6]},paint:{'text-color':'#365240','text-halo-color':'#fffdf3','text-halo-width':1.4}},
    {id:'place-labels',type:'symbol',source:'base','source-layer':'places',layout:{'text-field':name,'text-font':font,'text-size':['interpolate',['linear'],['zoom'],10,12,15,17],'text-max-width':8},paint:{'text-color':'#394b3b','text-halo-color':'#fffdf3','text-halo-width':1.5}},
  ];
  return{version:8,name:'AuMaNET Outdoor',glyphs:`${globalThis.location.origin}/maps/outdoor-preview/fonts/{fontstack}/{range}.pbf`,
    sources:{base:{type:'vector',url:basemap,bounds:manifest.bounds as [number,number,number,number]},terrain:{type:'raster-dem',url:terrain,encoding:'terrarium',tileSize:512,maxzoom:14},contours:{type:'vector',tiles:['aumanet-contours://{z}/{x}/{y}'],minzoom:13,maxzoom:14,bounds:manifest.bounds as [number,number,number,number]}},layers};
}

export function downloadedStyle(region:import('./downloads').VectorRegion):StyleSpecification{
  const root=globalThis.location.origin+'/_aumanet_maps/vector/'+region.id;
  const style=outdoorStyle('','');style.name='AuMaNET Offline · '+region.name;
  style.glyphs=root+'/glyphs/{fontstack}/{range}.pbf';
  style.sources.base={type:'vector',tiles:[root+'/base/{z}/{x}/{y}.pbf'],minzoom:0,maxzoom:15,bounds:region.bounds};
  if(region.terrain){style.sources.terrain={type:'raster-dem',tiles:[root+'/terrain/{z}/{x}/{y}.webp'],encoding:'terrarium',tileSize:512,minzoom:0,maxzoom:14,bounds:region.bounds};style.sources.contours={type:'vector',tiles:['aumanet-contours://{z}/{x}/{y}'],minzoom:13,maxzoom:14,bounds:region.bounds};}
  else{delete style.sources.terrain;delete style.sources.contours;style.layers=style.layers.filter(layer=>!['hillshade','contour-lines','contour-labels'].includes(layer.id));}
  return style;
}
