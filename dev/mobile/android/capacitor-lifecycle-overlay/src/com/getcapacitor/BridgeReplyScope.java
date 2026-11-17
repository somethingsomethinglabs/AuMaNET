package com.getcapacitor;

import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicReference;
import java.util.Map;

/** UI/document delivery lifetime only; never grants or closes native service authority. */
public final class BridgeReplyScope {
    private static final Object CLOSED=new Object();
    private final AtomicReference<Object> current=new AtomicReference<>(new Object());
    private final Object retention=new Object();
    public static final class Ticket {
        private final BridgeReplyScope owner;private final Object document;
        private Ticket(BridgeReplyScope owner,Object document){this.owner=owner;this.document=document;}
    }
    public Ticket capture(){return new Ticket(this,current.get());}
    public boolean accepts(Ticket ticket){Object observed=current.get();return ticket!=null&&ticket.owner==this&&observed!=CLOSED&&observed==ticket.document;}
    public boolean isClosed(){return current.get()==CLOSED;}
    public boolean advance(){return advanceAndClear(null);}
    public boolean advanceAndClear(Map<?,?> retained){synchronized(retention){if(current.get()==CLOSED)return false;current.set(new Object());if(retained!=null)retained.clear();return true;}}
    public <K,V> boolean retain(Ticket ticket,Map<K,V> retained,K key,V value){synchronized(retention){if(!accepts(ticket))return false;retained.put(key,value);return true;}}
    public void close(){synchronized(retention){current.set(CLOSED);}}
    public boolean post(Ticket ticket,Executor ui,Runnable delivery){
        if(!accepts(ticket))return false;
        ui.execute(()->{if(accepts(ticket))delivery.run();});return true;
    }
}
