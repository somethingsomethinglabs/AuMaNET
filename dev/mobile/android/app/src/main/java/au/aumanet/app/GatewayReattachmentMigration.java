package au.aumanet.app;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.function.BooleanSupplier;

/** One-time checked USB administration, not a lease job or learned MAC migration.
 * Firmware requires UNBIND(old generation), then BIND(new generation). No packet
 * prefix is returned after a partial/uncertain reservation or signing failure.
 */
final class GatewayReattachmentMigration {
    static final class Prepared {
        final List<GatewayGrantIssuer.Packet> packets;final long expiresAtUnixSeconds;
        private final Window window;
        Prepared(List<GatewayGrantIssuer.Packet> packets,Window window){this.packets=Collections.unmodifiableList(new ArrayList<>(packets));this.window=window;expiresAtUnixSeconds=window.expires;}
        void current(GatewaySessionFence.Clock clock){window.current(clock);}
    }
    private static final class Window {
        final long wall,elapsed,issued,expires;
        Window(GatewaySessionFence.Clock clock){wall=clock.wall();elapsed=clock.elapsed();if(wall<1000||wall>GroupNamePolicy.MAX_REVISION-30000||elapsed<0||elapsed>Long.MAX_VALUE-30000)throw new IllegalStateException("Migration clock is unavailable");issued=wall/1000;expires=issued+GatewayGrantCodec.LEASE_SECONDS;}
        void current(GatewaySessionFence.Clock clock){long afterElapsed=clock.elapsed(),afterWall=clock.wall();if(afterElapsed<elapsed||afterElapsed-elapsed>=30000||afterWall<wall||afterWall>=expires*1000||Math.abs((afterWall-wall)-(afterElapsed-elapsed))>5000)throw new IllegalStateException("Checked migration signing expired or the clock changed");}
    }
    private static void check(GatewayOwnerAuthority.Access authority,GatewayOwnerAuthority.Scope scope,BooleanSupplier intent,Window window,GatewaySessionFence.Clock clock){GatewayGrantIssuer.guard(authority,scope,false,intent);window.current(clock);}
    static Prepared prepare(GatewayOwnerAuthority.Access authority,GatewayOwnerAuthority.Scope scope,GatewayConfigStore.Record record,long expectedRevision,GatewaySequenceStore sequences,GatewaySessionFence.Clock clock,BooleanSupplier intent)throws Exception{
        Window window=new Window(clock);check(authority,scope,intent,window,clock);
        if(record==null||record.revision!=expectedRevision)throw new SecurityException("Checked migration configuration changed");record.checked(scope);GatewayBindingConfig config=record.config;
        if(!config.group.equals(scope.group)||config.epoch!=scope.epoch||!config.owner.equals(scope.self)||config.nodes.size()!=2||config.bindings.size()!=2)throw new SecurityException("Checked migration scope changed");
        for(GatewayBindingConfig.Binding binding:config.bindings)if(binding.generation<2||binding.generation>GroupNamePolicy.MAX_REVISION||!scope.approved.contains(binding.phone))throw new SecurityException("Migration requires newer checked attachment generations");
        List<long[]> reservations=new ArrayList<>();
        // Keep the existing four-grant reservation cap. Commit BOTH node batches
        // before signing anything; an unknown second commit cannot return node A.
        for(GatewayBindingConfig.Node node:config.nodes){List<GatewayBindingConfig.Node> targets=new ArrayList<>();for(int i=0;i<config.bindings.size()*2;i++)targets.add(node);check(authority,scope,intent,window,clock);reservations.add(sequences.reserve(targets));check(authority,scope,intent,window,clock);}
        List<GatewayGrantIssuer.Packet> packets=new ArrayList<>();int nodeIndex=0;
        for(GatewayBindingConfig.Node node:config.nodes){int sequenceIndex=0;long[] reserved=reservations.get(nodeIndex++);for(GatewayBindingConfig.Binding binding:config.bindings)for(boolean remove:new boolean[]{true,false}){
            check(authority,scope,intent,window,clock);byte[] body=GatewayGrantCodec.bind(config.group,config.epoch,node.id,node.run,reserved[sequenceIndex++],window.issued,window.expires,binding.attachment,binding.address,binding.mac,remove?binding.generation-1:binding.generation,remove);
            byte[] signature=authority.sign(scope,body,node.id,false);check(authority,scope,intent,window,clock);packets.add(new GatewayGrantIssuer.Packet(node.id,node.run,body,signature));
        }}
        check(authority,scope,intent,window,clock);return new Prepared(packets,window);
    }
    private GatewayReattachmentMigration(){}
}
