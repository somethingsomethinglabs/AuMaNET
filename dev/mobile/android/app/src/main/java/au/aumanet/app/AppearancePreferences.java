package au.aumanet.app;

import org.json.*;
import java.util.*;
import java.nio.*;
import java.nio.charset.*;
import java.security.*;

/** Display choices only: no identities, sessions, permissions, location or voice state. */
final class AppearancePreferences {
    static final String SCHEMA="aumanet.appearance.v1";
    static final int MAX_BYTES=65536;
    interface Storage {byte[] read()throws Exception;void write(byte[] bytes)throws Exception;}
    static final class State {
        final String theme,units,storage,token,error;final long revision;final boolean writable;
        State(String theme,String units,long revision,String storage,String token,String error){this.theme=theme;this.units=units;this.revision=revision;this.storage=storage;this.token=token;this.error=error;writable=storage.equals("default")||storage.equals("saved");}
        JSONObject json()throws Exception{return new JSONObject().put("schema",SCHEMA).put("source","device").put("theme",theme).put("units",units).put("revision",revision).put("storage",storage).put("writable",writable).put("token",token).put("error",error);}
    }
    private final Storage storage;
    private State confirmed=new State("Light","Metric",0,"default","absent","");
    AppearancePreferences(Storage storage){this.storage=storage;}
    private State failure(String status,String token,String message){return new State(confirmed.theme,confirmed.units,confirmed.revision,status,token,message);}
    static String token(byte[] bytes)throws Exception{if(bytes==null)return "absent";byte[] hash=MessageDigest.getInstance("SHA-256").digest(bytes);StringBuilder text=new StringBuilder(64);for(byte value:hash)text.append(String.format(Locale.ROOT,"%02x",value&255));return text.toString();}
    private State read()throws Exception{
        byte[] bytes=storage.read();if(bytes==null){confirmed=new State("Light","Metric",0,"default","absent","");return confirmed;}
        if(bytes.length>MAX_BYTES)throw new IllegalStateException("Appearance record exceeds safe reader size");String token=token(bytes);JSONObject value;
        try{String text=StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();JSONTokener parser=new JSONTokener(text);Object raw=parser.nextValue();if(!(raw instanceof JSONObject)||parser.nextClean()!=0)throw new IllegalArgumentException();value=(JSONObject)raw;if(!(value.opt("schema") instanceof String))throw new IllegalArgumentException();}
        catch(Exception malformed){return failure("invalid",token,"Saved appearance settings are malformed and have been preserved. Reset appearance settings to use Light and Metric.");}
        if(!SCHEMA.equals(value.opt("schema")))return failure("unsupported",token,"Saved appearance settings use another version and have been preserved. Update the app, or reset Appearance only.");
        Object revision=value.opt("revision"),theme=value.opt("theme"),units=value.opt("units");
        if(value.length()!=4||!(revision instanceof Number)||!Double.isFinite(((Number)revision).doubleValue())||((Number)revision).doubleValue()!=((Number)revision).longValue()||((Number)revision).longValue()<0||((Number)revision).longValue()>9007199254740991L||!validTheme(theme)||!validUnits(units))return failure("invalid",token,"Saved appearance settings are malformed and have been preserved. Reset appearance settings to use Light and Metric.");
        confirmed=new State((String)theme,(String)units,((Number)revision).longValue(),"saved",token,"");return confirmed;
    }
    synchronized State load(){try{return read();}catch(Exception unavailable){return failure("unavailable",null,"Appearance storage could not be read. Your last confirmed display settings remain in use. Reload settings to try again.");}}
    static boolean validTheme(Object value){return value instanceof String&&(value.equals("Light")||value.equals("Dark"));}
    static boolean validUnits(Object value){return value instanceof String&&(value.equals("Metric")||value.equals("Imperial"));}
    synchronized State save(String expectedToken,long expectedRevision,String theme,String units)throws Exception{
        State current=read();if(!current.writable||!Objects.equals(current.token,expectedToken)||current.revision!=expectedRevision)throw new IllegalStateException("Appearance settings changed; reload before saving");
        if(!validTheme(theme)||!validUnits(units)||current.revision>=9007199254740991L)throw new IllegalArgumentException("Invalid display preferences");return write(theme,units,current.revision+1);
    }
    synchronized State reset(String expectedToken)throws Exception{
        State current=read();if(!(current.storage.equals("invalid")||current.storage.equals("unsupported"))||!Objects.equals(current.token,expectedToken))throw new IllegalStateException("Appearance settings changed; reload before resetting");
        return write("Light","Metric",1);
    }
    private State write(String theme,String units,long revision)throws Exception{
        byte[] bytes=new JSONObject().put("schema",SCHEMA).put("theme",theme).put("units",units).put("revision",revision).toString().getBytes(StandardCharsets.UTF_8);
        storage.write(bytes);byte[] readback=storage.read();if(!Arrays.equals(bytes,readback))throw new IllegalStateException("Appearance save could not be confirmed");
        confirmed=new State(theme,units,revision,"saved",token(bytes),"");return confirmed;
    }
}
