package au.aumanet.app;

import java.util.concurrent.CompletableFuture;
import org.json.JSONObject;
import static au.aumanet.app.GroupRadioDispatchFixture.*;

/** Exercises the production radio dispatch from the authenticated envelope through controller admission. */
public final class GroupRadioDispatchTest {
    private static final String OP = GatewayRadioSettingsTest.TX;
    private static int cases, assertions;

    private static void check(boolean value, String description) {
        assertions++;
        if (!value) throw new AssertionError(description);
    }

    private static GroupRadioDispatchFixture host() {
        SystemClock.now = 100;
        return new GroupRadioDispatchFixture();
    }

    private static JSONObject request(JSONObject status, String action, String operation) {
        return new JSONObject().put("type", GroupRadioControl.REQUEST).put("epoch", 1)
            .put("requestId", GroupWire.random(16)).put("checkpointToken", status.getString("checkpointToken"))
            .put("operationId", operation).put("optionId", 22).put("action", action);
    }

    private static void dispatch(GroupRadioDispatchFixture host, Peer member, JSONObject request) throws Exception {
        host.feed(member, request);
        host.timer.drain();
    }

    private static void runWorker(GroupRadioDispatchFixture host) {
        check(host.controller.work.size() == 1, "one admitted worker expected");
        host.controller.work.removeFirst().run();
    }

    private static void expectProtocolRejection(GroupRadioDispatchFixture host, Peer peer, String group,
                                                String connection, long sequence, JSONObject frame) throws Exception {
        try {
            host.framed(peer, group, connection, sequence, frame);
            throw new AssertionError("expected envelope rejection");
        } catch (IllegalArgumentException rejected) {
            assertions++;
        }
    }

    private static void approvedMemberChangesOnce() throws Exception {
        cases++;
        var host = host();
        Peer member = host.connect(MEMBER);
        JSONObject change = request(host.offer(member), "apply", OP);
        dispatch(host, member, change);
        check(member.outbox.get(0).getString("result").isEmpty(), "approved request admitted");
        expectProtocolRejection(host, member, GROUP, member.connection, member.sent, change);
        dispatch(host, member, change);
        check(member.outbox.get(1).getString("result").equals("RADIO_CHANGE_NOT_ACCEPTED"), "duplicate request ID denied");
        runWorker(host);
        check(host.controller.trials == 1 && host.controller.commits == 1, "one trial and one commit");
        check(host.controller.state.equals("applied"), "signed outcome confirmed");
        dispatch(host, member, request(host.offer(member), "apply", OP));
        check(host.controller.work.isEmpty(), "same operation ID with new request ID cannot create another worker");
    }

    private static void unauthorizedOrWrongEnvelope() throws Exception {
        cases++;
        var host = host();
        Peer member = host.connect(MEMBER);
        Peer other = host.connect(OTHER);
        JSONObject change = request(host.offer(member), "apply", OP);
        expectProtocolRejection(host, member, "f".repeat(32), member.connection, 1, change);
        expectProtocolRejection(host, member, GROUP, other.connection, 1, change);
        dispatch(host, other, change);
        check(host.controller.work.isEmpty(), "checkpoint cannot be used by another approved peer");
        dispatch(host, member, new JSONObject(change.toString()).put("epoch", 2));
        check(host.controller.work.isEmpty(), "wrong epoch denied");
        member.authorized = false;
        dispatch(host, member, change);
        check(host.controller.work.isEmpty(), "unapproved connection denied");
        member.authorized = true;
        host.members.remove(MEMBER);
        dispatch(host, member, change);
        check(host.controller.work.isEmpty(), "removed member denied");
    }

    private static void staleOrReplacedHostCheckpoint() throws Exception {
        cases++;
        var host = host();
        Peer member = host.connect(MEMBER);
        JSONObject expired = request(host.offer(member), "apply", OP);
        SystemClock.now += GroupRadioControl.STATUS_MS;
        dispatch(host, member, expired);
        check(host.controller.work.isEmpty(), "expired checkpoint denied");
        JSONObject fresh = request(host.offer(member), "apply", OP);
        GatewayRadioOperationHarness replacement = new GatewayRadioOperationHarness();
        replacement.process = "20000000-0000-0000-0000-000000000000";
        host.applicationContext.host = replacement;
        dispatch(host, member, fresh);
        check(replacement.work.isEmpty(), "checkpoint for a replaced host process denied");
    }

    private static void replacementWhileQueued() throws Exception {
        cases++;
        var host = host();
        Peer member = host.connect(MEMBER);
        JSONObject change = request(host.offer(member), "apply", OP);
        host.feed(member, change);
        host.connect(MEMBER);
        host.timer.drain();
        check(host.controller.work.isEmpty(), "replaced requester before dispatch denied");

        var disconnected = host();
        Peer peer = disconnected.connect(MEMBER);
        disconnected.feed(peer, request(disconnected.offer(peer), "apply", OP));
        disconnected.controller.allowed = false;
        disconnected.timer.drain();
        check(disconnected.controller.work.isEmpty(), "host disconnect before dispatch denied");
    }

    private static void disconnectAfterAdmission() throws Exception {
        cases++;
        var host = host();
        Peer member = host.connect(MEMBER);
        dispatch(host, member, request(host.offer(member), "apply", OP));
        member.closed.set(true);
        host.connect(MEMBER);
        runWorker(host);
        check(host.controller.trials == 0 && host.controller.commits == 0, "replacement cannot inherit admitted operation");
        check(host.controller.state.equals("failed"), "readback reports trial never started");
    }

    private static void requesterReplacedAfterTrial() throws Exception {
        cases++;
        var host = host();
        Peer member = host.connect(MEMBER);
        dispatch(host, member, request(host.offer(member), "apply", OP));
        host.controller.onTrial = () -> host.connect(MEMBER);
        runWorker(host);
        check(host.controller.state.equals("unknown"), "the active trial needs fresh outcome readback");
        check(host.controller.trials == 1 && host.controller.commits == 0, "no commit after the approving connection changes");
    }

    private static void lostOrLateReplyDoesNotReplay() throws Exception {
        cases++;
        var host = host();
        Peer requester = host.connect(MEMBER);
        var member = new GroupRadioDispatchFixture();
        member.role = "member";
        member.controller.scope.self = MEMBER;
        Peer connection = member.connect(OWNER);
        member.ownerConnection = connection;
        member.feed(connection, new JSONObject().put("type", "heartbeat").put("epoch", 1)
            .put("radioControl", host.offer(requester)));
        CompletableFuture<String> pending = member.requestRadio(member.internetScope(), "apply", OP, 22);
        check(connection.outbox.size() == 1 && !pending.isDone(), "member issues a single request");
        dispatch(host, requester, connection.outbox.get(0).put("epoch", 1));
        JSONObject reply = requester.outbox.get(0).put("epoch", 1);
        runWorker(host);
        Peer fakeOwner = member.connect(OWNER);
        member.feed(fakeOwner, reply);
        member.feed(connection, new JSONObject(reply.toString()).put("epoch", 2));
        member.feed(connection, new JSONObject(reply.toString()).put("requestId", GroupWire.random(16)));
        member.timer.drain();
        check(!pending.isDone(), "wrong peer, epoch and request cannot resolve pending reply");
        member.ownerConnection = fakeOwner;
        connection.closed.set(true);
        member.timer.delayed.removeFirst().run();
        check(pending.join().equals("RADIO_HOST_NO_REPLY"), "lost reply remains uncertain");
        member.feed(fakeOwner, reply);
        member.timer.drain();
        check(pending.join().equals("RADIO_HOST_NO_REPLY"), "late reply cannot replace timeout");
        check(connection.outbox.size() == 1 && fakeOwner.outbox.isEmpty(), "timeout or replacement never retries");
        check(host.controller.trials == 1 && host.controller.commits == 1, "lost reply does not replay the host mutation");

        member.feed(fakeOwner, new JSONObject().put("type", "heartbeat").put("epoch", 1)
            .put("radioControl", host.offer(requester)));
        CompletableFuture<String> refresh = member.requestRadio(member.internetScope(), "refresh", "", 0);
        member.feed(fakeOwner, reply);
        member.timer.drain();
        check(!refresh.isDone(), "previous reply cannot resolve a new explicit refresh");
        dispatch(host, requester, fakeOwner.outbox.get(0).put("epoch", 1));
        member.feed(fakeOwner, requester.outbox.get(1).put("epoch", 1));
        member.timer.drain();
        check(refresh.join().isEmpty(), "matching owner reply resolves the explicit refresh");
    }

    private static void unknownOutcomeAllowsOnlyReadback() throws Exception {
        cases++;
        var host = host();
        Peer member = host.connect(MEMBER);
        host.controller.unknownCommit = true;
        dispatch(host, member, request(host.offer(member), "apply", OP));
        runWorker(host);
        check(host.controller.state.equals("unknown"), "lost commit confirmation is unknown");
        check(host.controller.trials == 1 && host.controller.commits == 1, "only one try before uncertainty");
        dispatch(host, member, request(host.offer(member), "apply", "f".repeat(32)));
        check(host.controller.work.isEmpty(), "new operation blocked while outcome is unknown");
        dispatch(host, member, request(host.offer(member), "refresh", ""));
        int priorQueries = host.controller.queries;
        runWorker(host);
        check(host.controller.queries > priorQueries, "refresh requested a new readback");
        check(host.controller.trials == 1 && host.controller.commits == 1, "read-only recovery issued no radio command");
    }

    private static void cancellationStaysWithRequester() throws Exception {
        cases++;
        var host = host();
        Peer requester = host.connect(MEMBER);
        Peer other = host.connect(OTHER);
        dispatch(host, requester, request(host.offer(requester), "apply", OP));
        dispatch(host, other, request(host.offer(other), "cancel", OP));
        check(!host.controller.active.get().cancelled.get(), "other approved member cannot cancel an operation they did not start");
        dispatch(host, requester, request(host.offer(requester), "cancel", OP));
        check(host.controller.active.get().cancelled.get(), "originating member can cancel their operation");
        runWorker(host);
        check(host.controller.trials == 0 && host.controller.commits == 0, "cancellation stopped the worker");
    }

    public static void main(String[] args) throws Exception {
        approvedMemberChangesOnce();
        unauthorizedOrWrongEnvelope();
        staleOrReplacedHostCheckpoint();
        replacementWhileQueued();
        disconnectAfterAdmission();
        requesterReplacedAfterTrial();
        lostOrLateReplyDoesNotReplay();
        unknownOutcomeAllowsOnlyReadback();
        cancellationStaysWithRequester();
        System.out.println(new JSONObject().put("testCount", cases).put("assertionCount", assertions));
    }
}
