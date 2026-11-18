package au.aumanet.app;

import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.*;

/** Local fixtures replace Android sockets and scheduling. The runner inserts production methods. */
final class GroupRadioDispatchFixture {
    static final String OWNER = GatewayRadioSettingsTest.OWNER;
    static final String MEMBER = "BB".repeat(32);
    static final String OTHER = "CC".repeat(32);
    static final String GROUP = GatewayRadioSettingsTest.GROUP;

    final Object lock = new Object();
    final GatewayRadioOperationHarness controller = new GatewayRadioOperationHarness();
    final GatewayRadioSettingsController applicationContext = new GatewayRadioSettingsController();
    final Map<String, Member> members = new HashMap<>();
    final Set<Peer> sockets = new HashSet<>();
    final Scheduler timer = new Scheduler();
    final String owner = OWNER;
    String role = "owner";
    long generation = 1;
    long epoch = 1;
    Peer ownerConnection;

    GroupRadioDispatchFixture() {
        applicationContext.host = controller;
        controller.scope.approved = Set.of(OWNER, MEMBER, OTHER);
        controller.scope.online = controller.scope.approved;
        controller.state = "idle";
    }

    static final class Scheduler {
        final Deque<Runnable> work = new ArrayDeque<>();
        final Deque<Runnable> delayed = new ArrayDeque<>();
        void execute(Runnable task) { work.addLast(task); }
        void schedule(Runnable task, long delay, TimeUnit unit) { delayed.addLast(task); }
        void drain() { while (!work.isEmpty()) work.removeFirst().run(); }
    }

    static final class Outbound {
        final JSONObject body;
        Outbound(JSONObject body, String attachment, long sequence) { this.body = body; }
    }

    static final class Member {
        boolean connected = true;
        Peer peer;
        Member(Peer peer) { this.peer = peer; }
    }

    static final class Peer {
        final String pin;
        final long run;
        final GroupWire.Sequence inbound;
        final GroupRadioControl.Requests radioRequests = new GroupRadioControl.Requests();
        final AtomicBoolean closed = new AtomicBoolean();
        final List<JSONObject> outbox = new ArrayList<>();
        final String connection = GroupWire.random(16);
        boolean authorized = true;
        boolean removalQueued;
        long sent;

        Peer(String pin, long run) {
            this.pin = pin;
            this.run = run;
            this.inbound = new GroupWire.Sequence(GROUP, connection);
        }

        void enqueue(Outbound frame, boolean closeIfFull) { outbox.add(frame.body); }
    }

    Peer connect(String pin) {
        Peer peer = new Peer(pin, generation);
        members.put(pin, new Member(peer));
        sockets.add(peer);
        return peer;
    }

    InternetSharingScope internetScope() { return controller.internetScope(); }
    boolean internetCurrent(InternetSharingScope scope) { return controller.internetCurrent(scope); }
    JSONObject heartbeat(Peer peer) throws Exception { return new JSONObject().put("type", "heartbeat"); }
    void receiveMaintenance(Peer peer, JSONObject message, Object controller) {}
    final Object radioMaintenance = new Object(), firmwareMaintenance = new Object();
    void receiveRadio(Peer peer, JSONObject message) {}
    void receiveRadioConfigurations(Peer peer, JSONObject message) {}
    void receiveInternet(Peer peer, JSONObject message) {}
    void receiveLinkBenchmark(Peer peer, JSONObject message) {}
    void receiveProfilePhotos(Peer peer, JSONObject message, long epoch) {}
    long number(JSONObject value,String key) throws Exception { return GroupNameMetadata.number(value,key); }

    void feed(Peer peer, JSONObject message) throws Exception {
        long sequence = ++peer.sent;
        framed(peer, GROUP, peer.connection, sequence, message);
    }

    void framed(Peer peer, String group, String connection, long sequence, JSONObject message) throws Exception {
        peer.inbound.accept(group, connection, sequence);
        receive(peer, message);
    }

    JSONObject offer(Peer peer) throws Exception {
        return advertiseRadioStatus(peer, controller.relayStatus(), epoch);
    }

    // PRODUCTION_RADIO_DISPATCH
}
