package au.aumanet.app;
import java.net.*;import java.util.concurrent.atomic.*;import java.util.function.*;
/** Explicit, bounded native consent and forwarded-payload quota. */
final class InternetSharingPolicy {
 static final long MIN_BYTES=10L*1024*1024,MAX_BYTES=1024L*1024*1024,MAX_MS=2*60*60*1000,MIN_MS=10*60*1000;
 static final class Run {
  final String id;final long generation,started,duration,limit;final AtomicBoolean active=new AtomicBoolean(true);final AtomicLong used=new AtomicLong();final LongSupplier clock;final BooleanSupplier scope;
  Run(String id,long generation,long now,long duration,long limit,LongSupplier clock,BooleanSupplier scope){if(id==null||!id.matches("[a-f0-9]{32}")||generation<1||now<0||duration<MIN_MS||duration>MAX_MS||limit<MIN_BYTES||limit>MAX_BYTES)throw new IllegalArgumentException("Invalid internet session bounds");this.id=id;this.generation=generation;started=now;this.duration=duration;this.limit=limit;this.clock=clock;this.scope=scope;}
  boolean live(){long now=clock.getAsLong();return active.get()&&now>=started&&now-started<duration&&used.get()<limit&&scope.getAsBoolean();}
  boolean charge(int bytes){if(bytes<0||!live())return false;for(;;){long before=used.get();if(bytes>limit-before){active.set(false);return false;}if(used.compareAndSet(before,before+bytes))return active.get()&&scope.getAsBoolean();}}
  long remainingMs(){long now=clock.getAsLong();return now<started?0:Math.max(0,duration-(now-started));}
  void stop(){active.set(false);}
 }
 static boolean publicAddress(InetAddress address){byte[] b=address.getAddress();int a=b[0]&255,c=b[1]&255;if(b.length==16)return a>=0x20&&a<=0x3f;return b.length==4&&a!=0&&a!=10&&a!=127&&a<224&&!(a==100&&c>=64&&c<=127)&&!(a==169&&c==254)&&!(a==172&&c>=16&&c<=31)&&!(a==192&&(c==168||c==0))&&!(a==198&&(c==18||c==19));}
 private InternetSharingPolicy(){}
}

