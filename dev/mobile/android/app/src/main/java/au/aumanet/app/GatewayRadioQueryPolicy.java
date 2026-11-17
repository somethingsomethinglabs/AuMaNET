package au.aumanet.app;
import java.util.*;
/** Query latency is distinct from the unchanged five-second node nonce. */
final class GatewayRadioQueryPolicy {
 static final class FreshnessUnavailable extends SecurityException{FreshnessUnavailable(){super("Fresh node proof is unavailable");}}
 static final class InvalidReadback extends SecurityException{InvalidReadback(){super("Authenticated node readback changed");}}
 static final long QUERY_MS=4000,COMMAND_MS=4000,CONFIRM_MS=12000,CAPABILITY_MS=60000;
 static boolean receiving(boolean query,long started,long now){return now>=started&&now-started<(query?QUERY_MS:COMMAND_MS);}
 static List<String> stationFirst(List<String> nodes,String ap){if(nodes==null||nodes.size()!=2||nodes.get(0).equals(nodes.get(1))||!nodes.contains(ap))throw new IllegalArgumentException();for(String id:nodes)GatewayGrantCodec.identifier(id);List<String> ordered=new ArrayList<>(nodes);ordered.sort(Comparator.comparingInt(id->id.equals(ap)?1:0));return ordered;}
 private GatewayRadioQueryPolicy(){}
}
