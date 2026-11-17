package au.aumanet.app;

import java.io.*;
import java.net.SocketTimeoutException;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Test;
import static org.junit.Assert.*;

public class GroupWireMaintenanceTest {
    static byte[] frame(String value)throws IOException {
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();
        GroupWire.write(new DataOutputStream(bytes),value);return bytes.toByteArray();
    }
    static class Pausing extends InputStream {
        final byte[] bytes;final int[] pauses;int at,pause;
        Pausing(byte[] bytes,int... pauses){this.bytes=bytes;this.pauses=pauses;}
        public int read()throws IOException{byte[] b=new byte[1];return read(b,0,1)<0?-1:b[0]&255;}
        public int read(byte[] out,int offset,int length)throws IOException {
            if(pause<pauses.length&&at==pauses[pause]){pause++;throw new SocketTimeoutException();}
            if(at==bytes.length)return -1;
            int n=Math.min(length,bytes.length-at);
            if(pause<pauses.length)n=Math.min(n,pauses[pause]-at);
            System.arraycopy(bytes,at,out,offset,n);at+=n;return n;
        }
    }
    @Test public void preservesHeaderAndPayloadAcrossRetainedTimeouts()throws Exception {
        AtomicInteger checks=new AtomicInteger();
        assertEquals("hello",GroupWire.read(new DataInputStream(new Pausing(frame("hello"),2,6)),()->{checks.incrementAndGet();return true;}));
        assertEquals(2,checks.get());
    }
    @Test public void ordinaryReadStillTimesOut()throws Exception {
        assertThrows(SocketTimeoutException.class,()->GroupWire.read(new DataInputStream(new Pausing(frame("hello"),2))));
    }
    @Test public void expiredOrRevokedLeaseStopsPartialRead()throws Exception {
        AtomicInteger checks=new AtomicInteger();
        assertThrows(SocketTimeoutException.class,()->GroupWire.read(new DataInputStream(new Pausing(frame("hello"),2,6)),()->checks.incrementAndGet()==1));
        assertEquals(2,checks.get());
    }
    @Test public void retainedLeaseDoesNotHideEofOrInvalidLength()throws Exception {
        assertThrows(EOFException.class,()->GroupWire.read(new DataInputStream(new ByteArrayInputStream(new byte[]{0,0})),()->true));
        assertThrows(IOException.class,()->GroupWire.read(new DataInputStream(new ByteArrayInputStream(new byte[]{0,2,0,0})),()->true));
    }
    @Test public void transferredTimeoutBytesAreNotDiscarded()throws Exception {
        byte[] bytes=frame("hello");
        InputStream stream=new ByteArrayInputStream(bytes);
        InputStream partial=new FilterInputStream(stream){boolean paused;
            public int read(byte[] out,int offset,int length)throws IOException {
                if(!paused){paused=true;int n=in.read(out,offset,2);SocketTimeoutException timeout=new SocketTimeoutException();timeout.bytesTransferred=n;throw timeout;}
                return in.read(out,offset,length);
            }
        };
        assertEquals("hello",GroupWire.read(new DataInputStream(partial),()->true));
    }
}
