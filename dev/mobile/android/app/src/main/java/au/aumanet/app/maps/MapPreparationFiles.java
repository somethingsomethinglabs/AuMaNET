package au.aumanet.app.maps;

import java.io.*;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicBoolean;

/** Bounded app-private GeoTIFF preparation staging; source and output bytes stay native. */
public final class MapPreparationFiles {
    public static final int HEADER_BYTES=76,MAX_TILE_BYTES=512*1024,MAX_TILES=8192;
    public static final long MAX_SOURCE_BYTES=256L*1024*1024,DEFAULT_PAYLOAD_BYTES=256L*1024*1024,PROPOSED_PAYLOAD_BYTES=512L*1024*1024;
    private static final long MARGIN=8L*1024*1024;
    private static final double WORLD=20037508.342789244;
    private final File root;
    private final long payloadLimit;
    private final long allocationUnit;
    private Session current;
    private Source selectedSource;
    private MapMutationLease mutation;

    public MapPreparationFiles(File root,long payloadLimit)throws IOException{this(root,payloadLimit,4096);}
    public MapPreparationFiles(File root,long payloadLimit,long allocationUnit)throws IOException{
        if(payloadLimit<24||payloadLimit>PROPOSED_PAYLOAD_BYTES)throw new IOException("Invalid preparation storage policy");
        if(allocationUnit<512||allocationUnit>1024*1024)throw new IOException("Unsupported map filesystem allocation unit");this.allocationUnit=allocationUnit;
        this.root=root.getCanonicalFile();this.payloadLimit=payloadLimit;
        if(!root.isDirectory()&&!root.mkdirs()&&!root.isDirectory())throw new IOException("Map storage is unavailable");
    }
    public static boolean allowedOrigin(String origin,boolean mainFrame){
        if(!mainFrame||origin==null)return false;
        try{URI uri=new URI(origin);return "https".equals(uri.getScheme())&&"localhost".equals(uri.getHost())&&(uri.getPort()==-1||uri.getPort()==443)&&uri.getRawUserInfo()==null&&(uri.getRawPath()==null||uri.getRawPath().isEmpty()||"/".equals(uri.getRawPath()))&&uri.getRawQuery()==null&&uri.getRawFragment()==null;}catch(Exception e){return false;}
    }
    private static boolean classic(byte[] h){return h[0]=='I'&&h[1]=='I'&&h[2]==42&&h[3]==0||h[0]=='M'&&h[1]=='M'&&h[2]==0&&h[3]==42;}
    private static String token(){return UUID.randomUUID().toString().replace("-","");}
    private static boolean token(String value){return value!=null&&value.matches("[a-f0-9]{32}");}
    public static final class Source {
        public final String id,fileName,sha256;
        public final long bytes;
        private final File file;
        private Source(String id,String name,String sha,long bytes,File file){this.id=id;fileName=name;sha256=sha;this.bytes=bytes;this.file=file;}
        public File file(){return file;}
    }
    public interface Cancellation {boolean cancelled();}
    /** Source is copied exactly once through a bounded buffer; callers own/close the SAF input stream. */
    public synchronized Source copySource(InputStream in,String displayName,Cancellation cancel)throws Exception{
        if(mutation!=null)throw new IOException("A source or preparation is already active");
        String id=token(),name=displayName==null?"source.tif":displayName.replace('\\','/');name=name.substring(name.lastIndexOf('/')+1);
        if(name.length()>200)name=name.substring(name.length()-200);if(name.trim().isEmpty())name="source.tif";
        File target=owned(".geo-source-"+id+".tif");boolean complete=false;
        mutation=MapMutationLease.acquire(root);
        try{
            MessageDigest hash=MessageDigest.getInstance("SHA-256");byte[] buffer=new byte[65536],header=new byte[8];int headerSize=0;long count=0;
            try(FileOutputStream out=new FileOutputStream(target)){
                int n;while((n=in.read(buffer))!=-1){if(cancel.cancelled())throw new IOException("GeoTIFF source selection cancelled");if(n==0)continue;count+=n;if(count>MAX_SOURCE_BYTES)throw new IOException("GeoTIFF source exceeds 256 MiB");if(root.getUsableSpace()<n+MARGIN)throw new IOException("Not enough free storage for the source copy");if(headerSize<8){int copied=Math.min(8-headerSize,n);System.arraycopy(buffer,0,header,headerSize,copied);headerSize+=copied;if(headerSize==8&&!classic(header))throw new IOException("Choose a classic TIFF/GeoTIFF source; prepared packs use Import offline map");}out.write(buffer,0,n);hash.update(buffer,0,n);}
                out.getFD().sync();
            }
            boolean little=header[0]=='I'&&header[1]=='I'&&header[2]==42&&header[3]==0,big=header[0]=='M'&&header[1]=='M'&&header[2]==0&&header[3]==42;
            if(headerSize!=8||!little&&!big)throw new IOException("Choose a classic TIFF source; BigTIFF is unsupported");
            if(cancel.cancelled())throw new IOException("GeoTIFF source selection cancelled");
            selectedSource=new Source(id,name,hex(hash.digest()),count,target);complete=true;return selectedSource;
        }finally{if(!complete)try{erase(target);}finally{releaseMutation();}}
    }
    public synchronized void discardSource(Source source)throws IOException{if(current!=null&&current.source==source)throw new IOException("Source is in active use");if(selectedSource!=source)throw new IOException("Source generation is unavailable");try{erase(source.file);}finally{selectedSource=null;releaseMutation();}}
    /** Only at plugin startup, before exposing the bridge. Never touches ready regions. */
    public synchronized void cleanOrphans()throws IOException{
        if(current!=null||mutation!=null)throw new IOException("Cannot clean an active preparation");
        MapMutationLease.cleanStartup(root);
    }
    public static final class Plan {
        public final int minZoom,maxZoom,tileCount;
        public final double[] bounds,geographicBounds;
        private final Set<String> keys=new HashSet<>();
        public Plan(double[] bounds,int minZoom,int maxZoom)throws IOException{
            if(bounds==null||bounds.length!=4||minZoom<0||maxZoom>18||minZoom>maxZoom||maxZoom-minZoom>4)throw new IOException("Invalid native preparation geometry");
            this.bounds=bounds.clone();this.minZoom=minZoom;this.maxZoom=maxZoom;
            for(double value:bounds)if(!Double.isFinite(value)||Math.abs(value)>WORLD+.001)throw new IOException("Invalid native preparation bounds");
            if(bounds[0]>=bounds[2]||bounds[1]>=bounds[3])throw new IOException("Invalid native preparation extent");
            for(int z=minZoom;z<=maxZoom;z++){
                int size=1<<z,x0=Math.max(0,(int)Math.floor((bounds[0]+WORLD)/(2*WORLD)*size)),x1=Math.min(size-1,(int)Math.ceil((bounds[2]+WORLD)/(2*WORLD)*size)-1),y0=Math.max(0,(int)Math.floor((WORLD-bounds[3])/(2*WORLD)*size)),y1=Math.min(size-1,(int)Math.ceil((WORLD-bounds[1])/(2*WORLD)*size)-1);
                if((long)(x1-x0+1)*(y1-y0+1)+keys.size()>MAX_TILES)throw new IOException("Preparation coverage exceeds 8192 tiles");
                for(int y=y0;y<=y1;y++)for(int x=x0;x<=x1;x++)keys.add(z+"/"+x+"/"+y);
            }
            if(keys.isEmpty())throw new IOException("Preparation has no tiles");tileCount=keys.size();
            geographicBounds=new double[]{bounds[0]/WORLD*180,latitude(bounds[1]),bounds[2]/WORLD*180,latitude(bounds[3])};
        }
    }
    public static final class Metadata {
        public final String id,title;
        public final Map<String,String> source;
        public Metadata(String id,String title,Map<String,String> source)throws IOException{
            if(id==null||!id.matches("[a-z0-9][a-z0-9-]{0,79}"))throw new IOException("Invalid preparation region ID");this.id=id;this.title=text(title,120);
            LinkedHashMap<String,String> validated=new LinkedHashMap<>();
            for(String key:new String[]{"name","url","attribution","license","licenseUrl","dataDate"})validated.put(key,text(source.get(key),key.equals("name")?120:key.equals("license")?160:key.equals("dataDate")?80:2000));
            for(String key:new String[]{"url","licenseUrl"})try{URI uri=new URI(validated.get(key));if(!"https".equals(uri.getScheme())||uri.getHost()==null||uri.getRawUserInfo()!=null)throw new Exception();}catch(Exception e){throw new IOException("Invalid preparation source link");}
            this.source=Collections.unmodifiableMap(validated);
        }
    }
    public interface ImageVerifier {void verify(byte[] bytes,int offset,int length)throws Exception;}
    public interface Completion {void complete(Ack ack);}
    public interface Activation {void activate(File ready,String regionId)throws Exception;}
    public static final class Ack {
        public final String sessionId,error;public final long sequence,storedBytes,totalBytes;public final boolean ok;
        private Ack(String id,long seq,boolean ok,long stored,long total,String error){sessionId=id;sequence=seq;this.ok=ok;storedBytes=stored;totalBytes=total;this.error=error;}
    }
    public synchronized Session begin(Source source,Plan plan,Metadata metadata,ImageVerifier verifier)throws Exception{
        if(current!=null)throw new IOException("Another GeoTIFF preparation is active");
        if(selectedSource!=source||mutation==null)throw new IOException("Native source generation is unavailable");
        try{
        if(plan==null||metadata==null||verifier==null)throw new IOException("Preparation validation is unavailable");
        if(source==null||!token(source.id)||!source.file.equals(owned(".geo-source-"+source.id+".tif"))||!source.file.isFile()||source.file.length()!=source.bytes)throw new IOException("Native GeoTIFF source is unavailable");
        Set<String> regionIds=new HashSet<>();boolean replacing=false;File[] files=root.listFiles();if(files==null)throw new IOException("Cannot inspect installed maps");
        for(File f:files)if(f.getName().matches("[a-z0-9][a-z0-9-]{0,79}\\.[a-f0-9]{32}")&&new File(f,"manifest.json").isFile()){String regionId=f.getName().substring(0,f.getName().lastIndexOf('.'));regionIds.add(regionId);if(regionId.equals(metadata.id))replacing=true;}
        if(regionIds.size()>=4&&!replacing)throw new IOException("Remove an installed map before preparing another (four-region limit)");
        long workingOverhead=MARGIN+2L*plan.tileCount*allocationUnit;
        if(root.getUsableSpace()<payloadLimit+workingOverhead)throw new IOException("Not enough free storage to preserve installed maps while preparing this region");
        String id=token();File stage=owned(".prepare-"+id);if(!stage.mkdir())throw new IOException("Cannot create preparation stage");
        current=new Session(id,source,plan,metadata,verifier,stage);return current;
        }catch(Exception failure){try{discardSource(source);}catch(Exception cleanup){failure.addSuppressed(cleanup);}throw failure;}
    }
    public final class Session {
        public final String id;
        private final Source source;private final Plan plan;private final Metadata metadata;private final ImageVerifier verifier;private final File stage;
        private final AtomicBoolean inFlight=new AtomicBoolean();
        private final long deadline=System.nanoTime()+15L*60*1000*1000*1000;
        private final List<Tile> tiles=new ArrayList<>();private final Set<String> written=new HashSet<>();
        private long sequence,totalBytes;private boolean ended;
        private Session(String id,Source source,Plan plan,Metadata metadata,ImageVerifier verifier,File stage){this.id=id;this.source=source;this.plan=plan;this.metadata=metadata;this.verifier=verifier;this.stage=stage;}
        /** Called on the bridge/UI thread before queueing work. A flood cannot build an executor backlog. */
        public boolean offer(byte[] frame,Executor executor,Completion completion){
            if(frame==null||frame.length<HEADER_BYTES+24||frame.length>HEADER_BYTES+MAX_TILE_BYTES)return false;
            // A delayed old WebView/worker generation must not cancel the current session.
            if(!id.equals(hex(Arrays.copyOfRange(frame,8,24))))return false;
            if(!inFlight.compareAndSet(false,true))return false;
            try{executor.execute(()->{Ack ack;try{ack=write(frame);}catch(Exception e){synchronized(MapPreparationFiles.this){long seq=sequence;try{cancelLocked();}catch(Exception ignored){}ack=new Ack(id,seq,false,0,totalBytes,message(e));}}finally{inFlight.set(false);}completion.complete(ack);});return true;}catch(RuntimeException e){inFlight.set(false);return false;}
        }
        private Ack write(byte[] frame)throws Exception{
            synchronized(MapPreparationFiles.this){
                live();ByteBuffer b=ByteBuffer.wrap(frame);
                if(b.getInt()!=0x414d5054||b.get()!=1||b.get()!=1||(b.getShort()&65535)!=HEADER_BYTES)throw new IOException("Unsupported preparation binary frame");
                byte[] tokenBytes=new byte[16];b.get(tokenBytes);if(!id.equals(hex(tokenBytes)))throw new IOException("Stale preparation generation");
                long seq=b.getInt()&0xffffffffL;int z=b.get()&255;if(b.get()!=0||b.get()!=0||b.get()!=0)throw new IOException("Invalid preparation frame flags");
                long x=b.getInt()&0xffffffffL,y=b.getInt()&0xffffffffL,length=b.getInt()&0xffffffffL;byte[] expectedHash=new byte[32];b.get(expectedHash);
                String key=z+"/"+x+"/"+y;
                if(seq!=sequence||!plan.keys.contains(key)||written.contains(key)||length<24||length>MAX_TILE_BYTES||frame.length!=HEADER_BYTES+length||totalBytes+length>payloadLimit)throw new IOException("Invalid preparation order, tile or storage budget");
                if(root.getUsableSpace()<length+3*allocationUnit+MARGIN)throw new IOException("Available map storage was exhausted");
                ByteBuffer png=ByteBuffer.wrap(frame,HEADER_BYTES,(int)length).slice();if(png.getLong(0)!=0x89504e470d0a1a0aL||png.getInt(8)!=13||png.getInt(12)!=0x49484452||png.getInt(16)!=256||png.getInt(20)!=256)throw new IOException("Prepared image must be a 256-pixel PNG");
                MessageDigest hash=MessageDigest.getInstance("SHA-256");hash.update(frame,HEADER_BYTES,(int)length);byte[] actual=hash.digest();if(!MessageDigest.isEqual(actual,expectedHash))throw new IOException("Prepared PNG checksum failed");
                verifier.verify(frame,HEADER_BYTES,(int)length); // Android integration must decode here, after all frame/header checks.
                File file=new File(stage,z+"/"+x+"/"+y+".png");if(!file.getParentFile().isDirectory()&&!file.getParentFile().mkdirs())throw new IOException("Cannot create preparation tile directory");
                try(FileOutputStream out=new FileOutputStream(file)){out.write(frame,HEADER_BYTES,(int)length);out.getFD().sync();}
                written.add(key);tiles.add(new Tile(z,(int)x,(int)y,(int)length,hex(actual)));totalBytes+=length;sequence++;
                return new Ack(id,seq,true,length,totalBytes,"");
            }
        }
        public File tile(int z,int x,int y)throws IOException{synchronized(MapPreparationFiles.this){live();String key=z+"/"+x+"/"+y;if(!written.contains(key))throw new IOException("Prepared child tile is unavailable");return new File(stage,key+".png");}}
        public File finish()throws Exception{return finish((ready,regionId)->{});}
        /** Integration performs selection/same-ID retirement here, before releasing the global mutation lease. */
        public File finish(Activation activation)throws Exception{
            synchronized(MapPreparationFiles.this){
                live();if(inFlight.get())throw new IOException("Wait for the pending tile acknowledgement");if(written.size()!=plan.tileCount)throw new IOException("Prepared tile index is incomplete");
                try{
                    String actualHash=hashFile(source.file);if(!actualHash.equals(source.sha256))throw new IOException("Native GeoTIFF source changed during preparation");
                    String manifestText=manifest();OfflineMapValidation.validate(new org.json.JSONObject(manifestText));byte[] manifest=manifestText.getBytes(StandardCharsets.UTF_8);if(manifest.length>2*1024*1024)throw new IOException("Prepared metadata is too large");
                    try(FileOutputStream out=new FileOutputStream(new File(stage,"manifest.json"))){out.write(manifest);out.getFD().sync();}
                    File ready=owned(metadata.id+"."+id);if(!stage.renameTo(ready))throw new IOException("Cannot activate verified prepared map");
                    ended=true;current=null;selectedSource=null;
                    try{activation.activate(ready,metadata.id);}finally{releaseMutation();try{erase(source.file);}catch(IOException ignored){/* Startup orphan cleanup retries without invalidating a committed region. */}}return ready;
                }catch(Exception failure){try{cancelLocked();}catch(Exception cleanup){failure.addSuppressed(cleanup);}throw failure;}
            }
        }
        public void cancel()throws IOException{synchronized(MapPreparationFiles.this){cancelLocked();}}
        private void cancelLocked()throws IOException{if(ended)return;ended=true;if(current==this)current=null;selectedSource=null;try{try{erase(stage);}finally{erase(source.file);}}finally{releaseMutation();}}
        private void live()throws IOException{if(ended||current!=this)throw new IOException("Preparation session is no longer active");if(System.nanoTime()-deadline>=0){cancelLocked();throw new IOException("GeoTIFF preparation expired");}}
        private String manifest(){
            StringBuilder out=new StringBuilder("{\"schema\":\"aumanet.offline-map.v1\",\"id\":").append(quote(metadata.id)).append(",\"title\":").append(quote(metadata.title)).append(",\"bounds\":").append(Arrays.toString(plan.geographicBounds)).append(",\"minZoom\":").append(plan.minZoom).append(",\"maxZoom\":").append(plan.maxZoom).append(",\"tileSize\":256,\"format\":\"image/png\",\"source\":{");
            boolean comma=false;for(Map.Entry<String,String> entry:metadata.source.entrySet()){if(comma)out.append(',');comma=true;out.append(quote(entry.getKey())).append(':').append(quote(entry.getValue()));}
            out.append(",\"fileName\":").append(quote(source.fileName)).append(",\"sha256\":").append(quote(source.sha256)).append(",\"preparedAt\":").append(quote(utcNow())).append(",\"changes\":").append(quote("Locally prepared from a north-up EPSG:3857 RGB8 GeoTIFF using bounded strip-row decoding, pixel-center bilinear resampling, full-colour PNG output and child-derived XYZ overviews.")).append("},\"tiles\":[");
            tiles.sort(Comparator.comparingInt((Tile t)->t.z).thenComparingInt(t->t.y).thenComparingInt(t->t.x));comma=false;for(Tile tile:tiles){if(comma)out.append(',');comma=true;out.append("{\"z\":").append(tile.z).append(",\"x\":").append(tile.x).append(",\"y\":").append(tile.y).append(",\"bytes\":").append(tile.bytes).append(",\"sha256\":").append(quote(tile.sha256)).append('}');}return out.append("]}").toString();
        }
    }
    private static final class Tile{final int z,x,y,bytes;final String sha256;Tile(int z,int x,int y,int bytes,String sha256){this.z=z;this.x=x;this.y=y;this.bytes=bytes;this.sha256=sha256;}}
    private File owned(String name)throws IOException{File f=new File(root,name).getCanonicalFile();if(!root.equals(f.getParentFile()))throw new IOException("Invalid owned map path");return f;}
    private void releaseMutation(){if(mutation!=null){mutation.close();mutation=null;}}
    private static String hashFile(File f)throws Exception{MessageDigest hash=MessageDigest.getInstance("SHA-256");try(InputStream in=new FileInputStream(f)){byte[] buffer=new byte[65536];int n;while((n=in.read(buffer))!=-1)if(n>0)hash.update(buffer,0,n);}return hex(hash.digest());}
    private static String hex(byte[] value){StringBuilder out=new StringBuilder();for(byte b:value)out.append(String.format(Locale.ROOT,"%02x",b&255));return out.toString();}
    private static double latitude(double y){return Math.atan(Math.sinh(y/WORLD*Math.PI))*180/Math.PI;}
    private static String utcNow(){SimpleDateFormat format=new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",Locale.ROOT);format.setTimeZone(TimeZone.getTimeZone("UTC"));return format.format(new Date());}
    private static String text(String value,int limit)throws IOException{if(value==null||value.trim().isEmpty()||value.length()>limit||value.matches("(?s).*[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f].*"))throw new IOException("Invalid preparation metadata");return value;}
    private static String quote(String value){StringBuilder out=new StringBuilder("\"");for(char c:value.toCharArray()){if(c=='"'||c=='\\')out.append('\\').append(c);else if(c<32)out.append(String.format(Locale.ROOT,"\\u%04x",(int)c));else out.append(c);}return out.append('"').toString();}
    private static String message(Exception e){String value=e.getMessage();return value==null?"Native map preparation failed":value.substring(0,Math.min(240,value.length())).replace('\n',' ');}
    private static void erase(File file)throws IOException{if(!file.exists())return;File[] children=file.listFiles();if(children!=null)for(File child:children)erase(child);if(!file.delete()&&file.exists())throw new IOException("Map staging cleanup failed");}
}
