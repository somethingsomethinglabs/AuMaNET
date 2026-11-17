package au.aumanet.app;
import java.io.*;import java.nio.charset.StandardCharsets;import org.json.*;
/** Optional independently signed extension. Original v1/v2 message canonical
 * bytes and receipts stay unchanged for older peers. Missing/invalid extensions
 * are unavailable metadata, never a reason to invent a location. */
final class GroupMessageSentContext {
    static final String SCHEMA="aumanet.group-message-context.v1";
    private static final byte[] DOMAIN="AuMaNET/group-context/v1\0".getBytes(StandardCharsets.US_ASCII);
    static JSONObject location(JSONObject fix)throws Exception{
        if(fix==null||!(fix.opt("mock") instanceof Boolean)||fix.getBoolean("mock"))return null;
        long age=GroupTextWire.integer(fix,"ageMs"),time=GroupTextWire.integer(fix,"timestamp");
        if(age>15000||time<1)return null;
        return checkedLocation(new JSONObject().put("latitude",fix.getDouble("latitude")).put("longitude",fix.getDouble("longitude")).put("accuracyMeters",fix.getDouble("accuracy")).put("capturedAt",time).put("ageAtSendMs",age));
    }
    private static double finite(JSONObject object,String key,double low,double high)throws Exception{Object raw=object.get(key);if(!(raw instanceof Number))throw new IllegalArgumentException("Invalid message location");double value=((Number)raw).doubleValue();if(!Double.isFinite(value)||value<low||value>high)throw new IllegalArgumentException("Invalid message location");return value;}
    static JSONObject checkedLocation(JSONObject value)throws Exception{
        double lat=finite(value,"latitude",-90,90),lon=finite(value,"longitude",-180,180),accuracy=finite(value,"accuracyMeters",0,100000);long time=GroupTextWire.integer(value,"capturedAt"),age=GroupTextWire.integer(value,"ageAtSendMs");if(time<1||age>15000)throw new IllegalArgumentException("Invalid message location");
        return new JSONObject().put("latitude",lat).put("longitude",lon).put("accuracyMeters",accuracy).put("capturedAt",time).put("ageAtSendMs",age);
    }
    private static byte[] canonical(GroupTextWire.Message message,JSONObject location)throws Exception{
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();DataOutputStream out=new DataOutputStream(bytes);out.write(DOMAIN);out.write(GroupTextWire.unhex(message.group,16));out.writeLong(message.epoch);out.write(GroupTextWire.unhex(message.id,16));out.write(GroupTextWire.unhex(message.sender,32));out.write(GroupTextWire.unhex(message.digest(),32));out.writeLong(message.created);out.writeBoolean(location!=null);
        if(location!=null){out.writeDouble(location.getDouble("latitude"));out.writeDouble(location.getDouble("longitude"));out.writeDouble(location.getDouble("accuracyMeters"));out.writeLong(location.getLong("capturedAt"));out.writeLong(location.getLong("ageAtSendMs"));}return bytes.toByteArray();
    }
    static JSONObject attach(GroupTextWire.Message message,JSONObject sealed,JSONObject location,GroupTextWire.Signer signer)throws Exception{
        if(!GroupTextWire.hash(signer.certificate()).equals(message.sender))throw new SecurityException("Message context signer changed");JSONObject result=new JSONObject(sealed.toString());JSONObject fix=location==null?null:checkedLocation(location);
        JSONObject context=new JSONObject().put("schema",SCHEMA).put("groupId",message.group).put("epoch",message.epoch).put("id",message.id).put("senderId",message.sender).put("messageDigest",message.digest()).put("sentAt",message.created);if(fix!=null)context.put("location",fix);
        result.put("sentContext",context).put("sentContextSignature",GroupWire.hex(signer.sign(canonical(message,fix))));
        if(result.toString().getBytes(StandardCharsets.UTF_8).length>GroupTextWire.MAX_ENVELOPE)return strip(result);
        return result;
    }
    static JSONObject verified(GroupTextWire.Message message,JSONObject sealed,long now){
        try{
            if(!(sealed.opt("sentContext") instanceof JSONObject)||!(sealed.opt("sentContextSignature") instanceof String))return null;
            JSONObject context=sealed.getJSONObject("sentContext");if(context.toString().getBytes(StandardCharsets.UTF_8).length>1024||!SCHEMA.equals(GroupTextWire.string(context,"schema"))||!message.group.equals(GroupTextWire.string(context,"groupId"))||message.epoch!=GroupTextWire.integer(context,"epoch")||!message.id.equals(GroupTextWire.string(context,"id"))||!message.sender.equals(GroupTextWire.string(context,"senderId"))||!message.digest().equals(GroupTextWire.string(context,"messageDigest"))||message.created!=GroupTextWire.integer(context,"sentAt"))return null;
            JSONObject location=context.has("location")?checkedLocation(context.getJSONObject("location")):null;
            JSONObject signature=new JSONObject().put("certificate",sealed.getString("certificate")).put("signature",sealed.getString("sentContextSignature"));GroupTextWire.verifyContext(signature,canonical(message,location),message.sender,now);
            JSONObject view=new JSONObject().put("sentAt",message.created).put("verified",true);if(location!=null)view.put("location",location);return view;
        }catch(Exception invalid){return null;}
    }
    static JSONObject safeEnvelope(GroupTextWire.Message message,JSONObject sealed,long now)throws Exception{return sealed.has("sentContext")||sealed.has("sentContextSignature")?verified(message,sealed,now)==null?strip(sealed):sealed:sealed;}
    static boolean hasLocation(JSONObject sealed){JSONObject context=sealed.optJSONObject("sentContext");return context!=null&&context.has("location");}
    static JSONObject strip(JSONObject sealed)throws Exception{JSONObject copy=new JSONObject(sealed.toString());copy.remove("sentContext");copy.remove("sentContextSignature");return copy;}
}

