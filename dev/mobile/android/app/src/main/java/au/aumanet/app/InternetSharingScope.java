package au.aumanet.app;
import android.net.Network;import java.util.*;
/** Exact live group/network capture; data flows never borrow a replacement run. */
final class InternetSharingScope {
 final Object source;final String process,self,group,owner,address;final long epoch,run;final Network network;final Set<String> approved,online;
 InternetSharingScope(Object source,String process,String self,String group,String owner,long epoch,long run,Network network,String address,Set<String> approved,Set<String> online){this.source=source;this.process=process;this.self=self;this.group=group;this.owner=owner;this.epoch=epoch;this.run=run;this.network=network;this.address=address;this.approved=Collections.unmodifiableSet(new HashSet<>(approved));this.online=Collections.unmodifiableSet(new HashSet<>(online));}
 boolean stable(InternetSharingScope other){return other!=null&&source==other.source&&process.equals(other.process)&&self.equals(other.self)&&group.equals(other.group)&&owner.equals(other.owner)&&epoch==other.epoch&&approved.equals(other.approved);}
 boolean exact(InternetSharingScope other){return stable(other)&&run==other.run&&network.equals(other.network)&&address.equals(other.address);}
}

