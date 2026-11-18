package au.aumanet.app;

import java.util.concurrent.CompletableFuture;
import org.json.JSONObject;

/** Radio control over the authenticated, epoch-scoped group connection. */
final class GroupRadioControl {
    static final long STATUS_MS = 12000;
    static final long REQUEST_MS = 6000;
    static final String REQUEST = "radio-control-request";
    static final String REPLY = "radio-control-reply";

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
