package au.aumanet.app;

import java.util.Arrays;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/** Exact native network ownership, independent of Internet/default-network state. */
final class VoiceNetworkScope {
    static final class Lease {
        final Object owner,network;final byte[] address;final int prefix;final String name;final long handle;
        final AtomicBoolean revoked=new AtomicBoolean();
        Lease(Object owner,Object network,byte[] address,int prefix,String name,long handle){this.owner=owner;this.network=network;this.address=address.clone();this.prefix=prefix;this.name=name;this.handle=handle;}
    }
    private final AtomicReference<Lease> current=new AtomicReference<>();
    Lease acquire(Object owner,Object network,byte[] address,int prefix,String name,long handle){
        if(owner==null||network==null||address==null||address.length!=4||prefix<1||prefix>32||name==null||name.isEmpty()||name.length()>64||handle==0)throw new IllegalArgumentException("Invalid selected native voice network");
        Lease lease=new Lease(owner,network,address,prefix,name,handle);if(!current.compareAndSet(null,lease))throw new IllegalStateException("Another native network owner is active");return lease;
    }
    boolean current(Lease lease){return lease!=null&&current.get()==lease&&!lease.revoked.get();}
    boolean matches(Lease lease,Object network,byte[] address,int prefix){return current(lease)&&lease.network.equals(network)&&lease.prefix==prefix&&Arrays.equals(lease.address,address);}
    /** Owner retirement drains an already entered notification before the next
     * SDK owner can be installed. Never used by the PCM/privacy gate. */
    boolean deliver(Lease lease,Runnable callback){synchronized(lease){if(!current(lease))return false;callback.run();return true;}}
    void revoke(Lease lease){if(lease!=null)synchronized(lease){lease.revoked.set(true);}}
    void release(Lease lease){if(lease==null)return;synchronized(lease){lease.revoked.set(true);current.compareAndSet(lease,null);}}
}
