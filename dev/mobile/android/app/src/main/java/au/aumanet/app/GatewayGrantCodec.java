package au.aumanet.app;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Arrays;

/** Exact AUGW1 local-radio binding contract. Donation is deliberately not exposed here. */
final class GatewayGrantCodec {
    static final int BODY_BYTES=192, PORT=17778, LEASE_SECONDS=30;
    private static final byte[] DOMAIN={'A','U','G','W','1',0,0,0};
    private GatewayGrantCodec() {}

    static byte[] identifier(String value) {
        if(value==null||!value.matches("[a-f0-9]{32}")||value.matches("0{32}"))throw new IllegalArgumentException("Invalid gateway identifier");
        return decode(value);
    }
    static byte[] bind(String group,long epoch,String target,String run,long sequence,long issued,long expires,
        String attachment,String address,String mac,long generation,boolean remove) {
        byte[] groupId=identifier(group),targetId=identifier(target),runId=identifier(run),attachedId=identifier(attachment);
        if(epoch<1||sequence<1||issued<1||expires<=issued||expires-issued>LEASE_SECONDS||generation<1)throw new IllegalArgumentException("Invalid gateway lease bounds");
        if(address==null||!address.matches("10\\.77\\.0\\.(?:[1-9][0-9]{0,2})"))throw new IllegalArgumentException("Only an assigned group host address is allowed");
        int host=Integer.parseInt(address.substring(8));
        if(host<2||host>254)throw new IllegalArgumentException("Reserved gateway address");
        if(mac==null||!mac.matches("[a-f0-9]{12}"))throw new IllegalArgumentException("Expected a checked phone MAC");
        byte[] hardware=decode(mac);
        if((hardware[0]&1)!=0||Arrays.equals(hardware,new byte[6]))throw new IllegalArgumentException("Expected an individual phone MAC");
        boolean local=Arrays.equals(targetId,attachedId);
        ByteBuffer body=ByteBuffer.allocate(BODY_BYTES).order(ByteOrder.BIG_ENDIAN);
        body.put(DOMAIN).put((byte)(remove?2:1)).put((byte)(local?0:1));
        body.position(16);body.put(groupId).putLong(epoch).put(runId).putLong(sequence).putLong(issued).putLong(expires).put(attachedId);
        body.put(new byte[]{10,77,0,(byte)host}).put(hardware);
        body.position(112);body.putLong(generation).putLong(0);
        if(!local)body.put(attachedId);
        return body.array();
    }
    static byte[] routedBind(String group,long epoch,String target,String run,long sequence,long issued,long expires,String attachment,String address,String mac,long generation,boolean remove){
        long ip=ipv4(address);int host=(int)(ip&255);if(host<16||host>239)throw new IllegalArgumentException("Reserved routed client address");
        byte[] body=bind(group,epoch,target,run,sequence,issued,expires,attachment,"10.77.0."+host,mac,generation,remove);body[4]='2';ByteBuffer.wrap(body).putInt(96,(int)ip);return body;
    }
    static boolean scopedBinding(byte[] body,String group,long epoch,String target) {
        if(body==null||body.length!=BODY_BYTES||epoch<1)return false;
        try {
            ByteBuffer value=ByteBuffer.wrap(body).order(ByteOrder.BIG_ENDIAN);
            boolean routed=body[4]=='2';byte[] domain=DOMAIN.clone();if(routed)domain[4]='2';if(!Arrays.equals(Arrays.copyOf(body,8),domain)||body[8]!=1&&body[8]!=2||body[9]<0||body[9]>1)return false;
            if(!Arrays.equals(Arrays.copyOfRange(body,16,32),identifier(group))||value.getLong(32)!=epoch)return false;
            // Signing callers must provide canonical bindings, not arbitrary bytes
            // under the gateway signature domain. Re-encode and compare exactly.
            String attachment=hex(Arrays.copyOfRange(body,80,96));
            String address=routed?address(Integer.toUnsignedLong(value.getInt(96))):"10.77.0."+(body[99]&255);
            byte[] expected=routed?routedBind(group,epoch,target,hex(Arrays.copyOfRange(body,40,56)),value.getLong(56),value.getLong(64),value.getLong(72),attachment,address,hex(Arrays.copyOfRange(body,100,106)),value.getLong(112),body[8]==2):bind(group,epoch,target,hex(Arrays.copyOfRange(body,40,56)),value.getLong(56),value.getLong(64),value.getLong(72),attachment,address,hex(Arrays.copyOfRange(body,100,106)),value.getLong(112),body[8]==2);
            return Arrays.equals(expected,body);
        }catch(RuntimeException invalid){return false;}
    }
    static byte[] envelope(String target,byte[] body,byte[] signature) {
        byte[] node=identifier(target);
        if(body==null||body.length!=BODY_BYTES||signature==null||signature.length<8||signature.length>72)throw new IllegalArgumentException("Invalid signed gateway envelope");
        return ByteBuffer.allocate(209+signature.length).put(node).put(body).put((byte)signature.length).put(signature).array();
    }
    static long ipv4(String value){GroupWire.privateIPv4(value);long n=0;for(String part:value.split("\\."))n=(n<<8)|Integer.parseInt(part);return n;}
    static String address(long n){return ((n>>>24)&255)+"."+((n>>>16)&255)+"."+((n>>>8)&255)+"."+(n&255);}
    private static byte[] decode(String value) {
        byte[] bytes=new byte[value.length()/2];
        for(int i=0;i<bytes.length;i++)bytes[i]=(byte)Integer.parseInt(value.substring(i*2,i*2+2),16);
        return bytes;
    }
    private static String hex(byte[] value) {
        StringBuilder result=new StringBuilder(value.length*2);
        for(byte b:value)result.append(String.format(java.util.Locale.ROOT,"%02x",b&255));
        return result.toString();
    }
}
