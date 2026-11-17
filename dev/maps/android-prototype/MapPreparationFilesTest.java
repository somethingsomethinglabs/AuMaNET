package au.aumanet.maps.prototype;

import java.io.*;
import java.nio.*;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import javax.imageio.ImageIO;

/** Independent JVM fault-injection harness; ImageIO substitutes for Android's bounded PNG decode. */
public final class MapPreparationFilesTest {
    private static final double W=20037508.342789244;
    private static Path temporary;private static byte[] golden,png;private static int passed;
    private interface Work{void run()throws Exception;}
    private static void check(boolean condition,String message){if(!condition)throw new AssertionError(message);}
    private static void expect(Work work,String fragment)throws Exception{try{work.run();}catch(Exception e){check(e.getMessage()!=null&&e.getMessage().contains(fragment),"Unexpected rejection: "+e);return;}throw new AssertionError("Expected rejection: "+fragment);}
    private static void test(String name,Work work)throws Exception{work.run();passed++;System.out.println("PASS "+name);}
    private static MapPreparationFiles store(String name,long quota)throws Exception{return new MapPreparationFiles(temporary.resolve(name).toFile(),quota);}
    private static MapPreparationFiles.Source source(MapPreparationFiles files)throws Exception{return files.copySource(new ByteArrayInputStream(new byte[]{'I','I',42,0,8,0,0,0,1,2,3}),"/untrusted/../fixture.tif",()->false);}
    private static MapPreparationFiles.Plan plan()throws Exception{return new MapPreparationFiles.Plan(new double[]{-W/2,-W/2,W/2,W/2},0,0);}
    private static MapPreparationFiles.Metadata metadata(String id)throws Exception{return new MapPreparationFiles.Metadata(id,"Fixture region",Map.of("name","Fixture source","url","https://example.org/source","attribution","Test-only synthetic raster","license","CC0","licenseUrl","https://creativecommons.org/publicdomain/zero/1.0/","dataDate","2026"));}
    private static MapPreparationFiles.Session begin(MapPreparationFiles files)throws Exception{return files.begin(source(files),plan(),metadata("fixture-region"),(bytes,offset,length)->{var image=ImageIO.read(new ByteArrayInputStream(bytes,offset,length));if(image==null||image.getWidth()!=256||image.getHeight()!=256)throw new IOException("Image decode rejected");});}
    private static byte[] frame(MapPreparationFiles.Session session,int sequence)throws Exception{byte[] value=golden.clone();for(int i=0;i<16;i++)value[8+i]=(byte)Integer.parseInt(session.id.substring(i*2,i*2+2),16);ByteBuffer.wrap(value).putInt(24,sequence);return value;}
    private static MapPreparationFiles.Ack write(MapPreparationFiles.Session session,byte[] bytes){MapPreparationFiles.Ack[] ack={null};check(session.offer(bytes,Runnable::run,value->ack[0]=value),"Frame not accepted");check(ack[0]!=null,"Missing acknowledgement");return ack[0];}
    private static long stages(Path directory)throws Exception{try(var paths=Files.list(directory)){return paths.filter(p->p.getFileName().toString().startsWith(".prepare-")||p.getFileName().toString().startsWith(".geo-source-")).count();}}
    public static void main(String[] args)throws Exception{
        temporary=Path.of(args[0]);Files.createDirectories(temporary);golden=Files.readAllBytes(Path.of(args[1]));png=Arrays.copyOfRange(golden,76,golden.length);
        test("exact HTTPS localhost main-frame origin boundary",()->{
            check(MapPreparationFiles.allowedOrigin("https://localhost",true),"Production origin rejected");check(MapPreparationFiles.allowedOrigin("https://localhost:443",true),"Default HTTPS port rejected");
            for(String origin:new String[]{"http://localhost","https://localhost:5173","https://localhost.evil.test","https://user@localhost","https://localhost/?a=1","file://localhost","https://127.0.0.1","https://localhost/#x","https://localhost/other"})check(!MapPreparationFiles.allowedOrigin(origin,true),"Untrusted origin allowed: "+origin);
            check(!MapPreparationFiles.allowedOrigin("https://localhost",false),"Child frame allowed");
        });
        test("source copy owns path, immutable checksum and cancellation cleanup",()->{
            var files=store("source",MapPreparationFiles.DEFAULT_PAYLOAD_BYTES);var source=source(files);check(source.fileName.equals("fixture.tif"),"Untrusted source path escaped metadata");check(source.sha256.matches("[a-f0-9]{64}"),"Missing native hash");check(source.bytes==11,"Incorrect native source bytes");files.discardSource(source);
            expect(()->files.copySource(new ByteArrayInputStream(new byte[16]),"bad.tif",()->false),"classic TIFF");expect(()->files.copySource(new ByteArrayInputStream(new byte[16]),"cancel.tif",()->true),"cancelled");check(stages(temporary.resolve("source"))==0,"Source staging leaked");
        });
        test("global mutation lease spans source copy through commit/cancel and releases on failure",()->{
            var files=store("lease",MapPreparationFiles.DEFAULT_PAYLOAD_BYTES);var selected=source(files);File root=temporary.resolve("lease").toFile();expect(()->MapMutationLease.acquire(root),"mutation");expect(files::cleanOrphans,"active");files.discardSource(selected);try(var external=MapMutationLease.acquire(root)){expect(()->source(files),"mutation");}var session=begin(files);check(write(session,frame(session,0)).ok,"Lease fixture tile failed");session.finish((ready,regionId)->expect(()->MapMutationLease.acquire(root),"mutation"));try(var afterCommit=MapMutationLease.acquire(root)){}var cancelled=begin(files);cancelled.cancel();try(var afterCancel=MapMutationLease.acquire(root)){}var invalid=source(files);expect(()->files.begin(invalid,null,metadata("fixture-region"),(bytes,offset,length)->{}),"validation");try(var afterFailure=MapMutationLease.acquire(root)){}
        });
        test("native geometry bounds reject unbounded or unsupported coverage",()->{
            check(plan().tileCount==1,"Fixture tile coverage wrong");expect(()->new MapPreparationFiles.Plan(new double[]{-W,-W,W,W},18,18),"8192");expect(()->new MapPreparationFiles.Plan(new double[]{0,0,Double.NaN,1},0,0),"bounds");expect(()->new MapPreparationFiles.Plan(new double[]{-1,-1,1,1},0,5),"geometry");
            var actual=new MapPreparationFiles.Plan(new double[]{16241303.492,-4664826.576,16376172.885,-4567049.439},10,14);check(actual.tileCount>3000&&actual.tileCount<3200,"Actual regional extent unexpectedly sized");
        });
        test("cross-language binary frame commits complete native-owned index atomically",()->{
            var files=store("commit",MapPreparationFiles.PROPOSED_PAYLOAD_BYTES);var session=begin(files);expect(session::finish,"incomplete");var ack=write(session,frame(session,0));check(ack.ok&&ack.sequence==0&&ack.storedBytes==png.length,"Unexpected write accounting");check(session.tile(0,0,0).isFile(),"Local child tile not available");expect(()->session.tile(0,1,0),"unavailable");File ready=session.finish();check(new File(ready,"manifest.json").isFile(),"Ready index missing");check(new File(ready,"0/0/0.png").length()==png.length,"Ready PNG incomplete");String manifest=Files.readString(new File(ready,"manifest.json").toPath());check(manifest.contains("full-colour PNG output")&&manifest.contains("\"sha256\""),"Native provenance missing");session.cancel();check(ready.isDirectory(),"Late cancel deleted committed region");check(stages(temporary.resolve("commit"))==0,"Commit source/stage leaked");
        });
        test("one in-flight native task prevents a message flood backlog",()->{
            var files=store("flood",MapPreparationFiles.DEFAULT_PAYLOAD_BYTES);var session=begin(files);List<Runnable> tasks=new ArrayList<>();check(session.offer(frame(session,0),tasks::add,ack->{}),"First frame refused");for(int i=0;i<1000;i++)check(!session.offer(frame(session,0),tasks::add,ack->{}),"Flood queued");check(tasks.size()==1,"Executor backlog grew");session.cancel();tasks.get(0).run();check(stages(temporary.resolve("flood"))==0,"Cancelled queued work recreated stage");
        });
        test("stale generation is rejected without destroying the current preparation",()->{
            var files=store("generation",MapPreparationFiles.DEFAULT_PAYLOAD_BYTES);var old=begin(files);byte[] delayed=frame(old,0);old.cancel();var current=begin(files);check(!current.offer(delayed,Runnable::run,ack->{}),"Old-generation frame queued");check(write(current,frame(current,0)).ok,"Current generation was damaged");current.cancel();
        });
        test("corrupt headers hashes duplicate sequence and tile coordinates fail before decoding",()->{
            for(String fault:new String[]{"magic","version","reserved","length","dimensions","hash","sequence","coordinates"}){
                var files=store("bad-"+fault,MapPreparationFiles.DEFAULT_PAYLOAD_BYTES);int[] decodes={0};var session=files.begin(source(files),plan(),metadata("fixture-region"),(data,offset,length)->decodes[0]++);byte[] bad=frame(session,0);ByteBuffer view=ByteBuffer.wrap(bad);
                switch(fault){case"magic":bad[0]=0;break;case"version":bad[4]=2;break;case"reserved":bad[29]=1;break;case"length":view.putInt(40,png.length+1);break;case"dimensions":view.putInt(76+16,100000000);break;case"hash":bad[44]^=1;break;case"sequence":view.putInt(24,1);break;case"coordinates":view.putInt(32,99);break;}
                check(!write(session,bad).ok,"Invalid frame accepted: "+fault);check(decodes[0]==0,"Decode occurred before validation: "+fault);check(stages(temporary.resolve("bad-"+fault))==0,"Failure stage leaked: "+fault);
            }
            var files=store("duplicate",MapPreparationFiles.DEFAULT_PAYLOAD_BYTES);var session=begin(files);check(write(session,frame(session,0)).ok,"First tile failed");check(!write(session,frame(session,1)).ok,"Duplicate tile accepted");
        });
        test("quota and decoder/storage faults preserve the previous ready region",()->{
            var directory=temporary.resolve("fault");var files=store("fault",32);Path previous=directory.resolve("old-region."+"a".repeat(32));Files.createDirectories(previous);Files.writeString(previous.resolve("manifest.json"),"previous-ready");int[] decodes={0};var session=files.begin(source(files),plan(),metadata("fixture-region"),(bytes,offset,length)->decodes[0]++);check(!write(session,frame(session,0)).ok,"Payload quota exceeded");check(decodes[0]==0&&Files.readString(previous.resolve("manifest.json")).equals("previous-ready"),"Prior map changed");
            var decodeStore=store("decode-failure",MapPreparationFiles.DEFAULT_PAYLOAD_BYTES);var decode=decodeStore.begin(source(decodeStore),plan(),metadata("fixture-region"),(bytes,offset,length)->{throw new IOException("Injected decode failure");});check(!write(decode,frame(decode,0)).ok,"Decode failure accepted");check(stages(temporary.resolve("decode-failure"))==0,"Decode failure leaked");
            var diskStore=store("disk-failure",MapPreparationFiles.DEFAULT_PAYLOAD_BYTES);var disk=begin(diskStore);Files.writeString(temporary.resolve("disk-failure/.prepare-"+disk.id+"/0"),"blocks tile directory");check(!write(disk,frame(disk,0)).ok,"Filesystem write failure accepted");check(stages(temporary.resolve("disk-failure"))==0,"Filesystem failure leaked");
        });
        test("startup orphan cleanup removes incomplete source/stage and keeps ready regions",()->{
            var directory=temporary.resolve("orphans");var files=store("orphans",MapPreparationFiles.DEFAULT_PAYLOAD_BYTES);Files.createDirectories(directory.resolve(".prepare-"+"b".repeat(32)));Files.writeString(directory.resolve(".geo-source-"+"c".repeat(32)+".tif"),"partial");Path ready=directory.resolve("ready-region."+"d".repeat(32));Files.createDirectories(ready);Files.writeString(ready.resolve("manifest.json"),"ready");files.cleanOrphans();check(stages(directory)==0&&Files.isDirectory(ready),"Orphan cleanup crossed ready boundary");
        });
        test("source mutation prevents activation and four-region bound supports replacement",()->{
            var files=store("source-mutation",MapPreparationFiles.DEFAULT_PAYLOAD_BYTES);var input=source(files);var session=files.begin(input,plan(),metadata("fixture-region"),(bytes,offset,length)->{});check(write(session,frame(session,0)).ok,"Valid tile failed");Files.write(input.file().toPath(),new byte[]{'I','I',42,0,8,0,0,0,9,9,9});expect(session::finish,"changed");check(stages(temporary.resolve("source-mutation"))==0,"Source mutation left a partial stage");session.cancel();
            var bounded=store("regions",MapPreparationFiles.DEFAULT_PAYLOAD_BYTES);Path directory=temporary.resolve("regions");for(int i=0;i<4;i++){Path region=directory.resolve("r"+i+"."+String.valueOf(i).repeat(32));Files.createDirectories(region);Files.writeString(region.resolve("manifest.json"),"ready");}var selected=source(bounded);expect(()->bounded.begin(selected,plan(),metadata("new-region"),(bytes,offset,length)->{}),"four-region");var replace=bounded.begin(source(bounded),plan(),metadata("r1"),(bytes,offset,length)->{});replace.cancel();
        });
        System.out.println("RESULT "+passed+" native staging scenarios passed");
    }
}
