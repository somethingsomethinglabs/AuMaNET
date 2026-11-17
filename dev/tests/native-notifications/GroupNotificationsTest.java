package au.aumanet.app;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.*;
import org.json.*;

public final class GroupNotificationsTest {
    static int checks;interface Work{void run()throws Exception;}
    static void check(boolean value,String why){checks++;if(!value)throw new AssertionError(why);}
    static void rejects(Work work,String why)throws Exception{try{work.run();}catch(Exception expected){checks++;return;}throw new AssertionError(why);}
    static final class Memory implements GroupAlertPreferences.Storage{byte[] value;boolean readFail,writeFail,lostReply;public byte[] read()throws Exception{if(readFail)throw new Exception("PRIVATE_READ_SENTINEL");return value==null?null:value.clone();}public void write(byte[] bytes)throws Exception{if(writeFail)throw new Exception("PRIVATE_WRITE_SENTINEL");value=bytes.clone();if(lostReply)throw new Exception("PRIVATE_REPLY_SENTINEL");}}
    static final class FakePlatform implements GroupAlertDelivery.Platform{boolean allowed=true,throwPost;int posted,cancelled;Runnable inAllowed;public boolean allowed(){if(inAllowed!=null)inAllowed.run();return allowed;}public void post(){posted++;if(throwPost)throw new IllegalStateException("Synthetic platform failure");}public void cancel(){cancelled++;}}
    static void preferences()throws Exception{
        Memory disk=new Memory();GroupAlertPreferences store=new GroupAlertPreferences(disk);GroupAlertPreferences.State initial=store.load();check(!initial.enabled&&initial.writable&&disk.value==null,"default Off without a write");GroupAlertPreferences.State on=store.save(initial.token,0,true);check(on.enabled&&on.revision==1,"explicit On stored");check(new GroupAlertPreferences(disk).load().enabled,"restart restores optional preference only");check(new JSONObject(new String(disk.value,StandardCharsets.UTF_8)).length()==3,"record contains only schema revision enabled");
        rejects(()->store.save(initial.token,0,false),"stale save fenced");disk.writeFail=true;rejects(()->store.save(on.token,1,false),"failed Off storage surfaced");disk.readFail=true;GroupAlertPreferences.State unavailable=store.load();check(unavailable.enabled&&!unavailable.writable&&unavailable.token==null&&!unavailable.error.contains("SENTINEL"),"storage failure retains saved intent and fails delivery closed");disk.writeFail=false;disk.readFail=false;
        disk.lostReply=true;rejects(()->store.save(on.token,1,false),"lost reply not claimed saved");disk.lostReply=false;check(!store.load().enabled,"read-only reload sees actual committed Off");
        for(String raw:new String[]{"{PRIVATE_JSON_SENTINEL","{\"schema\":\"aumanet.group-alerts.v9\"}","{\"schema\":\"aumanet.group-alerts.v1\",\"revision\":\"1\",\"enabled\":true}","{\"schema\":\"aumanet.group-alerts.v1\",\"revision\":1,\"enabled\":\"true\"}"}){
            disk.value=raw.getBytes(StandardCharsets.UTF_8);GroupAlertPreferences.State damaged=store.load();check(!damaged.writable&&damaged.token!=null&&!damaged.error.contains("SENTINEL"),"malformed/future record preserved readonly");check(new String(disk.value,StandardCharsets.UTF_8).equals(raw),"load doesn't reset damaged record");rejects(()->store.save(damaged.token,damaged.revision,true),"ordinary save cannot overwrite damaged schema");check(!store.reset(damaged.token).enabled,"explicit reset touches alerts only and sets Off");
        }
        disk.value="{old damage".getBytes(StandardCharsets.UTF_8);GroupAlertPreferences.State old=store.load();disk.value=new JSONObject().put("schema",GroupAlertPreferences.SCHEMA).put("enabled",true).put("revision",99).toString().getBytes(StandardCharsets.UTF_8);rejects(()->store.reset(old.token),"late reset cannot overwrite newer valid setting");check(store.load().enabled&&store.load().revision==99,"newer saved preference preserved");
    }
    static void delivery(){
        GroupAlertDelivery gate=new GroupAlertDelivery();FakePlatform platform=new FakePlatform();AtomicBoolean live=new AtomicBoolean(true);AtomicLong wall=new AtomicLong(1000),ticks=new AtomicLong(100);
        check(gate.incoming(true,true,live::get,9000,1000,100,wall::get,ticks::get,platform)==null,"optional default Off");gate.configure(true);
        check(gate.incoming(false,true,live::get,9000,1000,100,wall::get,ticks::get,platform)==null,"durable duplicate never queued");
        Runnable denied=gate.incoming(true,false,live::get,9000,1000,100,wall::get,ticks::get,platform);platform.allowed=true;check(denied==null&&platform.posted==0,"observed denied at arrival cannot become historical alert after grant");
        Runnable granted=gate.incoming(true,true,live::get,9000,1000,100,wall::get,ticks::get,platform);platform.allowed=false;granted.run();check(platform.posted==0,"revoked before actual post blocked");platform.allowed=true;
        Runnable beforeTransition=gate.incoming(true,true,live::get,9000,1000,100,wall::get,ticks::get,platform);gate.invalidate();beforeTransition.run();check(platform.posted==0,"observed permission transition invalidates queued work");
        Runnable oldArrival=gate.incoming(true,true,()->{gate.disableNow(platform);gate.enabledByExplicitSave();return true;},9000,1000,100,wall::get,ticks::get,platform);check(oldArrival==null,"Off/On ABA during arrival authorization cannot acquire a newer permit");
        long obsoleteOn=gate.beginSetting(true);gate.beginSetting(false);gate.enabledByExplicitSave(obsoleteOn);check(gate.suppressed(),"older successful On save cannot clear a newer Off command");gate.enabledByExplicitSave();
        AtomicInteger grantChecks=new AtomicInteger();Runnable lateAba=gate.incoming(true,true,()->{if(grantChecks.incrementAndGet()==3){gate.disableNow(platform);gate.enabledByExplicitSave();}return true;},9000,1000,100,wall::get,ticks::get,platform);lateAba.run();check(platform.posted==0,"Off/On ABA at final dispatch authorization cannot post an old ticket");
        int cancellationBaseline=platform.cancelled;
        Runnable beforeOff=gate.incoming(true,true,live::get,9000,1000,100,wall::get,ticks::get,platform);gate.disableNow(platform);beforeOff.run();check(gate.suppressed()&&platform.posted==0&&platform.cancelled==cancellationBaseline+1,"immediate Off fences queue and cancels only optional platform slot");gate.configure(true);check(gate.incoming(true,true,live::get,9000,1000,100,wall::get,ticks::get,platform)==null,"read-only restore cannot clear Off after failed save");gate.enabledByExplicitSave();
        Runnable revoked=gate.incoming(true,true,live::get,9000,1000,100,wall::get,ticks::get,platform);live.set(false);revoked.run();check(platform.posted==0,"current group grant rechecked at post");live.set(true);
        Runnable expired=gate.incoming(true,true,live::get,9000,1000,100,wall::get,ticks::get,platform);ticks.set(5100);expired.run();check(platform.posted==0,"five-second queue bound prevents backlog");ticks.set(100);
        Runnable clock=gate.incoming(true,true,live::get,9000,1000,100,wall::get,ticks::get,platform);wall.set(9000);clock.run();check(platform.posted==0,"wall expiry rechecked");wall.set(1000);
        platform.inAllowed=()->wall.set(9000);Runnable slowQuery=gate.incoming(true,true,live::get,9000,1000,100,wall::get,ticks::get,platform);slowQuery.run();check(platform.posted==0,"slow platform query cannot post after expiry");platform.inAllowed=null;wall.set(1000);
        platform.throwPost=true;Runnable failure=gate.incoming(true,true,live::get,9000,1000,100,wall::get,ticks::get,platform);failure.run();check(platform.posted==1,"platform failure contained outside durable receipt work");platform.throwPost=false;Runnable normal=gate.incoming(true,true,live::get,9000,1000,100,wall::get,ticks::get,platform);normal.run();check(platform.posted==2,"new approved first commit can alert normally");
    }
    public static void main(String[] args)throws Exception{preferences();delivery();System.out.println("PASS "+checks+" native optional notification preference/gate checks");}
}
