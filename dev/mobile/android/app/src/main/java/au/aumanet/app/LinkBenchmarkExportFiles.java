package au.aumanet.app;
import java.io.*;import java.nio.charset.StandardCharsets;import java.util.*;
/** Each explicit export owns a new URI. An old recipient's retained URI must
 * never reveal a later result/group/position through a rewritten cache path. */
final class LinkBenchmarkExportFiles {
    static File create(File directory,String format,String text,long now)throws Exception{
        if(!format.equals("json")&&!format.equals("csv"))throw new IOException();byte[] bytes=text.getBytes(StandardCharsets.UTF_8);if(bytes.length>4*1024*1024)throw new IOException();if(!directory.isDirectory()&&!directory.mkdirs())throw new IOException();File[] files=directory.listFiles();if(files==null)throw new IOException();Arrays.sort(files,Comparator.comparingLong(File::lastModified));int remaining=files.length;
        for(File file:files){if(!file.isFile())throw new IOException();if(remaining>=8||now-file.lastModified()>=24*60*60*1000L){if(!file.delete())throw new IOException();remaining--;}}
        File fresh=new File(directory,"AuMaNET-link-results-"+UUID.randomUUID().toString().replace("-","")+"."+format);if(!fresh.createNewFile())throw new IOException();boolean complete=false;try{try(FileOutputStream out=new FileOutputStream(fresh)){out.write(bytes);out.getFD().sync();}complete=true;return fresh;}finally{if(!complete)fresh.delete();}
    }
    private LinkBenchmarkExportFiles(){}
}
