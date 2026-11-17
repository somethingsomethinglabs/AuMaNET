package au.aumanet.app;
import org.json.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
public final class AppearancePreferencesTest {
    static int count;
    interface Work{void run()throws Exception;}
    static void check(boolean value,String why){count++;if(!value)throw new AssertionError(why);}
    static void rejects(Work task,String why)throws Exception{try{task.run();}catch(Exception expected){count++;return;}throw new AssertionError(why);}
    static final class Memory implements AppearancePreferences.Storage {
        byte[] raw;boolean readFail,writeFail,replyLost;
        public byte[] read()throws Exception{if(readFail)throw new Exception("PRIVATE_READ_SENTINEL");return raw==null?null:raw.clone();}
        public void write(byte[] bytes)throws Exception{if(writeFail)throw new Exception("PRIVATE_WRITE_SENTINEL");raw=bytes.clone();if(replyLost)throw new Exception("PRIVATE_LOST_REPLY_SENTINEL");}
        void set(String value){raw=value.getBytes(StandardCharsets.UTF_8);}
    }
    static String record(Object revision,Object theme,Object units)throws Exception{return new JSONObject().put("schema",AppearancePreferences.SCHEMA).put("revision",revision).put("theme",theme).put("units",units).toString();}
    public static void main(String[] args)throws Exception{
        Memory memory=new Memory();AppearancePreferences store=new AppearancePreferences(memory);AppearancePreferences.State initial=store.load();check(initial.theme.equals("Light")&&initial.units.equals("Metric")&&initial.storage.equals("default")&&initial.writable,"missing file safe defaults");check(memory.raw==null,"read never writes");
        AppearancePreferences.State saved=store.save(initial.token,0,"Dark","Imperial");check(saved.storage.equals("saved")&&saved.revision==1,"saved confirmed");JSONObject json=new JSONObject(new String(memory.raw,StandardCharsets.UTF_8));check(json.length()==4&&!json.has("identity")&&!json.has("voice")&&!json.has("location"),"only display fields persisted");AppearancePreferences fresh=new AppearancePreferences(memory);check(fresh.load().theme.equals("Dark")&&fresh.load().units.equals("Imperial"),"fresh owner restart restores");
        rejects(()->store.save(initial.token,0,"Light","Metric"),"stale save token fenced");check(store.load().theme.equals("Dark"),"stale save did not overwrite");
        memory.writeFail=true;rejects(()->store.save(saved.token,1,"Light","Metric"),"disk failure surfaced");memory.readFail=true;AppearancePreferences.State failed=store.load();check(failed.theme.equals("Dark")&&failed.units.equals("Imperial")&&!failed.writable&&failed.token==null,"read failure retains confirmed display and no write authority");check(!failed.json().toString().contains("SENTINEL"),"provider exception redacted");memory.readFail=false;memory.writeFail=false;
        memory.replyLost=true;rejects(()->store.save(saved.token,1,"Light","Metric"),"lost reply uncertain");memory.readFail=true;check(store.load().theme.equals("Dark"),"lost reply doesn't claim new display saved");memory.readFail=false;memory.replyLost=false;check(store.load().theme.equals("Light"),"read-only reload confirms actual committed write");
        for(String bad:Arrays.asList("{PRIVATE_JSON_SENTINEL",record("1","Dark","Metric"),record(1.5,"Dark","Metric"),record(1,5,"Metric"),record(1,"Dark",new JSONArray().put("Metric")))){
            memory.set(bad);AppearancePreferences.State invalid=store.load();check(invalid.storage.equals("invalid")&&!invalid.writable&&invalid.token!=null,"strict raw types/malformed JSON preserved");check(Arrays.equals(memory.raw,bad.getBytes(StandardCharsets.UTF_8)),"reading invalid doesn't overwrite");check(!invalid.json().toString().contains("SENTINEL"),"malformed JSON never surfaced");rejects(()->store.save(invalid.token,invalid.revision,"Dark","Imperial"),"invalid record cannot ordinary-save");AppearancePreferences.State reset=store.reset(invalid.token);check(reset.theme.equals("Light")&&reset.units.equals("Metric")&&reset.storage.equals("saved"),"explicit appearance reset");
        }
        memory.set("{\"schema\":\"aumanet.appearance.v9\",\"PRIVATE\":\"SENTINEL\"}");AppearancePreferences.State future=store.load();check(future.storage.equals("unsupported")&&!future.writable,"future preserved readonly");memory.set(record(99,"Dark","Imperial"));rejects(()->store.reset(future.token),"late reset cannot overwrite newer valid save");check(store.load().revision==99&&store.load().theme.equals("Dark"),"newer valid save intact");
        memory.set("{bad-one");AppearancePreferences.State old=store.load();memory.set("{bad-two");rejects(()->store.reset(old.token),"late reset cannot overwrite different corruption");
        memory.raw=new byte[]{(byte)0xc3,(byte)0x28};check(store.load().storage.equals("invalid"),"malformed UTF8 preserved with repair token");memory.raw=new byte[AppearancePreferences.MAX_BYTES+1];AppearancePreferences.State oversized=store.load();check(oversized.storage.equals("unavailable")&&!oversized.writable&&oversized.token==null&&oversized.theme.equals("Dark"),"oversized reads bounded and prior confirmed theme retained");
        System.out.println("PASS "+count+" native appearance persistence/failure/token checks");
    }
}
