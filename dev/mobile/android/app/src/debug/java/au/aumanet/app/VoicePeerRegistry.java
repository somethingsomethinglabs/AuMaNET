package au.aumanet.app;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Control-executor-only bounded pair registry. Capture never reads this mutable collection. */
final class VoicePeerRegistry<T> {
    private static final int MAX_PEERS=4;
    private static final class Entry<T>{final String pair;final T value;Entry(String pair,T value){this.pair=pair;this.value=value;}}
    private final Map<String,Entry<T>> entries=new LinkedHashMap<>();
    static void validate(String peer,String pair){
        if(peer==null||pair==null||!peer.matches("[A-F0-9]{64}")||!pair.matches("[a-f0-9]{32}"))throw new IllegalArgumentException("Invalid group peer tuple");
    }
    T get(String peer){Entry<T> entry=entries.get(peer);return entry==null?null:entry.value;}
    T require(String peer,String pair){validate(peer,pair);Entry<T> entry=entries.get(peer);
        if(entry==null||!entry.pair.equals(pair))throw new IllegalStateException("Group peer session changed; refresh the call");return entry.value;}
    void add(String peer,String pair,T value){
        validate(peer,pair);if(value==null)throw new IllegalArgumentException("Missing native peer");
        Entry<T> existing=entries.get(peer);
        if(existing!=null){if(existing.pair.equals(pair)&&existing.value==value)return;throw new IllegalStateException("Remove the previous peer session before adding its replacement");}
        if(entries.size()>=MAX_PEERS)throw new IllegalStateException("Group voice supports at most five participants");
        for(Entry<T> entry:entries.values())if(entry.pair.equals(pair))throw new IllegalArgumentException("Pair session is already used by another peer");
        entries.put(peer,new Entry<>(pair,value));
    }
    T remove(String peer,String pair){validate(peer,pair);Entry<T> existing=entries.get(peer);if(existing==null)return null;
        if(!existing.pair.equals(pair))throw new IllegalStateException("A newer peer session cannot be removed by an old request");
        entries.remove(peer);return existing.value;}
    int size(){return entries.size();}
    List<T> snapshot(){List<T> result=new ArrayList<>(entries.size());for(Entry<T> entry:entries.values())result.add(entry.value);return result;}
    void clear(){entries.clear();}
}
