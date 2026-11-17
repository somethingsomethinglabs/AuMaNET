package au.aumanet.app;
import java.util.function.*;
/** Native bulk pacing, shared by the explicit donor/consumer run. No catch-up burst. */
final class InternetRate{
 private long next;private final LongSupplier clock;private final BooleanSupplier voice;
 InternetRate(LongSupplier clock,BooleanSupplier voice){this.clock=clock;this.voice=voice;}
 boolean claim(int bytes,BooleanSupplier live){if(bytes<0||bytes>InternetWire.MAX_UDP||!live.getAsBoolean())return false;long due; synchronized(this){long now=clock.getAsLong();due=Math.max(now,next);long duration=(bytes*1000L+(voice.getAsBoolean()?8191:32767))/(voice.getAsBoolean()?8192:32768);if(due>now+10000)return false;next=due+duration;}while(live.getAsBoolean()){long delay=due-clock.getAsLong();if(delay<=0)return live.getAsBoolean();try{Thread.sleep(Math.min(20,delay));}catch(InterruptedException stopped){Thread.currentThread().interrupt();return false;}}return false;}
}

