package au.aumanet.app;
import java.security.*;import java.security.cert.*;import java.nio.file.*;import java.util.*;import org.json.*;
public final class OfflineEnrollmentTest {
 static int checks;interface Task{void run()throws Exception;}
 static void check(boolean b){checks++;if(!b)throw new AssertionError("Offline enrollment invariant failed");}
 static void reject(Task t)throws Exception{checks++;try{t.run();}catch(Exception expected){return;}throw new AssertionError("Unsafe enrollment accepted");}
 static KeyStore keys(String path)throws Exception{KeyStore k=KeyStore.getInstance("PKCS12");try(var in=Files.newInputStream(Path.of(path))){k.load(in,"fixture-only".toCharArray());}return k;}
 static GroupOfflineEnrollment.Signer signer(KeyStore k)throws Exception{PrivateKey key=(PrivateKey)k.getKey("fixture","fixture-only".toCharArray());return data->{Signature s=Signature.getInstance("SHA256withECDSA");s.initSign(key);s.update(data);return s.sign();};}
 static String code(JSONObject j){return "aumanet://join/"+GroupOfflineEnrollment.encode(j.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));}
 static JSONObject copy(JSONObject j){return new JSONObject(j.toString());}
 public static void main(String[] args)throws Exception{
  KeyStore owner=keys(args[0]),member=keys(args[1]);X509Certificate oc=(X509Certificate)owner.getCertificate("fixture"),mc=(X509Certificate)member.getCertificate("fixture");
  String op=GroupOfflineEnrollment.hex(MessageDigest.getInstance("SHA-256").digest(oc.getEncoded())),mp=GroupOfflineEnrollment.hex(MessageDigest.getInstance("SHA-256").digest(mc.getEncoded()));long now=1800000000000L;
  JSONObject invite=new JSONObject().put("schema","aumanet.invite.v2").put("groupId","a".repeat(32)).put("groupName","Trip").put("epoch",4).put("host","10.77.0.10").put("port",44444).put("pin",op).put("token","b".repeat(64)).put("expiresAt",now+300000);
  String invitation=code(invite);JSONObject requestBody=new JSONObject().put("invitation",invitation).put("name","New phone").put("nonce","c".repeat(32));
  String request=GroupOfflineEnrollment.signed("request",requestBody,mc,signer(member));check(GroupOfflineEnrollment.request(request,now).pin.equals(mp));
  JSONArray roster=new JSONArray().put(new JSONObject().put("id",op).put("name","Owner").put("nameRevision",1)).put(new JSONObject().put("id",mp).put("name","New phone").put("nameRevision",0));
  JSONObject body=new JSONObject().put("requestHash",GroupOfflineEnrollment.hash(request)).put("self",mp).put("groupId",invite.getString("groupId")).put("groupName","Trip").put("owner",op).put("epoch",5).put("host","10.77.0.10").put("port",44444).put("members",roster).put("expiresAt",now+300000);
  String approval=GroupOfflineEnrollment.signed("approval",body,oc,signer(owner));check(GroupOfflineEnrollment.approval(approval,request,mp,now).pin.equals(op));check(request.length()<12000&&approval.length()<12000);
  reject(()->GroupOfflineEnrollment.approval(approval,request,op,now));reject(()->GroupOfflineEnrollment.approval(approval,request,mp,now+300001));reject(()->GroupOfflineEnrollment.approval(approval,request,mp,now-6000));
  for(String field:new String[]{"requestHash","self","groupId","groupName","owner","epoch","host","port","expiresAt"}){
   JSONObject altered=copy(body);if(field.equals("epoch")||field.equals("port")||field.equals("expiresAt"))altered.put(field,altered.getLong(field)+1);else altered.put(field,"wrong");
   String signed=GroupOfflineEnrollment.signed("approval",altered,oc,signer(owner));reject(()->GroupOfflineEnrollment.approval(signed,request,mp,now));
  }
  String forged=GroupOfflineEnrollment.signed("approval",body,mc,signer(member));reject(()->GroupOfflineEnrollment.approval(forged,request,mp,now));
  String another=GroupOfflineEnrollment.signed("request",copy(requestBody).put("nonce","d".repeat(32)),mc,signer(member));reject(()->GroupOfflineEnrollment.approval(approval,another,mp,now));
  JSONObject duplicate=copy(body);duplicate.getJSONArray("members").put(copy(roster.getJSONObject(0)));String duplicateCode=GroupOfflineEnrollment.signed("approval",duplicate,oc,signer(owner));reject(()->GroupOfflineEnrollment.approval(duplicateCode,request,mp,now));
  reject(()->GroupOfflineEnrollment.request(approval,now));reject(()->GroupOfflineEnrollment.verified("request",request+"="));reject(()->GroupOfflineEnrollment.invite(code(copy(invite).put("unknown",true)),now));
  reject(()->GroupOfflineEnrollment.invite(code(copy(invite).put("host","10.77.999.10")),now));
  String prefix="aumanet://approval/",envelopeText=new String(GroupOfflineEnrollment.decode(approval.substring(prefix.length()),12000),java.nio.charset.StandardCharsets.UTF_8);JSONObject envelope=new JSONObject(envelopeText);byte[] sig=GroupOfflineEnrollment.decode(envelope.getString("signature"),100);sig[sig.length-1]^=1;envelope.put("signature",GroupOfflineEnrollment.encode(sig));String tampered=prefix+GroupOfflineEnrollment.encode(envelope.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));reject(()->GroupOfflineEnrollment.approval(tampered,request,mp,now));
  reject(()->GroupOfflineEnrollment.text(new byte[]{(byte)0xc3,0x28}));
  reject(()->GroupOfflineEnrollment.invite(code(copy(invite).put("groupName"," Trip ")),now));
  String noncanonical=GroupOfflineEnrollment.signed("request",copy(requestBody).put("name"," New phone "),mc,signer(member));reject(()->GroupOfflineEnrollment.request(noncanonical,now));
  JSONObject huge=copy(body);huge.getJSONArray("members").getJSONObject(0).put("nameRevision",9007199254740992L);String hugeCode=GroupOfflineEnrollment.signed("approval",huge,oc,signer(owner));reject(()->GroupOfflineEnrollment.approval(hugeCode,request,mp,now));
  System.out.println(new JSONObject().put("status","pass").put("assertions",checks));
 }
}
