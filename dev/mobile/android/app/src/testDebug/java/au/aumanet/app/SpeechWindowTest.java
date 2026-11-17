package au.aumanet.app;

import org.junit.Test;
import static org.junit.Assert.*;

public class SpeechWindowTest {
    @Test public void isolatedDetectionsCannotAccumulateAcrossSilence() {
        SpeechWindow window = new SpeechWindow();
        for (int i = 0; i < 100; i++) {
            assertFalse(window.update(true, 10));
            assertFalse(window.update(false, 10));
        }
    }
    @Test public void speechOpensAtSixtyMillisecondsAndTailClosesAtTwoHundred() {
        SpeechWindow window = new SpeechWindow();
        for (int i = 0; i < 5; i++) assertFalse(window.update(true, 10));
        assertTrue(window.update(true, 10));
        for (int i = 0; i < 19; i++) assertTrue(window.update(false, 10));
        assertFalse(window.update(false, 10));
        assertFalse(window.active());
    }
    @Test public void resumedSpeechRestartsTailAndResetErasesOnsetAndTail() {
        SpeechWindow window = new SpeechWindow();
        for (int i = 0; i < 6; i++) window.update(true, 10);
        for (int i = 0; i < 19; i++) window.update(false, 10);
        assertTrue(window.update(true, 10));
        for (int i = 0; i < 19; i++) assertTrue(window.update(false, 10));
        window.reset(); assertFalse(window.active());
        assertFalse(window.update(true, 10));
        assertFalse(window.update(false, 10));
    }
    @Test public void invalidLargeFramesCannotArtificiallyConfirmSpeech() {
        SpeechWindow window = new SpeechWindow();
        assertThrows(IllegalArgumentException.class, () -> window.update(true, 1000));
        assertThrows(IllegalArgumentException.class, () -> window.update(true, 0));
        assertFalse(window.active());
    }
}
