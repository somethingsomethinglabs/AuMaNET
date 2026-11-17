package au.aumanet.app;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.HashSet;
import java.util.Set;
import java.util.TreeSet;

/** One remembered permission, never a persisted active session or microphone gate.
 * Unknown commit/readback outcomes poison the writer until a checked reopen. */
final class TrustedConnectionStore {
    interface Storage {String read()throws Exception;boolean write(String value)throws Exception;}
    static final class Record {
        final long revision,previous,epoch,gatewayRevision;final String operation,self,group,owner,attachment,digest,voice;final Set<String> approved;final boolean enabled,shareLocation;
        Record(long revision,long previous,String operation,TrustedConnectionScope scope,String attachment,String voice,boolean enabled,long gatewayRevision,boolean shareLocation){this.shareLocation=shareLocation;this.gatewayRevision=gatewayRevision;this.revision=revision;this.previous=previous;this.operation=operation;self=scope.self;group=scope.group;owner=scope.owner;epoch=scope.epoch;approved=scope.approved;this.attachment=attachment;digest=scope.digest(attachment,gatewayRevision);this.voice=voice;this.enabled=enabled;}
        boolean matches(TrustedConnectionScope scope,String attachment,long gatewayRevision){return scope!=null&&scope.saved&&this.attachment.equals(attachment)&&this.gatewayRevision==gatewayRevision&&digest.equals(scope.digest(attachment,gatewayRevision));}
    }
    private final Storage storage;private Record record;private boolean poisoned;
    TrustedConnectionStore(Storage storage)throws Exception{this.storage=storage;String text=storage.read();if(text==null)return;JSONObject value=GroupNameJson.object(text,8192);boolean shareLocation=false;if(value.has("shareLocation")){Object sharing=value.get("shareLocation");if(!(sharing instanceof Boolean))throw new IllegalArgumentException("Invalid remembered location choice");shareLocation=(Boolean)sharing;}keys(value,"schema","revision","previousRevision","operationId","enabled","self","group","owner","epoch","approved","attachment","digest","voice","gatewayRevision");if(!"aumanet.trusted-connection.v1".equals(string(value,"schema")))throw new IllegalArgumentException("Unknown remembered connection");
        long revision=number(value,"revision"),previous=number(value,"previousRevision"),epoch=number(value,"epoch"),gatewayRevision=number(value,"gatewayRevision");String operation=string(value,"operationId"),self=string(value,"self"),group=string(value,"group"),owner=string(value,"owner"),attachment=string(value,"attachment"),digest=string(value,"digest"),voice=string(value,"voice");Object enabled=value.get("enabled");
        if(previous>=TrustedConnectionScope.MAX_REVISION||revision!=previous+1||!TrustedConnectionScope.id(operation)||!(enabled instanceof Boolean)||!mode(voice)||!TrustedConnectionScope.pin(attachment)||!TrustedConnectionScope.pin(digest))throw new IllegalArgumentException("Invalid remembered connection metadata");
        JSONArray pins=value.getJSONArray("approved");if(pins.length()<1||pins.length()>5)throw new IllegalArgumentException("Invalid remembered membership");TreeSet<String> approved=new TreeSet<>();for(int i=0;i<pins.length();i++){Object pin=pins.get(i);if(!(pin instanceof String)||!TrustedConnectionScope.pin((String)pin)||!approved.add((String)pin))throw new IllegalArgumentException("Invalid remembered membership");}
        TrustedConnectionScope syntax=new TrustedConnectionScope(this,"00000000-0000-0000-0000-000000000000",self,group,owner,epoch,0,approved,true,false,false);
        record=new Record(revision,previous,operation,syntax,attachment,voice,(Boolean)enabled,gatewayRevision,shareLocation);if(!digest.equals(record.digest)||!record.enabled&&(!voice.equals("off")||record.shareLocation))throw new IllegalArgumentException("Remembered connection scope differs");
    }
    synchronized Record current(){if(poisoned)throw new IllegalStateException("Remembered connection commit is unconfirmed");return record;}
    static boolean mode(String voice){return "off".equals(voice)||"muted".equals(voice)||"ptt-ready".equals(voice);}
    synchronized Record remember(TrustedConnectionScope scope,String attachment,String voice,long gatewayRevision,long expected,String operation)throws Exception{return save(scope,attachment,voice,false,true,gatewayRevision,expected,operation);}
    synchronized Record remember(TrustedConnectionScope scope,String attachment,String voice,boolean shareLocation,long gatewayRevision,long expected,String operation)throws Exception{return save(scope,attachment,voice,shareLocation,true,gatewayRevision,expected,operation);}
    synchronized Record forget(long expected,String operation)throws Exception{Record old=current();if(old==null)throw new IllegalStateException("No remembered connection");TrustedConnectionScope syntax=new TrustedConnectionScope(this,"00000000-0000-0000-0000-000000000000",old.self,old.group,old.owner,old.epoch,0,old.approved,true,false,false);return save(syntax,old.attachment,"off",false,false,old.gatewayRevision,expected,operation);}
    private Record save(TrustedConnectionScope scope,String attachment,String voice,boolean shareLocation,boolean enabled,long gatewayRevision,long expected,String operation)throws Exception{
        if(poisoned||scope==null||!scope.saved||!TrustedConnectionScope.pin(attachment)||!mode(voice)||!TrustedConnectionScope.id(operation)||expected<0||expected>=TrustedConnectionScope.MAX_REVISION)throw new IllegalArgumentException("Remembered connection permission unavailable");
        String digest=scope.digest(attachment,gatewayRevision);
        if(record!=null&&record.operation.equals(operation)){if(record.previous!=expected||record.enabled!=enabled||record.shareLocation!=shareLocation||!record.voice.equals(voice)||!record.digest.equals(digest))throw new SecurityException("Remembered connection operation conflicts");return record;}
        long revision=record==null?0:record.revision;if(expected!=revision)throw new IllegalStateException("Remembered connection changed; refresh first");
        Record next=new Record(revision+1,revision,operation,scope,attachment,voice,enabled,gatewayRevision,shareLocation);JSONArray approved=new JSONArray();for(String pin:next.approved)approved.put(pin);
        String encoded=new JSONObject().put("schema","aumanet.trusted-connection.v1").put("revision",next.revision).put("previousRevision",revision).put("operationId",operation).put("enabled",enabled).put("self",scope.self).put("group",scope.group).put("owner",scope.owner).put("epoch",scope.epoch).put("approved",approved).put("attachment",attachment).put("digest",digest).put("voice",voice).put("gatewayRevision",gatewayRevision).put("shareLocation",shareLocation).toString();
        try{if(!storage.write(encoded)||!encoded.equals(storage.read()))throw new IllegalStateException("Remembered connection readback unavailable");}
        catch(Exception unknown){poisoned=true;throw new IllegalStateException("Remembered connection commit is unconfirmed; no session was started");}
        catch(Error unknown){poisoned=true;throw unknown;}
        record=next;return next;
    }
    private static String string(JSONObject value,String key)throws Exception{Object raw=value.get(key);if(!(raw instanceof String))throw new IllegalArgumentException("Invalid remembered string");return(String)raw;}
    private static long number(JSONObject value,String key)throws Exception{Object raw=value.get(key);if(!(raw instanceof Number))throw new IllegalArgumentException("Invalid remembered revision");double x=((Number)raw).doubleValue();long n=((Number)raw).longValue();if(!Double.isFinite(x)||x!=n||n<0||n>TrustedConnectionScope.MAX_REVISION)throw new IllegalArgumentException("Invalid remembered revision");return n;}
    private static void keys(JSONObject value,String...expected){Set<String> found=new HashSet<>();value.keys().forEachRemaining(found::add);found.remove("shareLocation");if(!found.equals(new HashSet<>(java.util.Arrays.asList(expected))))throw new IllegalArgumentException("Unexpected remembered connection fields");}
}
