package au.aumanet.app;

import org.json.*;
import java.util.*;

/** Out-of-band endpoint hint for existing members, never an enrollment credential. */
final class GroupRecoveryCode {
    static final long TTL=300000;
    static GroupRecoveryPolicy.Endpoint read(String decoded,String group,String owner,long epoch,long now)throws Exception{
        JSONObject value=GroupNameJson.object(decoded,2048);Set<String> keys=new HashSet<>();value.keys().forEachRemaining(keys::add);if(!keys.equals(new HashSet<>(Arrays.asList("schema","groupId","ownerPin","epoch","host","port","expiresAt")))||!"aumanet.reconnect.v1".equals(GroupNameMetadata.string(value,"schema"))||!GroupWire.equal(group,GroupNameMetadata.string(value,"groupId"))||!GroupWire.equal(owner,GroupNameMetadata.string(value,"ownerPin")))throw new IllegalArgumentException("Connection code belongs to another saved group");
        long remoteEpoch=GroupNameMetadata.number(value,"epoch"),expires=GroupNameMetadata.number(value,"expiresAt"),port=GroupNameMetadata.number(value,"port");if(remoteEpoch<epoch||expires<=now||expires-now>TTL+5000||port>65535)throw new IllegalArgumentException("Connection code expired or is stale");return new GroupRecoveryPolicy.Endpoint(GroupNameMetadata.string(value,"host"),(int)port);
    }
    private GroupRecoveryCode(){}
}
