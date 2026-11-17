package au.aumanet.app;

import org.junit.Test;
import static org.junit.Assert.*;

public class DiagnosticMetadataTest {
    @Test public void actualSemverAndDevelopmentVersionsAreAccepted(){assertTrue(DiagnosticMetadata.appAvailable("0.1.0",1));assertTrue(DiagnosticMetadata.safeVersion("1.2.3-rc.2"));assertTrue(DiagnosticMetadata.safeVersion("0.0.0"));}
    @Test public void unboundedVersionsSecretsNamesPathsAddressesAndControlTextAreUnavailable(){
        for(String value:new String[]{"Rowan phone","10.20.30.40","C:\\Users\\rowan\\secret","https://example.test","0.1.0\nprivate","A".repeat(64),"0.1.0-secret","1.2"})assertFalse(value,DiagnosticMetadata.safeVersion(value));
        assertFalse(DiagnosticMetadata.safeVersion(null));assertFalse(DiagnosticMetadata.appAvailable("0.1.0",-1));assertFalse(DiagnosticMetadata.appAvailable("0.1.0",Long.MAX_VALUE));
    }
    @Test public void zeroFreeSpaceIsMeasuredButInvalidOrOverflowingTotalsAreUnavailable(){
        assertTrue(DiagnosticMetadata.volumeAvailable(0,1024));assertTrue(DiagnosticMetadata.volumeAvailable(1024,1024));
        assertFalse(DiagnosticMetadata.volumeAvailable(-1,1024));assertFalse(DiagnosticMetadata.volumeAvailable(1,0));assertFalse(DiagnosticMetadata.volumeAvailable(1025,1024));assertFalse(DiagnosticMetadata.volumeAvailable(0,Long.MAX_VALUE));
    }
}
