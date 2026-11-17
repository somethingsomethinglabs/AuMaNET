package au.aumanet.app;

import java.util.*;
import java.util.function.BooleanSupplier;

/** Signing is bounded, scoped and separate from transport. Packets do not prove node acceptance. */
final class GatewayGrantIssuer {
    static final class Packet {final String target,run;final byte[] body,signature,envelope;Packet(String target,String run,byte[] body,byte[] signature){this.target=target;this.run=run;this.body=body.clone();this.signature=signature.clone();this.envelope=GatewayGrantCodec.envelope(target,body,signature);}}
    static void guard(GatewayOwnerAuthority.Access authority,GatewayOwnerAuthority.Scope scope,boolean live,BooleanSupplier intent){if(!intent.getAsBoolean()||!authority.current(scope,live))throw new IllegalStateException("Gateway owner authority changed; start explicitly with current checked configuration");}
    static GatewayReattachmentMigration.Prepared prepareMigration(GatewayOwnerAuthority.Access authority,GatewayOwnerAuthority.Scope scope,GatewayConfigStore.Record record,long revision,GatewaySequenceStore sequences,GatewaySessionFence.Clock clock,BooleanSupplier intent)throws Exception{return GatewayReattachmentMigration.prepare(authority,scope,record,revision,sequences,clock,intent);}
    /** One explicit-Job exception: unchanged original USB A run, owner SELF/LOCAL only. */
    static Packet bootstrapSelf(GatewayOwnerAuthority.Access authority,GatewayOwnerAuthority.Scope scope,GatewayBindingConfig config,GatewaySequenceStore sequences,long wallMillis,BooleanSupplier intent)throws Exception{
        guard(authority,scope,true,intent);config.liveOwner(scope);if(!config.bootRecovery()||!scope.self.equals(config.owner))throw new SecurityException("Pinned owner bootstrap scope changed");GatewayBindingConfig.Node target=null;GatewayBindingConfig.Binding self=null;
        for(GatewayBindingConfig.Binding row:config.bindings)if(row.phone.equals(scope.self))self=row;
        for(GatewayBindingConfig.Node node:config.nodes)if(node.id.equals(config.ownerAttachment()))target=node;
        if(target==null||self==null||!target.id.equals(self.attachment))throw new SecurityException("Checked local owner attachment is unavailable");long issued=wallMillis/1000;if(issued<1||issued>GroupNamePolicy.MAX_REVISION-30)throw new IllegalStateException("Gateway issuer clock is unavailable");
        long sequence=sequences.reserve(Collections.singletonList(target))[0];guard(authority,scope,true,intent);byte[] body=config.bind(target,self,sequence,issued,issued+30,self.generation,false);byte[] signature=authority.sign(scope,body,target.id,true);guard(authority,scope,true,intent);return new Packet(target.id,target.run,body,signature);
    }
    static List<Packet> issue(GatewayOwnerAuthority.Access authority,GatewayOwnerAuthority.Scope scope,GatewayBindingConfig config,GatewaySequenceStore sequences,long wallMillis,boolean live,BooleanSupplier intent)throws Exception{
        return issueTargets(authority,scope,config,config.nodes,sequences,wallMillis,live,intent);
    }
    /** Native verified boot controller supplies a bounded subset; no public bridge accepts runs. */
    static List<Packet> issueTargets(GatewayOwnerAuthority.Access authority,GatewayOwnerAuthority.Scope scope,GatewayBindingConfig config,List<GatewayBindingConfig.Node> verified,GatewaySequenceStore sequences,long wallMillis,boolean live,BooleanSupplier intent)throws Exception{
        guard(authority,scope,live,intent);if(live)config.liveOwner(scope);long issued=wallMillis/1000;if(issued<1||issued>GroupNamePolicy.MAX_REVISION-30)throw new IllegalStateException("Gateway issuer clock is unavailable");
        if(verified.isEmpty()||verified.size()>2)throw new IllegalArgumentException("Invalid verified gateway targets");Set<String> seen=new HashSet<>();for(GatewayBindingConfig.Node node:verified){GatewayBindingConfig.Node configured=null;for(GatewayBindingConfig.Node candidate:config.nodes)if(candidate.id.equals(node.id))configured=candidate;if(configured==null||!seen.add(node.id)||!configured.publicKeySha256.equals(node.publicKeySha256)||!config.bootRecovery()&&!configured.run.equals(node.run))throw new SecurityException("Gateway target differs from checked configuration");}
        List<Long> counters=new ArrayList<>();if(config.routed()){for(GatewayBindingConfig.Node node:verified){List<GatewayBindingConfig.Node> targets=new ArrayList<>();for(GatewayBindingConfig.Binding binding:config.bindings)targets.add(node);for(long value:sequences.reserve(targets))counters.add(value);guard(authority,scope,live,intent);}}else{List<GatewayBindingConfig.Node> targets=new ArrayList<>();for(GatewayBindingConfig.Node node:verified)for(GatewayBindingConfig.Binding binding:config.bindings)targets.add(node);for(long value:sequences.reserve(targets))counters.add(value);}long[] reserved=new long[counters.size()];for(int i=0;i<reserved.length;i++)reserved[i]=counters.get(i);guard(authority,scope,live,intent);
        List<Packet> packets=new ArrayList<>();int index=0;for(GatewayBindingConfig.Node node:verified)for(GatewayBindingConfig.Binding binding:config.bindings){guard(authority,scope,live,intent);byte[] body=config.bind(node,binding,reserved[index++],issued,issued+GatewayGrantCodec.LEASE_SECONDS,binding.generation,false);byte[] signature=authority.sign(scope,body,node.id,live);guard(authority,scope,live,intent);packets.add(new Packet(node.id,node.run,body,signature));}return Collections.unmodifiableList(packets);
    }
    private GatewayGrantIssuer(){}
}
