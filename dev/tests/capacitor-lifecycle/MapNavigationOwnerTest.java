package au.aumanet.app.maps;
import java.util.concurrent.atomic.AtomicInteger;

/** Executes actual map registry navigation ownership; no files, UI, maps or sessions are fabricated. */
public final class MapNavigationOwnerTest {
    static int assertions;static void check(boolean ok){assertions++;if(!ok)throw new AssertionError("Map navigation owner assertion failed");}
    public static void main(String[] args){Object first=new Object(),replacement=new Object();AtomicInteger oldCalls=new AtomicInteger(),newCalls=new AtomicInteger();
        MapFileRegistry.registerCancellation(first,oldCalls::incrementAndGet);MapFileRegistry.cancelForNavigation(first);check(oldCalls.get()==1);
        MapFileRegistry.registerCancellation(replacement,newCalls::incrementAndGet);MapFileRegistry.cancelForNavigation(first);check(oldCalls.get()==1&&newCalls.get()==0);
        MapFileRegistry.removeCancellation(first);MapFileRegistry.cancelForNavigation(replacement);check(newCalls.get()==1);
        MapFileRegistry.removeCancellation(replacement);MapFileRegistry.cancelForNavigation(replacement);check(newCalls.get()==1);
        System.out.println("{\"status\":\"passed\",\"testCount\":1,\"assertionCount\":"+assertions+"}");
    }
}
