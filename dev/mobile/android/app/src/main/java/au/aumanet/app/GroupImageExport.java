package au.aumanet.app;
import java.io.*;import java.text.SimpleDateFormat;import java.util.*;import java.util.concurrent.*;import java.util.function.BooleanSupplier;import org.json.*;

/** Explicit local copy only. No network, media capture, delivery permission or automatic retry. */
final class GroupImageExport {
    static final String FAILED="Image could not be saved. Check available storage and try again.",UNCONFIRMED="Save outcome could not be confirmed. Check Pictures/AuMaNET before trying again.";
    private static final ThreadPoolExecutor WORKER=new ThreadPoolExecutor(1,1,0,TimeUnit.MILLISECONDS,new ArrayBlockingQueue<>(2),work->{Thread thread=new Thread(work,"AuMaNET-image-save");thread.setDaemon(true);return thread;});
    interface Store{Pending insert(String displayName)throws Exception;}
    interface Pending{OutputStream open()throws Exception;boolean publish()throws Exception;boolean delete()throws Exception;}
    interface Reply{void saved(JSONObject result);void failed(SaveException failure);}
    static final class SaveException extends Exception{final boolean uncertain;SaveException(boolean uncertain){super(uncertain?UNCONFIRMED:FAILED);this.uncertain=uncertain;}}
    static final class Source{
        final String process,group,self,sender,id,sha;private final byte[] bytes;final BooleanSupplier current;
        Source(String process,GroupTextStore.Scope scope,String sender,String id,String sha,byte[] bytes,BooleanSupplier current)throws Exception{
            if(process==null||!process.matches("[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}")||!GroupWire.pin(sender)||!GroupWire.id(id)||sha==null||!sha.matches("[A-F0-9]{64}")||bytes==null||bytes.length<4||bytes.length>GroupTextWire.MAX_IMAGE||current==null)throw new SaveException(false);
            this.process=process;group=scope.group;self=scope.self;this.sender=sender;this.id=id;this.sha=sha;this.bytes=bytes.clone();this.current=current;
            if(!GroupTextWire.hash(this.bytes).equals(sha)||(this.bytes[0]&255)!=255||(this.bytes[1]&255)!=216||(this.bytes[this.bytes.length-2]&255)!=255||(this.bytes[this.bytes.length-1]&255)!=217)throw new SaveException(false);
        }
        JSONObject result(String name)throws Exception{return new JSONObject().put("schema","aumanet.group-image-save.v1").put("source","device").put("saved",true).put("collection","pictures").put("displayName",name).put("processId",process).put("groupId",group).put("selfId",self).put("senderId",sender).put("id",id).put("sha256",sha);}
    }
    static void submit(Source source,Store store,Reply reply){try{WORKER.execute(()->{JSONObject saved;try{saved=save(source,store,filename());}catch(SaveException failed){reply.failed(failed);return;}catch(Exception failed){reply.failed(new SaveException(true));return;}reply.saved(saved);});}catch(RejectedExecutionException busy){reply.failed(new SaveException(false));}}
    private static String filename(){SimpleDateFormat date=new SimpleDateFormat("yyyyMMdd",Locale.ROOT);date.setTimeZone(TimeZone.getTimeZone("UTC"));return "AuMaNET-"+date.format(new Date())+"-"+GroupWire.random(6)+".jpg";}
    static JSONObject save(Source source,Store store,String name)throws SaveException{
        Pending pending=null;boolean inserted=false,complete=false,uncertain=false;
        try{
            if(source==null||store==null||name==null||!name.matches("AuMaNET-[0-9]{8}-[a-f0-9]{12}\\.jpg")||!source.current.getAsBoolean())throw new SaveException(false);
            // The immutable bytes were verified on the serialized native message worker.
            if(!GroupTextWire.hash(source.bytes).equals(source.sha))throw new SaveException(false);
            inserted=true;pending=store.insert(name);if(pending==null)throw new SaveException(true);
            if(!source.current.getAsBoolean())throw new SaveException(false);
            try(OutputStream out=pending.open()){
                if(out==null)throw new SaveException(false);
                for(int at=0;at<source.bytes.length;at+=16384){if(!source.current.getAsBoolean())throw new SaveException(false);out.write(source.bytes,at,Math.min(16384,source.bytes.length-at));}
                out.flush();if(out instanceof FileOutputStream)((FileOutputStream)out).getFD().sync();
            }
            if(!source.current.getAsBoolean())throw new SaveException(false);
            if(!pending.publish())throw new SaveException(true);
            if(!source.current.getAsBoolean())throw new SaveException(false);
            JSONObject result=source.result(name);complete=true;return result;
        }catch(SaveException failed){uncertain=failed.uncertain&&pending==null;}catch(Exception failed){uncertain=inserted&&pending==null;}
        finally{if(!complete&&pending!=null)try{if(!pending.delete())uncertain=true;}catch(Exception cleanupFailed){uncertain=true;}}
        throw new SaveException(uncertain);
    }
}
