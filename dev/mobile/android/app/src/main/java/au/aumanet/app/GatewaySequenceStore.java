package au.aumanet.app;

import org.json.*;
import java.util.*;

/** Durable per-target high-water marks span every boot; reservation precedes signing. */
final class GatewaySequenceStore {
    static final int MAX_TARGETS=64;private static final int MAX_LEGACY_ROWS=64;
    interface Storage{String read()throws Exception;boolean write(String encoded)throws Exception;}
    private final Storage storage;private LinkedHashMap<String,Long> counters=new LinkedHashMap<>();private volatile boolean poisoned;
    GatewaySequenceStore(Storage storage)throws Exception{
        this.storage=storage;String saved=storage.read();if(saved==null)return;
        if(saved.isEmpty())throw new IllegalArgumentException("Saved gateway sequence record is empty");
        JSONObject record=GroupNameJson.object(saved,32768);GatewayBindingConfig.keys(record,"schema","counters");
        String schema=GroupNameMetadata.string(record,"schema");boolean legacy=schema.equals("aumanet.gateway-sequences.v1");
        if(!legacy&&!schema.equals("aumanet.gateway-sequences.v2"))throw new IllegalArgumentException("Unknown gateway sequence storage");
        JSONArray rows=record.getJSONArray("counters");if(rows.length()>(legacy?MAX_LEGACY_ROWS:MAX_TARGETS))throw new IllegalArgumentException("Gateway sequence capacity exceeded");
        LinkedHashMap<String,Long> loaded=new LinkedHashMap<>();Set<String> seen=new HashSet<>();
        for(int i=0;i<rows.length();i++){
            JSONObject row=rows.getJSONObject(i);if(legacy)GatewayBindingConfig.keys(row,"target","run","sequence");else GatewayBindingConfig.keys(row,"target","sequence");
            String target=GroupNameMetadata.string(row,"target");GatewayGrantCodec.identifier(target);
            String identity=target;if(legacy){String run=GroupNameMetadata.string(row,"run");GatewayGrantCodec.identifier(run);identity=target+":"+run;}
            long sequence=GroupNameMetadata.number(row,"sequence");if(sequence<1||!seen.add(identity))throw new IllegalArgumentException("Invalid saved gateway sequence");
            loaded.put(target,Math.max(sequence,loaded.getOrDefault(target,0L)));
        }
        if(legacy)commit(loaded);else counters=loaded;
    }
    boolean healthy(){return !poisoned;}
    /** Same private path/AtomicFile; an unconfirmed migration or reservation poisons this instance. */
    private void commit(LinkedHashMap<String,Long> next)throws Exception{
        JSONArray rows=new JSONArray();for(Map.Entry<String,Long> entry:next.entrySet())rows.put(new JSONObject().put("target",entry.getKey()).put("sequence",entry.getValue()));
        String encoded=new JSONObject().put("schema","aumanet.gateway-sequences.v2").put("counters",rows).toString();
        try{if(!storage.write(encoded)||!encoded.equals(storage.read()))throw new IllegalStateException("Unconfirmed gateway sequence commit");}
        catch(Exception failure){poisoned=true;throw new IllegalStateException("Gateway sequence storage is uncertain; no grant was emitted");}
        catch(Error interrupted){poisoned=true;throw interrupted;}
        counters=next;
    }
    synchronized long[] reserve(List<GatewayBindingConfig.Node> targets)throws Exception{
        if(poisoned)throw new IllegalStateException("Gateway sequence storage is uncertain; restart before explicit recovery");
        if(targets.isEmpty()||targets.size()>4)throw new IllegalArgumentException("Invalid gateway sequence batch");
        LinkedHashMap<String,Long> next=new LinkedHashMap<>(counters);long[] reserved=new long[targets.size()];
        for(int i=0;i<targets.size();i++){
            GatewayBindingConfig.Node target=targets.get(i);GatewayGrantCodec.identifier(target.id);GatewayGrantCodec.identifier(target.run);
            long sequence=GroupNamePolicy.next(next.getOrDefault(target.id,0L));next.put(target.id,sequence);reserved[i]=sequence;
        }
        if(next.size()>MAX_TARGETS)throw new IllegalStateException("Gateway sequence storage reached its target limit; retained counters were preserved");
        commit(next);return reserved;
    }
}
