package au.aumanet.app;

import org.junit.Test;
import static org.junit.Assert.*;
import java.io.*;

/** Pure native protocol negatives; TLS identity/handshake is separately a physical gate. */
public class GroupWireTest {
    @Test public void inviteRejectsWrongTokenExpiredAndReplay() {
        GroupWire.Invite invite=new GroupWire.Invite(1000);
        assertFalse(invite.consume("f".repeat(64),1001));assertTrue(invite.available(1001));
        assertTrue(invite.consume(invite.token,1002));assertFalse(invite.consume(invite.token,1003));
        GroupWire.Invite expired=new GroupWire.Invite(1000);assertFalse(expired.consume(expired.token,301000));
        assertFalse(GroupWire.equal("AB".repeat(32),"AC".repeat(32)));
    }
    @Test public void wrongGroupConnectionSequenceAndEpochCannotAuthorizeFrames() {
        String group="a".repeat(32),connection="b".repeat(32);GroupWire.Sequence sequence=new GroupWire.Sequence(group,connection);
        sequence.accept(group,connection,1);
        assertThrows(IllegalArgumentException.class,()->sequence.accept(group,connection,1));
        assertThrows(IllegalArgumentException.class,()->sequence.accept(group,connection,3));
        assertThrows(IllegalArgumentException.class,()->sequence.accept("c".repeat(32),connection,2));
        assertThrows(IllegalArgumentException.class,()->sequence.accept(group,"c".repeat(32),2));
        sequence.accept(group,connection,2);GroupWire.requireEpoch(3,3);
        assertThrows(IllegalArgumentException.class,()->GroupWire.requireEpoch(3,2));
        assertThrows(IllegalArgumentException.class,()->GroupWire.requireEpoch(3,4));
    }
    @Test public void boundedFramesRejectOversizeTruncationAndMalformedUtf8() throws Exception {
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();GroupWire.write(new DataOutputStream(bytes),"{\"ok\":true}");
        assertEquals("{\"ok\":true}",GroupWire.read(new DataInputStream(new ByteArrayInputStream(bytes.toByteArray()))));
        ByteArrayOutputStream oversize=new ByteArrayOutputStream();new DataOutputStream(oversize).writeInt(GroupWire.MAX_BYTES+1);
        assertThrows(IOException.class,()->GroupWire.read(new DataInputStream(new ByteArrayInputStream(oversize.toByteArray()))));
        assertThrows(IOException.class,()->GroupWire.read(new DataInputStream(new ByteArrayInputStream(new byte[]{0,0,0,2,1}))));
        assertThrows(IOException.class,()->GroupWire.read(new DataInputStream(new ByteArrayInputStream(new byte[]{0,0,0,2,(byte)0xC3,0x28}))));
    }
    @Test public void endpointCannotSelectPublicLoopbackHostnamesOrAmbiguousAddresses() {
        assertEquals("192.168.0.101",GroupWire.privateIPv4("192.168.0.101"));assertEquals("10.1.2.3",GroupWire.privateIPv4("10.1.2.3"));
        for(String value:new String[]{"8.8.8.8","127.0.0.1","localhost","192.168.0.999","192.168.00.1","192.168.0.1/../../secret","::1","169.254.1.1"})
            assertThrows(IllegalArgumentException.class,()->GroupWire.privateIPv4(value));
    }
}
