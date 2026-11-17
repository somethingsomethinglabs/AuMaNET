package au.aumanet.app;

import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.spec.X509EncodedKeySpec;
import java.util.*;

/** Checked USB setup material. Private AP credentials never enter a public snapshot. */
final class NodeConnectionProfile {
    final String self,group,owner,node,nodePin,nodePublicKey,ssid,bssid,password,address,mac,digest;
    final long epoch;
    NodeConnectionProfile(JSONObject raw)throws Exception {
        Set<String> names=new HashSet<>();raw.keys().forEachRemaining(names::add);
        if(!names.equals(new HashSet<>(Arrays.asList("schema","self","group","owner","epoch","node","nodePin","nodePublicKey","ssid","bssid","password","address","mac")))||
           !"aumanet.node-wifi-profile.v1".equals(raw.optString("schema")))throw new IllegalArgumentException("Invalid checked node profile");
        self=hex(raw,"self",64);group=hex(raw,"group",32);owner=hex(raw,"owner",64);node=hex(raw,"node",32);
        nodePin=hex(raw,"nodePin",64);nodePublicKey=hex(raw,"nodePublicKey",182);
        Object number=raw.opt("epoch");if(!(number instanceof Number))throw new IllegalArgumentException("Invalid profile epoch");
        double value=((Number)number).doubleValue();epoch=((Number)number).longValue();
        if(!Double.isFinite(value)||epoch<1||epoch>9007199254740991L||value!=epoch)throw new IllegalArgumentException("Invalid profile epoch");
        ssid=text(raw,"ssid");if(ssid.isEmpty()||ssid.getBytes(StandardCharsets.UTF_8).length>32||ssid.chars().anyMatch(c->c<32||c==127))throw new IllegalArgumentException("Invalid profile SSID");
        password=text(raw,"password");if(password.length()<8||password.length()>63||password.chars().anyMatch(c->c<32||c>126))throw new IllegalArgumentException("Invalid profile credentials");
        bssid=hex(raw,"bssid",12).toLowerCase(Locale.ROOT);mac=hex(raw,"mac",12).toLowerCase(Locale.ROOT);
        if((Integer.parseInt(bssid.substring(0,2),16)&1)!=0||(Integer.parseInt(mac.substring(0,2),16)&1)!=0||
           bssid.matches("0{12}")||mac.matches("0{12}"))throw new IllegalArgumentException("Invalid checked station");
        address=text(raw,"address");if(!address.matches("10\\.77\\.0\\.[1-9][0-9]{0,2}"))throw new IllegalArgumentException("Invalid checked address");
        int host=Integer.parseInt(address.substring(8));if(host<2||host>254)throw new IllegalArgumentException("Invalid checked address");
        byte[] key=unhex(nodePublicKey);byte[] checked=GatewayPublicKeyPolicy.checked(KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(key)));
        if(!Arrays.equals(key,checked)||!nodePin.equals(hex(MessageDigest.getInstance("SHA-256").digest(checked))))throw new SecurityException("Node public pin mismatch");
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();DataOutputStream data=new DataOutputStream(bytes);
        for(String part:new String[]{self,group,owner,Long.toString(epoch),node,nodePin,nodePublicKey,ssid,bssid,password,address,mac}){
            byte[] encoded=part.getBytes(StandardCharsets.UTF_8);data.writeInt(encoded.length);data.write(encoded);
        }
        digest=hex(MessageDigest.getInstance("SHA-256").digest(bytes.toByteArray()));
    }
    boolean matches(String currentSelf,String currentGroup,String currentOwner,long currentEpoch){
        return self.equalsIgnoreCase(currentSelf)&&group.equalsIgnoreCase(currentGroup)&&owner.equalsIgnoreCase(currentOwner)&&epoch==currentEpoch;
    }
    JSONObject json()throws Exception{return new JSONObject().put("schema","aumanet.node-wifi-profile.v1").put("self",self).put("group",group).put("owner",owner).put("epoch",epoch)
        .put("node",node).put("nodePin",nodePin).put("nodePublicKey",nodePublicKey).put("ssid",ssid).put("bssid",bssid).put("password",password).put("address",address).put("mac",mac);}
    private static String text(JSONObject raw,String name)throws Exception{Object value=raw.get(name);if(!(value instanceof String))throw new IllegalArgumentException("Invalid checked profile field");return(String)value;}
    private static String hex(JSONObject raw,String name,int length)throws Exception{String value=text(raw,name);if(value.length()!=length||!value.matches("[A-Fa-f0-9]+"))throw new IllegalArgumentException("Invalid checked profile field");return value.toUpperCase(Locale.ROOT);}
    static byte[] unhex(String value){byte[] bytes=new byte[value.length()/2];for(int i=0;i<bytes.length;i++)bytes[i]=(byte)Integer.parseInt(value.substring(i*2,i*2+2),16);return bytes;}
    static String hex(byte[] value){StringBuilder out=new StringBuilder();for(byte b:value)out.append(String.format(Locale.ROOT,"%02X",b&255));return out.toString();}
}
