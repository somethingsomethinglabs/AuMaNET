package au.aumanet.app.maps;
import android.content.res.AssetFileDescriptor;
import java.io.*;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

/** Exact bounded reads of an uncompressed APK asset. Never exposes a filesystem path. */
final class BoundedAssetInputStream extends InputStream {
    private static final Semaphore READERS=new Semaphore(32,true);
    private final InputStream input;
    private long remaining;
    private boolean closed;
    BoundedAssetInputStream(AssetFileDescriptor asset,long offset,long length)throws IOException{
        if(offset<0||length<1||length>2L*1024*1024||offset>asset.getLength()-length){asset.close();throw new IOException("Invalid asset range");}
        try{if(!READERS.tryAcquire(1,TimeUnit.SECONDS)){asset.close();throw new IOException("Vector map readers are busy");}}catch(InterruptedException error){asset.close();Thread.currentThread().interrupt();throw new IOException("Asset read interrupted",error);}
        InputStream opened=null;
        try{
            opened=asset.createInputStream();long left=offset;
            while(left>0){long skipped=opened.skip(left);if(skipped<=0)throw new EOFException("Asset offset unavailable");left-=skipped;}
            input=opened;remaining=length;
        }catch(Exception error){try{if(opened!=null)opened.close();else asset.close();}finally{READERS.release();}throw error;}
    }
    @Override public synchronized int read()throws IOException{if(remaining==0)return-1;ensureOpen();int value=input.read();if(value<0){close();throw new EOFException("Vector asset truncated");}remaining--;if(remaining==0)close();return value;}
    @Override public synchronized int read(byte[] bytes,int offset,int length)throws IOException{
        if(bytes==null)throw new NullPointerException();if(offset<0||length<0||offset>bytes.length-length)throw new IndexOutOfBoundsException();if(length==0)return 0;if(remaining==0)return-1;ensureOpen();
        int count=input.read(bytes,offset,(int)Math.min(length,remaining));if(count<0){close();throw new EOFException("Vector asset truncated");}remaining-=count;if(remaining==0)close();return count;
    }
    @Override public synchronized int available(){return closed?0:(int)Math.min(Integer.MAX_VALUE,remaining);}
    @Override public synchronized void close()throws IOException{if(closed)return;closed=true;try{input.close();}finally{READERS.release();}}
    private void ensureOpen()throws IOException{if(closed)throw new IOException("Vector asset stream closed");}
}
