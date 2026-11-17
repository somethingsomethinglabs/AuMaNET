package au.aumanet.app;

import org.json.*;
import java.io.*;
import java.nio.*;
import java.nio.charset.*;
import java.security.*;
import java.security.cert.*;
import java.security.interfaces.ECPublicKey;
import java.math.BigInteger;
import java.util.*;

/** Bounded canonical signed text/commit receipts. TLS remains mandatory; the owner cannot forge authors or receipts. */
final class GroupTextWire {
    static final int VERSION=1,MAX_TEXT=240,EXTENDED_TEXT=2048,MAX_IMAGE=1048576,MAX_IMAGE_EDGE=2048,MAX_IMAGE_BASE64=((MAX_IMAGE+2)/3)*4,CHUNK=4096,MAX_DRAFT=4096,MAX_ENVELOPE=8192;
    static final long TTL=86400000L,RETENTION=7*TTL,CLOCK_SKEW=120000L;
    private static final byte[] MESSAGE_DOMAIN="AuMaNET/group-text/v1\0".getBytes(StandardCharsets.US_ASCII),RECEIPT_DOMAIN="AuMaNET/group-text-receipt/v1\0".getBytes(StandardCharsets.US_ASCII);
    interface Signer{byte[] sign(byte[] canonical)throws Exception;byte[] certificate()throws Exception;}
    static String text(Object raw,int maximum,boolean blank)throws Exception{
        if(!(raw instanceof String))throw new IllegalArgumentException("Message text must be a string");String value=(String)raw;
        if(value.length()>maximum)throw new IllegalArgumentException("Text exceeds its UTF-8 byte limit");
        ByteBuffer encoded=StandardCharsets.UTF_8.newEncoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).encode(CharBuffer.wrap(value));
        if(encoded.remaining()>maximum)throw new IllegalArgumentException("Text exceeds its UTF-8 byte limit");if(!blank&&value.replaceAll("[\\s\\p{Z}\\uFEFF]","").isEmpty())throw new IllegalArgumentException("Message cannot be blank");
        for(int i=0;i<value.length();i++){char c=value.charAt(i);if(Character.isISOControl(c)&&c!='\n'&&c!='\r'&&c!='\t')throw new IllegalArgumentException("Message contains unsupported control characters");}return value;
    }
    static String string(JSONObject value,String key)throws Exception{Object raw=value.get(key);if(!(raw instanceof String))throw new IllegalArgumentException("Invalid message "+key);return(String)raw;}
    static long integer(JSONObject value,String key)throws Exception{Object raw=value.get(key);if(!(raw instanceof Number))throw new IllegalArgumentException("Invalid message "+key);double d=((Number)raw).doubleValue();long n=((Number)raw).longValue();if(!Double.isFinite(d)||d!=n||n<0||n>9007199254740991L)throw new IllegalArgumentException("Invalid message "+key);return n;}
    static String id(String value){if(!GroupWire.id(value))throw new IllegalArgumentException("Invalid message ID");return value;}
    static String pin(String value){if(!GroupWire.pin(value))throw new IllegalArgumentException("Invalid message identity");return value;}
    static byte[] unhex(String value,int maximum){if(value==null||value.isEmpty()||value.length()%2!=0||value.length()>maximum*2||!value.matches("[A-Fa-f0-9]+"))throw new IllegalArgumentException("Invalid bounded signed data");byte[] bytes=new byte[value.length()/2];for(int i=0;i<bytes.length;i++)bytes[i]=(byte)Integer.parseInt(value.substring(i*2,i*2+2),16);return bytes;}
    static String hash(byte[] bytes)throws Exception{return GroupWire.hex(MessageDigest.getInstance("SHA-256").digest(bytes));}
    static String textHash(String text)throws Exception{return hash(text.getBytes(StandardCharsets.UTF_8));}
    static final class Image{
        final int width,height,bytes;final String sha,source;
        Image(int width,int height,int bytes,String sha,String source){if(width<1||height<1||width>MAX_IMAGE_EDGE||height>MAX_IMAGE_EDGE||bytes<1||bytes>MAX_IMAGE||sha==null||!sha.matches("[A-F0-9]{64}")||source==null||!source.matches("[A-F0-9]{64}"))throw new IllegalArgumentException("Invalid bounded image manifest");this.width=width;this.height=height;this.bytes=bytes;this.sha=sha;this.source=source;}
        JSONObject json()throws Exception{return new JSONObject().put("mimeType","image/jpeg").put("width",width).put("height",height).put("byteLength",bytes).put("sha256",sha).put("sourceSha256",source);}
        static Image parse(JSONObject o)throws Exception{if(!"image/jpeg".equals(string(o,"mimeType")))throw new IllegalArgumentException("Unsupported image format");long w=integer(o,"width"),h=integer(o,"height"),n=integer(o,"byteLength");if(w>MAX_IMAGE_EDGE||h>MAX_IMAGE_EDGE||n>MAX_IMAGE)throw new IllegalArgumentException("Image exceeds its bounds");return new Image((int)w,(int)h,(int)n,string(o,"sha256"),string(o,"sourceSha256"));}
    }
    static final class Message{
        final String group,id,sender,text;final List<String> recipients;final long epoch,created,expires;final int version;final boolean historyShared;final Image image;
        Message(String group,long epoch,String id,String sender,List<String> recipients,long created,long expires,String text)throws Exception{
            this(group,epoch,id,sender,recipients,created,expires,text,1,false,null);
        }
        Message(String group,long epoch,String id,String sender,List<String> recipients,long created,long expires,String text,int version,boolean shared,Image image)throws Exception{
            if(version!=1&&version!=2||version==1&&(shared||image!=null))throw new IllegalArgumentException("Unsupported message version");this.version=version;historyShared=shared;this.image=image;
            this.group=id(group);this.id=id(id);this.sender=pin(sender);if(epoch<1||epoch>9007199254740991L||created<1||created>9007199254740991L-TTL||expires!=created+TTL)throw new IllegalArgumentException("Invalid message epoch/expiry");this.epoch=epoch;this.created=created;this.expires=expires;this.text=GroupTextWire.text(text,version==1?MAX_TEXT:EXTENDED_TEXT,image!=null);
            ArrayList<String> sorted=new ArrayList<>(recipients);if(sorted.isEmpty()||sorted.size()>4)throw new IllegalArgumentException("Choose an approved group recipient");Collections.sort(sorted);if(new HashSet<>(sorted).size()!=sorted.size()||sorted.contains(sender))throw new IllegalArgumentException("Invalid frozen message recipients");for(String recipient:sorted)pin(recipient);this.recipients=Collections.unmodifiableList(sorted);
        }
        byte[] canonical()throws Exception{ByteArrayOutputStream buffer=new ByteArrayOutputStream();DataOutputStream out=new DataOutputStream(buffer);out.write(version==1?MESSAGE_DOMAIN:"AuMaNET/group-message/v2\0".getBytes(StandardCharsets.US_ASCII));out.write(unhex(group,16));out.writeLong(epoch);out.write(unhex(id,16));out.write(unhex(sender,32));out.writeByte(recipients.size());for(String to:recipients)out.write(unhex(to,32));out.writeLong(created);out.writeLong(expires);byte[] body=text.getBytes(StandardCharsets.UTF_8);out.writeShort(body.length);out.write(body);if(version==2){out.writeBoolean(historyShared);out.writeBoolean(image!=null);if(image!=null){out.writeShort(image.width);out.writeShort(image.height);out.writeInt(image.bytes);out.write(unhex(image.sha,32));out.write(unhex(image.source,32));}}return buffer.toByteArray();}
        String operationHash()throws Exception{return textHash(image==null?text:text+'\0'+image.source);}
        String digest()throws Exception{return hash(canonical());}
        JSONObject json()throws Exception{JSONObject o=new JSONObject().put("schema",version==1?"aumanet.group-text.v1":"aumanet.group-message.v2").put("groupId",group).put("epoch",epoch).put("id",id).put("senderId",sender).put("recipients",new JSONArray(recipients)).put("createdAt",created).put("expiresAt",expires).put("text",text);if(version==2){o.put("historyShared",historyShared).put("kind",image==null?"text":"image");if(image!=null)o.put("image",image.json());}return o;}
        static Message parse(JSONObject value)throws Exception{
            String schema=string(value,"schema");int version=schema.equals("aumanet.group-text.v1")?1:schema.equals("aumanet.group-message.v2")?2:0;if(version==0)throw new IllegalArgumentException("Unsupported signed text version");JSONArray list=value.getJSONArray("recipients");if(list.length()>4)throw new IllegalArgumentException("Too many message recipients");List<String> recipients=new ArrayList<>();for(int i=0;i<list.length();i++){Object item=list.get(i);if(!(item instanceof String))throw new IllegalArgumentException("Invalid recipient identity");recipients.add((String)item);}String kind=version==1?"text":string(value,"kind");if(!Arrays.asList("text","image").contains(kind)||version==2&&!(value.get("historyShared") instanceof Boolean))throw new IllegalArgumentException("Invalid message kind/policy");Message result=new Message(string(value,"groupId"),integer(value,"epoch"),string(value,"id"),string(value,"senderId"),recipients,integer(value,"createdAt"),integer(value,"expiresAt"),string(value,"text"),version,version==2&&value.getBoolean("historyShared"),kind.equals("image")?Image.parse(value.getJSONObject("image")):null);if(!result.recipients.equals(recipients))throw new IllegalArgumentException("Recipient identities must use canonical order");return result;
        }
    }
    static final class Receipt{
        final String group,id,sender,recipient,digest;final long epoch,stored;
        Receipt(String group,long epoch,String id,String sender,String recipient,String digest,long stored){this.group=id(group);this.id=id(id);this.sender=pin(sender);this.recipient=pin(recipient);if(sender.equals(recipient)||epoch<1||epoch>9007199254740991L||stored<1||stored>9007199254740991L||digest==null||!digest.matches("[A-F0-9]{64}"))throw new IllegalArgumentException("Invalid commit receipt");this.epoch=epoch;this.digest=digest;this.stored=stored;}
        byte[] canonical()throws Exception{ByteArrayOutputStream buffer=new ByteArrayOutputStream();DataOutputStream out=new DataOutputStream(buffer);out.write(RECEIPT_DOMAIN);out.write(unhex(group,16));out.writeLong(epoch);out.write(unhex(id,16));out.write(unhex(sender,32));out.write(unhex(recipient,32));out.write(unhex(digest,32));out.writeLong(stored);return buffer.toByteArray();}
        JSONObject json()throws Exception{return new JSONObject().put("schema","aumanet.group-text-receipt.v1").put("groupId",group).put("epoch",epoch).put("id",id).put("senderId",sender).put("recipientId",recipient).put("messageDigest",digest).put("storedAt",stored);}
        static Receipt parse(JSONObject value)throws Exception{if(!"aumanet.group-text-receipt.v1".equals(string(value,"schema")))throw new IllegalArgumentException("Unsupported commit receipt version");return new Receipt(string(value,"groupId"),integer(value,"epoch"),string(value,"id"),string(value,"senderId"),string(value,"recipientId"),string(value,"messageDigest"),integer(value,"storedAt"));}
    }
    static JSONObject sign(Message message,Signer signer)throws Exception{return sealed(message.json(),message.canonical(),message.sender,signer);}
    static JSONObject sign(Receipt receipt,Signer signer)throws Exception{return sealed(receipt.json(),receipt.canonical(),receipt.recipient,signer);}
    private static JSONObject sealed(JSONObject object,byte[] canonical,String expected,Signer signer)throws Exception{byte[] certificate=signer.certificate();if(certificate.length>2048||!hash(certificate).equals(expected))throw new SecurityException("Signing identity changed");byte[] signed=signer.sign(canonical);if(signed.length>80)throw new SecurityException("Unexpected signature size");object.put("certificate",GroupWire.hex(certificate)).put("signature",GroupWire.hex(signed));bounded(object);return object;}
    static Message verifyMessage(JSONObject value,long now)throws Exception{bounded(value);Message message=Message.parse(value);verify(value,message.canonical(),message.sender,now);if(message.created>now+CLOCK_SKEW||message.expires<=now)throw new IllegalArgumentException("Message is expired or device clocks disagree");return message;}
    static Receipt verifyReceipt(JSONObject value,long now)throws Exception{bounded(value);Receipt receipt=Receipt.parse(value);verify(value,receipt.canonical(),receipt.recipient,now);return receipt;}
    private static void bounded(JSONObject value)throws Exception{if(value.toString().getBytes(StandardCharsets.UTF_8).length>MAX_ENVELOPE)throw new IllegalArgumentException("Signed text envelope exceeds its limit");}
    private static void verify(JSONObject value,byte[] canonical,String expected,long now)throws Exception{
        byte[] der=unhex(string(value,"certificate"),2048),signed=unhex(string(value,"signature"),80);if(!hash(der).equals(expected))throw new SecurityException("Message certificate does not match approved identity");ByteArrayInputStream input=new ByteArrayInputStream(der);X509Certificate certificate=(X509Certificate)CertificateFactory.getInstance("X.509").generateCertificate(input);if(input.available()!=0||!(certificate.getPublicKey() instanceof ECPublicKey))throw new SecurityException("Invalid message certificate");
        ECPublicKey key=(ECPublicKey)certificate.getPublicKey();if(!key.getParams().getOrder().equals(new BigInteger("FFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551",16)))throw new SecurityException("Message identity must use P-256");certificate.checkValidity(new Date(now));certificate.verify(key);Signature verifier=Signature.getInstance("SHA256withECDSA");verifier.initVerify(key);verifier.update(canonical);if(!verifier.verify(signed))throw new SecurityException("Message identity signature failed");
    }
    static void verifyContext(JSONObject value,byte[] canonical,String expected,long now)throws Exception{verify(value,canonical,expected,now);}
}
