package au.aumanet.app.maps;

import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

/** Immutable, app-private vector regions. A manifest becomes visible only by atomic rename. */
public final class VectorRegions {
    public static final long MAX_BYTES=256L*1024*1024;
    public static final int MAX_TILES=8192,MAX_REGIONS=4;
    private static final Map<String,Cached> CACHE=new LinkedHashMap<String,Cached>(16,.75f,true){protected boolean removeEldestEntry(Map.Entry<String,Cached> e){return size()>16;}};
    private static final class Cached {final long modified,length;final JSONObject value;Cached(File f,JSONObject value){modified=f.lastModified();length=f.length();this.value=value;}}
    public static final class Plan {
        public final double[] bounds;
        public final String name,key;
        public final boolean terrain;public final int radiusKm;
        public final List<int[]> base=new ArrayList<>(),dem=new ArrayList<>();
        public Plan(double latitude,double longitude,int radius,String name,boolean terrain)throws Exception{
            if(!Double.isFinite(latitude)||!Double.isFinite(longitude)||latitude< -80||latitude>80||longitude< -180||longitude>180||(radius<2||radius>25))throw new IOException("Choose a valid map centre and a distance between 2 and 25 km");
            this.name=name==null?"Offline area":name.trim();if(this.name.isEmpty()||this.name.length()>64||this.name.codePoints().anyMatch(c->Character.isISOControl(c)))throw new IOException("Use an area name of 1–64 characters");
            this.terrain=terrain;this.radiusKm=radius;double dy=radius/111.32,dx=dy/Math.cos(Math.toRadians(latitude));bounds=new double[]{longitude-dx,latitude-dy,longitude+dx,latitude+dy};
            if(bounds[0]< -180||bounds[2]>180||bounds[1]< -85||bounds[3]>85)throw new IOException("Choose an area away from the date line and poles");
            tiles(base,bounds,15,0);if(terrain)tiles(dem,bounds,14,1);if(base.size()+dem.size()>MAX_TILES)throw new IOException("Choose a smaller area");
            key=sha((String.format(Locale.ROOT,"%.6f,%.6f,%d,%s",latitude,longitude,radius,terrain)).getBytes(StandardCharsets.UTF_8));
        }
        public int count(){return base.size()+dem.size();}
    }
    private static void tiles(List<int[]> out,double[] bounds,int max,int buffer){for(int z=0;z<=max;z++){int padding=z>=13?buffer:0;int n=1<<z,x0=(int)Math.floor((bounds[0]+180)/360*n)-padding,x1=(int)Math.floor((bounds[2]+180)/360*n)+padding,y0=(int)Math.floor(y(bounds[3],n))-padding,y1=(int)Math.floor(y(bounds[1],n))+padding;for(int x=Math.max(0,x0);x<=Math.min(n-1,x1);x++)for(int y=Math.max(0,y0);y<=Math.min(n-1,y1);y++)out.add(new int[]{z,x,y});}}
    private static double y(double lat,int n){double r=Math.toRadians(lat);return(1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*n;}
    public static boolean id(String value){return value!=null&&value.matches("[a-f0-9]{32}");}
    public static boolean path(String value){return value!=null&&(value.matches("(base|terrain)/[0-9]{1,2}/[0-9]{1,6}/[0-9]{1,6}\\.(pbf|webp)")||value.matches("glyphs/[0-9]{1,5}-[0-9]{1,5}\\.pbf"));}
    public static JSONObject manifest(File dir)throws Exception{
        File file=new File(dir,"manifest.json");if(!file.isFile()||file.length()<2||file.length()>2*1024*1024)throw new IOException("Invalid offline region manifest");
        synchronized(CACHE){Cached cached=CACHE.get(file.getAbsolutePath());if(cached!=null&&cached.modified==file.lastModified()&&cached.length==file.length())return cached.value;}
        byte[] metadata;try(InputStream input=new FileInputStream(file)){metadata=VectorPmtiles.bounded(input,2*1024*1024);}
        JSONObject m=new JSONObject(new String(metadata,StandardCharsets.UTF_8));
        if(!m.getString("schema").equals("aumanet.vector-region.v1")||!id(m.getString("id"))||!dir.getName().equals(m.getString("id"))||m.getLong("bytes")<1||m.getLong("bytes")>MAX_BYTES||m.getString("name").length()>64)throw new IOException("Invalid offline region");
        JSONArray bounds=m.getJSONArray("bounds");if(bounds.length()!=4)throw new IOException("Invalid region bounds");for(int i=0;i<4;i++)if(!Double.isFinite(bounds.getDouble(i)))throw new IOException("Invalid region bounds");
        if(bounds.getDouble(0)< -180||bounds.getDouble(2)>180||bounds.getDouble(1)< -85||bounds.getDouble(3)>85||bounds.getDouble(0)>=bounds.getDouble(2)||bounds.getDouble(1)>=bounds.getDouble(3))throw new IOException("Invalid region bounds");
        JSONObject files=m.getJSONObject("files");if(files.length()<1||files.length()>MAX_TILES+257)throw new IOException("Invalid region file count");long bytes=0;Iterator<String> keys=files.keys();while(keys.hasNext()){String p=keys.next();JSONObject row=files.getJSONObject(p);long length=row.getLong("bytes");if(!path(p)||length<0||length>VectorPmtiles.LIMIT||!row.getString("sha256").matches("[a-f0-9]{64}"))throw new IOException("Invalid region file");bytes+=length;}if(bytes!=m.getLong("bytes"))throw new IOException("Invalid region byte count");synchronized(CACHE){CACHE.put(file.getAbsolutePath(),new Cached(file,m));}return m;
    }
    public static List<JSONObject> list(File root){List<JSONObject> list=new ArrayList<>();File[] dirs=root.listFiles();if(dirs!=null)for(File dir:dirs)if(id(dir.getName()))try{list.add(manifest(dir));}catch(Exception ignored){}list.sort((a,b)->Long.compare(b.optLong("installedAt"),a.optLong("installedAt")));return list;}
    public static JSONObject summary(JSONObject m)throws JSONException{JSONObject row=new JSONObject();for(String key:new String[]{"id","key","name","bounds","bytes","installedAt","terrain","dataDate"})row.put(key,m.get(key));return row;}
    /** Resolve one verified tile across immutable regions, in caller supplied priority order. */
    public static File fileFromSet(File root,String set,String path)throws Exception{
        if(set==null||!set.matches("[a-f0-9]{32}(_[a-f0-9]{32}){0,3}")||!path(path))throw new IOException("Invalid vector region set");
        Set<String> seen=new HashSet<>(Arrays.asList(set.split("_")));if(seen.size()!=set.split("_").length)throw new IOException("Duplicate vector region");
        for(String id:set.split("_")){File dir=new File(root,id);if(!new File(dir,"manifest.json").isFile())continue;JSONObject m=manifest(dir);if(m.getJSONObject("files").has(path))return file(root,id,path);}
        return null;
    }
    public static File file(File root,String id,String path)throws Exception{
        if(!id(id)||!path(path))throw new IOException("Invalid vector tile path");File dir=new File(root,id);JSONObject m=manifest(dir),entry=m.getJSONObject("files").optJSONObject(path);if(entry==null)throw new FileNotFoundException("Tile outside downloaded coverage");
        File f=new File(dir,path);if(!f.isFile()||f.length()!=entry.getLong("bytes"))throw new IOException("Offline map file is incomplete");MessageDigest digest=MessageDigest.getInstance("SHA-256");try(InputStream in=new FileInputStream(f)){byte[] b=new byte[16384];int n;while((n=in.read(b))!=-1)digest.update(b,0,n);}if(!hex(digest.digest()).equals(entry.getString("sha256")))throw new IOException("Offline map file checksum failed");return f;
    }
    public static void verifyPayload(File dir,JSONObject manifest,VectorPmtiles.Check check)throws Exception{
        JSONObject files=manifest.getJSONObject("files");Iterator<String> names=files.keys();while(names.hasNext()){check.check();String name=names.next();if(!path(name))throw new IOException("Invalid vector payload path");JSONObject entry=files.getJSONObject(name);File f=new File(dir,name);if(!f.isFile()||f.length()!=entry.getLong("bytes"))throw new IOException("Incomplete vector payload");MessageDigest sha=MessageDigest.getInstance("SHA-256");try(InputStream in=new FileInputStream(f)){byte[] b=new byte[16384];int n;while((n=in.read(b))!=-1){check.check();sha.update(b,0,n);}}if(!hex(sha.digest()).equals(entry.getString("sha256")))throw new IOException("Vector download checksum failed");}
    }
    public static void cleanStaging(File root)throws IOException{File[] files=root.listFiles(f->f.getName().matches("\\.download-[a-f0-9]{32}"));if(files!=null)for(File f:files)erase(f);}
    public static void erase(File file)throws IOException{File[] children=file.listFiles();if(children!=null)for(File child:children)erase(child);if(!file.delete()&&file.exists())throw new IOException("Could not remove offline map");}
    public static String sha(byte[] bytes)throws Exception{return hex(MessageDigest.getInstance("SHA-256").digest(bytes));}
    private static String hex(byte[] bytes){StringBuilder out=new StringBuilder();for(byte b:bytes)out.append(String.format(Locale.ROOT,"%02x",b&255));return out.toString();}
    public interface Progress {void update(int complete,int total,long bytes,String phase)throws Exception;}
    public static JSONObject download(File staging,String id,Plan plan,VectorPmtiles.Check check,Progress progress)throws Exception{
        JSONArray builds=new JSONArray(new String(VectorPmtiles.get("https://build-metadata.protomaps.dev/builds.json",2*1024*1024,check),StandardCharsets.UTF_8));String build="";
        for(int i=0;i<builds.length();i++){JSONObject row=builds.getJSONObject(i);String key=row.optString("key");if(row.optString("version").startsWith("4.")&&key.matches("[0-9]{8}\\.pmtiles")&&key.compareTo(build)>0)build=key;}
        if(build.isEmpty())throw new IOException("No compatible vector map build is available");
        VectorPmtiles.Remote baseSource=new VectorPmtiles.Remote("https://build.protomaps.com/"+build,check);VectorPmtiles base=new VectorPmtiles(baseSource);if(base.type!=1||base.maxZoom<15)throw new IOException("Unsupported basemap archive");
        JSONObject metadata=new JSONObject(new String(base.metadata(),StandardCharsets.UTF_8));if(!metadata.optString("version").startsWith("4.")||!metadata.has("vector_layers"))throw new IOException("Unsupported vector map schema");
        JSONObject files=new JSONObject(),sources=new JSONObject();sources.put(baseSource.address,baseSource.etag());Set<Integer> glyphs=new TreeSet<>();glyphs.add(0);long[] bytes={0};
        int[] done={0};
        int tileTotal=plan.count();
        base.readTiles(plan.base,check,(tile,value)->{
            if(value==null)value=new byte[0];
            Glyphs.collect(value,glyphs);
            save(staging,"base/"+tile[0]+"/"+tile[1]+"/"+tile[2]+".pbf",value,files,bytes);
            progress.update(++done[0],tileTotal,bytes[0],"downloading");
        });
        Map<String,List<int[]>> terrains=new LinkedHashMap<>();
        for(int[] tile:plan.dem){
            String name=tile[0]<=12?"planet":"6-"+(tile[1]>>(tile[0]-6))+"-"+(tile[2]>>(tile[0]-6));
            terrains.computeIfAbsent(name,key->new ArrayList<>()).add(tile);
        }
        for(Map.Entry<String,List<int[]>> archive:terrains.entrySet()){
            VectorPmtiles.Remote source=new VectorPmtiles.Remote("https://download.mapterhorn.com/"+archive.getKey()+".pmtiles",check);
            VectorPmtiles dem=new VectorPmtiles(source);
            if(dem.type!=4||!new JSONObject(new String(dem.metadata(),StandardCharsets.UTF_8)).optString("encoding","terrarium").equals("terrarium"))throw new IOException("Unsupported elevation archive");
            sources.put(source.address,source.etag());
            dem.readTiles(archive.getValue(),check,(tile,value)->{
                if(value==null)throw new IOException("Elevation is unavailable for part of this area; retry with roads and tracks only");
                if(value.length<12||value[0]!='R'||value[1]!='I'||value[2]!='F'||value[3]!='F'||value[8]!='W'||value[9]!='E'||value[10]!='B'||value[11]!='P')throw new IOException("Invalid elevation image");
                save(staging,"terrain/"+tile[0]+"/"+tile[1]+"/"+tile[2]+".webp",value,files,bytes);
                progress.update(++done[0],tileTotal,bytes[0],"downloading");
            });
        }
        if(glyphs.size()>128)throw new IOException("Too many font ranges for this area; choose a smaller region");int total=tileTotal+glyphs.size();for(int start:glyphs){check.check();String range=start+"-"+(start+255);byte[] value=VectorPmtiles.get("https://protomaps.github.io/basemaps-assets/fonts/Noto%20Sans%20Regular/"+range+".pbf",VectorPmtiles.LIMIT,check);if(value.length<2)throw new IOException("Map font is unavailable");save(staging,"glyphs/"+range+".pbf",value,files,bytes);progress.update(++done[0],total,bytes[0],"fonts");}
        check.check();return new JSONObject().put("schema","aumanet.vector-region.v1").put("id",id).put("key",plan.key).put("name",plan.name).put("bounds",new JSONArray(plan.bounds)).put("bytes",bytes[0]).put("installedAt",System.currentTimeMillis()).put("terrain",plan.terrain).put("dataDate",metadata.optString("planetiler:osm:osmosisreplicationtime",build.substring(0,8))).put("sources",sources).put("files",files).put("attribution","© OpenStreetMap contributors / Protomaps; elevation: Mapterhorn and underlying sources; Noto Sans: SIL OFL. See bundled terrain sources and licences.");
    }
    private static void save(File dir,String path,byte[] value,JSONObject files,long[] bytes)throws Exception{if(!path(path)||value.length>VectorPmtiles.LIMIT||bytes[0]>MAX_BYTES-value.length)throw new IOException("Region exceeds the 256 MiB download limit; choose a smaller area");File f=new File(dir,path);if(!f.getParentFile().isDirectory()&&!f.getParentFile().mkdirs())throw new IOException("Map storage unavailable");try(FileOutputStream out=new FileOutputStream(f)){out.write(value);out.getFD().sync();}bytes[0]+=value.length;files.put(path,new JSONObject().put("bytes",value.length).put("sha256",sha(value)));}
    /** Reads only MVT property messages, not geometry, to retain glyph ranges used by our labels. */
    static final class Glyphs {
        static void collect(byte[] tile,Set<Integer> ranges)throws IOException{VectorPmtiles.Cursor in=new VectorPmtiles.Cursor(tile);while(in.position<tile.length){long tag=in.varint();if(tag==26)layer(in.data(),ranges);else in.skip((int)(tag&7));}}
        static void layer(byte[] bytes,Set<Integer> ranges)throws IOException{VectorPmtiles.Cursor in=new VectorPmtiles.Cursor(bytes);List<String> keys=new ArrayList<>(),values=new ArrayList<>();List<byte[]> features=new ArrayList<>();while(in.position<bytes.length){long tag=in.varint();if(tag==26)keys.add(new String(in.data(),StandardCharsets.UTF_8));else if(tag==34){VectorPmtiles.Cursor v=new VectorPmtiles.Cursor(in.data());String text=null;while(v.position<v.bytes.length){long t=v.varint();if(t==10)text=new String(v.data(),StandardCharsets.UTF_8);else v.skip((int)(t&7));}values.add(text);}else if(tag==18)features.add(in.data());else in.skip((int)(tag&7));}
            for(byte[] feature:features){VectorPmtiles.Cursor f=new VectorPmtiles.Cursor(feature);String name=null,english=null,house=null;while(f.position<feature.length){long tag=f.varint();if(tag!=18){f.skip((int)(tag&7));continue;}VectorPmtiles.Cursor tags=new VectorPmtiles.Cursor(f.data());while(tags.position<tags.bytes.length){long k=tags.varint(),v=tags.varint();if(k>=keys.size()||v>=values.size())throw new IOException("Invalid vector label properties");String key=keys.get((int)k),text=values.get((int)v);if(key.equals("name"))name=text;else if(key.equals("name:en"))english=text;else if(key.equals("addr_housenumber"))house=text;}}add(english!=null?english:name,ranges);add(house,ranges);}
        }
        static void add(String text,Set<Integer> ranges)throws IOException{if(text==null)return;for(int i=0;i<text.length();i++){int code=text.charAt(i);if(!Character.isSurrogate((char)code))ranges.add(code/256*256);}if(ranges.size()>128)throw new IOException("Too many map font ranges");}
    }
}
