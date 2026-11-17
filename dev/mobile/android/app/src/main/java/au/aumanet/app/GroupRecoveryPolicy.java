package au.aumanet.app;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;

/** Discovery is an unauthenticated hint, never authority or permission to resume media. */
final class GroupRecoveryPolicy {
    static final long WINDOW=45000;static final int CANDIDATES=5,ATTEMPTS_PER_ENDPOINT=5;
    static String serviceKey(String group,String owner)throws Exception{if(!GroupWire.id(group)||!GroupWire.pin(owner))throw new IllegalArgumentException("Invalid saved group");return GroupWire.hex(MessageDigest.getInstance("SHA-256").digest(("AuMaNET endpoint discovery v1\n"+group+"\n"+owner).getBytes(StandardCharsets.US_ASCII))).toLowerCase(Locale.ROOT);}
    static final class Endpoint {final String host;final int port;Endpoint(String host,int port){this.host=GroupWire.privateIPv4(host);if(port<1024||port>65535)throw new IllegalArgumentException("Invalid local group port");this.port=port;}String key(){return host+":"+port;}}
    static boolean sameSubnet(String local,String remote,int prefix){GroupWire.privateIPv4(local);GroupWire.privateIPv4(remote);if(prefix<1||prefix>32)throw new IllegalArgumentException("Invalid Wi-Fi subnet");String[] a=local.split("\\."),b=remote.split("\\.");int bits=prefix;for(int i=0;i<4;i++){int mask=bits>=8?255:bits<=0?0:(255<<(8-bits))&255;if((Integer.parseInt(a[i])&mask)!=(Integer.parseInt(b[i])&mask))return false;bits-=8;}return true;}
    static void authenticated(String expectedGroup,String expectedOwner,long savedEpoch,String actualGroup,String actualOwner,long actualEpoch){if(!GroupWire.id(actualGroup)||!GroupWire.equal(expectedGroup,actualGroup)||!GroupWire.equal(expectedOwner,actualOwner)||actualEpoch<savedEpoch||actualEpoch>GroupVoiceCohort.MAX_REVISION)throw new IllegalArgumentException("Wrong group, owner or stale session");}
    static final class Attempt {
        final String id,group,owner,key,local;final long epoch,run,deadline;final int prefix;
        private static final class Candidate {final Endpoint endpoint;long readyAt;int attempts;boolean selected;Candidate(Endpoint endpoint,long now){this.endpoint=endpoint;readyAt=now;}}
        private final LinkedHashMap<String,Candidate> candidates=new LinkedHashMap<>();private final AtomicInteger state=new AtomicInteger();private final java.util.function.Predicate<String> routed;
        Attempt(String id,String group,String owner,long epoch,long run,String local,int prefix,long now)throws Exception{this(id,group,owner,epoch,run,local,prefix,now,destination->false);}
        Attempt(String id,String group,String owner,long epoch,long run,String local,int prefix,long now,java.util.function.Predicate<String> routed)throws Exception{if(!GroupWire.id(id)||epoch<1||now<0||now>Long.MAX_VALUE-WINDOW||routed==null)throw new IllegalArgumentException("Invalid recovery attempt");this.routed=routed;this.id=id;this.group=group;this.owner=owner;this.epoch=epoch;this.run=run;this.key=serviceKey(group,owner);this.local=GroupWire.privateIPv4(local);if(prefix<1||prefix>32)throw new IllegalArgumentException("Invalid Wi-Fi subnet");this.prefix=prefix;deadline=now+WINDOW;}
        synchronized boolean offer(String serviceKey,String host,int port,long now){if(!active(now)||!GroupWire.equal(key,serviceKey)||candidates.size()>=CANDIDATES)return false;try{Endpoint endpoint=new Endpoint(host,port);if((!sameSubnet(local,host,prefix)&&!routed.test(host))||candidates.containsKey(endpoint.key()))return false;candidates.put(endpoint.key(),new Candidate(endpoint,now));notifyAll();return true;}catch(IllegalArgumentException invalid){return false;}}
        synchronized Endpoint poll(long now){if(!active(now))return null;for(Candidate candidate:candidates.values())if(!candidate.selected&&candidate.attempts<ATTEMPTS_PER_ENDPOINT&&now>=candidate.readyAt){candidate.selected=true;candidate.attempts++;return candidate.endpoint;}return null;}
        /** Only the exact consumed hint can be retried. Repeated discovery cannot reset its budget. */
        synchronized void retry(Endpoint endpoint,long now){Candidate candidate=candidates.get(endpoint.key());if(!active(now)||candidate==null||candidate.endpoint!=endpoint||!candidate.selected)return;candidate.selected=false;long delay=candidate.attempts==1?1000:candidate.attempts==2?3000:8000;candidate.readyAt=now>deadline-delay?deadline:now+delay;notifyAll();}
        synchronized void awaitCandidate()throws InterruptedException{if(state.get()==0)wait(200);}
        boolean active(long now){return state.get()==0&&now>=0&&now<deadline;}
        boolean complete(long now){return now>=0&&now<deadline&&state.compareAndSet(0,1);}
        synchronized void cancel(){state.compareAndSet(0,2);candidates.clear();notifyAll();}
        boolean completed(){return state.get()==1;}
    }
    private GroupRecoveryPolicy(){}
}
