package au.aumanet.app.maps;

import java.io.File;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.HashSet;
import java.util.Set;

/** One process-wide owner per canonical app-private map root; reads and selection need no lease. */
public final class MapMutationLease implements AutoCloseable {
    private static final Map<String,MapMutationLease> OWNERS=new HashMap<>();
    private static final Set<String> STARTED=new HashSet<>();
    private final String root;
    private boolean closed;
    private MapMutationLease(String root){this.root=root;}
    public static synchronized MapMutationLease acquire(File root)throws IOException{
        String key=root.getCanonicalPath();if(OWNERS.containsKey(key))throw new IOException("Another offline map mutation is active");MapMutationLease lease=new MapMutationLease(key);OWNERS.put(key,lease);return lease;
    }
    /** Both plugins call this before becoming mutation-ready. One startup sweep handles all stage types. */
    public static synchronized void cleanStartup(File root)throws IOException{
        String key=root.getCanonicalPath();if(STARTED.contains(key))return;
        try(MapMutationLease startup=acquire(root)){
            File[] files=root.listFiles();if(files==null)throw new IOException("Map storage is unavailable");
            for(File file:files){String name=file.getName();if(name.matches("\\.prepare-[a-f0-9]{32}")||name.matches("\\.geo-source-[a-f0-9]{32}\\.tif")||name.matches("\\.import-[a-z0-9][a-z0-9-]{0,79}\\.[a-f0-9]{32}"))erase(file);}
            STARTED.add(key);
        }
    }
    private static void erase(File file)throws IOException{File[] children=file.listFiles();if(children!=null)for(File child:children)erase(child);if(!file.delete()&&file.exists())throw new IOException("Offline map staging cleanup failed");}
    @Override public void close(){synchronized(MapMutationLease.class){if(closed)return;closed=true;if(OWNERS.get(root)==this)OWNERS.remove(root);}}
}
