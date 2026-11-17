package au.aumanet.app;

import org.json.JSONObject;
import java.security.*;
import java.security.spec.ECGenParameterSpec;
import java.util.Locale;

/** Real JCE/key/profile scope checks; no Android radio or transport simulation. */
public final class NodeConnectionProfileTest {
    static int checks,groups;
    static void check(boolean value){checks++;if(!value)throw new AssertionError("Checked profile invariant failed");}
    interface Checked {void run()throws Exception;}
    static void reject(Checked action)throws Exception{checks++;try{action.run();}catch(Exception expected){return;}throw new AssertionError("Invalid profile accepted");}
    static JSONObject copy(JSONObject value)throws Exception{return new JSONObject(value.toString());}
    static JSONObject profile()throws Exception{
        KeyPairGenerator generator=KeyPairGenerator.getInstance("EC");generator.initialize(new ECGenParameterSpec("secp256r1"));byte[] key=generator.generateKeyPair().getPublic().getEncoded();
        return new JSONObject().put("schema","aumanet.node-wifi-profile.v1").put("self","A".repeat(64)).put("group","b".repeat(32)).put("owner","C".repeat(64)).put("epoch",4)
            .put("node","d".repeat(32)).put("nodePublicKey",NodeConnectionProfile.hex(key)).put("nodePin",NodeConnectionProfile.hex(MessageDigest.getInstance("SHA-256").digest(key)))
            .put("ssid","Fixture-node").put("bssid","024400000001").put("password","fixture-only-password").put("address","10.77.0.11").put("mac","026600000001");
    }
    public static void main(String[] ignored)throws Exception{
        JSONObject raw=profile();NodeConnectionProfile valid=new NodeConnectionProfile(raw);
        check(valid.digest.matches("[A-F0-9]{64}"));check(valid.digest.equals(new NodeConnectionProfile(valid.json()).digest));groups++;
        JSONObject lower=copy(raw);for(String key:new String[]{"self","group","owner","node","nodePin","nodePublicKey","mac","bssid"})lower.put(key,lower.getString(key).toLowerCase(Locale.ROOT));
        check(valid.digest.equals(new NodeConnectionProfile(lower).digest));check(valid.matches("a".repeat(64),"B".repeat(32),"c".repeat(64),4));groups++;
        for(String field:new String[]{"self","group","owner","epoch"}){
            String self=field.equals("self")?"1".repeat(64):valid.self,group=field.equals("group")?"2".repeat(32):valid.group,owner=field.equals("owner")?"3".repeat(64):valid.owner;
            check(!valid.matches(self,group,owner,field.equals("epoch")?5:4));
        }groups++;
        for(String field:new String[]{"ssid","password","bssid","mac","address","epoch"}){
            JSONObject changed=copy(raw);changed.put(field,field.equals("ssid")?"Other-node":field.equals("password")?"other-fixture-password":field.equals("bssid")?"024400000002":field.equals("mac")?"026600000002":field.equals("address")?"10.77.0.12":5);
            check(!valid.digest.equals(new NodeConnectionProfile(changed).digest));
        }groups++;
        for(String field:new String[]{"self","group","owner","node","nodePin","nodePublicKey","ssid","password","address","bssid","mac","epoch","schema"}){
            JSONObject missing=copy(raw);missing.remove(field);reject(()->new NodeConnectionProfile(missing));
        }
        JSONObject extra=copy(raw).put("unapproved","value");reject(()->new NodeConnectionProfile(extra));groups++;
        for(Object epoch:new Object[]{0,-1,1.5,Double.NaN,"4",9007199254740992L}){JSONObject bad=copy(raw).put("epoch",epoch instanceof Double&&((Double)epoch).isNaN()?"NaN":epoch);reject(()->new NodeConnectionProfile(bad));}groups++;
        for(String field:new String[]{"bssid","mac"})for(String value:new String[]{"ffffffffffff","014400000001","000000000000","xx4400000001","0244000000"}){
            JSONObject bad=copy(raw).put(field,value);reject(()->new NodeConnectionProfile(bad));
        }
        for(String value:new String[]{"10.77.0.0","10.77.0.1","10.77.0.255","10.77.1.11","10.77.0.011","192.168.0.11"}){JSONObject bad=copy(raw).put("address",value);reject(()->new NodeConnectionProfile(bad));}groups++;
        for(String value:new String[]{"","x".repeat(33),"bad\nssid","é".repeat(17)}){JSONObject bad=copy(raw).put("ssid",value);reject(()->new NodeConnectionProfile(bad));}
        check(new NodeConnectionProfile(copy(raw).put("ssid","é".repeat(16))).ssid.length()==16);
        for(String value:new String[]{"short","x".repeat(64),"newline\nsecret","é".repeat(10)}){JSONObject bad=copy(raw).put("password",value);reject(()->new NodeConnectionProfile(bad));}groups++;
        JSONObject wrongPin=copy(raw).put("nodePin","F".repeat(64));reject(()->new NodeConnectionProfile(wrongPin));
        JSONObject other=profile();JSONObject wrongKey=copy(raw).put("nodePublicKey",other.getString("nodePublicKey"));reject(()->new NodeConnectionProfile(wrongKey));
        JSONObject broken=copy(raw).put("nodePublicKey","00".repeat(91));reject(()->new NodeConnectionProfile(broken));groups++;
        groups++;long lost=100000,now=160000;String ssid="Fixture-node",bssid="02:44:00:00:00:01";
        check(NodeRecoveryScan.matches(ssid,valid.bssid,lost,now,ssid,bssid,106000000));
        check(!NodeRecoveryScan.matches(ssid,valid.bssid,lost,now,ssid,bssid,lost*1000));
        check(!NodeRecoveryScan.matches(ssid,valid.bssid,lost,now,ssid,bssid,99000000));
        check(!NodeRecoveryScan.matches(ssid,valid.bssid,lost,200001,ssid,bssid,110000000));
        check(!NodeRecoveryScan.matches(ssid,valid.bssid,lost,now,ssid,bssid,160001000));
        check(!NodeRecoveryScan.matches(ssid,valid.bssid,lost,now,"Other-node",bssid,150000000));
        check(!NodeRecoveryScan.matches(ssid,valid.bssid,lost,now,ssid,"02:44:00:00:00:02",150000000));
        check(!NodeRecoveryScan.matches(ssid,valid.bssid,lost,now,ssid,"024400000001",150000000));
        check(!NodeRecoveryScan.matches(ssid,valid.bssid,lost,now,ssid,bssid,0));
        System.out.print("{\"status\":\"passed\",\"testCount\":"+groups+",\"assertionCount\":"+checks+"}");
    }
}
