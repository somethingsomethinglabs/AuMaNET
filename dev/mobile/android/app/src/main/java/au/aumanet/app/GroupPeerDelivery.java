package au.aumanet.app;

import java.util.function.BooleanSupplier;

/** A maintenance/broadcast queue failure belongs to its exact peer, never the owner listener. */
final class GroupPeerDelivery {
    interface Send {void run()throws Exception;}
    static boolean offer(BooleanSupplier closed,Send send,Runnable detach){
        if(closed.getAsBoolean())return false;
        try{send.run();return true;}catch(Exception failed){detach.run();return false;}
    }
    private GroupPeerDelivery(){}
}
