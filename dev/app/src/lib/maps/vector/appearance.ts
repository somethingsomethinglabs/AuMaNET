import type {StyleSpecification} from 'maplibre-gl';
import type {MapConnection} from '../connections';
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
    if(layer.type==='background')layer.paint={...layer.paint,'background-color':'#25392F'};
    if(layer.type==='fill'){
      if(layer.id==='water')layer.paint={...layer.paint,'fill-color':'#416478'};
      else if(layer.id==='landuse')layer.paint={...layer.paint,'fill-color':['match',['get','kind'],'forest','#344A36','wood','#344A36','nature_reserve','#344A36','park','#344A36','#25392F'],'fill-opacity':1};
      else layer.paint={...layer.paint,'fill-color':'#344A36','fill-outline-color':'#799482'};
    }
    if(layer.type==='line')layer.paint={...layer.paint,'line-color':layer.id==='road-casing'?'#182A24':layer.id==='waterways'?'#416478':layer.id==='contour-lines'?'#799482':layer.id==='restricted-access'?'#FFB9AB':'#C7D9AC'};
    if(layer.type==='symbol')layer.paint={...layer.paint,'text-color':'#EDF3E8','text-halo-color':'#182A24','text-halo-width':1.6};
    if(layer.type==='circle')layer.paint={...layer.paint,'circle-color':'#D3E6A4','circle-stroke-color':'#182A24'};
    if(layer.type==='hillshade')layer.paint={...layer.paint,'hillshade-shadow-color':'#10271F','hillshade-highlight-color':'#799482','hillshade-accent-color':'#344A36'};
  }
  return result;
}
