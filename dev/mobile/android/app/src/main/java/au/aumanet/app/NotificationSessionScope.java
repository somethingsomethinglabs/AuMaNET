package au.aumanet.app;

/** Notification actions belong to one native owner, never whichever session is current later. */
final class NotificationSessionScope {
    private NotificationSessionScope() {}

    static boolean matches(String currentOwner, long currentGeneration, String suppliedOwner, long suppliedGeneration) {
        return currentOwner != null && !currentOwner.isEmpty() && currentOwner.length() <= 128
            && currentGeneration >= 0 && currentOwner.equals(suppliedOwner) && currentGeneration == suppliedGeneration;
    }
}
