package au.aumanet.maps.prototype;

import java.io.File;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

/** One process-wide owner per canonical app-private map root; reads and selection need no lease. */
public final class MapMutationLease implements AutoCloseable {
    private static final Map<String,MapMutationLease> OWNERS=new HashMap<>();
    private final String root;
    private boolean closed;
    private MapMutationLease(String root){this.root=root;}
    public static synchronized MapMutationLease acquire(File root)throws IOException{
        String key=root.getCanonicalPath();if(OWNERS.containsKey(key))throw new IOException("Another offline map mutation is active");MapMutationLease lease=new MapMutationLease(key);OWNERS.put(key,lease);return lease;
    }
    @Override public void close(){synchronized(MapMutationLease.class){if(closed)return;closed=true;if(OWNERS.get(root)==this)OWNERS.remove(root);}}
}
