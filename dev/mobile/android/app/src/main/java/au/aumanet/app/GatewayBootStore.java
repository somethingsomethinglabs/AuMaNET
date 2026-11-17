package au.aumanet.app;

import org.json.*;
import java.util.*;

/** Prepared TIME transcripts only. A disk row is never current boot authority. */
final class GatewayBootStore {
    static final class Record {
        final String target,nodePin,group,owner,run,digest;final long epoch;private final GatewayBootCodec.Message time;
        private Record(String pin,GatewayBootCodec.Message time){if(!GroupWire.pin(pin)||time.kind!='T')throw new IllegalArgumentException("Invalid prepared gateway time");this.nodePin=pin;this.time=time;target=time.target;group=time.group;owner=time.owner;run=time.run;epoch=time.epoch;digest=time.sha256();}
        boolean matches(String pin,GatewayBootCodec.Message proof){return proof.kind=='R'&&proof.clockState==1&&nodePin.equals(pin)&&target.equals(proof.target)&&group.equals(proof.group)&&epoch==proof.epoch&&owner.equals(proof.owner)&&time.relay.equals(proof.relay)&&run.equals(proof.run)&&digest.equals(proof.digest);}
        GatewayBootCodec.Message time(){return GatewayBootCodec.parse(time.body());}
    }
    private final GatewaySequenceStore.Storage storage;private final Map<String,Record> records=new TreeMap<>();private volatile boolean poisoned;
    boolean healthy(){return !poisoned;}
    GatewayBootStore(GatewaySequenceStore.Storage storage)throws Exception{
        this.storage=storage;String encoded=storage.read();if(encoded==null)return;JSONObject value=GroupNameJson.object(encoded,8192);GatewayBindingConfig.keys(value,"schema","records");if(!"aumanet.gateway-prepared-time.v1".equals(GroupNameMetadata.string(value,"schema")))throw new IllegalArgumentException("Unknown prepared gateway time storage");JSONArray rows=value.getJSONArray("records");if(rows.length()>2)throw new IllegalArgumentException("Prepared gateway time capacity exceeded");
        for(int i=0;i<rows.length();i++){JSONObject row=rows.getJSONObject(i);GatewayBindingConfig.keys(row,"target","nodePin","bodyHex");GatewayBootCodec.Message body=GatewayBootCodec.parse(GatewayBootCodec.bytes(GroupNameMetadata.string(row,"bodyHex"),GatewayBootCodec.TIME));Record record=new Record(GroupNameMetadata.string(row,"nodePin"),body);if(!record.target.equals(GroupNameMetadata.string(row,"target"))||records.put(record.target,record)!=null)throw new IllegalArgumentException("Invalid prepared gateway time record");}
    }
    synchronized Record current(String node){if(poisoned)throw new IllegalStateException("Prepared gateway time commit is uncertain");return records.get(node);}
    synchronized Record prepare(String nodePin,GatewayBootCodec.Message time,String expectedDigest)throws Exception{
        if(poisoned)throw new IllegalStateException("Prepared gateway time commit is uncertain");Record next=new Record(nodePin,time),before=records.get(time.target);String old=before==null?"":before.digest;if(!old.equals(expectedDigest))throw new IllegalStateException("Prepared gateway time changed");if(before!=null&&before.nodePin.equals(nodePin)&&before.digest.equals(next.digest))return before;
        Map<String,Record> proposed=new TreeMap<>(records);proposed.put(next.target,next);if(proposed.size()>2)throw new IllegalStateException("Prepared gateway time capacity exceeded");JSONArray rows=new JSONArray();for(Record record:proposed.values())rows.put(new JSONObject().put("target",record.target).put("nodePin",record.nodePin).put("bodyHex",GroupWire.hex(record.time.body())));String encoded=new JSONObject().put("schema","aumanet.gateway-prepared-time.v1").put("records",rows).toString();
        try{if(!storage.write(encoded))throw new IllegalStateException("Unconfirmed prepared gateway time commit");}catch(Exception unknown){poisoned=true;throw new IllegalStateException("Prepared gateway time storage is uncertain; no TIME may be emitted");}catch(Error unknown){poisoned=true;throw unknown;}records.clear();records.putAll(proposed);return next;
    }
}
