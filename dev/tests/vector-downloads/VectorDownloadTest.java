package au.aumanet.app.maps;
import java.io.*;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.*;

public final class VectorDownloadTest {
    static int checks;
    static void require(boolean value,String message){if(!value)throw new AssertionError(message);checks++;}
    interface Action {void run()throws Exception;}
    static void rejects(Action action)throws Exception{try{action.run();}catch(Exception expected){checks++;return;}throw new AssertionError("Invalid input accepted");}
    static final class FileSource implements VectorPmtiles.Source {
        final File file;FileSource(File file){this.file=file;}
        public long size(){return file.length();}
        public byte[] read(long offset,int length)throws IOException{if(offset<0||length<1||length>VectorPmtiles.LIMIT||offset>file.length()-length)throw new IOException("range");try(RandomAccessFile in=new RandomAccessFile(file,"r")){byte[] b=new byte[length];in.seek(offset);in.readFully(b);return b;}}
    }
    static void verifyBatchedReads()throws Exception{
        // IDs 1 and 2 share a payload, ID 3 is missing, and ID 4 sits across a large gap.
        byte[] directory={3,0,1,3,1,2,1,2,3,1,1,5,(byte)0x81,(byte)0x80,2};
        int tileStart=127+directory.length;
        byte[] fixture=new byte[tileStart+32769];
        ByteBuffer header=ByteBuffer.wrap(fixture).order(ByteOrder.LITTLE_ENDIAN);
        header.put("PMTiles".getBytes(StandardCharsets.US_ASCII)).put((byte)3);
        header.putLong(127).putLong(directory.length).putLong(0).putLong(0);
        header.putLong(0).putLong(0).putLong(tileStart).putLong(32769);
        fixture[97]=1;fixture[98]=1;fixture[99]=1;fixture[101]=1;
        System.arraycopy(directory,0,fixture,127,directory.length);
        System.arraycopy(new byte[]{1,2,0,0,3,4,5},0,fixture,tileStart,7);
        fixture[tileStart+32768]=6;
        List<Integer> payloadReads=new ArrayList<>();
        VectorPmtiles archive=new VectorPmtiles(new VectorPmtiles.Source(){
            public long size(){return fixture.length;}
            public byte[] read(long offset,int length){
                if(offset>=tileStart)payloadReads.add(length);
                return Arrays.copyOfRange(fixture,(int)offset,(int)offset+length);
            }
        });
        List<int[]> tiles=List.of(new int[]{1,1,0},new int[]{1,1,1},new int[]{1,0,1},new int[]{0,0,0},new int[]{1,0,0});
        Map<Long,byte[]> actual=new HashMap<>();
        archive.readTiles(tiles,()->{},(tile,value)->actual.put(VectorPmtiles.tileId(tile[0],tile[1],tile[2]),value));
        require(payloadReads.equals(List.of(7,1)),"batch nearby and shared tiles, skip large gaps");
        require(actual.size()==tiles.size(),"one result per requested coordinate");
        for(int[] tile:tiles){
            long id=VectorPmtiles.tileId(tile[0],tile[1],tile[2]);
            require(actual.containsKey(id)&&Arrays.equals(actual.get(id),archive.tile(tile[0],tile[1],tile[2])),"batched payload matches single read");
        }
        payloadReads.clear();
        boolean[] stop={false};
        rejects(()->archive.readTiles(List.of(tiles.get(0),tiles.get(3)),()->{
            if(stop[0])throw new IOException("Cancelled");
        },(tile,value)->stop[0]=true));
        require(payloadReads.equals(List.of(2)),"cancellation stops the next range");
    }
    public static void main(String[] args)throws Exception{
        File bundle=new File(args[0]),output=new File(args[1]);output.mkdirs();
        if(args.length>2&&args[2].equals("download")){
            String id="e".repeat(32);File root=new File(output,"live"),stage=new File(root,".download-"+id);root.mkdirs();if(stage.exists())VectorRegions.erase(stage);stage.mkdir();
            JSONObject m=VectorRegions.download(stage,id,new VectorRegions.Plan(-37.6535,145.5159,2,"Healesville host download",true),()->{},(n,t,b,p)->{if(n%20==0)System.out.println(n+"/"+t+" "+b+" bytes");});
            Files.writeString(new File(stage,"manifest.json").toPath(),m.toString());File ready=new File(root,id);if(ready.exists())VectorRegions.erase(ready);require(stage.renameTo(ready),"atomic install");require(VectorRegions.list(root).size()==1,"ready region");
            Iterator<String> keys=m.getJSONObject("files").keys();while(keys.hasNext())VectorRegions.file(root,id,keys.next());System.out.println(new JSONObject().put("pass",true).put("bytes",m.getLong("bytes")).put("files",m.getJSONObject("files").length()).put("manifest",new File(ready,"manifest.json").getPath()));return;
        }
        require(VectorPmtiles.tileId(0,0,0)==0,"root Hilbert");require(VectorPmtiles.tileId(1,0,0)==1,"Hilbert 1");require(VectorPmtiles.tileId(1,0,1)==2,"Hilbert 2");require(VectorPmtiles.tileId(1,1,1)==3,"Hilbert 3");require(VectorPmtiles.tileId(1,1,0)==4,"Hilbert 4");require(VectorPmtiles.tileId(12,3423,1763)==19078479,"spec Hilbert example");
        verifyBatchedReads();
        JSONObject expected=new JSONObject(Files.readString(new File(output,"expected.json").toPath()));
        for(String name:new String[]{"basemap.pmtiles","terrain.pmtiles"}){VectorPmtiles archive=new VectorPmtiles(new FileSource(new File(bundle,name)));JSONArray rows=expected.getJSONArray(name);for(int i=0;i<rows.length();i++){JSONObject row=rows.getJSONObject(i);byte[] tile=archive.tile(row.getInt("z"),row.getInt("x"),row.getInt("y"));require(tile!=null&&VectorRegions.sha(tile).equals(row.getString("sha256")),"tile differs from official PMTiles JS reader");if(name.equals("basemap.pmtiles")){Set<Integer> ranges=new TreeSet<>();VectorRegions.Glyphs.collect(tile,ranges);require(ranges.contains(0)||ranges.isEmpty(),"glyph ranges decoded");}}rejects(()->archive.tile(15,-1,0));}
        JSONArray plans=expected.getJSONArray("plans");for(int i=0;i<plans.length();i++){JSONObject row=plans.getJSONObject(i);if(row.getInt("count")>VectorRegions.MAX_TILES)rejects(()->new VectorRegions.Plan(row.getDouble("latitude"),row.getDouble("longitude"),row.getInt("radius"),"Area",true));else require(new VectorRegions.Plan(row.getDouble("latitude"),row.getDouble("longitude"),row.getInt("radius"),"Area",true).count()==row.getInt("count"),"preview/native tile count parity");}
        VectorRegions.Plan plan=new VectorRegions.Plan(-37.65,145.51,10,"Hike",true);require(plan.count()<8192&&plan.base.size()>0&&plan.dem.size()>0,"bounded plan");require(new VectorRegions.Plan(-37.65,145.51,25,"Weekend",true).count()<8192,"weekend area plan");require(plan.bounds[0]<145.51&&plan.bounds[2]>145.51,"coverage bounds");
        rejects(()->new VectorRegions.Plan(Double.NaN,145,2,"x",true));rejects(()->new VectorRegions.Plan(0,180,2,"x",true));rejects(()->new VectorRegions.Plan(85,0,2,"x",true));rejects(()->new VectorRegions.Plan(0,0,26,"x",true));rejects(()->new VectorRegions.Plan(0,0,2,"\n",true));
        for(String path:new String[]{"../manifest.json","base/../0.pbf","glyphs/%2e%2e.pbf","/base/0/0/0.pbf","base/0/0/0.pbf?x"})require(!VectorRegions.path(path),"path rejected");
        for(String url:new String[]{"http://build.protomaps.com/20261116.pmtiles","https://example.com/a.pmtiles","https://build.protomaps.com@evil.invalid/20261116.pmtiles","https://build.protomaps.com/20261116.pmtiles?x=1"})rejects(()->new VectorPmtiles.Remote(url,()->{}));
        byte[] header=new FileSource(new File(bundle,"basemap.pmtiles")).read(0,127);header[7]=4;rejects(()->new VectorPmtiles(new VectorPmtiles.Source(){public long size(){return 9999999;}public byte[] read(long o,int n){return header;}}));
        rejects(()->new VectorPmtiles.Cursor(new byte[]{(byte)128}).varint());rejects(()->new VectorPmtiles.Cursor(new byte[]{10}).data());
        File root=new File(output,"atomic");root.mkdirs();String id="a".repeat(32);File stage=new File(root,".download-"+id);if(stage.exists())VectorRegions.erase(stage);stage.mkdir();byte[] bytes="sample".getBytes(StandardCharsets.UTF_8);File file=new File(stage,"base/0/0/0.pbf");file.getParentFile().mkdirs();Files.write(file.toPath(),bytes);
        JSONObject manifest=new JSONObject().put("schema","aumanet.vector-region.v1").put("id",id).put("key","b".repeat(64)).put("name","Area").put("bounds",new JSONArray(new double[]{145,-38,146,-37})).put("bytes",bytes.length).put("installedAt",1).put("terrain",false).put("dataDate","2026-11-16").put("files",new JSONObject().put("base/0/0/0.pbf",new JSONObject().put("bytes",bytes.length).put("sha256",VectorRegions.sha(bytes))));Files.writeString(new File(stage,"manifest.json").toPath(),manifest.toString());VectorRegions.verifyPayload(stage,manifest,()->{});checks++;require(VectorRegions.list(root).isEmpty(),"staging is invisible");File ready=new File(root,id);if(ready.exists())VectorRegions.erase(ready);require(stage.renameTo(ready),"atomic publication");require(VectorRegions.list(root).size()==1,"published area");VectorRegions.file(root,id,"base/0/0/0.pbf");checks++;require(VectorRegions.fileFromSet(root,"c".repeat(32)+"_"+id,"base/0/0/0.pbf").equals(new File(ready,"base/0/0/0.pbf")),"adjacent fallback retains verified old-format file");require(VectorRegions.fileFromSet(root,id,"base/1/0/0.pbf")==null,"coverage gap distinct from corruption");rejects(()->VectorRegions.fileFromSet(root,id+"_"+id,"base/1/0/0.pbf"));rejects(()->VectorRegions.fileFromSet(root,"../private","base/0/0/0.pbf"));Files.write(new File(ready,"base/0/0/0.pbf").toPath(),"broken".getBytes(StandardCharsets.UTF_8));rejects(()->VectorRegions.file(root,id,"base/0/0/0.pbf"));rejects(()->VectorRegions.fileFromSet(root,id,"base/0/0/0.pbf"));rejects(()->VectorRegions.verifyPayload(ready,manifest,()->{}));VectorRegions.erase(ready);
        System.out.println(new JSONObject().put("pass",true).put("checks",checks));
    }
}
