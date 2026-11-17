package au.aumanet.app;

import java.util.*;

/** Immutable owner authority. Object identities fence source/network replacement, including ABA. */
final class GatewayOwnerAuthority {
    static final class Scope {
        final Object source,network;final String process,self,group,address;final long epoch,run;final int prefix;final boolean live;final Set<String> approved;
        Scope(Object source,String process,String self,String group,long epoch,long run,Collection<String> approved,Object network,String address,int prefix,boolean live){
            if(source==null||process==null||!process.matches("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}")||!GroupWire.pin(self)||!GroupWire.id(group)||epoch<1||epoch>GroupNamePolicy.MAX_REVISION||run<0||run>GroupNamePolicy.MAX_REVISION||approved==null||approved.isEmpty()||approved.size()>5||!approved.contains(self))throw new IllegalArgumentException("Saved owner authority is unavailable");
            Set<String> pins=new HashSet<>();for(String pin:approved)if(!GroupWire.pin(pin)||!pins.add(pin))throw new IllegalArgumentException("Invalid approved gateway membership");
            this.source=source;this.process=process;this.self=self;this.group=group;this.epoch=epoch;this.run=run;this.approved=Collections.unmodifiableSet(pins);this.network=network;this.address=address;this.prefix=prefix;this.live=live;
        }
        boolean same(Scope other,boolean requireLive){return other!=null&&source==other.source&&process.equals(other.process)&&self.equals(other.self)&&group.equals(other.group)&&epoch==other.epoch&&run==other.run&&approved.equals(other.approved)&&(!requireLive||live&&other.live&&network!=null&&network.equals(other.network)&&Objects.equals(address,other.address)&&prefix==other.prefix);}
        void selectedGatewayWifi(){if(!live||network==null||prefix!=24||address==null)throw new IllegalStateException("Open the saved owner group on its selected gateway Wi-Fi first");long ip=GatewayGrantCodec.ipv4(address);if((ip&255)<2||(ip&255)>254)throw new IllegalStateException("Gateway owner needs an assigned group host address");}
    }
    interface Access {Scope capture(boolean live)throws Exception;boolean current(Scope scope,boolean live);byte[] sign(Scope scope,byte[] body,String target,boolean live)throws Exception;byte[] publicKey(Scope scope)throws Exception;
        default byte[] signControl(Scope scope,GatewayBootCodec.Message message,String expectedTarget,String expectedRelay,boolean live)throws Exception{throw new SecurityException("Authenticated gateway boot signing is unavailable");}
        default byte[] signRadio(Scope scope,GatewayRadioConfigCodec.Message message,String target,String relay)throws Exception{throw new SecurityException("Checked radio signing is unavailable");}
    }
    private GatewayOwnerAuthority(){}
}
