package au.aumanet.app;

import java.math.BigInteger;
import java.nio.*;
import java.security.*;
import java.security.spec.X509EncodedKeySpec;
import java.util.*;

/** Frozen BOOT-RECOVERY.md wire contract; no network, clock mutation or trust-on-first-use. */
final class GatewayBootCodec {
    static final int QUERY=136,PROOF=232,TIME=224,ACK=224,MAX_FRAME=321;
    static final long WINDOW_MS=5000,UPPER_MS=10000,MAX_AHEAD_MS=16000;
    private static final BigInteger ORDER=new BigInteger("ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551",16);
    static final class Message {
        final char kind;final String target,group,owner,relay,challenge,run,nodeChallenge,digest;final long epoch,clock;final int clockState;final String signalPeer;final int signalStatus,signalRole,signalRssi;final long signalReadAge;
        private final byte[] body;
        private Message(byte[] raw){
            body=raw.clone();kind=(char)raw[5];target=lower(raw,16,16);group=lower(raw,32,16);epoch=number(raw,48);owner=hex(raw,56,32);relay=lower(raw,88,16);challenge=hex(raw,104,32);
            run=kind=='Q'||kind=='G'?"":lower(raw,136,16);nodeChallenge=kind=='Q'||kind=='G'||kind=='H'?"":hex(raw,152,32);
            signalPeer=kind=='H'?lower(raw,152,16):"";signalStatus=kind=='H'?raw[168]&255:-1;signalRole=kind=='H'?raw[169]&255:-1;signalRssi=kind=='H'?ByteBuffer.wrap(raw).getInt(176):0;signalReadAge=kind=='H'?number(raw,184):0;
            clockState=kind=='R'?(raw[184]&255):-1;clock=kind=='R'?number(raw,192):kind=='T'||kind=='A'?number(raw,216):0;
            digest=kind=='R'?hex(raw,200,32):kind=='T'||kind=='A'?hex(raw,184,32):"";
        }
        byte[] body(){return body.clone();}String sha256(){return hash(body);}
    }
    static final class Frame {
        final Message message;private final byte[] signature;
        private Frame(Message message,byte[] signature){this.message=message;this.signature=signature.clone();}
        boolean verify(PublicKey key)throws Exception{GatewayPublicKeyPolicy.checked(key);Signature verifier=Signature.getInstance("SHA256withECDSA");verifier.initVerify(key);verifier.update(message.body);return verifier.verify(signature);}
    }
    static Message parse(byte[] raw){
        if(raw==null||raw.length<QUERY||raw[0]!='A'||raw[1]!='U'||raw[2]!='G'||raw[3]!='W'||raw[4]!='B'||raw[6]!='1'||raw[7]!=0||raw[8]!=1)throw invalid();
        char kind=(char)raw[5];int length=kind=='Q'||kind=='G'?QUERY:kind=='R'?PROOF:kind=='T'?TIME:kind=='A'||kind=='H'?ACK:0;if(length==0||raw.length!=length)throw invalid();
        zero(raw,9,7);nonzero(raw,16,16);nonzero(raw,32,16);nonzero(raw,56,32);nonzero(raw,88,16);nonzero(raw,104,32);
        long epoch=number(raw,48);if(epoch<1)throw invalid();
        if(kind!='Q'&&kind!='G'){nonzero(raw,136,16);if(kind!='H')nonzero(raw,152,32);}
        if(kind=='H'){nonzero(raw,152,16);int state=raw[168]&255,role=raw[169]&255,rssi=ByteBuffer.wrap(raw).getInt(176);if(state>2||role>1||state==0&&(role!=1||rssi < -127||rssi >= 0)||state!=0&&rssi!=0)throw invalid();zero(raw,170,6);zero(raw,180,4);number(raw,184);zero(raw,192,32);}
        if(kind=='R'){
            int state=raw[184]&255;if(state>2)throw invalid();zero(raw,185,7);long clock=number(raw,192);
            if(state==0){if(clock!=0)throw invalid();zero(raw,200,32);}else{if(clock<1)throw invalid();if(state==1)nonzero(raw,200,32);else zero(raw,200,32);}
        }else if(kind=='T'||kind=='A'){nonzero(raw,184,32);if(number(raw,216)<1||kind=='T'&&number(raw,216)>GroupNamePolicy.MAX_REVISION-UPPER_MS-1000)throw invalid();if(kind=='A'&&number(raw,216)%1000!=0)throw invalid();}
        return new Message(raw);
    }
    static Message signalQuery(String target,String group,long epoch,String owner,String relay,String challenge){return parse(prefix('G',QUERY,target,group,epoch,owner,relay,challenge));}
    static Message query(String target,String group,long epoch,String owner,String relay,String challenge){return parse(prefix('Q',QUERY,target,group,epoch,owner,relay,challenge));}
    static Message time(Message proof,long wall){if(proof.kind!='R'||proof.clockState!=0||wall<1||wall>GroupNamePolicy.MAX_REVISION-UPPER_MS-1000)throw invalid();byte[] raw=prefix('T',TIME,proof.target,proof.group,proof.epoch,proof.owner,proof.relay,proof.challenge);put(raw,136,GatewayGrantCodec.identifier(proof.run));put(raw,152,bytes(proof.nodeChallenge,32));put(raw,184,bytes(proof.sha256(),32));ByteBuffer.wrap(raw).putLong(216,wall);return parse(raw);}
    static long upper(long wall){if(wall<1||wall>GroupNamePolicy.MAX_REVISION-UPPER_MS-1000)throw invalid();return((wall+UPPER_MS+999)/1000)*1000;}
    static byte[] envelope(Message body,byte[] signature){strictSignature(signature);return ByteBuffer.allocate(17+body.body.length+signature.length).put(GatewayGrantCodec.identifier(body.target)).put(body.body).put((byte)signature.length).put(signature).array();}
    static Frame frame(byte[] data,int length){
        if(data==null||length<161||length>MAX_FRAME||length>data.length)throw invalid();byte[] frame=Arrays.copyOf(data,length);if(frame[16]!='A'||frame[21]!='Q'&&frame[21]!='R'&&frame[21]!='T'&&frame[21]!='A'&&frame[21]!='G'&&frame[21]!='H')throw invalid();
        int size=frame[21]=='Q'||frame[21]=='G'?QUERY:frame[21]=='R'?PROOF:TIME;if(length<17+size+8)throw invalid();int signatureLength=frame[16+size]&255;if(length!=17+size+signatureLength)throw invalid();
        Message message=parse(Arrays.copyOfRange(frame,16,16+size));if(!message.target.equals(lower(frame,0,16)))throw invalid();byte[] signature=Arrays.copyOfRange(frame,17+size,length);strictSignature(signature);return new Frame(message,signature);
    }
    static PublicKey nodeKey(String derHex,String pin)throws Exception{
        if(derHex==null||!derHex.matches("[A-F0-9]{182}")||!GroupWire.pin(pin))throw invalid();byte[] der=bytes(derHex,91);if(!hash(der).equals(pin))throw new SecurityException("Pinned gateway node key differs");PublicKey key=KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(der));if(!Arrays.equals(der,GatewayPublicKeyPolicy.checked(key)))throw invalid();return key;
    }
    static boolean scopedOwner(byte[] raw,String group,long epoch,String target,String owner){try{Message message=parse(raw);return(message.kind=='Q'||message.kind=='T'||message.kind=='G')&&message.group.equals(group)&&message.epoch==epoch&&message.target.equals(target)&&message.owner.equals(owner);}catch(RuntimeException malformed){return false;}}
    static boolean sameCommon(Message a,Message b){return a.target.equals(b.target)&&a.group.equals(b.group)&&a.epoch==b.epoch&&a.owner.equals(b.owner)&&a.relay.equals(b.relay)&&a.challenge.equals(b.challenge);}
    static String hash(byte[] value){try{return GroupWire.hex(MessageDigest.getInstance("SHA-256").digest(value));}catch(NoSuchAlgorithmException impossible){throw new IllegalStateException("SHA-256 unavailable");}}
    static byte[] bytes(String hex,int count){if(hex==null||!hex.matches("[A-F0-9]{"+(count*2)+"}"))throw invalid();byte[] out=new byte[count];for(int i=0;i<count;i++)out[i]=(byte)Integer.parseInt(hex.substring(i*2,i*2+2),16);return out;}
    private static byte[] prefix(char kind,int length,String target,String group,long epoch,String owner,String relay,String challenge){
        if(epoch<1||epoch>GroupNamePolicy.MAX_REVISION)throw invalid();byte[] body=new byte[length];put(body,0,new byte[]{'A','U','G','W','B',(byte)kind,'1',0,1});put(body,16,GatewayGrantCodec.identifier(target));put(body,32,GatewayGrantCodec.identifier(group));ByteBuffer.wrap(body).putLong(48,epoch);put(body,56,bytes(owner,32));put(body,88,GatewayGrantCodec.identifier(relay));put(body,104,bytes(challenge,32));return body;
    }
    private static long number(byte[] raw,int offset){long n=ByteBuffer.wrap(raw).getLong(offset);if(n<0||n>GroupNamePolicy.MAX_REVISION)throw invalid();return n;}
    private static String hex(byte[] raw,int offset,int count){return GroupWire.hex(Arrays.copyOfRange(raw,offset,offset+count));}private static String lower(byte[] raw,int offset,int count){return hex(raw,offset,count).toLowerCase(Locale.ROOT);}
    private static void put(byte[] to,int at,byte[] from){System.arraycopy(from,0,to,at,from.length);}private static void zero(byte[] raw,int at,int count){for(int i=at;i<at+count;i++)if(raw[i]!=0)throw invalid();}private static void nonzero(byte[] raw,int at,int count){for(int i=at;i<at+count;i++)if(raw[i]!=0)return;throw invalid();}
    private static void strictSignature(byte[] signature){
        if(signature==null||signature.length<8||signature.length>72||signature[0]!=0x30||(signature[1]&255)!=signature.length-2)throw invalid();int offset=2;
        for(int i=0;i<2;i++){if(offset+2>signature.length||signature[offset++]!=2)throw invalid();int size=signature[offset++]&255;if(size<1||size>33||offset+size>signature.length||(signature[offset]&128)!=0||size>1&&signature[offset]==0&&(signature[offset+1]&128)==0)throw invalid();BigInteger scalar=new BigInteger(1,Arrays.copyOfRange(signature,offset,offset+size));if(scalar.signum()==0||scalar.compareTo(ORDER)>=0)throw invalid();offset+=size;}if(offset!=signature.length)throw invalid();
    }
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("Malformed gateway boot control");}
    private GatewayBootCodec(){}
}
