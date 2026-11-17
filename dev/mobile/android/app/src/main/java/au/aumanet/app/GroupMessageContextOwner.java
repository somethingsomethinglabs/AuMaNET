package au.aumanet.app;
import org.json.*;import java.util.concurrent.*;import java.util.function.*;
/** Volatile disclosure tickets are deliberately never reconstructed from disk.
 * A restart or later consent withdrawal strips location on future transmission;
 * already accepted historical copies remain readable at their recipients. */
final class GroupMessageContextOwner {
    static final class Capture {final JSONObject location;final BooleanSupplier live;Capture(JSONObject location,BooleanSupplier live){this.location=location;this.live=live;}}
    interface Source{Capture capture(String sender);}
    private static final class Export {final String signature;final BooleanSupplier live;final JSONObject stripped;Export(String signature,BooleanSupplier live,JSONObject stripped){this.signature=signature;this.live=live;this.stripped=stripped;}}
    private final ConcurrentHashMap<String,Export> exports=new ConcurrentHashMap<>();private final Source source;private final GroupTextWire.Signer signer;private final String self;
    GroupMessageContextOwner(Source source,GroupTextWire.Signer signer,String self){this.source=source;this.signer=signer;this.self=self;}
    private static String key(JSONObject message){return message.optString("groupId")+":"+message.optString("senderId")+":"+message.optString("id");}
    JSONObject seal(GroupTextWire.Message message,JSONObject sealed)throws Exception{Capture capture=source.capture(message.sender);JSONObject result=GroupMessageSentContext.attach(message,sealed,capture==null?null:capture.location,signer);remember(message,result,capture);return result;}
    Capture arrival(JSONObject sealed){return GroupMessageSentContext.hasLocation(sealed)?source.capture(sealed.optString("senderId")):null;}
    void observe(GroupTextWire.Message message,JSONObject sealed,Capture arrival)throws Exception{if(GroupMessageSentContext.verified(message,sealed,System.currentTimeMillis())!=null)remember(message,sealed,arrival);}
    private void remember(GroupTextWire.Message message,JSONObject sealed,Capture capture)throws Exception{
        if(!GroupMessageSentContext.hasLocation(sealed))return;JSONObject stripped=GroupMessageSentContext.strip(sealed);if(message.sender.equals(self))stripped=GroupMessageSentContext.attach(message,stripped,null,signer);
        if(exports.size()>=GroupTextStore.MAX_SCOPES*(GroupTextStore.MAX_HISTORY+GroupTextStore.MAX_OUTBOX))exports.clear();
        exports.putIfAbsent(key(sealed),new Export(sealed.optString("sentContextSignature"),capture==null?()->false:capture.live,stripped));
    }
    JSONObject filter(JSONObject message)throws Exception{if(!GroupMessageSentContext.hasLocation(message))return message;Export ticket=exports.get(key(message));if(ticket==null||!ticket.signature.equals(message.optString("sentContextSignature")))return GroupMessageSentContext.strip(message);return ticket.live.getAsBoolean()?message:ticket.stripped;}
    JSONObject frame(JSONObject original)throws Exception{
        String type=original.optString("type");JSONObject payload=original.optJSONObject("payload");if(payload==null)return original;JSONObject message=type.equals("text")?payload:type.equals("message-v2")&&payload.optString("op").equals("history-item")?payload.optJSONObject("message"):null;if(message==null)return original;JSONObject selected=filter(message);if(selected==message)return original;JSONObject copy=new JSONObject(original.toString());if(type.equals("text"))copy.put("payload",selected);else copy.getJSONObject("payload").put("message",selected);return copy;
    }
}

