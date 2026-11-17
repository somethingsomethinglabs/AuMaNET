package au.aumanet.app;
import org.json.*;
import java.nio.*;
import java.nio.charset.*;
import java.security.*;
import java.util.*;

/** Separate from appearance/session stores. A failed Off save never re-enables the runtime alert gate. */
final class GroupAlertPreferences {
    static final String SCHEMA="aumanet.group-alerts.v1";static final int MAX_BYTES=65536;
    interface Storage{byte[] read()throws Exception;void write(byte[] value)throws Exception;}
    static final class State{
        final boolean enabled,writable;final long revision;final String storage,token,error;
        State(boolean enabled,long revision,String storage,String token,String error){this.enabled=enabled;this.revision=revision;this.storage=storage;this.token=token;this.error=error;writable=storage.equals("default")||storage.equals("saved");}
    }
    private final Storage storage;private State confirmed=new State(false,0,"default","absent","");
    GroupAlertPreferences(Storage storage){this.storage=storage;}
    private State failure(String status,String token,String message){return new State(confirmed.enabled,confirmed.revision,status,token,message);}
    static String token(byte[] value)throws Exception{if(value==null)return "absent";StringBuilder text=new StringBuilder();for(byte item:MessageDigest.getInstance("SHA-256").digest(value))text.append(String.format(Locale.ROOT,"%02x",item&255));return text.toString();}
    private State read()throws Exception{
        byte[] bytes=storage.read();if(bytes==null){confirmed=new State(false,0,"default","absent","");return confirmed;}if(bytes.length>MAX_BYTES)throw new IllegalStateException();String token=token(bytes);JSONObject record;
        try{String text=StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();JSONTokener parser=new JSONTokener(text);Object value=parser.nextValue();if(!(value instanceof JSONObject)||parser.nextClean()!=0)throw new IllegalArgumentException();record=(JSONObject)value;if(!(record.opt("schema") instanceof String))throw new IllegalArgumentException();}
        catch(Exception malformed){return failure("invalid",token,"Saved Group alerts settings are malformed and were preserved. Reset this setting to Off before changing it.");}
        if(!SCHEMA.equals(record.opt("schema")))return failure("unsupported",token,"Saved Group alerts settings use another version and were preserved. Update the app, or reset Group alerts only.");
        Object raw=record.opt("revision");if(record.length()!=3||!(record.opt("enabled") instanceof Boolean)||!(raw instanceof Number)||!Double.isFinite(((Number)raw).doubleValue())||((Number)raw).doubleValue()!=((Number)raw).longValue()||((Number)raw).longValue()<0||((Number)raw).longValue()>9007199254740991L)return failure("invalid",token,"Saved Group alerts settings are malformed and were preserved. Reset this setting to Off before changing it.");
        confirmed=new State((Boolean)record.opt("enabled"),((Number)raw).longValue(),"saved",token,"");return confirmed;
    }
    State load(){try{return read();}catch(Exception unavailable){return failure("unavailable",null,"Group alerts storage is unavailable. Optional alerts are paused; reload this setting to try again.");}}
    State save(String token,long revision,boolean enabled)throws Exception{State current=read();if(!current.writable||!Objects.equals(token,current.token)||current.revision!=revision||revision>=9007199254740991L)throw new IllegalStateException();return write(enabled,revision+1);}
    State reset(String token)throws Exception{State current=read();if(!(current.storage.equals("invalid")||current.storage.equals("unsupported"))||!Objects.equals(token,current.token))throw new IllegalStateException();return write(false,1);}
    private State write(boolean enabled,long revision)throws Exception{byte[] bytes=new JSONObject().put("schema",SCHEMA).put("enabled",enabled).put("revision",revision).toString().getBytes(StandardCharsets.UTF_8);storage.write(bytes);if(!Arrays.equals(bytes,storage.read()))throw new IllegalStateException();confirmed=new State(enabled,revision,"saved",token(bytes),"");return confirmed;}
}
