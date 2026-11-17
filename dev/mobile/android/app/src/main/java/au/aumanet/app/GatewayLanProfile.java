package au.aumanet.app;
import org.json.JSONObject;
import java.nio.ByteBuffer;
import java.security.*;
import java.util.*;

/** Persistent owner-signed R1 ownership; never membership, consent or proof of a live route. */
final class GatewayLanProfile {
 final String node,group,owner,gateway,first,last,network,bodyHex,signatureHex,ownerDerHex,ownerCertificateHex;final long epoch,revision;
 private GatewayLanProfile(String node,String group,String owner,long epoch,long revision,long network,int first,int last,String body,String sig,String der,String cert){this.node=node;this.group=group;this.owner=owner;this.epoch=epoch;this.revision=revision;this.network=address(network);gateway=address(network+1);this.first=address(network+first);this.last=address(network+last);bodyHex=body;signatureHex=sig;ownerDerHex=der;ownerCertificateHex=cert;}
 static long ip(String text){GroupWire.privateIPv4(text);long n=0;for(String part:text.split("\\."))n=(n<<8)|Integer.parseInt(part);return n;}
 static String address(long n){return ((n>>>24)&255)+"."+((n>>>16)&255)+"."+((n>>>8)&255)+"."+(n&255);}
 static byte[] unhex(String s){if(s==null||s.length()%2!=0||!s.matches("[a-f0-9]+"))throw new IllegalArgumentException("Invalid canonical LAN hex");byte[] b=new byte[s.length()/2];for(int i=0;i<b.length;i++)b[i]=(byte)Integer.parseInt(s.substring(i*2,i*2+2),16);return b;}
 boolean contains(String address){try{long n=ip(address);return n>=ip(first)&&n<=ip(last);}catch(Exception invalid){return false;}}
 JSONObject json()throws Exception{return new JSONObject().put("bodyHex",bodyHex).put("signatureDerHex",signatureHex).put("ownerPublicKeyDerHex",ownerDerHex).put("ownerCertificateDerHex",ownerCertificateHex);}
 static byte[] body(String group,long epoch,String node,String ownerSpki,int index,long revision,long issued){
  if(index<1||index>254||revision<1||revision>GroupNamePolicy.MAX_REVISION||epoch<1||epoch>GroupNamePolicy.MAX_REVISION||issued<1||issued>GroupNamePolicy.MAX_REVISION-300000)throw new IllegalArgumentException("Invalid scoped allocation request");
  ByteBuffer b=ByteBuffer.allocate(128);b.put(new byte[]{65,85,76,65,78,49,0,0}).putShort((short)1).putShort((short)0).put(GatewayGrantCodec.identifier(group)).put(GatewayGrantCodec.identifier(node)).put(unhex(ownerSpki.toLowerCase(Locale.ROOT))).putLong(epoch).putLong(revision).putInt(0x0a4d0000).put((byte)16).put((byte)index).put((byte)24).put((byte)1).put((byte)16).put((byte)17).putShort((short)0).putLong(issued).putLong(issued+300000).putLong(0);return b.array();
 }
 static GatewayLanProfile read(JSONObject raw,String expectedGroup,long expectedEpoch,String expectedOwner,String expectedNode)throws Exception{
  GatewayBindingConfig.keys(raw,"bodyHex","signatureDerHex","ownerPublicKeyDerHex","ownerCertificateDerHex");String bh=raw.getString("bodyHex"),sh=raw.getString("signatureDerHex"),der=raw.getString("ownerPublicKeyDerHex"),cert=raw.getString("ownerCertificateDerHex");
  if(bh.length()!=256||sh.length()<16||sh.length()>144||der.length()>256||cert.length()>8192)throw new SecurityException("Invalid bounded LAN grant");byte[] b=unhex(bh),sig=unhex(sh),key=unhex(der);
  java.security.cert.X509Certificate certificate=(java.security.cert.X509Certificate)java.security.cert.CertificateFactory.getInstance("X.509").generateCertificate(new java.io.ByteArrayInputStream(unhex(cert)));
  if(!Arrays.equals(unhex(cert),certificate.getEncoded())||!GroupWire.hex(MessageDigest.getInstance("SHA-256").digest(certificate.getEncoded())).equals(expectedOwner)||!Arrays.equals(certificate.getPublicKey().getEncoded(),key))throw new SecurityException("LAN owner certificate pin mismatch");
  String controlPin=GroupWire.hex(MessageDigest.getInstance("SHA-256").digest(key));PublicKey pub=GatewayBootCodec.nodeKey(der.toUpperCase(Locale.ROOT),controlPin);GatewayPublicKeyPolicy.checked(pub);
  if(!GroupWire.hex(MessageDigest.getInstance("SHA-256").digest(key)).equals(controlPin))throw new SecurityException("LAN authority pin mismatch");
  Signature verifier=Signature.getInstance("SHA256withECDSA");verifier.initVerify(pub);verifier.update(b);if(!verifier.verify(sig))throw new SecurityException("Invalid LAN grant signature");
  ByteBuffer v=ByteBuffer.wrap(b);String group=GroupWire.hex(Arrays.copyOfRange(b,12,28)).toLowerCase(Locale.ROOT),node=GroupWire.hex(Arrays.copyOfRange(b,28,44)).toLowerCase(Locale.ROOT),owner=GroupWire.hex(Arrays.copyOfRange(b,44,76));long epoch=v.getLong(76),revision=v.getLong(84),issued=v.getLong(104),until=v.getLong(112),pool=Integer.toUnsignedLong(v.getInt(92));int index=b[97]&255,first=b[100]&255,last=b[101]&255;
  if(!Arrays.equals(Arrays.copyOf(b,8),new byte[]{65,85,76,65,78,49,0,0})||v.getShort(8)!=1||v.getShort(10)!=0||!group.equals(expectedGroup)||!node.equals(expectedNode)||!GroupWire.id(node)||!owner.equals(controlPin)||epoch!=expectedEpoch||revision<1||revision>GroupNamePolicy.MAX_REVISION||(pool&65535)!=0||b[96]!=16||index<1||index>254||b[98]!=24||b[99]!=1||first<16||last>239||last-first!=1||b[102]!=0||b[103]!=0||issued<1||until<=issued||until>GroupNamePolicy.MAX_REVISION||until-issued>86400000||v.getLong(120)!=0)throw new SecurityException("LAN grant scope/encoding mismatch");
  GroupWire.privateIPv4(address(pool));long network=pool+index*256L;if(network==0x0a4d0000L||network==0x0a4e0000L)throw new SecurityException("LAN overlaps legacy/underlay");
  return new GatewayLanProfile(node,group,expectedOwner,epoch,revision,network,first,last,bh,sh,der,cert);
 }
}
