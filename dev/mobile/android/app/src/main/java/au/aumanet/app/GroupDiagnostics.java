package au.aumanet.app;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.Set;

/** Exception metadata only. Never pass application frames, invitations, SDP or fixes here. */
final class GroupDiagnostics {
    static JSONArray causes(Throwable failure) {
        JSONArray result = new JSONArray();
        Set<Throwable> seen = Collections.newSetFromMap(new IdentityHashMap<>());
        try {
            for (Throwable current = failure; current != null && seen.add(current) && result.length() < 8; current = current.getCause()) {
                String message = current.getMessage();
                if (message == null) message = "";
                message = message.replaceAll("[\\r\\n\\t]", " ")
                    .replaceAll("aumanet://join/[A-Za-z0-9_-]+", "[invitation removed]")
                    .replaceAll("(?i)[a-f0-9]{64,}", "[long hex removed]")
                    .replaceAll("[-+]?[0-9]{1,3}\\.[0-9]{5,}", "[precise number removed]");
                if (message.contains("a=ice-") || message.contains("m=audio") || message.contains("v=0")) message = "[media description removed]";
                if (message.length() > 480) message = message.substring(0,480);
                result.put(new JSONObject().put("class", current.getClass().getName()).put("message", message));
            }
        } catch (Exception ignored) { /* Diagnostic failure must not alter authentication. */ }
        return result;
    }
}
