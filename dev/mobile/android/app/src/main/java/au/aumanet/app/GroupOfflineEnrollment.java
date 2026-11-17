package au.aumanet.app;

import org.json.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.cert.*;
import java.io.ByteArrayInputStream;
import java.util.*;

/** Bounded out-of-band enrollment. The existing pinned TLS connection still proves
 * possession on reconnect. No Wi-Fi password or private key enters these codes. */
final class GroupOfflineEnrollment {
    interface Signer { byte[] sign(byte[] bytes)throws Exception; }
    static final long WINDOW=300000;
    static String hex(byte[] bytes){StringBuilder s=new StringBuilder();for(byte b:bytes)s.append(String.format(Locale.ROOT,"%02X",b&255));return s.toString();}
    static String hash(String text)throws Exception{return hex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));}
    static boolean pin(String value){return value!=null&&value.matches("[A-F0-9]{64}");}
    static String encode(byte[] bytes){return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);}
    static byte[] decode(String text,int max)throws Exception{if(text==null||text.isEmpty()||text.length()>max||!text.matches("[A-Za-z0-9_-]+"))throw new SecurityException("Invalid enrollment code");byte[] b=Base64.getUrlDecoder().decode(text);if(!encode(b).equals(text))throw new SecurityException("Noncanonical enrollment code");return b;}
    static void keys(JSONObject j,String... fields)throws Exception{Set<String> names=new HashSet<>();j.keys().forEachRemaining(names::add);if(!names.equals(new HashSet<>(Arrays.asList(fields))))throw new SecurityException("Unknown enrollment fields");}
    static JSONObject json(String text)throws Exception{return GroupNameJson.object(text,12000);}
    static String text(byte[] bytes)throws Exception{return StandardCharsets.UTF_8.newDecoder().onMalformedInput(java.nio.charset.CodingErrorAction.REPORT).onUnmappableCharacter(java.nio.charset.CodingErrorAction.REPORT).decode(java.nio.ByteBuffer.wrap(bytes)).toString();}
    static void label(String value,int max)throws Exception{if(!value.equals(GroupNamePolicy.label(value,max)))throw new SecurityException("Noncanonical enrollment name");}
    static long number(JSONObject j,String key)throws Exception{Object v=j.get(key);if(!(v instanceof Number))throw new SecurityException();long n=((Number)v).longValue();if(n<1||n>9007199254740991L||((Number)v).doubleValue()!=n)throw new SecurityException();return n;}
    static void current(long expiry,long now)throws Exception{long remaining=expiry-now;if(remaining<=0||remaining>WINDOW+5000)throw new SecurityException("Enrollment code expired; request a new invitation");}
    static JSONObject invite(String code,long now)throws Exception{
        String prefix="aumanet://join/";if(code==null||!code.startsWith(prefix))throw new SecurityException("Use a complete group invitation");
        JSONObject j=json(text(decode(code.substring(prefix.length()),4096)));
        keys(j,"schema","groupId","groupName","epoch","host","port","pin","token","expiresAt");
        if(!j.getString("schema").equals("aumanet.invite.v2")||!j.getString("groupId").matches("[a-f0-9]{32}")||!pin(j.getString("pin"))||!j.getString("token").matches("[a-f0-9]{64}"))throw new SecurityException("Invalid group invitation");
        label(j.getString("groupName"),64);number(j,"epoch");long port=number(j,"port");if(port<1024||port>65535)throw new SecurityException();
        // No host is contacted by this exchange. Resume applies its existing network policy.
        if(!j.getString("host").matches("(?:10\\.(?:[0-9]{1,3}\\.){2}[0-9]{1,3}|192\\.168\\.[0-9]{1,3}\\.[0-9]{1,3}|172\\.(?:1[6-9]|2[0-9]|3[01])\\.[0-9]{1,3}\\.[0-9]{1,3})"))throw new SecurityException();
        for(String part:j.getString("host").split("\\."))if(Integer.parseInt(part)>255)throw new SecurityException();current(number(j,"expiresAt"),now);return j;
    }
    static byte[] canonical(String kind,String body)throws Exception{if(!Arrays.asList("request","approval").contains(kind)||body==null||body.length()>10000)throw new SecurityException();return ("AuMaNET/offline-enrollment/"+kind+"/v1\0"+body).getBytes(StandardCharsets.US_ASCII);}
    static String signed(String kind,JSONObject payload,X509Certificate cert,Signer signer)throws Exception{
        GatewayPublicKeyPolicy.checked(cert.getPublicKey());String body=encode(payload.toString().getBytes(StandardCharsets.UTF_8));
        JSONObject envelope=new JSONObject().put("body",body).put("certificate",encode(cert.getEncoded())).put("signature",encode(signer.sign(canonical(kind,body))));
        String result="aumanet://"+kind+"/"+encode(envelope.toString().getBytes(StandardCharsets.UTF_8));if(result.length()>12000)throw new SecurityException("Enrollment exceeds capacity");return result;
    }
    static final class Verified {final JSONObject body;final String pin;Verified(JSONObject b,String p){body=b;pin=p;}}
    static Verified verified(String kind,String code)throws Exception{
        String prefix="aumanet://"+kind+"/";if(code==null||!code.startsWith(prefix))throw new SecurityException("Wrong enrollment code type");
        JSONObject e=json(text(decode(code.substring(prefix.length()),12000)));keys(e,"body","certificate","signature");
        byte[] der=decode(e.getString("certificate"),2048);ByteArrayInputStream input=new ByteArrayInputStream(der);
        X509Certificate cert=(X509Certificate)CertificateFactory.getInstance("X.509").generateCertificate(input);if(input.available()!=0||!Arrays.equals(der,cert.getEncoded()))throw new SecurityException();
        GatewayPublicKeyPolicy.checked(cert.getPublicKey());Signature verifier=Signature.getInstance("SHA256withECDSA");verifier.initVerify(cert.getPublicKey());verifier.update(canonical(kind,e.getString("body")));
        byte[] signature=decode(e.getString("signature"),100);if(signature.length<8||signature.length>72||!verifier.verify(signature))throw new SecurityException("Enrollment signature rejected");
        return new Verified(json(text(decode(e.getString("body"),10000))),hex(MessageDigest.getInstance("SHA-256").digest(der)));
    }
    static Verified request(String code,long now)throws Exception{Verified v=verified("request",code);keys(v.body,"invitation","name","nonce");invite(v.body.getString("invitation"),now);label(v.body.getString("name"),48);if(!v.body.getString("nonce").matches("[a-f0-9]{32}"))throw new SecurityException();return v;}
    static Verified approval(String code,String request,String self,long now)throws Exception{
        Verified r=request(request,now),a=verified("approval",code);JSONObject i=invite(r.body.getString("invitation"),now),b=a.body;
        keys(b,"requestHash","self","groupId","groupName","owner","epoch","host","port","members","expiresAt");
        if(!r.pin.equals(self)||!b.getString("self").equals(self)||!b.getString("requestHash").equals(hash(request))||!a.pin.equals(i.getString("pin"))||!a.pin.equals(b.getString("owner"))||!b.getString("groupId").equals(i.getString("groupId"))||number(b,"epoch")!=number(i,"epoch")+1||!b.getString("groupName").equals(i.getString("groupName"))||!b.getString("host").equals(i.getString("host"))||number(b,"port")!=number(i,"port"))throw new SecurityException("Approval is for another invitation or phone");
        if(number(b,"expiresAt")!=number(i,"expiresAt"))throw new SecurityException();current(number(b,"expiresAt"),now);
        JSONArray members=b.getJSONArray("members");if(members.length()<2||members.length()>5)throw new SecurityException();Set<String> pins=new HashSet<>();
        for(int n=0;n<members.length();n++){JSONObject m=members.getJSONObject(n);keys(m,"id","name","nameRevision");String p=m.getString("id");if(!pin(p)||!pins.add(p))throw new SecurityException();label(m.getString("name"),48);Object revision=m.get("nameRevision");if(!(revision instanceof Number)||((Number)revision).longValue()<0||((Number)revision).longValue()>9007199254740991L||((Number)revision).doubleValue()!=((Number)revision).longValue())throw new SecurityException();}
        if(!pins.contains(self)||!pins.contains(a.pin))throw new SecurityException();return a;
    }
    private GroupOfflineEnrollment(){}
}
