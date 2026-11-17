package au.aumanet.app;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Collection;
import java.util.Collections;
import java.util.Set;
import java.util.TreeSet;

/** Native-captured authority. Persisting its stable digest never grants active
 * network, voice, location or microphone consent. Unavailable scope is null. */
final class TrustedConnectionScope {
    static final long MAX_REVISION=9007199254740991L;
    final Object source;final String process,self,group,owner;final long epoch,generation;
    final Set<String> approved;final boolean saved,live,recovering;
    TrustedConnectionScope(Object source,String process,String self,String group,String owner,long epoch,long generation,Collection<String> approved,boolean saved,boolean live,boolean recovering){
        if(source==null||process==null||!process.matches("[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}")||!pin(self)||!id(group)||!pin(owner)||epoch<1||epoch>MAX_REVISION||generation<0||generation>MAX_REVISION||approved==null||approved.isEmpty()||approved.size()>5)throw new IllegalArgumentException("Trusted saved group scope unavailable");
        TreeSet<String> members=new TreeSet<>();for(String member:approved)if(!pin(member)||!members.add(member))throw new IllegalArgumentException("Invalid trusted membership");
        if(!members.contains(self)||!members.contains(owner)||live&&!saved)throw new IllegalArgumentException("Incomplete trusted membership");
        this.source=source;this.process=process;this.self=self;this.group=group;this.owner=owner;this.epoch=epoch;this.generation=generation;this.approved=Collections.unmodifiableSet(members);this.saved=saved;this.live=live;this.recovering=recovering;
    }
    static boolean pin(String value){return value!=null&&value.matches("[A-F0-9]{64}");}
    static boolean id(String value){return value!=null&&value.matches("[a-f0-9]{32}");}
    boolean sameAuthority(TrustedConnectionScope other){return other!=null&&self.equals(other.self)&&group.equals(other.group)&&owner.equals(other.owner)&&epoch==other.epoch&&approved.equals(other.approved)&&saved&&other.saved;}
    boolean sameRun(TrustedConnectionScope other){return sameAuthority(other)&&source==other.source&&process.equals(other.process)&&generation==other.generation;}
    String digest(String attachment){return digest(attachment,0);}
    String digest(String attachment,long gatewayRevision){
        if(!saved||!pin(attachment)||gatewayRevision<0||gatewayRevision>MAX_REVISION)throw new IllegalArgumentException("Trusted node attachment is unavailable");
        StringBuilder body=new StringBuilder("AuMaNET remembered connection v1\n").append(self).append('\n').append(group).append('\n').append(owner).append('\n').append(epoch).append('\n').append(attachment).append('\n').append(gatewayRevision).append('\n');for(String member:approved)body.append(member).append('\n');return sha(body.toString());
    }
    String rosterDigest(){StringBuilder body=new StringBuilder("AuMaNET remembered roster v1\n");for(String member:approved)body.append(member).append('\n');return sha(body.toString());}
    private static String sha(String value){try{byte[] digest=MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.US_ASCII));StringBuilder out=new StringBuilder();for(byte b:digest)out.append(String.format(java.util.Locale.ROOT,"%02X",b&255));return out.toString();}catch(java.security.NoSuchAlgorithmException impossible){throw new IllegalStateException(impossible);}}
}
