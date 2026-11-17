package au.aumanet.app;
import org.json.JSONObject;
import java.util.Locale;

/** Explicit signed endpoint scope; not discovery, group approval or media consent. */
final class RoutedGroupNetwork {
 final String group,owner;final long epoch;final GatewayLanProfile local,remote;
 private RoutedGroupNetwork(String group,String owner,long epoch,GatewayLanProfile local,GatewayLanProfile remote){this.group=group;this.owner=owner;this.epoch=epoch;this.local=local;this.remote=remote;}
 static RoutedGroupNetwork read(JSONObject raw)throws Exception{
  GatewayBindingConfig.keys(raw,"schema","groupId","ownerPin","epoch","local","remote");
  if(!raw.getString("schema").equals("aumanet.routed-group-network.v1"))throw new SecurityException("Unknown routed endpoint scope");
  String group=raw.getString("groupId"),owner=raw.getString("ownerPin");long epoch=GroupNameMetadata.number(raw,"epoch");if(!GroupWire.id(group)||!GroupWire.pin(owner)||epoch<1)throw new SecurityException("Invalid routed group scope");
  GatewayLanProfile[] profiles=new GatewayLanProfile[2];int i=0;for(String side:new String[]{"local","remote"}){JSONObject grant=raw.getJSONObject(side);byte[] b=GatewayLanProfile.unhex(grant.getString("bodyHex"));if(b.length!=128)throw new SecurityException("Invalid LAN grant length");String node=GroupWire.hex(java.util.Arrays.copyOfRange(b,28,44)).toLowerCase(Locale.ROOT);profiles[i++]=GatewayLanProfile.read(grant,group,epoch,owner,node);}
  if(profiles[0].node.equals(profiles[1].node)||profiles[0].network.equals(profiles[1].network))throw new SecurityException("Routed nodes must own distinct LANs");
  return new RoutedGroupNetwork(group,owner,epoch,profiles[0],profiles[1]);
 }
 boolean permits(String group,String owner,long epoch,String localAddress,int prefix,String destination){return this.group.equals(group)&&this.owner.equals(owner)&&this.epoch==epoch&&prefix==24&&local.contains(localAddress)&&remote.contains(destination);}
 void follows(RoutedGroupNetwork old){if(!group.equals(old.group)||!owner.equals(old.owner)||epoch!=old.epoch)throw new SecurityException("Routed group scope replacement requires a separate group setup");for(GatewayLanProfile previous:new GatewayLanProfile[]{old.local,old.remote}){GatewayLanProfile next=local.node.equals(previous.node)?local:remote.node.equals(previous.node)?remote:null;if(next==null||!next.network.equals(previous.network)||next.revision<previous.revision||next.revision==previous.revision&&!next.bodyHex.equals(previous.bodyHex))throw new SecurityException("Routed subnet rollback/renumber rejected");}}
}
