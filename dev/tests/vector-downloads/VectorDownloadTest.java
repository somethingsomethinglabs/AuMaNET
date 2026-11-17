package au.aumanet.app.maps;
import java.io.*;
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
    public static void main(String[] args)throws Exception{
        File bundle=new File(args[0]),output=new File(args[1]);output.mkdirs();
        if(args.length>2&&args[2].equals("download")){
            String id="e".repeat(32);File root=new File(output,"live"),stage=new File(root,".download-"+id);root.mkdirs();if(stage.exists())VectorRegions.erase(stage);stage.mkdir();
            JSONObject m=VectorRegions.download(stage,id,new VectorRegions.Plan(-37.6535,145.5159,2,"Healesville host download",true),()->{},(n,t,b,p)->{if(n%20==0)System.out.println(n+"/"+t+" "+b+" bytes");});
            Files.writeString(new File(stage,"manifest.json").toPath(),m.toString());File ready=new File(root,id);if(ready.exists())VectorRegions.erase(ready);require(stage.renameTo(ready),"atomic install");require(VectorRegions.list(root).size()==1,"ready region");
            Iterator<String> keys=m.getJSONObject("files").keys();while(keys.hasNext())VectorRegions.file(root,id,keys.next());System.out.println(new JSONObject().put("pass",true).put("bytes",m.getLong("bytes")).put("files",m.getJSONObject("files").length()).put("manifest",new File(ready,"manifest.json").getPath()));return;
        }
        require(VectorPmtiles.tileId(0,0,0)==0,"root Hilbert");require(VectorPmtiles.tileId(1,0,0)==1,"Hilbert 1");require(VectorPmtiles.tileId(1,0,1)==2,"Hilbert 2");require(VectorPmtiles.tileId(1,1,1)==3,"Hilbert 3");require(VectorPmtiles.tileId(1,1,0)==4,"Hilbert 4");require(VectorPmtiles.tileId(12,3423,1763)==19078479,"spec Hilbert example");
        JSONObject expected=new JSONObject(Files.readString(new File(output,"expected.json").toPath()));
        for(String name:new String[]{"basemap.pmtiles","terrain.pmtiles"}){VectorPmtiles archive=new VectorPmtiles(new FileSource(new File(bundle,name)));JSONArray rows=expected.getJSONArray(name);for(int i=0;i<rows.length();i++){JSONObject row=rows.getJSONObject(i);byte[] tile=archive.tile(row.getInt("z"),row.getInt("x"),row.getInt("y"));require(tile!=null&&VectorRegions.sha(tile).equals(row.getString("sha256")),"tile differs from official PMTiles JS reader");if(name.equals("basemap.pmtiles")){Set<Integer> ranges=new TreeSet<>();VectorRegions.Glyphs.collect(tile,ranges);require(ranges.contains(0)||ranges.isEmpty(),"glyph ranges decoded");}}rejects(()->archive.tile(15,-1,0));}
        VectorRegions.Plan plan=new VectorRegions.Plan(-37.65,145.51,10,"Hike",true);require(plan.count()<2048&&plan.base.size()>0&&plan.dem.size()>0,"bounded plan");require(plan.bounds[0]<145.51&&plan.bounds[2]>145.51,"coverage bounds");
        rejects(()->new VectorRegions.Plan(Double.NaN,145,2,"x",true));rejects(()->new VectorRegions.Plan(0,180,2,"x",true));rejects(()->new VectorRegions.Plan(85,0,2,"x",true));rejects(()->new VectorRegions.Plan(0,0,25,"x",true));rejects(()->new VectorRegions.Plan(0,0,2,"\n",true));
        for(String path:new String[]{"../manifest.json","base/../0.pbf","glyphs/%2e%2e.pbf","/base/0/0/0.pbf","base/0/0/0.pbf?x"})require(!VectorRegions.path(path),"path rejected");
        for(String url:new String[]{"http://build.protomaps.com/20261116.pmtiles","https://example.com/a.pmtiles","https://build.protomaps.com@evil.invalid/20261116.pmtiles","https://build.protomaps.com/20261116.pmtiles?x=1"})rejects(()->new VectorPmtiles.Remote(url,()->{}));
        byte[] header=new FileSource(new File(bundle,"basemap.pmtiles")).read(0,127);header[7]=4;rejects(()->new VectorPmtiles(new VectorPmtiles.Source(){public long size(){return 9999999;}public byte[] read(long o,int n){return header;}}));
        rejects(()->new VectorPmtiles.Cursor(new byte[]{(byte)128}).varint());rejects(()->new VectorPmtiles.Cursor(new byte[]{10}).data());
        File root=new File(output,"atomic");root.mkdirs();String id="a".repeat(32);File stage=new File(root,".download-"+id);if(stage.exists())VectorRegions.erase(stage);stage.mkdir();byte[] bytes="sample".getBytes(StandardCharsets.UTF_8);File file=new File(stage,"base/0/0/0.pbf");file.getParentFile().mkdirs();Files.write(file.toPath(),bytes);
        JSONObject manifest=new JSONObject().put("schema","aumanet.vector-region.v1").put("id",id).put("key","b".repeat(64)).put("name","Area").put("bounds",new JSONArray(new double[]{145,-38,146,-37})).put("bytes",bytes.length).put("installedAt",1).put("terrain",false).put("dataDate","2026-11-16").put("files",new JSONObject().put("base/0/0/0.pbf",new JSONObject().put("bytes",bytes.length).put("sha256",VectorRegions.sha(bytes))));Files.writeString(new File(stage,"manifest.json").toPath(),manifest.toString());VectorRegions.verifyPayload(stage,manifest,()->{});checks++;require(VectorRegions.list(root).isEmpty(),"staging is invisible");File ready=new File(root,id);if(ready.exists())VectorRegions.erase(ready);require(stage.renameTo(ready),"atomic publication");require(VectorRegions.list(root).size()==1,"published area");VectorRegions.file(root,id,"base/0/0/0.pbf");checks++;Files.write(new File(ready,"base/0/0/0.pbf").toPath(),"broken".getBytes(StandardCharsets.UTF_8));rejects(()->VectorRegions.file(root,id,"base/0/0/0.pbf"));rejects(()->VectorRegions.verifyPayload(ready,manifest,()->{}));VectorRegions.erase(ready);
        System.out.println(new JSONObject().put("pass",true).put("checks",checks));
    }
}
