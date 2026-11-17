package au.aumanet.app;

import java.io.Closeable;
import java.net.Socket;
import java.net.ServerSocket;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Process-wide owned-FD budget, including sockets whose physical close is stalled.
 * Reserve BEFORE opening/accepting an owned FD. No connection retry bypasses stalled cleanup.
 */
final class GroupSocketBudget {
    static final int LIMIT=8;
    private final int limit;
    private final Set<Lease> leases=new HashSet<>();
    private final ThreadPoolExecutor closer;
    GroupSocketBudget(){this(LIMIT,2);}
    GroupSocketBudget(int limit,int workers){
        if(limit<1||workers<1)throw new IllegalArgumentException("Invalid close budget");this.limit=limit;
        ThreadFactory factory=task->{Thread thread=new Thread(task,"AuMaNET-group-close");thread.setDaemon(true);return thread;};
        // At most `limit` leases can submit once, so this queue cannot reject a valid close.
        closer=new ThreadPoolExecutor(workers,workers,0,TimeUnit.MILLISECONDS,new ArrayBlockingQueue<>(limit),factory);
    }
    synchronized Lease reserve(){if(leases.size()>=limit)return null;Lease lease=new Lease();leases.add(lease);return lease;}
    synchronized int used(){return leases.size();}
    synchronized int closing(){int count=0;for(Lease lease:leases)if(lease.closing.get())count++;return count;}
    synchronized long oldestCloseMs(long now){long age=0;for(Lease lease:leases)if(lease.closing.get())age=Math.max(age,Math.max(0,now-lease.startedAt));return age;}
    int limit(){return limit;}
    final class Lease {
        private final AtomicBoolean closing=new AtomicBoolean();
        private volatile long startedAt;
        private Lease(){}
        /** Only for a reservation that never acquired an FD. */
        void unused(){if(!closing.compareAndSet(false,true))return;release();}
        void closeAsync(Closeable socket,long now){closeAsync(null,socket,now);}
        /** Retained raw client transport is closed first, aborting any blocked TLS write/notify. */
        void closeAsync(Closeable raw,Closeable tls,long now){
            if(!closing.compareAndSet(false,true))return;startedAt=now;
            closer.execute(()->{
                boolean complete=false;
                try{
                    boolean failed=false;
                    if(raw!=null&&!closeReturned(raw))failed=true;
                    if(tls!=null&&!closeReturned(tls))failed=true;
                    complete=!failed;
                }finally{
                    // A failed or stalled close does not prove the FD was released. Retain
                    // its lease conservatively; retries cannot create unbounded resources.
                    if(complete)release();
                }
            });
        }
        private void release(){synchronized(GroupSocketBudget.this){leases.remove(this);GroupSocketBudget.this.notifyAll();}}
    }
    private static boolean closeReturned(Closeable resource){
        try{resource.close();return true;}
        catch(Exception failure){
            // Inspect only AFTER close returned. A TLS wrapper can throw while its
            // finally block has already closed the transport. A blocked close never
            // reaches here; unknown Closeables retain their conservative lease.
            return resource instanceof Socket&&((Socket)resource).isClosed()||resource instanceof ServerSocket&&((ServerSocket)resource).isClosed();
        }
    }
}
