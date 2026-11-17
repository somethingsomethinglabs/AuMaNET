package au.aumanet.app;

import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;

/** Small durable operation receipt journal. A failed commit is ambiguous, never NOT_ACCEPTED.
 * The owner must reopen after storage uncertainty; in-memory SharedPreferences is not disk proof. */
final class GroupNameJournal {
    static final class NotAccepted extends Exception {NotAccepted(String message){super(message);}}
    static final class Uncertain extends Exception {Uncertain(Throwable cause){super("Name storage outcome is uncertain; restart the app before editing",cause);}}
    interface Commit { void write(JSONArray candidate) throws Exception; }
    private JSONArray records;private boolean healthy=true,uncertain;private final long generation;
    GroupNameJournal(String encoded)throws Exception{this(encoded,0);}
    GroupNameJournal(String encoded,long generation) throws Exception{
        if(generation<0||generation>GroupNamePolicy.MAX_REVISION)throw new IllegalArgumentException("Invalid name generation");this.generation=generation;
        if(encoded==null||encoded.length()>32768||encoded.getBytes(java.nio.charset.StandardCharsets.UTF_8).length>32768)throw new IllegalArgumentException("Unbounded name receipt journal");
        Object parsed=GroupNameJson.read(encoded,32768);if(!(parsed instanceof JSONArray))throw new IllegalArgumentException("Trailing or invalid name receipt journal");records=(JSONArray)parsed;
        if(records.length()>GroupNamePolicy.RECEIPTS)throw new IllegalArgumentException("Unbounded name receipt journal");
        java.util.Set<String> ids=new java.util.HashSet<>();for(int i=0;i<records.length();i++){JSONObject receipt=records.getJSONObject(i);validate(receipt);if(generation(receipt)!=generation||generation>0&&!receipt.has("generation"))throw new IllegalArgumentException("Retired name receipt generation");if(!ids.add(receipt.getString("operationId")))throw new IllegalArgumentException("Duplicate name receipt");}
    }
    boolean healthy(){return healthy;}
    long generation(){return generation;}
    boolean uncertain(){return uncertain;}
    void poison(){healthy=false;uncertain=true;}
    void unavailable(){healthy=false;}
    void requireHealthy(){if(!healthy)throw new IllegalStateException(uncertain?"Name storage outcome is uncertain; restart the app before editing":"Name metadata is unavailable");}
    static void validate(JSONObject receipt)throws Exception{
        for(String field:new String[]{"operationId","processId","selfId","kind","name","groupId"})if(!(receipt.get(field) instanceof String))throw new IllegalArgumentException("Invalid name receipt type");
        java.util.Set<String> keys=new java.util.HashSet<>();receipt.keys().forEachRemaining(keys::add);java.util.Set<String> expectedFields=new java.util.HashSet<>(java.util.Arrays.asList("operationId","processId","selfId","kind","name","groupId","epoch","expectedRevision","revision"));if(receipt.has("generation"))expectedFields.add("generation");if(!keys.equals(expectedFields))throw new IllegalArgumentException("Unexpected name receipt fields");generation(receipt);
        if(!GroupWire.id(receipt.getString("operationId"))||!receipt.getString("processId").matches("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}")||!GroupWire.pin(receipt.getString("selfId")))throw new IllegalArgumentException("Invalid name operation receipt");
        String kind=receipt.getString("kind"),group=receipt.getString("groupId");
        if(!kind.equals("self")&&!kind.equals("group")||!group.isEmpty()&&!GroupWire.id(group))throw new IllegalArgumentException("Invalid name operation scope");
        if(!GroupNamePolicy.label(receipt.getString("name"),kind.equals("self")?48:64).equals(receipt.getString("name")))throw new IllegalArgumentException("Noncanonical name receipt");
        long epoch=number(receipt,"epoch"),expected=number(receipt,"expectedRevision"),revision=number(receipt,"revision");
        if(group.isEmpty()&&epoch!=0||!group.isEmpty()&&epoch<1||kind.equals("group")&&group.isEmpty()||epoch<0||epoch>GroupNamePolicy.MAX_REVISION||expected<0||revision!=GroupNamePolicy.next(expected))throw new IllegalArgumentException("Invalid name operation revision");
    }
    private static long number(JSONObject value,String key)throws Exception{Object raw=value.get(key);if(!(raw instanceof Number))throw new IllegalArgumentException("Invalid name receipt revision");long result=((Number)raw).longValue();if(!Double.isFinite(((Number)raw).doubleValue())||result!=((Number)raw).doubleValue()||result<0||result>GroupNamePolicy.MAX_REVISION)throw new IllegalArgumentException("Invalid name receipt revision");return result;}
    static long generation(JSONObject value)throws Exception{return value.has("generation")?number(value,"generation"):0;}
    JSONObject find(String id)throws Exception{
        requireHealthy();for(int i=0;i<records.length();i++)if(records.getJSONObject(i).getString("operationId").equals(id))return new JSONObject(records.getJSONObject(i).toString());return null;
    }
    boolean same(JSONObject left,JSONObject right)throws Exception{
        for(String key:new String[]{"operationId","processId","selfId","kind","name","groupId","epoch","expectedRevision","revision"})if(!String.valueOf(left.get(key)).equals(String.valueOf(right.get(key))))return false;return generation(left)==generation(right);
    }
    void commit(JSONObject receipt,Commit storage)throws Exception{
        requireHealthy();validate(receipt);if(generation(receipt)!=generation||generation>0&&!receipt.has("generation"))throw new IllegalArgumentException("Retired name operation generation");JSONObject prior=find(receipt.getString("operationId"));
        if(prior!=null){if(!same(prior,receipt))throw new IllegalArgumentException("Name operation ID conflicts with a different edit");return;}
        JSONArray candidate=new JSONArray();for(int i=Math.max(0,records.length()-GroupNamePolicy.RECEIPTS+1);i<records.length();i++)candidate.put(records.getJSONObject(i));candidate.put(receipt);
        JSONArray published=new JSONArray(candidate.toString());
        try{storage.write(candidate);}catch(Exception failure){healthy=false;uncertain=true;throw new Uncertain(failure);}catch(Error interrupted){healthy=false;uncertain=true;throw interrupted;}
        records=published;
    }
}
