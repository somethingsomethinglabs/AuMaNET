package au.aumanet.app;

import org.junit.Test;
import static org.junit.Assert.*;
import java.nio.ByteBuffer;
import java.util.Arrays;

public class GatewayGrantCodecTest {
    private static final String GROUP="01".repeat(16),A="02".repeat(16),B="03".repeat(16),RUN="04".repeat(16);
    private byte[] body(String target){return GatewayGrantCodec.bind(GROUP,7,target,RUN,11,1000,1030,A,"10.77.0.10","021122334455",3,false);}
    @Test public void exactFirmwareOffsetsAndCanonicalReservedBytes() {
        byte[] local=body(A);ByteBuffer b=ByteBuffer.wrap(local);
        assertEquals(192,local.length);assertEquals("AUGW1",new String(local,0,5,java.nio.charset.StandardCharsets.US_ASCII));
        assertEquals(1,local[8]);assertEquals(0,local[9]);assertEquals(7,b.getLong(32));assertEquals(11,b.getLong(56));
        assertEquals(1000,b.getLong(64));assertEquals(1030,b.getLong(72));assertEquals(0x0a4d000a,b.getInt(96));
        assertEquals(3,b.getLong(112));assertEquals(0,b.getLong(120));assertArrayEquals(new byte[64],Arrays.copyOfRange(local,128,192));
        assertTrue(GatewayGrantCodec.scopedBinding(local,GROUP,7,A));
        byte[] remote=body(B);assertEquals(1,remote[9]);assertArrayEquals(GatewayGrantCodec.identifier(A),Arrays.copyOfRange(remote,128,144));
        assertArrayEquals(new byte[48],Arrays.copyOfRange(remote,144,192));assertTrue(GatewayGrantCodec.scopedBinding(remote,GROUP,7,B));
    }
    @Test public void signingRejectsScopeChangesDonationAndNoncanonicalInput() {
        byte[] good=body(B);assertFalse(GatewayGrantCodec.scopedBinding(good,GROUP,8,B));assertFalse(GatewayGrantCodec.scopedBinding(good,B,7,B));
        for(int offset:new int[]{0,5,8,9,10,16,32,40,56,64,72,80,96,97,98,99,100,106,112,120,128,144,191}){
            byte[] changed=good.clone();
            // Noncanonical/reserved mutation cases, or an explicitly invalid field.
            if(offset==8)changed[offset]=3;
            else if(offset==9)changed[offset]=4;
            else if(offset==99)changed[offset]=1;
            else if(offset==100)changed[offset]|=1;
            else if(offset==40||offset==56||offset==64||offset==72||offset==112)continue;
            else changed[offset]^=1;
            assertFalse("Noncanonical/scoped mutation at "+offset,GatewayGrantCodec.scopedBinding(changed,GROUP,7,B));
        }
        assertFalse(GatewayGrantCodec.scopedBinding(Arrays.copyOf(good,191),GROUP,7,B));
    }
    @Test public void invalidAddressesMacsAndLeaseBoundsNeverEncode() {
        for(String ip:new String[]{"10.77.0.0","10.77.0.1","10.77.0.255","10.77.0.010","10.78.0.10","8.8.8.8"})
            assertThrows(IllegalArgumentException.class,()->GatewayGrantCodec.bind(GROUP,7,A,RUN,1,1000,1030,A,ip,"021122334455",1,false));
        for(String mac:new String[]{"000000000000","031122334455","02112233445","02:11:22:33:44:55"})
            assertThrows(IllegalArgumentException.class,()->GatewayGrantCodec.bind(GROUP,7,A,RUN,1,1000,1030,A,"10.77.0.10",mac,1,false));
        for(long end:new long[]{999,1000,1031})assertThrows(IllegalArgumentException.class,()->GatewayGrantCodec.bind(GROUP,7,A,RUN,1,1000,end,A,"10.77.0.10","021122334455",1,false));
    }
    @Test public void withdrawalIsBindingOnlyAndEnvelopeHasAnExactLength() {
        byte[] remove=GatewayGrantCodec.bind(GROUP,7,A,RUN,12,1000,1030,A,"10.77.0.10","021122334455",3,true);
        assertEquals(2,remove[8]);assertTrue(GatewayGrantCodec.scopedBinding(remove,GROUP,7,A));
        byte[] signature=new byte[72],packet=GatewayGrantCodec.envelope(A,remove,signature);
        assertEquals(281,packet.length);assertArrayEquals(GatewayGrantCodec.identifier(A),Arrays.copyOf(packet,16));
        assertArrayEquals(remove,Arrays.copyOfRange(packet,16,208));assertEquals(72,packet[208]);
        assertThrows(IllegalArgumentException.class,()->GatewayGrantCodec.envelope(A,remove,new byte[73]));
    }
}
