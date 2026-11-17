package au.aumanet.app;

import java.math.BigInteger;
import java.security.*;
import java.security.interfaces.ECPublicKey;
import java.security.spec.*;
import java.util.Arrays;

/** Exact named-curve P-256 SPKI; accepting any 256-bit curve would be insufficient. */
final class GatewayPublicKeyPolicy {
    private static final byte[] PREFIX={0x30,0x59,0x30,0x13,0x06,0x07,0x2a,(byte)0x86,0x48,(byte)0xce,0x3d,0x02,0x01,0x06,0x08,0x2a,(byte)0x86,0x48,(byte)0xce,0x3d,0x03,0x01,0x07,0x03,0x42,0x00,0x04};
    static byte[] checked(PublicKey raw)throws Exception{
        if(!(raw instanceof ECPublicKey))throw new SecurityException("Expected P-256 gateway authority");ECPublicKey key=(ECPublicKey)raw;AlgorithmParameters algorithm=AlgorithmParameters.getInstance("EC");algorithm.init(new ECGenParameterSpec("secp256r1"));ECParameterSpec expected=algorithm.getParameterSpec(ECParameterSpec.class),actual=key.getParams();
        if(actual==null||!(actual.getCurve().getField() instanceof ECFieldFp)||!actual.getCurve().getField().equals(expected.getCurve().getField())||!actual.getCurve().getA().equals(expected.getCurve().getA())||!actual.getCurve().getB().equals(expected.getCurve().getB())||!actual.getGenerator().equals(expected.getGenerator())||!actual.getOrder().equals(expected.getOrder())||actual.getCofactor()!=expected.getCofactor())throw new SecurityException("Expected exact P-256 gateway curve parameters");
        byte[] der=key.getEncoded();if(der==null||der.length!=91||!Arrays.equals(PREFIX,Arrays.copyOf(der,PREFIX.length)))throw new SecurityException("Expected canonical named P-256 public SPKI");BigInteger x=new BigInteger(1,Arrays.copyOfRange(der,27,59)),y=new BigInteger(1,Arrays.copyOfRange(der,59,91)),p=((ECFieldFp)actual.getCurve().getField()).getP();
        if(!new ECPoint(x,y).equals(key.getW())||x.compareTo(p)>=0||y.compareTo(p)>=0||!y.multiply(y).mod(p).equals(x.multiply(x).multiply(x).add(actual.getCurve().getA().multiply(x)).add(actual.getCurve().getB()).mod(p)))throw new SecurityException("Invalid gateway public EC point");return der.clone();
    }
    private GatewayPublicKeyPolicy(){}
}
