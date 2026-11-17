package au.aumanet.app;

import org.junit.Test;
import static org.junit.Assert.*;
import java.io.IOException;
import java.net.*;
import java.util.concurrent.*;

/** Real loopback listeners exercise restart/occupied-port behavior without Android or phones. */
public class GroupListenerEndpointTest {
    private final InetAddress loopback=InetAddress.getLoopbackAddress();
    private void await(CountDownLatch latch)throws Exception{assertTrue("Latch timed out",latch.await(2,TimeUnit.SECONDS));}
    private void until(java.util.function.BooleanSupplier done)throws Exception{long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(2);while(!done.getAsBoolean()&&System.nanoTime()<end)Thread.yield();assertTrue("Condition timed out",done.getAsBoolean());}

    @Test public void resumeKeepsValidPortAndAllowsExplicitPrivateAddressMigration(){
        assertEquals(40001,GroupListenerEndpoint.resumePort("192.168.1.20","192.168.1.20",40001));
        for(int port:new int[]{-1,0,1,1023,65536})assertThrows(IllegalStateException.class,()->GroupListenerEndpoint.resumePort("192.168.1.20","192.168.1.20",port));
        assertEquals(40001,GroupListenerEndpoint.resumePort("192.168.1.20","192.168.1.21",40001));
        for(String host:new String[]{"example.test","8.8.8.8","192.168.01.20","127.0.0.1"})assertThrows(IllegalArgumentException.class,()->GroupListenerEndpoint.resumePort(host,"192.168.1.20",40001));
    }

    @Test public void freshAllocationSetsReuseBeforeBindingThenRestartKeepsChosenPort()throws Exception{
        int port;
        try(ServerSocket initial=new ServerSocket(){@Override public void bind(SocketAddress endpoint,int backlog)throws IOException{assertTrue("Reuse must precede bind",getReuseAddress());super.bind(endpoint,backlog);}}){
            GroupListenerEndpoint.bind(initial,loopback,0);port=initial.getLocalPort();assertTrue(port>=1024);
            // Create an established connection before shutdown, as a real restart can leave TIME_WAIT.
            try(Socket client=new Socket(loopback,port);Socket accepted=initial.accept()){accepted.close();}
        }
        try(ServerSocket resumed=new ServerSocket()){GroupListenerEndpoint.bind(resumed,loopback,port);assertEquals(port,resumed.getLocalPort());}
    }

    @Test public void occupiedSavedPortFailsWithoutAllocatingFallback()throws Exception{
        try(ServerSocket owner=new ServerSocket();ServerSocket retry=new ServerSocket()){
            GroupListenerEndpoint.bind(owner,loopback,0);int port=owner.getLocalPort();
            BindException failure=assertThrows(BindException.class,()->GroupListenerEndpoint.bind(retry,loopback,port));
            assertTrue(failure.getMessage().contains("retry Resume"));assertTrue(failure.getCause() instanceof BindException);
            assertFalse("Occupied resume must not silently bind port 0",retry.isBound());assertEquals(port,owner.getLocalPort());
        }
    }

    @Test public void asynchronousListenerCloseRequiresRetryAndRetainsExactEndpoint()throws Exception{
        CountDownLatch closing=new CountDownLatch(1),release=new CountDownLatch(1);GroupSocketBudget budget=new GroupSocketBudget(1,1);
        ServerSocket owner=new ServerSocket(){@Override public void close()throws IOException{
            closing.countDown();try{if(!release.await(2,TimeUnit.SECONDS))throw new IOException("Test close release timed out");}catch(InterruptedException stopped){Thread.currentThread().interrupt();throw new IOException(stopped);}super.close();
        }};
        try{
            GroupListenerEndpoint.bind(owner,loopback,0);int port=owner.getLocalPort();GroupSocketBudget.Lease lease=budget.reserve();assertNotNull(lease);
            lease.closeAsync(owner,1);await(closing);
            try(ServerSocket early=new ServerSocket()){assertThrows(BindException.class,()->GroupListenerEndpoint.bind(early,loopback,port));assertFalse(early.isBound());}
            assertEquals("Pending physical close keeps its FD lease",1,budget.used());release.countDown();until(()->budget.used()==0);
            try(ServerSocket resumed=new ServerSocket()){GroupListenerEndpoint.bind(resumed,loopback,port);assertEquals(port,resumed.getLocalPort());}
        }finally{release.countDown();owner.close();}
    }
}
