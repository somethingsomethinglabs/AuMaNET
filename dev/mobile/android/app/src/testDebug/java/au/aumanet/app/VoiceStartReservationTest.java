package au.aumanet.app;

import org.junit.Test;
import static org.junit.Assert.*;
import java.util.concurrent.*;

public class VoiceStartReservationTest {
    private static final String A="a".repeat(32),B="b".repeat(32);
    @Test public void pendingPermissionClaimBlocksOtherStartsWithoutReplacingOwner(){
        VoiceStartReservation reservation=new VoiceStartReservation();assertTrue(reservation.reserve(A,1));assertFalse(reservation.reserve(B,2));
        assertTrue(reservation.pending());assertTrue(reservation.matches(A,1));assertFalse(reservation.owns(B));
    }
    @Test public void oldPermissionCallbackOrServiceCleanupCannotClearReplacement(){
        VoiceStartReservation reservation=new VoiceStartReservation();assertTrue(reservation.reserve(A,1));reservation.cancel();assertTrue(reservation.reserve(B,3));
        assertFalse(reservation.release(A,1));assertTrue(reservation.matches(B,3));assertTrue(reservation.newerThan(1));assertFalse(reservation.newerThan(3));
    }
    @Test public void sameSessionIdABAStillRequiresExactGeneration(){
        VoiceStartReservation reservation=new VoiceStartReservation();assertTrue(reservation.reserve(A,1));assertTrue(reservation.release(A,1));assertTrue(reservation.reserve(A,3));
        assertFalse(reservation.release(A,1));assertFalse(reservation.matches(A,1));assertTrue(reservation.matches(A,3));
    }
    @Test public void exactReleaseAndCancelNeverPretendTheOldClaimStillExists(){
        VoiceStartReservation reservation=new VoiceStartReservation();assertFalse(reservation.owns(""));assertFalse(reservation.matches("",0));
        assertTrue(reservation.reserve(A,1));assertFalse(reservation.release(B,1));assertFalse(reservation.release(A,2));assertTrue(reservation.release(A,1));assertFalse(reservation.pending());
        assertTrue(reservation.reserve(B,2));reservation.cancel();assertFalse(reservation.owns(B));assertFalse(reservation.newerThan(1));
    }
    @Test public void malformedOrUnversionedClaimsCannotReserveMedia(){
        VoiceStartReservation reservation=new VoiceStartReservation();assertThrows(IllegalArgumentException.class,()->reservation.reserve(null,1));
        assertThrows(IllegalArgumentException.class,()->reservation.reserve("bad",1));assertThrows(IllegalArgumentException.class,()->reservation.reserve(A,0));assertFalse(reservation.pending());
    }
    @Test public void concurrentClaimsHaveExactlyOneOwner()throws Exception{
        VoiceStartReservation reservation=new VoiceStartReservation();ExecutorService workers=Executors.newFixedThreadPool(2);CountDownLatch begin=new CountDownLatch(1);
        try{
            Future<Boolean> first=workers.submit(()->{assertTrue(begin.await(2,TimeUnit.SECONDS));return reservation.reserve(A,1);});
            Future<Boolean> second=workers.submit(()->{assertTrue(begin.await(2,TimeUnit.SECONDS));return reservation.reserve(B,2);});begin.countDown();
            boolean a=first.get(2,TimeUnit.SECONDS),b=second.get(2,TimeUnit.SECONDS);assertNotEquals(a,b);assertEquals(a,reservation.matches(A,1));assertEquals(b,reservation.matches(B,2));
        }finally{begin.countDown();workers.shutdownNow();}
    }
}
