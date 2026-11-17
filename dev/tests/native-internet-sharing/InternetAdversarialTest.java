package au.aumanet.app;

import java.io.*;
import java.net.*;
import java.nio.ByteBuffer;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import javax.net.ssl.*;

/** Actual production resource/parser/framed-TCP boundaries; Android lifecycle is not simulated here. */
public final class InternetAdversarialTest {
    private static final AtomicInteger checks=new AtomicInteger();
    private static int tests;
    private static final String GROUP="a".repeat(32),SESSION="b".repeat(32);
    private static final InetAddress LOOP=InetAddress.getLoopbackAddress();
    interface Work {void run()throws Exception;}
    private static void check(boolean value,String reason){checks.incrementAndGet();if(!value)throw new AssertionError(reason);}
    private static void rejects(Work work)throws Exception{try{work.run();}catch(Exception expected){checks.incrementAndGet();return;}throw new AssertionError("Expected denial");}
    private static DataInputStream input(byte[] bytes){return new DataInputStream(new ByteArrayInputStream(bytes));}
    private static final class BlockingClose implements Closeable {
        final CountDownLatch entered=new CountDownLatch(1),release=new CountDownLatch(1),finished=new CountDownLatch(1);
        public void close()throws IOException{entered.countDown();try{if(!release.await(5,TimeUnit.SECONDS))throw new IOException("test close deadline");}catch(InterruptedException stopped){Thread.currentThread().interrupt();throw new IOException(stopped);}finally{finished.countDown();}}
    }
    private static void retirement()throws Exception {
        tests++;InternetTunnel.Resources old=new InternetTunnel.Resources(),replacement=new InternetTunnel.Resources();BlockingClose blocked=old.own(new BlockingClose());Socket newer=replacement.own(new Socket());
        try {
            long start=System.nanoTime();old.retire();check(System.nanoTime()-start<TimeUnit.MILLISECONDS.toNanos(250),"privacy retirement cannot wait on physical close");
            check(!old.active.get(),"logical denial precedes any physical cleanup");check(blocked.entered.await(2,TimeUnit.SECONDS),"bounded closer reaches exact retired resource");
            Socket late=new Socket();rejects(()->old.own(late));check(late.isClosed(),"late socket cannot enter retired owner");check(!newer.isClosed()&&replacement.active.get(),"old retirement preserves replacement");
            InternetTunnel.Access access=access(new AtomicBoolean(true));check(!InternetTunnel.valid(access,old)&&InternetTunnel.valid(access,replacement),"retired ownership denies forwarding independently of caller guard");
            old.retire();check(!newer.isClosed(),"duplicate old retirement cannot target replacement");
        } finally {blocked.release.countDown();check(blocked.finished.await(2,TimeUnit.SECONDS),"owned closer drains after blocker released");replacement.close();}
    }
    private static InternetTunnel.Access access(AtomicBoolean live){return new InternetTunnel.Access(){public boolean live(){return live.get();}public boolean charge(int n){return live.get();}public Socket internet(InternetWire.Address target)throws Exception{throw new IOException();}public DatagramSocket datagram()throws Exception{throw new IOException();}public InetAddress resolve(InternetWire.Address target)throws Exception{throw new IOException();}public Socket upstream(int kind,InternetWire.Address target)throws Exception{throw new IOException();}};}
    private static void malformed()throws Exception {
        tests++;ByteArrayOutputStream out=new ByteArrayOutputStream();InternetWire.header(new DataOutputStream(out),GROUP,7,SESSION,InternetWire.PING,null);byte[] good=out.toByteArray();
        check(InternetWire.acceptHeader(input(good),GROUP,7,SESSION)==InternetWire.PING,"reference scope accepted");
        rejects(()->InternetWire.acceptHeader(input(good),"c".repeat(32),7,SESSION));rejects(()->InternetWire.acceptHeader(input(good),GROUP,8,SESSION));rejects(()->InternetWire.acceptHeader(input(good),GROUP,7,"d".repeat(32)));
        for(int field:new int[]{0,8,24,32,48}){byte[] changed=good.clone();changed[field]^=(byte)0xff;rejects(()->InternetWire.acceptHeader(input(changed),GROUP,7,SESSION));}
        for(int length:new int[]{0,1,7,good.length-1})rejects(()->InternetWire.acceptHeader(input(Arrays.copyOf(good,length)),GROUP,7,SESSION));
        for(int length:new int[]{-1,4097,Integer.MAX_VALUE})rejects(()->new InternetWire.StreamReader().read(input(ByteBuffer.allocate(4).putInt(length).array())));
        for(int length:new int[]{-1,0,6,InternetWire.MAX_UDP+261,Integer.MAX_VALUE})rejects(()->new InternetWire.DatagramReader().read(input(ByteBuffer.allocate(4).putInt(length).array())));
        rejects(()->new InternetWire.Address(3,"localhost\nignored".getBytes(java.nio.charset.StandardCharsets.US_ASCII),443));
        rejects(()->InternetWire.readAddress(input(new byte[]{9,0,0,0,0,0,0})));
        rejects(()->InternetWire.header(new DataOutputStream(new ByteArrayOutputStream()),GROUP,7,SESSION,InternetWire.TCP,new InternetWire.Address(1,new byte[]{1,1,1,1},0)));
    }
    /** Real TLS and sockets; the live boolean represents the controller's exact immutable peer/run guard. */
    private static void stoppedStream(String ownerKey,String peerKey,boolean retire)throws Exception {
        tests++;HostIdentity owner=new HostIdentity(ownerKey),peer=new HostIdentity(peerKey);
        SSLServerSocket server=(SSLServerSocket)owner.context(pin->pin.equals(HostIdentity.fingerprint(peer.certificate))).getServerSocketFactory().createServerSocket(0,2,LOOP);server.setNeedClientAuth(true);
        ServerSocket appListener=new ServerSocket(0,2,LOOP);InternetTunnel.Resources resources=new InternetTunnel.Resources();AtomicBoolean allowed=new AtomicBoolean(true);AtomicReference<Throwable> failure=new AtomicReference<>();CountDownLatch connected=new CountDownLatch(1),done=new CountDownLatch(1);
        Thread bridge=InternetTunnel.thread("host-adversarial-bridge",()->{try(Socket plain=appListener.accept();SSLSocket secure=(SSLSocket)server.accept()){secure.setSoTimeout(2000);secure.startHandshake();connected.countDown();InternetTunnel.tcp(plain,secure,access(allowed),resources);}catch(Throwable error){failure.set(error);}finally{done.countDown();}});
        try(Socket app=new Socket(LOOP,appListener.getLocalPort());SSLSocket remote=(SSLSocket)peer.context(pin->pin.equals(HostIdentity.fingerprint(owner.certificate))).getSocketFactory().createSocket(LOOP,server.getLocalPort())) {
            remote.setSoTimeout(2000);remote.startHandshake();check(connected.await(2,TimeUnit.SECONDS),"real pinned TLS established");
            byte[] first="before-revocation".getBytes(java.nio.charset.StandardCharsets.US_ASCII);app.getOutputStream().write(first);app.getOutputStream().flush();InternetWire.StreamReader frames=new InternetWire.StreamReader();DataInputStream received=new DataInputStream(remote.getInputStream());check(Arrays.equals(first,frames.read(received)),"framed payload crosses authorized TLS flow");
            if(retire)resources.retire();else allowed.set(false);
            // A remote peer may try another frame after the captured guard is retired.
            // Reads already blocked on the socket must recheck ownership before emitting it.
            try{app.getOutputStream().write("after-revocation".getBytes(java.nio.charset.StandardCharsets.US_ASCII));app.getOutputStream().flush();}catch(IOException alreadyClosed){}
            boolean denied=false;try{frames.read(received);}catch(IOException closed){denied=true;}check(denied,"retired peer/run cannot deliver another payload");
            check(done.await(3,TimeUnit.SECONDS),"retired actual TCP flow terminates");check(failure.get()==null,"normal revocation is not a worker failure");
        } finally {allowed.set(false);resources.close();server.close();appListener.close();bridge.join(3000);}
    }
    private static void staleSocksAdmission()throws Exception {
        tests++;for(int command:new int[]{1,3}){
            ServerSocket server=new ServerSocket(0,2,LOOP);InternetTunnel.Resources resources=new InternetTunnel.Resources();AtomicBoolean peer=new AtomicBoolean(true);AtomicInteger upstream=new AtomicInteger();CountDownLatch authenticated=new CountDownLatch(1),done=new CountDownLatch(1);
            InternetTunnel.Access access=new InternetTunnel.Access(){public boolean live(){boolean current=peer.get();authenticated.countDown();return current;}public boolean charge(int n){return peer.get();}public Socket upstream(int k,InternetWire.Address target)throws Exception{upstream.incrementAndGet();throw new IOException("declared upstream boundary");}public Socket internet(InternetWire.Address target)throws Exception{throw new IOException();}public DatagramSocket datagram()throws Exception{throw new IOException();}public InetAddress resolve(InternetWire.Address target)throws Exception{throw new IOException();}};
            InternetTunnel.thread("host-stale-socks-admission",()->{try(Socket accepted=server.accept()){InternetTunnel.socks(accepted,"u","p",access,resources);}catch(Exception expected){}finally{done.countDown();}});
            try(Socket app=new Socket(LOOP,server.getLocalPort())){app.setSoTimeout(2000);DataOutputStream send=new DataOutputStream(app.getOutputStream());DataInputStream read=new DataInputStream(app.getInputStream());send.write(new byte[]{5,1,2});send.flush();check(read.readUnsignedShort()==0x0502,"authentication chosen");send.write(new byte[]{1,1,'u',1,'p'});send.flush();check(read.readUnsignedShort()==0x0100,"secret accepted before peer replacement");check(authenticated.await(2,TimeUnit.SECONDS),"initial peer guard passed before blocked request header");peer.set(false);send.write(new byte[]{5,(byte)command,0,1,1,1,1,1,0,53});send.flush();check(done.await(2,TimeUnit.SECONDS),"stale request terminates");check(upstream.get()==0,"retired peer cannot create a new donor connection after delayed SOCKS header");}
            finally{peer.set(false);resources.close();server.close();}
        }
    }
    private static void stoppedUdpReceive()throws Exception {
        tests++;ServerSocket local=new ServerSocket(0,2,LOOP),hop=new ServerSocket(0,2,LOOP);InternetTunnel.Resources resources=new InternetTunnel.Resources();AtomicBoolean live=new AtomicBoolean(true);AtomicInteger mainChecks=new AtomicInteger(),charged=new AtomicInteger();CountDownLatch preReceive=new CountDownLatch(1),release=new CountDownLatch(1),done=new CountDownLatch(1);String workerName="host-udp-receive-stop";
        Socket upstream=new Socket(LOOP,hop.getLocalPort());Socket remote=hop.accept();remote.setSoTimeout(2000);
        InternetTunnel.Access access=new InternetTunnel.Access(){public boolean live(){boolean observed=live.get();if(Thread.currentThread().getName().equals(workerName)&&mainChecks.incrementAndGet()==3){preReceive.countDown();try{if(!release.await(2,TimeUnit.SECONDS))throw new IllegalStateException("test gate deadline");}catch(InterruptedException stopped){throw new IllegalStateException(stopped);}}return observed;}public boolean charge(int n){charged.addAndGet(n);return live.get();}public Socket upstream(int kind,InternetWire.Address target){return upstream;}public Socket internet(InternetWire.Address t)throws Exception{throw new IOException();}public DatagramSocket datagram()throws Exception{throw new IOException();}public InetAddress resolve(InternetWire.Address t)throws Exception{throw new IOException();}};
        InternetTunnel.thread(workerName,()->{try(Socket accepted=local.accept()){InternetTunnel.socks(accepted,"u","p",access,resources);}catch(Exception expected){}finally{done.countDown();}});
        try(Socket app=new Socket(LOOP,local.getLocalPort());DatagramSocket packetSource=new DatagramSocket(new InetSocketAddress(LOOP,0))){app.setSoTimeout(2000);DataOutputStream out=new DataOutputStream(app.getOutputStream());DataInputStream in=new DataInputStream(app.getInputStream());out.write(new byte[]{5,1,2});out.flush();check(in.readUnsignedShort()==0x0502,"UDP association requires secret");out.write(new byte[]{1,1,'u',1,'p'});out.flush();check(in.readUnsignedShort()==0x0100,"UDP secret accepted");out.write(new byte[]{5,3,0,1,0,0,0,0,0,0});out.flush();check(in.readUnsignedByte()==5&&in.readUnsignedByte()==0&&in.readUnsignedByte()==0,"UDP association established while authorized");InternetWire.Address bound=InternetWire.readAddress(in);check(preReceive.await(2,TimeUnit.SECONDS),"receive-loop guard captured live before Stop");live.set(false);
            byte[] datagram={0,0,0,1,1,1,1,1,0,53,9,8,7};packetSource.send(new DatagramPacket(datagram,datagram.length,LOOP,bound.port));release.countDown();boolean emitted=false;try{emitted=remote.getInputStream().read()>=0;}catch(IOException denied){}check(!emitted,"packet arriving after Stop cannot emit a framed upstream byte");check(charged.get()==0,"retired packet consumes no quota");check(done.await(3,TimeUnit.SECONDS),"retired UDP association exits");
        }finally{live.set(false);release.countDown();resources.close();upstream.close();remote.close();local.close();hop.close();}
    }
    public static void main(String[] args)throws Exception{retirement();malformed();stoppedStream(args[0],args[1],true);stoppedStream(args[0],args[1],false);staleSocksAdmission();stoppedUdpReceive();System.out.println("{\"status\":\"pass\",\"testCount\":"+tests+",\"assertionCount\":"+checks.get()+"}");}
}
