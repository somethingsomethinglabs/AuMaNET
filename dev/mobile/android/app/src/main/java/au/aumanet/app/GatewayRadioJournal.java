package au.aumanet.app;
import org.json.*;import java.util.*;
/** An unresolved operation is reconciliation metadata, never authority to replay. */
final class GatewayRadioJournal {
 static JSONObject checked(JSONObject r)throws Exception{Set<String> keys=new HashSet<>();r.keys().forEachRemaining(keys::add);if(!keys.equals(new HashSet<>(Arrays.asList("schema","operationId","groupId","ownerId","epoch","aRun","bRun","target","power","beforeGeneration","beforeActual"))))throw new IllegalArgumentException();if(!"aumanet.radio-operation.v1".equals(GroupNameMetadata.string(r,"schema")))throw new IllegalArgumentException();for(String key:new String[]{"operationId","groupId","aRun","bRun"})if(!GroupWire.id(GroupNameMetadata.string(r,key))||GroupNameMetadata.string(r,key).matches("0{32}"))throw new IllegalArgumentException();if(!GroupWire.pin(GroupNameMetadata.string(r,"ownerId"))||GroupNameMetadata.number(r,"epoch")<1||GroupNameMetadata.number(r,"beforeGeneration")>=GroupNamePolicy.MAX_REVISION)throw new IllegalArgumentException();long before=GroupNameMetadata.number(r,"beforeActual"),target=GroupNameMetadata.number(r,"target"),power=GroupNameMetadata.number(r,"power");if(before<1||before>23||target<1||target>23||power<1||power>24)throw new IllegalArgumentException();return new JSONObject(r.toString());}
 private GatewayRadioJournal(){}
}
