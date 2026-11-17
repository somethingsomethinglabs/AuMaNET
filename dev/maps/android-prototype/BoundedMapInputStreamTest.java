package au.aumanet.app.maps;
import java.io.*;
import java.nio.file.*;
import java.util.*;

/** Exact offset/end/descriptor lifecycle tests, independent of WebView heuristics. */
public final class BoundedMapInputStreamTest {
    private interface Work{void run()throws Exception;}
    private static void check(boolean value,String message){if(!value)throw new AssertionError(message);}
    private static void reject(Work work)throws Exception{try{work.run();}catch(IOException expected){return;}throw new AssertionError("Invalid file window accepted");}
    public static void main(String[] args)throws Exception{
        Path root=Path.of(args[0]);Files.createDirectories(root);File file=root.resolve("bounded.bin").toFile();byte[] bytes=new byte[256];for(int i=0;i<bytes.length;i++)bytes[i]=(byte)i;Files.write(file.toPath(),bytes);
        BoundedMapInputStream stream=new BoundedMapInputStream(file,32,16);byte[] actual=stream.readAllBytes();check(Arrays.equals(actual,Arrays.copyOfRange(bytes,32,48)),"Source offset was skipped twice or end was not bounded");check(stream.read()==-1&&BoundedMapInputStream.openReaders()==0,"EOF retained a native descriptor");stream.close();
        try(BoundedMapInputStream partial=new BoundedMapInputStream(file,100,20)){check(partial.read()==100,"Incorrect first byte");check(partial.skip(18)==18&&partial.read()==119&&partial.read()==-1,"Skip crossed its requested window");}check(BoundedMapInputStream.openReaders()==0,"Partial read leaked");
        BoundedMapInputStream closed=new BoundedMapInputStream(file,0,16);closed.close();reject(closed::read);check(BoundedMapInputStream.openReaders()==0,"Explicit close leaked");
        reject(()->new BoundedMapInputStream(file,-1,1));reject(()->new BoundedMapInputStream(file,255,2));reject(()->new BoundedMapInputStream(file,0,2097153));
        File denied=new File(file.getPath()){@Override public long length(){return 256;}@Override public String getPath(){throw new SecurityException("Injected open denial");}};try{new BoundedMapInputStream(denied,0,1);throw new AssertionError("Open denial not injected");}catch(SecurityException expected){}check(BoundedMapInputStream.openReaders()==0,"Runtime open failure leaked a permit");
        long[] last=BoundedMapInputStream.query("offset=255&length=1",256);check(last[0]==255&&last[1]==1,"Last source byte rejected");for(String query:new String[]{"offset=256&length=1","offset=255&length=2","offset=0&length=2097153","offset=0&length=0","offset=-1&length=1","offset=0&length=1&path=other","bytes=0-15"})reject(()->BoundedMapInputStream.query(query,256));
        BoundedMapInputStream truncated=new BoundedMapInputStream(file,128,20);try(RandomAccessFile edit=new RandomAccessFile(file,"rw")){edit.setLength(1);}reject(truncated::read);check(BoundedMapInputStream.openReaders()==0,"Truncated source leaked its descriptor");Files.write(file.toPath(),bytes);
        List<BoundedMapInputStream> held=new ArrayList<>();try{for(int i=0;i<32;i++)held.add(new BoundedMapInputStream(file,0,1));reject(()->new BoundedMapInputStream(file,0,1));check(BoundedMapInputStream.openReaders()==32,"Descriptor cap was exceeded");}finally{for(BoundedMapInputStream value:held)value.close();}check(BoundedMapInputStream.openReaders()==0,"Descriptor recovery failed");
        System.out.println("PASS native query offset/end/EOF/truncation/close/32-reader cap scenarios");
    }
}
