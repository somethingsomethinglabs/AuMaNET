package au.aumanet.app;

import java.io.IOException;
import java.net.ConnectException;
import java.net.NoRouteToHostException;
import java.net.SocketTimeoutException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.IdentityHashMap;
import java.util.Set;
import javax.net.ssl.SSLException;

/** Debug observations only. No addresses, identities, exception text or authority decisions. */
final class GroupRecoveryDiagnostics {
    enum Stage { QUEUED, WAITING_CANDIDATE, SOCKET_CREATE, TCP_CONNECT, TLS_CONTEXT,
        TLS_HANDSHAKE, OWNER_CHALLENGE, HELLO_WRITE, ROSTER_READ, CONNECTED, ENDED }
    enum Failure { NONE, TIMEOUT, UNREACHABLE, CONNECT_FAILED, TLS_FAILED, TRANSPORT_IO,
        AUTH_FAILED, PROTOCOL_REJECTED, OPERATION_FAILED, WORKER_BUSY, RESOURCE_CAPACITY,
        CANCELLED, WINDOW_EXPIRED }
    static final class Event {
        final Stage stage; final Failure failure; final long observedElapsedMs;
        Event(Stage stage,Failure failure,long now){this.stage=stage;this.failure=failure;observedElapsedMs=Math.max(0,now);}
    }
    static final class Snapshot {
        final Stage stage; final int attemptedCandidates,connectionAttempts; final long observedElapsedMs;
        final List<Event> failures;
        Snapshot(Stage stage,int count,int attempts,long now,ArrayDeque<Event> failures){this.stage=stage;attemptedCandidates=count;connectionAttempts=attempts;observedElapsedMs=now;this.failures=Collections.unmodifiableList(new ArrayList<>(failures));}
    }
    static final class Trace {
        private Stage stage=Stage.QUEUED; private int attempts; private long now; private boolean terminal;
        private boolean sawTransportFailure,nonTransportFailure;
        private final Set<Object> candidates=Collections.newSetFromMap(new IdentityHashMap<>());
        private final ArrayDeque<Event> failures=new ArrayDeque<>();
        Trace(long now){this.now=Math.max(0,now);}
        synchronized void stage(Stage next,long observed){if(!terminal){stage=next;now=Math.max(now,observed);}}
        synchronized void candidate(Object endpoint,long observed){if(!terminal){if(candidates.size()<GroupRecoveryPolicy.CANDIDATES)candidates.add(endpoint);attempts=Math.min(GroupRecoveryPolicy.CANDIDATES*GroupRecoveryPolicy.ATTEMPTS_PER_ENDPOINT,attempts+1);now=Math.max(now,observed);}}
        synchronized void failed(Exception failure,long observed){if(!terminal){if(transientTransport(failure))sawTransportFailure=true;else nonTransportFailure=true;add(classify(failure),observed);}}
        synchronized boolean transportFailureOnly(){return sawTransportFailure&&!nonTransportFailure;}
        synchronized void end(Failure failure,long observed){if(!terminal){if(failure!=Failure.NONE)add(failure,observed);stage=Stage.ENDED;terminal=true;now=Math.max(now,observed);}}
        synchronized void connected(long observed){if(!terminal){stage=Stage.CONNECTED;terminal=true;now=Math.max(now,observed);}}
        private void add(Failure failure,long observed){now=Math.max(now,observed);failures.add(new Event(stage,failure,now));while(failures.size()>GroupRecoveryPolicy.CANDIDATES)failures.removeFirst();}
        synchronized Snapshot snapshot(){return new Snapshot(stage,candidates.size(),attempts,now,failures);}
    }
    private volatile Trace current;
    Trace begin(long now){Trace next=new Trace(now);current=next;return next;}
    void cancel(long now){Trace value=current;if(value!=null)value.end(Failure.CANCELLED,now);}
    Snapshot snapshot(){Trace value=current;return value==null?null:value.snapshot();}
    static Failure classify(Exception failure){
        // Only types are inspected; provider messages can contain private endpoints/payloads.
        if(failure instanceof SocketTimeoutException)return Failure.TIMEOUT;
        if(failure instanceof SSLException)return Failure.TLS_FAILED;
        if(failure instanceof NoRouteToHostException)return Failure.UNREACHABLE;
        if(failure instanceof ConnectException)return Failure.CONNECT_FAILED;
        if(failure instanceof IOException)return Failure.TRANSPORT_IO;
        if(failure instanceof SecurityException)return Failure.AUTH_FAILED;
        if(failure instanceof IllegalArgumentException)return Failure.PROTOCOL_REJECTED;
        return Failure.OPERATION_FAILED;
    }
    static boolean transientTransport(Exception failure){return failure instanceof IOException&&!(failure instanceof SSLException);}
    GroupRecoveryDiagnostics(){}
}
