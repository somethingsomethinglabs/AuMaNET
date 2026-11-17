"""Check two prepared packs at user-supplied public reference points and overlap samples.

References JSON: [{"name":"Public landmark", "latitude":..., "longitude":...}, ...].
No network access and no reference coordinates in the output. This compares raster
alignment, not surveyed map accuracy or the accuracy of a phone position.
"""
from __future__ import annotations
import argparse,hashlib,io,json,math,struct
from functools import lru_cache
from pathlib import Path
import numpy as np
from PIL import Image

WORLD=20037508.342789244
def digest(path):
    sha=hashlib.sha256()
    with path.open('rb')as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):sha.update(chunk)
    return sha.hexdigest()
class Pack:
    def __init__(self,path):
        self.path=Path(path);self.file=self.path.open('rb')
        if self.file.read(8)!=b'AUMAP001':raise ValueError('Invalid map pack magic')
        size=struct.unpack('>I',self.file.read(4))[0]
        if not 2<=size<=2*1024*1024:raise ValueError('Invalid map manifest size')
        self.manifest=json.loads(self.file.read(size));self.index={};offset=self.file.tell();tiles=self.manifest['tiles']
        low=self.manifest['minZoom'];high=self.manifest['maxZoom']
        if self.manifest['schema']!='aumanet.offline-map.v1'or self.manifest['tileSize']!=256 or self.manifest['format']!='image/png'or type(low)is not int or type(high)is not int or not 0<=low<=high<=18:raise ValueError('Unsupported map manifest')
        if not 1<=len(tiles)<=8192:raise ValueError('Invalid map tile count')
        for tile in tiles:
            if any(type(tile[k])is not int for k in['z','x','y','bytes'])or not low<=tile['z']<=high or not 0<=tile['x']<2**tile['z']or not 0<=tile['y']<2**tile['z']or not 8<=tile['bytes']<=512*1024:raise ValueError('Invalid map tile index/size')
            self.index[(tile['z'],tile['x'],tile['y'])]=(offset,tile);offset+=tile['bytes']
        if offset-12-size>512*1024*1024:raise ValueError('Map payload exceeds 512 MiB')
        if offset!=self.path.stat().st_size:raise ValueError('Map payload size mismatch')
    @lru_cache(maxsize=128)
    def tile(self,z,x,y):
        if(z,x,y)not in self.index:return Image.new('RGBA',(256,256))
        offset,tile=self.index[(z,x,y)];self.file.seek(offset);data=self.file.read(tile['bytes'])
        if hashlib.sha256(data).hexdigest()!=tile['sha256']:raise ValueError('Map tile checksum mismatch')
        if len(data)<24 or data[:8]!=b'\x89PNG\r\n\x1a\n' or data[12:16]!=b'IHDR' or struct.unpack('>II',data[16:24])!=(256,256):raise ValueError('Invalid 256-pixel PNG tile')
        return Image.open(io.BytesIO(data)).convert('RGBA')
    def address(self,latitude,longitude,zoom):
        # Standard XYZ Web Mercator equations, independently of the preparer.
        size=2**zoom;tx=(longitude+180)/360*size;ty=(1-math.asinh(math.tan(latitude*math.pi/180))/math.pi)/2*size
        return math.floor(tx),math.floor(ty),min(255,int((tx%1)*256)),min(255,int((ty%1)*256))
    def alpha(self,latitude,longitude,zoom):
        x,y,px,py=self.address(latitude,longitude,zoom);return self.tile(zoom,x,y).getpixel((px,py))[3]
    def crop(self,latitude,longitude,zoom):
        x,y,px,py=self.address(latitude,longitude,zoom);image=Image.new('RGBA',(768,768))
        for dx in[-1,0,1]:
            for dy in[-1,0,1]:image.paste(self.tile(zoom,x+dx,y+dy),((dx+1)*256,(dy+1)*256))
        return image.crop((256+px-128,256+py-128,256+px+128,256+py+128))
    def close(self):self.file.close();self.tile.cache_clear()
def contains(bounds,latitude,longitude):return bounds[0]<=longitude<=bounds[2]and bounds[1]<=latitude<=bounds[3]
def edges(image):
    grey=np.asarray(image.convert('RGB'),dtype=np.float64).mean(axis=2);dy,dx=np.gradient(grey);return np.hypot(dx,dy)
def main(args):
    points=json.loads(Path(args.references).read_text('utf-8-sig'))
    if not isinstance(points,list)or not 2<=len(points)<=16:raise ValueError('Provide 2–16 public reference points')
    a=Pack(args.first);b=Pack(args.second)
    try:
        zoom=min(a.manifest['maxZoom'],b.manifest['maxZoom'])
        if zoom<max(a.manifest['minZoom'],b.manifest['minZoom']):raise ValueError('Packs have no common native zoom')
        refs=[]
        for point in points:
            name=point['name'];lat=point['latitude'];lon=point['longitude']
            if not isinstance(name,str)or not 1<=len(name)<=120 or not isinstance(lat,(float,int))or not isinstance(lon,(float,int))or not math.isfinite(lat)or not math.isfinite(lon)or abs(lat)>85.05112878 or abs(lon)>180:raise ValueError('Invalid public reference')
            if not contains(a.manifest['bounds'],lat,lon)or not contains(b.manifest['bounds'],lat,lon):raise ValueError(f'Reference is outside the overlap: {name}')
            ia=a.crop(lat,lon,zoom);ib=b.crop(lat,lon,zoom);ea=edges(ia);eb=edges(ib);aa=ea[16:-16,16:-16];aa=aa-aa.mean();matches=[]
            for dy in range(-4,5):
                for dx in range(-4,5):
                    bb=eb[16+dy:240+dy,16+dx:240+dx];bb=bb-bb.mean();denominator=float(np.sum(aa*aa)*np.sum(bb*bb));score=float(np.sum(aa*bb)/np.sqrt(denominator))if denominator else-1;matches.append((score,dx,dy))
            score,dx,dy=max(matches)
            if abs(dx)>1 or abs(dy)>1 or score<.5:raise ValueError(f'Inspect source georeferencing/cartographic differences at {name}: offset {dx},{dy}, correlation {score:.3f}')
            if a.alpha(lat,lon,zoom)!=255 or b.alpha(lat,lon,zoom)!=255:raise ValueError(f'Reference lacks opaque data in both packs: {name}')
            refs.append({'publicLandmark':name,'bestIntegerOffsetNativePixels':[dx,dy],'edgeCorrelation':score})
        w=max(a.manifest['bounds'][0],b.manifest['bounds'][0]);s=max(a.manifest['bounds'][1],b.manifest['bounds'][1]);e=min(a.manifest['bounds'][2],b.manifest['bounds'][2]);n=min(a.manifest['bounds'][3],b.manifest['bounds'][3])
        if w>=e or s>=n:raise ValueError('Map footprints do not overlap')
        margin_x=min(.001,(e-w)/100);margin_y=min(.001,(n-s)/100);samples=0
        for longitude in np.linspace(w+margin_x,e-margin_x,5):
            for latitude in np.linspace(s+margin_y,n-margin_y,256):
                if a.alpha(float(latitude),float(longitude),zoom)!=255 or b.alpha(float(latitude),float(longitude),zoom)!=255:raise ValueError('Missing raster data inside the declared overlap')
                samples+=1
        result={'status':'pass','packs':[{'file':p.path.name,'sha256':digest(p.path)}for p in[a,b]],'nativeZoom':zoom,'publicReferenceAlignment':refs,'overlapSamplesWithOpaqueDataInBothSheets':samples,'scope':'Actual prepared regional packs with supplied public references; raster alignment, not surveyed accuracy or phone-position evidence.'}
        if args.output:Path(args.output).write_text(json.dumps(result,indent=2),'utf-8')
        print(json.dumps(result))
    finally:a.close();b.close()
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('first');parser.add_argument('second');parser.add_argument('--references',required=True);parser.add_argument('--output');main(parser.parse_args())
