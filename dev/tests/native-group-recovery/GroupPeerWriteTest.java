package au.aumanet.app;
import org.json.*;
import java.io.*;
import java.net.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

/** Exact extracted production writer, real GroupWire framing/sequence and TCP.
 * Filter, authority/consent and Android clock are explicit host boundaries. */
public final class GroupPeerWriteTest {
    static int tests,checks;
    static void check(boolean value){checks++;if(!value)throw new AssertionError("Peer sequence check failed");}
    static void await(CountDownLatch latch)throws Exception{if(!latch.await(3,TimeUnit.SECONDS))throw new AssertionError("Writer barrier timed out");}
    static JSONObject heartbeat()throws Exception{return new JSONObject().put("type","heartbeat");}
    static JSONObject text()throws Exception{return new JSONObject().put("type","text").put("payload",new JSONObject().put("fixture",true));}
    static JSONObject read(Socket receiver)throws Exception{return new JSONObject(GroupWire.read(new DataInputStream(receiver.getInputStream())));}
    static void accept(GroupWire.Sequence inbound,JSONObject frame)throws Exception{inbound.accept(frame.getString("groupId"),frame.getString("connectionId"),frame.getLong("seq"));}
    public static void main(String[] args)throws Exception{
        for(String cancelled:new String[]{"intent","grant","capability"}){
            tests++;
            try(ServerSocket listener=new ServerSocket(0,1,InetAddress.getLoopbackAddress());Socket sender=new Socket(InetAddress.getLoopbackAddress(),listener.getLocalPort());Socket receiver=listener.accept()){
                receiver.setSoTimeout(1000);GroupPeerWriteHarness writer=new GroupPeerWriteHarness(new DataOutputStream(sender.getOutputStream()));
                CountDownLatch prepared=new CountDownLatch(1),proceed=new CountDownLatch(1);AtomicReference<Throwable> failure=new AtomicReference<>();AtomicBoolean allowed=new AtomicBoolean(true);AtomicInteger intentReads=new AtomicInteger();
                if(cancelled.equals("grant"))writer.secondGrantCheck=()->{prepared.countDown();await(proceed);};
                GroupPeerWriteHarness.Outbound candidate=new GroupPeerWriteHarness.Outbound(text(),new Object(),()->{
                    if(!cancelled.equals("grant")&&intentReads.incrementAndGet()==2){prepared.countDown();try{await(proceed);}catch(Exception failed){throw new IllegalStateException(failed);}}return allowed.get();
                });
                Thread pending=new Thread(()->{try{writer.write(candidate);}catch(Throwable failed){failure.set(failed);}});
                pending.start();await(prepared);
                if(cancelled.equals("grant"))writer.grantLive.set(false);else if(cancelled.equals("intent"))allowed.set(false);else writer.textVersion=0;
                proceed.countDown();pending.join(3000);check(!pending.isAlive()&&failure.get()==null);check(writer.sendSequence==0);check(receiver.getInputStream().available()==0);check(!writer.closed.get());
                writer.grantLive.set(true);writer.textVersion=1;writer.secondGrantCheck=null;
                writer.write(new GroupPeerWriteHarness.Outbound(heartbeat(),null,()->true));JSONObject first=read(receiver);check(first.getLong("seq")==1);
                GroupWire.Sequence inbound=new GroupWire.Sequence(writer.groupId,writer.connection);accept(inbound,first);
                writer.write(new GroupPeerWriteHarness.Outbound(text(),new Object(),()->true));JSONObject second=read(receiver);check(second.getLong("seq")==2);accept(inbound,second);check(writer.sendSequence==2);
            }
        }
        tests++;
        ByteArrayOutputStream skippedBytes=new ByteArrayOutputStream();GroupPeerWriteHarness skipped=new GroupPeerWriteHarness(new DataOutputStream(skippedBytes));
        skipped.write(new GroupPeerWriteHarness.Outbound(heartbeat(),new Object(),()->false));check(skipped.sendSequence==0&&skippedBytes.size()==0);
        GroupPeerWriteHarness.Outbound staleSignal=new GroupPeerWriteHarness.Outbound(new JSONObject().put("type","signal"),null,()->true);staleSignal.frameVoiceRevision=0;skipped.write(staleSignal);check(skipped.sendSequence==0&&skippedBytes.size()==0);
        tests++;
        ByteArrayOutputStream filteredBytes=new ByteArrayOutputStream();GroupPeerWriteHarness filtered=new GroupPeerWriteHarness(new DataOutputStream(filteredBytes));filtered.replaceAtFinalFilter=true;
        filtered.write(new GroupPeerWriteHarness.Outbound(text(),new Object(),()->true));JSONObject safe=new JSONObject(GroupWire.read(new DataInputStream(new ByteArrayInputStream(filteredBytes.toByteArray()))));check(safe.getJSONObject("payload").getBoolean("scrubbed"));check(safe.getLong("seq")==1&&filtered.sendSequence==1);
        tests++;
        GroupPeerWriteHarness failedFilter=new GroupPeerWriteHarness(new DataOutputStream(new ByteArrayOutputStream()));failedFilter.failAtFinalFilter=true;
        failedFilter.queue.add(new GroupPeerWriteHarness.Outbound(text(),new Object(),()->true));failedFilter.startWriter();failedFilter.writer.join(3000);
        check(!failedFilter.writer.isAlive()&&failedFilter.closed.get());check(failedFilter.sendSequence==0&&failedFilter.closeCount.get()==1);check(failedFilter.transportCloseCount.get()==0);
        tests++;
        AtomicInteger attempts=new AtomicInteger();GroupPeerWriteHarness failedWrite=new GroupPeerWriteHarness(new DataOutputStream(new OutputStream(){@Override public void write(int value)throws IOException{attempts.incrementAndGet();throw new IOException("fixture write failed");}}));
        failedWrite.queue.add(new GroupPeerWriteHarness.Outbound(heartbeat(),null,()->true));failedWrite.queue.add(new GroupPeerWriteHarness.Outbound(heartbeat(),null,()->true));failedWrite.startWriter();failedWrite.writer.join(3000);
        check(!failedWrite.writer.isAlive()&&failedWrite.closed.get());check(failedWrite.sendSequence==1&&attempts.get()==1);check(failedWrite.transportCloseCount.get()==1&&failedWrite.writeStartedAt==0);check(failedWrite.queue.size()==1);
        tests++;
        Object benchmark=new Object();LinkBenchmarkTraffic.install(new LinkBenchmarkTraffic.Quiet(){public boolean enter(Object ticket){return true;}public void leave(Object ticket){}});
        check(LinkBenchmarkTraffic.acquire(benchmark));ByteArrayOutputStream quietBytes=new ByteArrayOutputStream();GroupPeerWriteHarness quiet=new GroupPeerWriteHarness(new DataOutputStream(quietBytes));
        quiet.write(new GroupPeerWriteHarness.Outbound(text(),new Object(),()->true));check(quietBytes.size()==0&&quiet.sendSequence==0);
        quiet.write(new GroupPeerWriteHarness.Outbound(heartbeat(),null,()->true));check(quiet.sendSequence==1&&quietBytes.size()>0);LinkBenchmarkTraffic.release(benchmark);LinkBenchmarkTraffic.install(null);
        tests++;ByteArrayOutputStream legacyBytes=new ByteArrayOutputStream();GroupPeerWriteHarness legacy=new GroupPeerWriteHarness(new DataOutputStream(legacyBytes));JSONObject maintenance=new JSONObject().put("type","firmware-maintenance").put("payload",new JSONObject().put("action","prepare"));legacy.write(new GroupPeerWriteHarness.Outbound(maintenance,null,()->true));check(legacyBytes.size()==0&&legacy.sendSequence==0&&!legacy.closed.get());legacy.write(new GroupPeerWriteHarness.Outbound(heartbeat(),null,()->true));check(legacy.sendSequence==1&&legacyBytes.size()>0);
        tests++;ByteArrayOutputStream withdrewBytes=new ByteArrayOutputStream();GroupPeerWriteHarness withdrew=new GroupPeerWriteHarness(new DataOutputStream(withdrewBytes));withdrew.firmwareMaintenanceVersion=1;withdrew.finalFilter=()->withdrew.firmwareMaintenanceVersion=0;withdrew.write(new GroupPeerWriteHarness.Outbound(maintenance,null,()->true));check(withdrewBytes.size()==0&&withdrew.sendSequence==0&&!withdrew.closed.get());
        tests++;
        ByteArrayOutputStream removalBytes = new ByteArrayOutputStream();
        GroupPeerWriteHarness removal = new GroupPeerWriteHarness(new DataOutputStream(removalBytes));
        removal.queue.add(new GroupPeerWriteHarness.Outbound(heartbeat(), null, () -> true));
        removal.queue.add(new GroupPeerWriteHarness.Outbound(heartbeat(), null, () -> true));
        removal.textQueue.add(new GroupPeerWriteHarness.Outbound(text(), new Object(), () -> true));
        removal.bulkQueue.add(new GroupPeerWriteHarness.Outbound(text(), new Object(), () -> true));
        CountDownLatch preparing = new CountDownLatch(1), revoked = new CountDownLatch(1);
        removal.finalFilter = () -> { preparing.countDown(); await(revoked); };
        removal.startWriter();
        try {
            await(preparing);
            removal.sendRemovalAndClose();
        } finally {
            revoked.countDown();
        }
        removal.writer.join(3000);
        check(!removal.writer.isAlive() && removal.closed.get());
        check(removal.queue.isEmpty() && removal.textQueue.isEmpty() && removal.bulkQueue.isEmpty());
        DataInputStream frames = new DataInputStream(new ByteArrayInputStream(removalBytes.toByteArray()));
        JSONObject notice = new JSONObject(GroupWire.read(frames));
        check(notice.getString("type").equals(GroupProfilePhotos.MEMBERSHIP_REMOVED));
        check(notice.getString("memberId").equals(removal.pin));
        accept(new GroupWire.Sequence(removal.groupId, removal.connection), notice);
        check(frames.read() == -1 && removal.sendSequence == 1 && removal.closeCount.get() == 1);
        System.out.println(new JSONObject().put("status","passed").put("testCount",tests).put("assertionCount",checks));
    }
}
