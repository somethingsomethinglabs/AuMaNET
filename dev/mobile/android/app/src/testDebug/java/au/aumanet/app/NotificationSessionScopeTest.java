package au.aumanet.app;

import org.junit.Test;
import static org.junit.Assert.*;

public class NotificationSessionScopeTest {
    @Test public void exactLiveActionIsAccepted() {
        assertTrue(NotificationSessionScope.matches("voice-session", 8, "voice-session", 8));
        assertTrue(NotificationSessionScope.matches("location-request", 0, "location-request", 0));
    }
    @Test public void oldActionCannotControlAReplacementOwnerOrGeneration() {
        assertFalse(NotificationSessionScope.matches("new-session", 9, "old-session", 8));
        assertFalse(NotificationSessionScope.matches("same-session", 9, "same-session", 8));
        assertFalse(NotificationSessionScope.matches("location-new-request", 2, "location-old-request", 2));
    }
    @Test public void unscopedAndMalformedActionsAreRejected() {
        assertFalse(NotificationSessionScope.matches("current", 1, null, -1));
        assertFalse(NotificationSessionScope.matches("current", 1, "current", -1));
        assertFalse(NotificationSessionScope.matches(null, 1, null, 1));
        assertFalse(NotificationSessionScope.matches("", 1, "", 1));
        assertFalse(NotificationSessionScope.matches("current", -1, "current", -1));
        assertFalse(NotificationSessionScope.matches("x".repeat(129), 1, "x".repeat(129), 1));
    }
}
