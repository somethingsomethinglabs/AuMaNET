package au.aumanet.app;

/** Actual transport-owner policy; no phone, RF, JNI or throughput acceptance. */
public final class VoiceNetworkScopeTest {
    static int assertions;
    static void check(boolean value){assertions++;if(!value)throw new AssertionError("Selected voice network assertion failed");}
    static void rejects(Runnable action){assertions++;try{action.run();}catch(IllegalStateException|IllegalArgumentException expected){return;}throw new AssertionError("Invalid network owner accepted");}
    public static void main(String[] args)throws Exception{
        VoiceNetworkScope scope=new VoiceNetworkScope();Object owner=new Object(),network=new Object();byte[] address={10,77,0,10};
        VoiceNetworkScope.Lease first=scope.acquire(owner,network,address,24,"wlan0",7);address[3]=99;
        check(scope.matches(first,network,new byte[]{10,77,0,10},24));check(!scope.matches(first,new Object(),new byte[]{10,77,0,10},24));
        check(!scope.matches(first,network,new byte[]{10,77,0,11},24));check(!scope.matches(first,network,new byte[]{10,77,0,10},16));
        rejects(()->scope.acquire(new Object(),network,new byte[]{10,77,0,10},24,"wlan0",7));scope.revoke(first);check(!scope.current(first));
        rejects(()->scope.acquire(new Object(),network,new byte[]{10,77,0,10},24,"wlan0",7));scope.release(first);
        VoiceNetworkScope.Lease replacement=scope.acquire(new Object(),network,new byte[]{10,77,0,10},24,"wlan0",7);scope.release(first);scope.revoke(first);
        check(scope.current(replacement)&&!scope.current(first));scope.release(replacement);check(!scope.current(replacement));
        rejects(()->scope.acquire(owner,network,new byte[16],24,"wlan0",7));rejects(()->scope.acquire(owner,network,new byte[4],0,"wlan0",7));rejects(()->scope.acquire(owner,network,new byte[4],24,"",7));rejects(()->scope.acquire(owner,network,new byte[4],24,"wlan0",0));
        VoiceNetworkScope.Lease entered=scope.acquire(owner,network,new byte[]{10,77,0,10},24,"wlan0",8);
        java.util.concurrent.CountDownLatch inside=new java.util.concurrent.CountDownLatch(1),finish=new java.util.concurrent.CountDownLatch(1),retired=new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.atomic.AtomicReference<Throwable> failure=new java.util.concurrent.atomic.AtomicReference<>();
        Thread callback=new Thread(()->{try{scope.deliver(entered,()->{inside.countDown();try{if(!finish.await(2,java.util.concurrent.TimeUnit.SECONDS))throw new AssertionError();}catch(InterruptedException interrupted){throw new AssertionError(interrupted);}});}catch(Throwable error){failure.set(error);}});
        callback.start();check(inside.await(2,java.util.concurrent.TimeUnit.SECONDS));Thread close=new Thread(()->{scope.release(entered);retired.countDown();});close.start();check(!retired.await(40,java.util.concurrent.TimeUnit.MILLISECONDS));finish.countDown();callback.join(2000);close.join(2000);
        check(!callback.isAlive()&&!close.isAlive()&&failure.get()==null);VoiceNetworkScope.Lease fresh=scope.acquire(new Object(),network,new byte[]{10,77,0,10},24,"wlan0",8);
        check(!scope.deliver(entered,()->{throw new AssertionError("Old SDK callback reached new owner");}));scope.release(entered);check(scope.current(fresh));scope.release(fresh);
        System.out.println("{\"status\":\"pass\",\"assertions\":"+assertions+",\"scope\":\"native owner policy only\"}");
    }
}
