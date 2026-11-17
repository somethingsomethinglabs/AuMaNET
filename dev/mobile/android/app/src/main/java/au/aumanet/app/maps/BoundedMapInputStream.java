package au.aumanet.app.maps;
import java.io.*;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

/** Real seek and exact end bound; closes its descriptor immediately after the final byte. */
public final class BoundedMapInputStream extends InputStream {
    private static final Semaphore DESCRIPTORS=new Semaphore(32,true);
    private final RandomAccessFile file;
    private long remaining;
    private boolean closed;
    public BoundedMapInputStream(File source,long offset,long length)throws IOException{
        if(offset<0||length<1||length>2L*1024*1024||offset>source.length()-length)throw new IOException("Invalid bounded map file read");
        try{if(!DESCRIPTORS.tryAcquire(1,TimeUnit.SECONDS))throw new IOException("Map file readers are busy");}catch(InterruptedException e){Thread.currentThread().interrupt();throw new IOException("Map read interrupted",e);}
        RandomAccessFile opened=null;boolean accepted=false;try{opened=new RandomAccessFile(source,"r");opened.seek(offset);file=opened;remaining=length;accepted=true;}finally{if(!accepted)try{if(opened!=null)opened.close();}finally{DESCRIPTORS.release();}}
    }
    @Override public synchronized int read()throws IOException{if(remaining==0)return-1;ensureOpen();int value=file.read();if(value<0){close();throw new EOFException("Map file was truncated");}remaining--;if(remaining==0)close();return value;}
    @Override public synchronized int read(byte[] bytes,int offset,int length)throws IOException{if(bytes==null)throw new NullPointerException();if(offset<0||length<0||offset>bytes.length-length)throw new IndexOutOfBoundsException();if(length==0)return 0;if(remaining==0)return-1;ensureOpen();int count=file.read(bytes,offset,(int)Math.min(length,remaining));if(count<0){close();throw new EOFException("Map file was truncated");}remaining-=count;if(remaining==0)close();return count;}
    @Override public synchronized long skip(long count)throws IOException{if(count<=0||remaining==0)return 0;ensureOpen();long skipped=Math.min(count,remaining);file.seek(file.getFilePointer()+skipped);remaining-=skipped;if(remaining==0)close();return skipped;}
    @Override public synchronized int available(){return closed?0:(int)Math.min(Integer.MAX_VALUE,remaining);}
    @Override public synchronized void close()throws IOException{if(closed)return;closed=true;try{file.close();}finally{DESCRIPTORS.release();}}
    private void ensureOpen()throws IOException{if(closed)throw new IOException("Map file stream is closed");}
    static int openReaders(){return 32-DESCRIPTORS.availablePermits();}
    /** Query transport avoids WebView's automatic Range start-offset heuristics. */
    public static long[] query(String raw,long size)throws IOException{
        if(raw==null||!raw.matches("offset=\\d{1,10}&length=\\d{1,10}"))throw new IOException("An exact bounded source read is required");
        String[] values=raw.split("&");long offset=Long.parseLong(values[0].substring(7)),length=Long.parseLong(values[1].substring(7));
        if(offset<0||length<1||length>2L*1024*1024||offset>size-length)throw new IOException("Source read lies outside the bounded file");return new long[]{offset,length};
    }
}
