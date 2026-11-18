package au.aumanet.app.maps;

import java.io.*;
import java.net.*;
import java.nio.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.zip.GZIPInputStream;

/** Bounded PMTiles v3 reader for regional downloads, following the public v3 specification.
 * https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md */
public final class VectorPmtiles {
    public static final int LIMIT=2*1024*1024;
    private static final int BATCH_LIMIT=1024*1024;
    private static final int BATCH_GAP=16*1024;
    public interface Check { void check() throws IOException; }
    public interface Source { byte[] read(long offset,int length)throws IOException; long size(); }
    interface TileConsumer { void accept(int[] tile,byte[] value)throws Exception; }
    public final int minZoom,maxZoom,type,compression;
    private final Source source;
    private final long rootOffset,rootLength,leafOffset,leafLength,tileOffset,tileLength,metadataOffset,metadataLength;
    private final int internal;
    private final LinkedHashMap<Long,Entry[]> directories=new LinkedHashMap<Long,Entry[]>(8,.75f,true){protected boolean removeEldestEntry(Map.Entry<Long,VectorPmtiles.Entry[]> e){return size()>8;}};
    private static final class Entry { long id,run,offset; int length; }
    public VectorPmtiles(Source source)throws IOException{
        this.source=source;byte[] raw=source.read(0,127);
        if(raw.length!=127||!new String(raw,0,7,StandardCharsets.US_ASCII).equals("PMTiles")||raw[7]!=3)throw new IOException("Unsupported vector archive header");
        ByteBuffer h=ByteBuffer.wrap(raw).order(ByteOrder.LITTLE_ENDIAN);
        rootOffset=h.getLong(8);rootLength=h.getLong(16);metadataOffset=h.getLong(24);metadataLength=h.getLong(32);
        leafOffset=h.getLong(40);leafLength=h.getLong(48);tileOffset=h.getLong(56);tileLength=h.getLong(64);
        internal=raw[97]&255;compression=raw[98]&255;type=raw[99]&255;minZoom=raw[100]&255;maxZoom=raw[101]&255;
        section(rootOffset,rootLength);section(metadataOffset,metadataLength);section(leafOffset,leafLength);section(tileOffset,tileLength);
        if(rootOffset<127||rootLength<1||rootOffset+rootLength>16384||metadataLength>LIMIT||maxZoom>26||minZoom>maxZoom||!(internal==1||internal==2)||!(compression==1||compression==2))throw new IOException("Unsupported vector archive layout or compression");
    }
    private void section(long offset,long length)throws IOException{if(offset<0||length<0||offset>source.size()-length)throw new IOException("Archive section is outside its file");}
    public byte[] metadata()throws IOException{return metadataLength==0?new byte[]{'{','}'}:decode(source.read(metadataOffset,(int)metadataLength),internal);}
    public byte[] tile(int z,int x,int y)throws IOException{
        Entry entry=findTile(z,checkedTileId(z,x,y));
        return entry==null?null:decode(source.read(tileOffset+entry.offset,entry.length),compression);
    }
    private static long checkedTileId(int z,int x,int y)throws IOException{
        if(z<0||z>26||x<0||y<0||x>=(1L<<z)||y>=(1L<<z))throw new IOException("Invalid vector tile coordinates");
        return tileId(z,x,y);
    }
    private Entry findTile(int zoom,long id)throws IOException{
        if(zoom<minZoom||zoom>maxZoom)return null;
        long offset=rootOffset;int length=(int)rootLength;
        for(int depth=0;depth<4;depth++){
            Entry[] entries=directories.get(offset);if(entries==null){entries=directory(decode(source.read(offset,length),internal));directories.put(offset,entries);}
            int low=0,high=entries.length-1;while(low<=high){int mid=(low+high)>>>1;if(entries[mid].id<=id)low=mid+1;else high=mid-1;}
            if(high<0)return null;Entry e=entries[high];
            if(e.run>0){if(id-e.id>=e.run)return null;if(e.offset>tileLength-e.length)throw new IOException("Tile escapes archive section");return e;}
            if(e.offset>leafLength-e.length)throw new IOException("Directory escapes archive section");offset=leafOffset+e.offset;length=e.length;
        }
        throw new IOException("Vector archive directory is too deep");
    }
    private static final class RequestedTile {
        final int[] coordinates;
        final long id;
        Entry entry;
        RequestedTile(int[] coordinates)throws IOException{
            this.coordinates=coordinates;
            id=checkedTileId(coordinates[0],coordinates[1],coordinates[2]);
        }
    }
    void readTiles(List<int[]> coordinates,Check check,TileConsumer consumer)throws Exception{
        List<RequestedTile> requested=new ArrayList<>(coordinates.size());
        for(int[] tile:coordinates)requested.add(new RequestedTile(tile));
        // Resolve IDs in directory order so nearby tiles reuse cached leaf directories.
        requested.sort(Comparator.comparingLong(tile->tile.id));
        List<RequestedTile> available=new ArrayList<>(requested.size());
        for(RequestedTile tile:requested){
            check.check();
            tile.entry=findTile(tile.coordinates[0],tile.id);
            if(tile.entry==null)consumer.accept(tile.coordinates,null);
            else available.add(tile);
        }
        // Fetch in physical order, including shared payloads and small gaps in a single GET.
        available.sort(Comparator.comparingLong(tile->tile.entry.offset));
        for(int first=0;first<available.size();){
            check.check();
            Entry initial=available.get(first).entry;
            long start=initial.offset,end=start+initial.length;
            int next=first+1;
            while(next<available.size()){
                Entry entry=available.get(next).entry;
                long entryEnd=entry.offset+entry.length;
                if(entry.offset-end>BATCH_GAP||entryEnd-start>Math.max(BATCH_LIMIT,initial.length))break;
                end=Math.max(end,entryEnd);
                next++;
            }
            byte[] range=source.read(tileOffset+start,(int)(end-start));
            if(range.length!=end-start)throw new IOException("Map archive range was truncated");
            for(int i=first;i<next;i++){
                check.check();
                RequestedTile tile=available.get(i);
                int offset=(int)(tile.entry.offset-start);
                byte[] value=offset==0&&tile.entry.length==range.length
                    ?range:Arrays.copyOfRange(range,offset,offset+tile.entry.length);
                consumer.accept(tile.coordinates,decode(value,compression));
            }
            first=next;
        }
    }
    public static long tileId(int z,int x,int y){
        long id=((1L<<(2*z))-1)/3;int tx=x,ty=y;
        for(int s=1<<(z-1);s>0;s>>=1){int rx=(tx&s)==0?0:1,ry=(ty&s)==0?0:1;id+=(long)s*s*((3*rx)^ry);if(ry==0){if(rx==1){tx=s-1-tx;ty=s-1-ty;}int t=tx;tx=ty;ty=t;}}
        return id;
    }
    private static Entry[] directory(byte[] bytes)throws IOException{
        Cursor in=new Cursor(bytes);long count=in.varint();if(count<1||count>65536||count>bytes.length)throw new IOException("Invalid directory entry count");Entry[] values=new Entry[(int)count];long last=-1;
        for(int i=0;i<count;i++){Entry e=new Entry();long delta=in.varint();if(i>0&&delta==0)throw new IOException("Unordered directory");e.id=Math.addExact(i==0?0:last,delta);last=e.id;values[i]=e;}
        for(Entry e:values)e.run=in.varint();for(Entry e:values){long length=in.varint();if(length<1||length>LIMIT)throw new IOException("Oversized tile or directory");e.length=(int)length;}
        for(int i=0;i<count;i++){long v=in.varint();if(v==0){if(i==0)throw new IOException("Invalid directory offset");values[i].offset=Math.addExact(values[i-1].offset,values[i-1].length);}else values[i].offset=v-1;}
        if(in.position!=bytes.length)throw new IOException("Unexpected directory bytes");return values;
    }
    public static byte[] decode(byte[] bytes,int compression)throws IOException{
        if(compression==1)return bytes;if(compression!=2)throw new IOException("Unsupported map compression");
        try(InputStream in=new GZIPInputStream(new ByteArrayInputStream(bytes))){return bounded(in,LIMIT);}
    }
    public static byte[] bounded(InputStream in,int limit)throws IOException{
        ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buffer=new byte[16384];int n;while((n=in.read(buffer))!=-1){if(n==0)continue;if(out.size()>limit-n)throw new IOException("Map response exceeds its size limit");out.write(buffer,0,n);}return out.toByteArray();
    }
    public static final class Cursor {
        public final byte[] bytes;public int position;
        public Cursor(byte[] bytes){this.bytes=bytes;}
        public long varint()throws IOException{long value=0;for(int shift=0;shift<63;shift+=7){if(position>=bytes.length)throw new EOFException("Truncated map integer");int b=bytes[position++]&255;value|=(long)(b&127)<<shift;if((b&128)==0)return value;}throw new IOException("Map integer overflow");}
        public byte[] data()throws IOException{long n=varint();if(n>bytes.length-position)throw new IOException("Map field escapes its message");byte[] result=Arrays.copyOfRange(bytes,position,position+(int)n);position+=(int)n;return result;}
        public void skip(int wire)throws IOException{if(wire==0){for(int i=0;i<10;i++){if(position>=bytes.length)throw new EOFException("Truncated map integer");int b=bytes[position++]&255;if(i==9&&b>1)throw new IOException("Map integer overflow");if((b&128)==0)return;}throw new IOException("Map integer overflow");}long n=wire==1?8:wire==5?4:wire==2?varint():-1;if(n<0||n>bytes.length-position)throw new IOException("Invalid map field");position+=(int)n;}
    }
    public static boolean allowed(URL url){String host=url.getHost(),path=url.getPath();return url.getProtocol().equals("https")&&url.getUserInfo()==null&&url.getPort()==-1&&url.getQuery()==null&&url.getRef()==null&&(
        host.equals("build.protomaps.com")&&path.matches("/[0-9]{8}\\.pmtiles")||host.equals("build-metadata.protomaps.dev")&&path.equals("/builds.json")||
        host.equals("tiles-ap1.arcgis.com")&&path.startsWith(VicmapTerrain.PATH)&&path.substring(VicmapTerrain.PATH.length()).matches("[0-9]{1,2}/[0-9]{1,6}/[0-9]{1,6}")||
        host.equals("download.mapterhorn.com")&&path.matches("/(planet|6-[0-9]{1,2}-[0-9]{1,2})\\.pmtiles")||
        host.equals("protomaps.github.io")&&path.matches("/basemaps-assets/fonts/Noto%20Sans%20Regular/[0-9]{1,5}-[0-9]{1,5}\\.pbf"));}
    public static byte[] get(String address,int limit,Check check)throws IOException{
        URL url=new URL(address);if(!allowed(url))throw new IOException("Unapproved map source");check.check();HttpURLConnection c=(HttpURLConnection)url.openConnection();configure(c);
        try{if(c.getResponseCode()!=200)throw new IOException("Map source returned HTTP "+c.getResponseCode());try(InputStream in=c.getInputStream()){return bounded(new CheckedStream(in,check),limit);}}finally{c.disconnect();}
    }
    private static void configure(HttpURLConnection c)throws IOException{c.setInstanceFollowRedirects(false);c.setConnectTimeout(10000);c.setReadTimeout(20000);c.setRequestProperty("User-Agent","AuMaNET-Prototype-OfflineMaps/1.0 (+https://github.com/somethingsomethinglabs/AuMaNET)");c.setRequestProperty("Accept-Encoding","identity");}
    private static final class CheckedStream extends FilterInputStream {final Check check;CheckedStream(InputStream in,Check check){super(in);this.check=check;}public int read(byte[] b,int o,int n)throws IOException{check.check();return super.read(b,o,n);}}
    static final class HttpStatus extends IOException {
        final int status;
        HttpStatus(int status) {
            super("Map archive does not support consistent partial downloads (HTTP "+status+")");
            this.status = status;
        }
    }
    public static final class Remote implements Source {
        public final String address;private final Check check;private long size=-1;private String etag;
        public Remote(String address,Check check)throws IOException{if(!allowed(new URL(address)))throw new IOException("Unapproved archive source");this.address=address;this.check=check;}
        public long size(){return size;}
        public String etag(){return etag;}
        public byte[] read(long offset,int length)throws IOException{
            if(offset<0||length<1||length>LIMIT||offset>Long.MAX_VALUE-length||size>=0&&offset>size-length)throw new IOException("Invalid archive range");check.check();
            HttpURLConnection c=(HttpURLConnection)new URL(address).openConnection();configure(c);c.setRequestProperty("Range","bytes="+offset+"-"+(offset+length-1));if(etag!=null)c.setRequestProperty("If-Match",etag);
            try{
                int status=c.getResponseCode();if(status!=206)throw new HttpStatus(status);
                String range=c.getHeaderField("Content-Range"),tag=c.getHeaderField("ETag");String prefix="bytes "+offset+"-"+(offset+length-1)+"/";
                if(range==null||!range.startsWith(prefix)||!range.substring(prefix.length()).matches("[0-9]{1,15}")||c.getContentLengthLong()!=length||tag==null||tag.startsWith("W/")||etag!=null&&!etag.equals(tag))throw new IOException("Map archive changed or returned an unexpected range");
                long total=Long.parseLong(range.substring(prefix.length()));if(total<offset+length||size>=0&&size!=total)throw new IOException("Map archive size changed");size=total;etag=tag;
                try(InputStream in=c.getInputStream()){byte[] bytes=bounded(new CheckedStream(in,check),length);if(bytes.length!=length)throw new IOException("Map archive range was truncated");return bytes;}
            }finally{c.disconnect();}
        }
    }
}
