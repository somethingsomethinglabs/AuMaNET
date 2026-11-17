package au.aumanet.app;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.function.*;
import org.json.*;

/** Measured application payload, not PHY throughput. TLS framing, warmup and
 * acknowledgement bytes are excluded. A receiver acknowledgement is mandatory. */
final class LinkBenchmarkWire {
    static final long WARMUP_MS=2000,MEASURE_MS=10000,DEADLINE_MS=45000;
    static final long COMPARISON_WARMUP_MS=500,COMPARISON_MEASURE_MS=3000;
    static final int BLOCK=8192,HEADER=4096;
    static final long MAX_BYTES=32L*1024*1024,PHASE_BYTES=8L*1024*1024;
    interface Progress {void update(long bytes,long elapsed);}
    static final class Budget {
        private long used;
        synchronized void charge(int bytes)throws IOException{if(bytes<1||bytes>BLOCK||used>MAX_BYTES-bytes)throw new IOException("Benchmark payload bound reached");used+=bytes;}
        synchronized long used(){return used;}
    }
    static void json(DataOutputStream out,JSONObject value)throws Exception{
        byte[] bytes=value.toString().getBytes(StandardCharsets.UTF_8);if(bytes.length<2||bytes.length>HEADER)throw new IOException("Benchmark header bound reached");out.writeInt(bytes.length);out.write(bytes);out.flush();
    }
    static JSONObject json(DataInputStream in)throws Exception{
        int n=in.readInt();if(n<2||n>HEADER)throw new IOException("Invalid benchmark header");byte[] bytes=new byte[n];in.readFully(bytes);
        String text=new String(bytes,StandardCharsets.UTF_8);JSONTokener tokener=new JSONTokener(text);Object parsed=tokener.nextValue();if(!(parsed instanceof JSONObject)||tokener.nextClean()!=0)throw new IOException("Invalid benchmark header");return (JSONObject)parsed;
    }
    static long integer(JSONObject value,String key,long maximum)throws Exception{
        Object raw=value.get(key);if(!(raw instanceof Number))throw new IOException("Invalid benchmark number");double d=((Number)raw).doubleValue();long n=((Number)raw).longValue();if(!Double.isFinite(d)||d!=n||n<0||n>maximum)throw new IOException("Invalid benchmark number");return n;
    }
    static void require(BooleanSupplier live)throws IOException{if(!live.getAsBoolean())throw new IOException("Benchmark cancelled");}
    static String hello(JSONObject value,String group,long epoch,String self,String peer,String arm)throws Exception{
        boolean comparison=value.has("testProfile");String id=value.getString("testId");if(value.length()!=(comparison?8:7)||comparison&&!"channel-comparison".equals(value.get("testProfile"))||!id.matches("[a-f0-9]{32}")||!"aumanet.link-test.v1".equals(value.optString("schema"))||!group.equals(value.optString("groupId"))||integer(value,"epoch",9007199254740991L)!=epoch||!peer.equals(value.optString("from"))||!self.equals(value.optString("to"))||!arm.equals(value.optString("armId")))throw new IOException("Benchmark scope changed");return id;
    }
    static JSONObject send(DataOutputStream out,DataInputStream in,String phase,long duration,Budget budget,LongSupplier clock,BooleanSupplier live,Progress progress)throws Exception{
        require(live);json(out,new JSONObject().put("phase",phase));long started=clock.getAsLong(),bytes=0;byte[] block=new byte[BLOCK];
        // A fixed nonsecret pattern avoids charging random-number generation to
        // the measured path. It is encrypted by the authenticated TLS transport.
        for(int i=0;i<block.length;i++)block[i]=(byte)(i*31+17);
        while(clock.getAsLong()-started<duration&&bytes<PHASE_BYTES){require(live);budget.charge(block.length);out.writeInt(block.length);out.write(block);bytes+=block.length;progress.update(bytes,Math.max(0,clock.getAsLong()-started));}
        while(clock.getAsLong()-started<duration){require(live);progress.update(bytes,Math.max(0,clock.getAsLong()-started));Thread.sleep(20);}
        require(live);long sentElapsed=Math.max(1,clock.getAsLong()-started);out.writeInt(0);out.writeLong(sentElapsed);out.flush();JSONObject ack=json(in);require(live);
        if(!phase.equals(ack.getString("phase"))||integer(ack,"receivedBytes",PHASE_BYTES)!=bytes)throw new IOException("Benchmark acknowledgement differs");
        long reported=integer(ack,"elapsedMs",DEADLINE_MS);if(reported<sentElapsed)throw new IOException("Benchmark acknowledgement clock differs");long elapsed=Math.max(reported,clock.getAsLong()-started);if(elapsed<1||elapsed>DEADLINE_MS)throw new IOException("Benchmark acknowledgement clock differs");
        return measurement(bytes,bytes,elapsed,true);
    }
    static JSONObject receive(DataInputStream in,DataOutputStream out,String phase,Budget budget,LongSupplier clock,BooleanSupplier live,Progress progress)throws Exception{
        require(live);JSONObject header=json(in);if(!phase.equals(header.getString("phase")))throw new IOException("Benchmark phase differs");
        long started=clock.getAsLong(),bytes=0;byte[] block=new byte[BLOCK];
        for(;;){require(live);int n=in.readInt();require(live);if(n==0)break;if(n<1||n>BLOCK||bytes>PHASE_BYTES-n)throw new IOException("Benchmark payload bound reached");budget.charge(n);in.readFully(block,0,n);require(live);bytes+=n;long elapsed=clock.getAsLong()-started;if(elapsed<0||elapsed>DEADLINE_MS)throw new IOException("Benchmark deadline reached");progress.update(bytes,elapsed);}
        require(live);long senderElapsed=in.readLong();require(live);long observed=clock.getAsLong()-started;if(senderElapsed<1||senderElapsed>DEADLINE_MS||observed<0||observed>DEADLINE_MS)throw new IOException("Benchmark phase clock differs");long elapsed=Math.max(senderElapsed,Math.max(1,observed));json(out,new JSONObject().put("phase",phase).put("receivedBytes",bytes).put("elapsedMs",elapsed));return measurement(bytes,bytes,elapsed,true);
    }
    static JSONObject measurement(long sent,long received,long elapsed,boolean complete)throws Exception{return new JSONObject().put("sentBytes",sent).put("receivedBytes",received).put("elapsedMs",elapsed).put("goodputBitsPerSecond",elapsed>0?received*8000d/elapsed:0).put("complete",complete);}
    private LinkBenchmarkWire(){}
}
