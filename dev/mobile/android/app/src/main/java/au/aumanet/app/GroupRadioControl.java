package au.aumanet.app;

import java.util.concurrent.CompletableFuture;
import java.util.LinkedHashMap;
import org.json.JSONObject;

/** Radio control over the authenticated, epoch-scoped group connection. */
final class GroupRadioControl {
    static final int VERSION = 2;
    static final long STATUS_MS = 12000;
    static final long REQUEST_MS = 6000;
    static final String REQUEST = "radio-control-request";
    static final String REPLY = "radio-control-reply";
    private static final int MAX_CHECKPOINTS = 16;
    private static final int MAX_REQUESTS = 64;

    /** Host-issued tokens and request IDs live only on their authenticated connection. */
    static final class Requests {
        private final LinkedHashMap<String, Status> checkpoints = new LinkedHashMap<>();
        private final LinkedHashMap<String, Long> seen = new LinkedHashMap<>();

        String offer(Object connection, long epoch, long now, JSONObject checkpoint) {
            checkpoints.entrySet().removeIf(entry -> !entry.getValue().current(connection, epoch, now));
            if (checkpoints.size() >= MAX_CHECKPOINTS) checkpoints.remove(checkpoints.keySet().iterator().next());
            String token = GroupWire.random(16);
            checkpoints.put(token, new Status(connection, epoch, now, checkpoint));
            return token;
        }

        JSONObject admit(Object connection, long epoch, long now, String token, String requestId) {
            Status checkpoint = checkpoints.get(token);
            if (checkpoint == null || !checkpoint.current(connection, epoch, now) || !GroupWire.id(requestId)) return null;
            seen.entrySet().removeIf(entry -> now >= entry.getValue() && now - entry.getValue() >= STATUS_MS);
            if (seen.size() >= MAX_REQUESTS || seen.containsKey(requestId)) return null;
            seen.put(requestId, now);
            return checkpoint.value;
        }
    }

    static final class Status {
        final Object connection;
        final long epoch, receivedAt;
        final JSONObject value;

        Status(Object connection, long epoch, long receivedAt, JSONObject value) {
            this.connection = connection;
            this.epoch = epoch;
            this.receivedAt = receivedAt;
            this.value = value;
        }

        boolean current(Object peer, long currentEpoch, long now) {
            return peer == connection && epoch == currentEpoch && now >= receivedAt && now - receivedAt < STATUS_MS;
        }
    }

    static final class Pending {
        final Object connection;
        final long epoch;
        final String id;
        final CompletableFuture<String> reply = new CompletableFuture<>();

        Pending(Object connection, long epoch, String id) {
            this.connection = connection;
            this.epoch = epoch;
            this.id = id;
        }

        boolean matches(Object peer, long currentEpoch, String replyId) {
            return peer == connection && epoch == currentEpoch && id.equals(replyId);
        }
    }

    private GroupRadioControl() {}
}
