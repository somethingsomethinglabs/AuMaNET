package au.aumanet.app;

import org.junit.Test;
import static org.junit.Assert.*;

public class VoicePreferencesTest {
    @Test public void documentedBoundariesSelectActualNativeModes() {
        assertEquals("low", VoicePreferences.profileKey(0));
        assertEquals("low", VoicePreferences.profileKey(33));
        assertEquals(3, VoicePreferences.profile(33).gmmMode);
        assertEquals("balanced", VoicePreferences.profileKey(34));
        assertEquals("balanced", VoicePreferences.profileKey(66));
        assertEquals(2, VoicePreferences.profile(66).gmmMode);
        assertEquals("high", VoicePreferences.profileKey(67));
        assertEquals("high", VoicePreferences.profileKey(100));
        assertEquals(0, VoicePreferences.profile(100).gmmMode);
    }
    @Test public void wrongSavedTypesAndOutOfRangeValuesRepairToSafeDefault() {
        for (Object saved : new Object[]{null,"100",100.0,Long.valueOf(100),Boolean.TRUE,-1,101,Integer.MAX_VALUE})
            assertEquals(50, VoicePreferences.restoreSensitivity(saved));
        assertEquals(0, VoicePreferences.restoreSensitivity(0));
        assertEquals(100, VoicePreferences.restoreSensitivity(100));
        assertThrows(IllegalArgumentException.class, () -> VoicePreferences.validateSensitivity(-1));
        assertThrows(IllegalArgumentException.class, () -> VoicePreferences.profile(101));
    }
}
