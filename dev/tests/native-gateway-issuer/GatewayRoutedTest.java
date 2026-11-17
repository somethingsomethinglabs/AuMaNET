package au.aumanet.app;
import org.json.*;
import java.nio.*;
import java.nio.file.*;
import java.security.*;
import java.security.cert.X509Certificate;
import java.util.*;

/** Real disposable P256/X509 signatures; production profiles/config/issuer/recovery policy. */
public final class GatewayRoutedTest {
 static int assertions;static void check(boolean v){assertions++;if(!v)throw new AssertionError("check "+assertions);}
 interface Work{void run()throws Exception;}static void denied(Work w)throws Exception{try{w.run();}catch(Exception expected){assertions++;return;}throw new AssertionError("Expected rejection");}
 static final String G="1".repeat(32),A="a".repeat(32),B="b".repeat(32),RUN="2".repeat(32),P2="B".repeat(64),P3="C".repeat(64);
 static String hex(byte[] b){return GroupWire.hex(b).toLowerCase(Locale.ROOT);}static String hash(byte[] b)throws Exception{return GroupWire.hex(MessageDigest.getInstance("SHA-256").digest(b));}
 static PrivateKey privateKey;static X509Certificate certificate;static String owner;
 static JSONObject grant(String node,int index,long revision)throws Exception{
  byte[] pub=certificate.getPublicKey().getEncoded(),body=GatewayLanProfile.body(G,1,node,hash(pub),index,revision,1000);Signature s=Signature.getInstance("SHA256withECDSA");s.initSign(privateKey);s.update(body);
  return new JSONObject().put("bodyHex",hex(body)).put("signatureDerHex",hex(s.sign())).put("ownerPublicKeyDerHex",hex(pub)).put("ownerCertificateDerHex",hex(certificate.getEncoded()));
 }
 static JSONObject node(String id,JSONObject grant)throws Exception{KeyPairGenerator g=KeyPairGenerator.getInstance("EC");g.initialize(new java.security.spec.ECGenParameterSpec("secp256r1"));byte[] pub=g.generateKeyPair().getPublic().getEncoded();return new JSONObject().put("id",id).put("run",RUN).put("publicKeyDerHex",GroupWire.hex(pub)).put("publicKeySha256",hash(pub)).put("lanGrant",grant);}
 static JSONObject binding(String pin,String node,String address,String mac){return new JSONObject().put("phonePin",pin).put("attachmentNode",node).put("ipv4",address).put("mac",mac).put("generation",1);}
 static final class Disk implements GatewaySequenceStore.Storage{String raw;public String read(){return raw;}public boolean write(String next){raw=next;return true;}}
 public static void main(String[] args)throws Exception{
  KeyStore ks=KeyStore.getInstance("PKCS12");try(java.io.InputStream in=Files.newInputStream(Path.of(args[0]))){ks.load(in,"test-only-password".toCharArray());}privateKey=(PrivateKey)ks.getKey("routed-test","test-only-password".toCharArray());certificate=(X509Certificate)ks.getCertificate("routed-test");owner=hash(certificate.getEncoded());
  JSONObject ga=grant(A,1,1),gb=grant(B,2,1);GatewayLanProfile a=GatewayLanProfile.read(ga,G,1,owner,A);check(a.gateway.equals("10.77.1.1"));check(a.contains("10.77.1.16"));check(!a.contains("10.77.1.1"));check(!a.contains("10.77.2.16"));
  denied(()->GatewayLanProfile.read(ga,G,2,owner,A));denied(()->GatewayLanProfile.read(ga,G,1,P2,A));denied(()->GatewayLanProfile.read(ga,G,1,owner,B));
  JSONObject bad=new JSONObject(ga.toString());bad.put("signatureDerHex","30".repeat(36));denied(()->GatewayLanProfile.read(bad,G,1,owner,A));
  GatewayOwnerAuthority.Scope scope=new GatewayOwnerAuthority.Scope(new Object(),"12345678-1234-1234-1234-123456789abc",owner,G,1,1,List.of(owner,P2,P3),null,null,0,false);
  JSONObject raw=new JSONObject().put("schema","aumanet.gateway-config.v4").put("groupId",G).put("ownerPin",owner).put("epoch",1).put("radioRelayNode",A).put("nodes",new JSONArray().put(node(A,ga)).put(node(B,gb))).put("bindings",new JSONArray().put(binding(owner,A,"10.77.1.16","020000000001")).put(binding(P2,A,"10.77.1.17","020000000002")).put(binding(P3,B,"10.77.2.16","020000000003")));
  GatewayBindingConfig config=GatewayBindingConfig.parse(raw,scope);check(config.routed());check(config.bootRecovery());check(config.bindings.size()==3);check(config.localGateway().equals("10.77.1.1"));
  JSONObject spoof=new JSONObject(raw.toString());spoof.getJSONArray("bindings").getJSONObject(1).put("ipv4","10.77.2.17");denied(()->GatewayBindingConfig.parse(spoof,scope));
  JSONObject overlap=new JSONObject(raw.toString());overlap.getJSONArray("nodes").getJSONObject(1).put("lanGrant",grant(B,1,1));denied(()->GatewayBindingConfig.parse(overlap,scope));
  Disk disk=new Disk();GatewayConfigStore store=new GatewayConfigStore(disk);store.save(scope,raw,0,"3".repeat(32));GatewayBindingConfig restored=new GatewayConfigStore(disk).current().config;check(restored.routed());check(restored.bindings.size()==3);check(restored.nodes.get(1).lan.network.equals("10.77.2.0"));
  GatewayOwnerAuthority.Access authority=new GatewayOwnerAuthority.Access(){public GatewayOwnerAuthority.Scope capture(boolean live){return scope;}public boolean current(GatewayOwnerAuthority.Scope s,boolean live){return s==scope;}public byte[] publicKey(GatewayOwnerAuthority.Scope s){return certificate.getPublicKey().getEncoded();}public byte[] sign(GatewayOwnerAuthority.Scope s,byte[] body,String target,boolean live)throws Exception{check(GatewayGrantCodec.scopedBinding(body,G,1,target));Signature signature=Signature.getInstance("SHA256withECDSA");signature.initSign(privateKey);signature.update(body);return signature.sign();}};
  GatewaySequenceStore sequenceStore=new GatewaySequenceStore(new Disk());List<GatewayGrantIssuer.Packet> packets=GatewayGrantIssuer.issue(authority,scope,restored,sequenceStore,1800000000000L,false,()->true);check(packets.size()==6);
  for(GatewayGrantIssuer.Packet p:packets){check(p.body[4]=='2');check((p.body[96]&255)==10);check((p.body[97]&255)==77);check((p.body[98]&255)>0);check(GatewayGrantCodec.scopedBinding(p.body,G,1,p.target));Signature s=Signature.getInstance("SHA256withECDSA");s.initVerify(certificate);s.update(p.body);check(s.verify(p.signature));}
  JSONObject network=new JSONObject().put("schema","aumanet.routed-group-network.v1").put("groupId",G).put("ownerPin",owner).put("epoch",1).put("local",gb).put("remote",ga);RoutedGroupNetwork policy=RoutedGroupNetwork.read(network);
  check(policy.permits(G,owner,1,"10.77.2.16",24,"10.77.1.16"));check(!policy.permits(G,owner,1,"10.77.2.16",24,"10.77.3.16"));check(!policy.permits(G,P2,1,"10.77.2.16",24,"10.77.1.16"));check(!policy.permits(G,owner,2,"10.77.2.16",24,"10.77.1.16"));
  GroupRecoveryPolicy.Attempt legacy=new GroupRecoveryPolicy.Attempt("4".repeat(32),G,owner,1,1,"10.77.2.16",24,100);check(!legacy.offer(legacy.key,"10.77.1.16",1234,100));
  GroupRecoveryPolicy.Attempt routed=new GroupRecoveryPolicy.Attempt("5".repeat(32),G,owner,1,1,"10.77.2.16",24,100,d->policy.permits(G,owner,1,"10.77.2.16",24,d));check(routed.offer(routed.key,"10.77.1.16",1234,100));check(!routed.offer(routed.key,"10.77.3.16",1234,100));check(routed.poll(100).host.equals("10.77.1.16"));
  GatewayOwnerReady ready=new GatewayOwnerReady();check(ready.issued(RUN,3,3,100,2000,()->true));check(!ready.issued(RUN,3,4,100,2000,()->true));
  Files.write(Path.of(args[1],"lan-local.bin"),GatewayLanProfile.unhex(ga.getString("bodyHex")));Files.write(Path.of(args[1],"lan-peer.bin"),GatewayLanProfile.unhex(gb.getString("bodyHex")));
  Files.write(Path.of(args[1],"lan-local.sig"),GatewayLanProfile.unhex(ga.getString("signatureDerHex")));Files.write(Path.of(args[1],"lan-peer.sig"),GatewayLanProfile.unhex(gb.getString("signatureDerHex")));Files.write(Path.of(args[1],"owner.der"),certificate.getPublicKey().getEncoded());
  for(int i=0;i<packets.size();i++)Files.write(Path.of(args[1],"packet-"+i+".bin"),packets.get(i).envelope);
  List<GatewayGrantIssuer.Packet> renewals=GatewayGrantIssuer.issue(authority,scope,restored,sequenceStore,1800000000000L,false,()->true);for(int i=0;i<renewals.size();i++)Files.write(Path.of(args[1],"renewal-"+i+".bin"),renewals.get(i).envelope);
  System.out.println(new JSONObject().put("status","passed").put("testCount",10).put("assertionCount",assertions));
 }
}
final class GroupVoiceCohort {static final long MAX_REVISION=9007199254740991L;}
