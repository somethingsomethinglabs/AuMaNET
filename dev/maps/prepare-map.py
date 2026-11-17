"""Prepare one local GeoTIFF into a bounded, verified AuMaNET raster pack.

Rasterio/GDAL performs windowed projection/resampling; no whole-sheet JavaScript
decode. Input and generated maps stay private unless their licence permits sharing.
"""
from __future__ import annotations
import argparse, hashlib, io, json, math, os, struct, tempfile
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.vrt import WarpedVRT
from rasterio.warp import transform_bounds
from rasterio.windows import from_bounds
from rasterio.shutil import copy as raster_copy
from PIL import Image

WORLD = 20037508.342789244
def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''): h.update(block)
    return h.hexdigest()
def tile_bounds(z:int,x:int,y:int):
    edge=2*WORLD/(2**z)
    return (-WORLD+x*edge,WORLD-(y+1)*edge,-WORLD+(x+1)*edge,WORLD-y*edge)
def tile_range(bounds,z):
    west,south,east,north=bounds; n=2**z
    return (max(0,int((west+WORLD)/(2*WORLD)*n)),max(0,int((WORLD-north)/(2*WORLD)*n)),min(n-1,int(math.nextafter((east+WORLD)/(2*WORLD)*n,-math.inf))),min(n-1,int(math.nextafter((WORLD-south)/(2*WORLD)*n,-math.inf))))
def render_tile(tiled,vrt,bounds):
    if tiled.crs.to_epsg()==3857:
        window=from_bounds(*bounds,transform=tiled.transform)
        rgb=tiled.read([1,2,3],window=window,out_shape=(3,256,256),boundless=True,resampling=Resampling.bilinear,fill_value=0)
        # Rasterio dataset_mask(boundless=True) can return an all-zero mask for
        # a bottom/right partial window despite returning valid RGB samples.
        # These RGB sheets have no nodata mask: derive exact footprint coverage
        # from destination pixel centers, independently of that boundless mask.
        columns=window.col_off+(np.arange(256)+.5)*window.width/256
        rows=window.row_off+(np.arange(256)+.5)*window.height/256
        alpha=(((rows>=0)&(rows<tiled.height))[:,np.newaxis]&((columns>=0)&(columns<tiled.width))[np.newaxis,:]).astype('uint8')*255
        return np.concatenate((rgb,alpha[np.newaxis,:,:]),axis=0)
    from rasterio.warp import reproject
    from rasterio.transform import from_bounds as affine_bounds
    tile=np.zeros((4,256,256),dtype='uint8')
    for band in range(1,5):
        reproject(rasterio.band(vrt,band),tile[band-1],src_transform=vrt.transform,src_crs=vrt.crs,dst_transform=affine_bounds(*bounds,256,256),dst_crs='EPSG:3857',resampling=Resampling.bilinear,warp_mem_limit=16,num_threads=1)
    return tile

def encode_tile(tile,palette_colours=0):
    image=Image.fromarray(tile.transpose(1,2,0))
    if palette_colours:image=image.quantize(colors=palette_colours,method=Image.Quantize.FASTOCTREE,dither=Image.Dither.NONE)
    out=io.BytesIO();image.save(out,format='PNG',compress_level=6);return out.getvalue()
def prepare(args):
    source=Path(args.input).resolve();output=Path(args.output).resolve()
    if source==output: raise ValueError('Input and output must differ')
    if not 0<=args.min_zoom<=args.max_zoom<=18: raise ValueError('Zooms must be within 0–18')
    metadata=json.loads(Path(args.source_metadata).read_text('utf-8-sig'))
    output.parent.mkdir(parents=True,exist_ok=True)
    with rasterio.Env(GDAL_CACHEMAX=32_000_000),rasterio.open(source) as src:
        if src.crs is None: raise ValueError('GeoTIFF has no coordinate reference system')
        if src.count<3 or src.dtypes[:3]!=('uint8','uint8','uint8'): raise ValueError('Expected three 8-bit RGB bands')
        if src.nodata is not None or any(rasterio.enums.MaskFlags.all_valid not in flags for flags in src.mask_flag_enums[:3]): raise ValueError('This preparation version requires RGB sheets without nodata masks')
        geographic=transform_bounds(src.crs,'EPSG:4326',*src.bounds,densify_pts=21)
        mercator=transform_bounds(src.crs,'EPSG:3857',*src.bounds,densify_pts=21)
        ranges=[(z,tile_range(mercator,z)) for z in range(args.min_zoom,args.max_zoom+1)]
        count=sum((x1-x0+1)*(y1-y0+1) for _,(x0,y0,x1,y1) in ranges)
        if count>8192: raise ValueError(f'{count} tiles exceeds the 8192 tile limit; lower max zoom or prepare a smaller sheet')
        palette_colours=getattr(args,'palette_colours',0)
        if palette_colours not in (0,256):raise ValueError('Palette conversion must be explicitly 256 colours or disabled')
        colour_change='explicit 256-colour palette quantization' if palette_colours else 'full-colour PNG output without colour quantization'
        manifest={'schema':'aumanet.offline-map.v1','id':args.id,'title':args.title,'bounds':list(geographic),'minZoom':args.min_zoom,'maxZoom':args.max_zoom,'tileSize':256,'format':'image/png','source':{**metadata,'fileName':source.name,'sha256':digest(source),'preparedAt':datetime.now(timezone.utc).isoformat(),'changes':f'Local GeoTIFF converted to EPSG:3857 XYZ PNG tiles with bilinear resampling and {colour_change}. Original source retained; transparent margins added.'},'tiles':[]}
        records=[];total=0
        with tempfile.TemporaryDirectory(prefix='aumanet-map-') as scratch:
            # Retile the publisher's long JPEG strips once, preserving the original.
            # Overviews avoid repeatedly decoding a full sheet for low-zoom tiles.
            print('Preparing tiled raster and overviews…',flush=True)
            cog=Path(scratch)/'source.tif'
            raster_copy(src,str(cog),driver='COG',BLOCKSIZE=256,COMPRESS='DEFLATE',PREDICTOR=2,NUM_THREADS='1',OVERVIEW_RESAMPLING='BILINEAR')
            with rasterio.open(cog) as tiled,WarpedVRT(tiled,crs='EPSG:3857',resampling=Resampling.bilinear,add_alpha=True,warp_mem_limit=32) as vrt:
                for z,(x0,y0,x1,y1) in ranges:
                    for y in range(y0,y1+1):
                        for x in range(x0,x1+1):
                            bounds=tile_bounds(z,x,y);tile=render_tile(tiled,vrt,bounds)
                            data=encode_tile(tile,palette_colours)
                            if len(data)>512*1024: raise ValueError('Encoded tile exceeds reader limit')
                            entry={'z':z,'x':x,'y':y,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
                            manifest['tiles'].append(entry);total+=len(data)
                            if total>512*1024*1024: raise ValueError('Map pack exceeds 512 MiB limit')
                            tile_file=Path(scratch)/f'{len(records)}.png';tile_file.write_bytes(data);records.append(tile_file)
                    print(f'zoom {z}: {len(records)}/{count} tiles, {total/1048576:.1f} MiB',flush=True)
            encoded=json.dumps(manifest,separators=(',',':'),ensure_ascii=False).encode('utf-8')
            if len(encoded)>2*1024*1024: raise ValueError('Map manifest exceeds 2 MiB limit')
            temporary=output.with_suffix(output.suffix+'.partial')
            try:
                with temporary.open('wb') as stream:
                    stream.write(b'AUMAP001');stream.write(struct.pack('>I',len(encoded)));stream.write(encoded)
                    for tile_file in records:
                        with tile_file.open('rb') as tile_input:
                            for block in iter(lambda:tile_input.read(65536),b''):stream.write(block)
                    stream.flush();os.fsync(stream.fileno())
                temporary.replace(output)
            finally:
                if temporary.exists():temporary.unlink()
        report={'pack':output.name,'packBytes':output.stat().st_size,'packSha256':digest(output),'manifest':manifest,'sourceRaster':{'crs':str(src.crs),'width':src.width,'height':src.height,'transform':list(src.transform),'bounds':list(src.bounds)},'preparation':{'rasterio':rasterio.__version__,'gdal':rasterio.__gdal_version__,'maxRasterTileBytes':4*256*256,'gdalCacheBytes':32_000_000,'warpMemoryMiB':32}}
        output.with_suffix('.manifest.json').write_text(json.dumps(report,indent=2),'utf-8')
        print(json.dumps({k:report[k] for k in ['pack','packBytes','packSha256']},indent=2))
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('input');parser.add_argument('output');parser.add_argument('--id',required=True);parser.add_argument('--title',required=True);parser.add_argument('--source-metadata',required=True);parser.add_argument('--min-zoom',type=int,default=10);parser.add_argument('--max-zoom',type=int,default=15);parser.add_argument('--palette-colours',type=int,choices=[0,256],default=0,help='Explicit lossy palette conversion; default0 preserves full colour');prepare(parser.parse_args())
