import type {StyleSpecification} from 'maplibre-gl';
import {mapBackground} from './style';
import type {MapConnection} from '../connections';
const darkWater='#416478',darkVegetation='#344A36';

/** Match the saved map's land and water contrast in the OpenFreeMap dark style. */
export function onlineDarkAppearance(style:StyleSpecification):StyleSpecification{
  for(const layer of style.layers){
    if(layer.type==='background')layer.paint={...layer.paint,'background-color':mapBackground.dark};
    if(layer.type==='fill'){
      if(layer.id==='water')layer.paint={...layer.paint,'fill-color':darkWater};
      if(layer.id==='landuse_park')layer.paint={...layer.paint,'fill-color':darkVegetation};
      if(layer.id==='landcover_wood'){
        layer.minzoom=8;
        layer.paint={...layer.paint,'fill-color':darkVegetation};
        delete layer.paint['fill-pattern'];
      }
    }
    if(layer.type==='symbol'&&layer.layout?.['text-field']){
      layer.paint={...layer.paint,'text-color':'#EDF3E8','text-halo-color':'#182A24','text-halo-width':1.6};
    }
    if(layer.type==='line'&&/road|highway|path|rail/i.test(layer.id)&&!/casing|case|tunnel/i.test(layer.id)){
      layer.paint={...layer.paint,'line-color':'#C7D9AC'};
    }
  }
  return style;
}

/** Signal remains an illustrative continuous scale, with the exact directional
 * observation in text. Every endpoint uses the approved semantic palette. */
export function connectionAppearance(connection:MapConnection,dark:boolean){
  if(connection.dashed||connection.signal?.rssiDbm===undefined)return dark?'#D2DED4':'#626D60';
  const value=Math.min(-40,Math.max(-100,connection.signal.rssiDbm));
  const stops=dark?[[255,185,171],[241,212,154],[185,212,168]]:[[168,72,53],[115,84,33],[49,94,71]];
  const half=value<=-70?0:1,t=(value+100-half*30)/30;
  return '#'+stops[half]!.map((v,index)=>Math.round(v+(stops[half+1]![index]!-v)*t).toString(16).padStart(2,'0')).join('');
}
/** Recolour our styleable vector layers, preserving source data, layer order,
 * widths, dash patterns, filters and labels. Fixed raster tiles remain intact. */
export function mapAppearance(style:StyleSpecification,dark:boolean):StyleSpecification{
  if(!dark)return style;
  const result=structuredClone(style);
  for(const layer of result.layers){
    if(layer.type==='background')layer.paint={...layer.paint,'background-color':mapBackground.dark};
    if(layer.type==='fill'){
      if(layer.id==='water')layer.paint={...layer.paint,'fill-color':darkWater};
      else if(layer.id==='landuse')layer.paint={...layer.paint,'fill-color':['match',['get','kind'],'forest',darkVegetation,'wood',darkVegetation,'nature_reserve',darkVegetation,'park',darkVegetation,'#25392F'],'fill-opacity':1};
      else layer.paint={...layer.paint,'fill-color':darkVegetation,'fill-outline-color':'#799482'};
    }
    if(layer.type==='line')layer.paint={...layer.paint,'line-color':layer.id==='road-casing'?'#182A24':layer.id==='waterways'?'#416478':layer.id==='contour-lines'?'#799482':layer.id==='restricted-access'?'#FFB9AB':'#C7D9AC'};
    if(layer.type==='symbol')layer.paint={...layer.paint,'text-color':'#EDF3E8','text-halo-color':'#182A24','text-halo-width':1.6};
    if(layer.type==='circle')layer.paint={...layer.paint,'circle-color':'#D3E6A4','circle-stroke-color':'#182A24'};
    if(layer.type==='hillshade')layer.paint={...layer.paint,'hillshade-shadow-color':'#10271F','hillshade-highlight-color':'#799482','hillshade-accent-color':darkVegetation};
  }
  return result;
}
