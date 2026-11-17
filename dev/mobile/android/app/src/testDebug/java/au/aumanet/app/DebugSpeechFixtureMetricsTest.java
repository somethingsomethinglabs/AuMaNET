package au.aumanet.app;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import org.junit.Test;
import static org.junit.Assert.*;

/** Counter arithmetic uses injected decisions; this is not a native VAD score. */
public class DebugSpeechFixtureMetricsTest {
    @Test public void actualLicensedFixtureHasBoundedReferenceAndControlledSilence() throws Exception {
        DebugSpeechFixture fixture = DebugSpeechFixtureTest.fixture(DebugSpeechFixture.Id.CLEAN);
        DebugSpeechFixtureMetrics metrics = new DebugSpeechFixtureMetrics(DebugSpeechFixture.Id.CLEAN);
        ByteBuffer pcm = ByteBuffer.allocate(960).order(ByteOrder.LITTLE_ENDIAN);
        for (int index = 0; index < DebugSpeechFixture.TOTAL_FRAMES; index++) {
            assertTrue(fixture.replace(pcm,48000,1,960));
            boolean reference = fixture.speechSection();
            assertTrue(metrics.observe(index,reference,reference,pcm,960));
        }
        DebugSpeechFixtureMetrics.Summary summary = metrics.summary();
        assertTrue(summary.complete); assertEquals(592,summary.observedFrames);assertEquals(0,summary.rejectedObservations);
        assertEquals(50,summary.leading.observedFrames);assertEquals(492,summary.reference.observedFrames);assertEquals(50,summary.trailing.observedFrames);
        assertEquals(0,summary.leading.nonzeroOutputFrames);assertEquals(0,summary.trailing.nonzeroOutputFrames);
        assertTrue(summary.reference.nonzeroOutputFrames>0);assertTrue(summary.reference.nonzeroOutputFrames<=492);
        assertEquals(0,summary.closedGateNonzeroFrames);assertTrue(summary.outputRms>0);
        assertTrue(summary.firstReferenceOutputOffsetMs>=0&&summary.firstReferenceOutputOffsetMs<4920);
        assertEquals(-1,summary.lastTailOutputOffsetMs);fixture.close();
    }
    @Test public void nonsequentialAndMalformedObservationsCannotCreateCompleteResult() {
        DebugSpeechFixtureMetrics metrics = new DebugSpeechFixtureMetrics(DebugSpeechFixture.Id.SILENCE);
        ByteBuffer pcm = ByteBuffer.allocate(960);
        assertFalse(metrics.observe(1,false,false,pcm,960));assertTrue(metrics.observe(0,false,false,pcm,960));
        assertFalse(metrics.observe(0,false,false,pcm,960));assertFalse(metrics.observe(1,false,false,pcm,2));
        DebugSpeechFixtureMetrics.Summary summary = metrics.summary();
        assertFalse(summary.complete);assertEquals(1,summary.observedFrames);assertEquals(3,summary.rejectedObservations);
        assertEquals(1,summary.control.observedFrames);assertEquals(0,summary.reference.observedFrames);
    }
    @Test public void nonzeroClosedGateOutputIsReportedAsPrivacyViolation() {
        DebugSpeechFixtureMetrics metrics = new DebugSpeechFixtureMetrics(DebugSpeechFixture.Id.NOISE_ONLY);
        ByteBuffer pcm = ByteBuffer.allocate(320).order(ByteOrder.LITTLE_ENDIAN);pcm.putShort(0,(short)1000);
        assertTrue(metrics.observe(0,false,false,pcm,320));
        DebugSpeechFixtureMetrics.Summary summary=metrics.summary();
        assertEquals(1,summary.closedGateNonzeroFrames);assertEquals(1,summary.control.nonzeroOutputFrames);
        assertEquals(0,summary.control.openFrames);assertEquals(0,summary.control.detectedFrames);assertTrue(summary.outputRms>0);
        assertEquals(-1,summary.firstReferenceOutputOffsetMs);
    }
}
