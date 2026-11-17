package au.aumanet.app;

import org.junit.Test;
import static org.junit.Assert.*;
import java.util.concurrent.*;

public class VoicePathProofTest {
    @Test public void selectionNotificationAloneNeverProvesAPath(){
        VoicePathProof proof=new VoicePathProof();assertFalse(proof.verified());
        long first=proof.invalidate();assertFalse(proof.verified());assertTrue(proof.current(first));
        assertTrue(proof.apply(first,true));assertTrue(proof.verified());proof.invalidate();assertFalse(proof.verified());
    }
    @Test public void oldAsyncSuccessCannotRearmAfterNewerSelectedPathChange(){
        VoicePathProof proof=new VoicePathProof();long requested=proof.revision();proof.invalidate();
        assertFalse(proof.apply(requested,true));assertFalse(proof.verified());
    }
    @Test public void staleFailureCannotOverwriteNewerVerifiedPath(){
        VoicePathProof proof=new VoicePathProof();long old=proof.revision(),current=proof.invalidate();
        assertTrue(proof.apply(current,true));assertFalse(proof.apply(old,false));assertTrue(proof.verified());
    }
    @Test public void invalidOrUnrequestedEvidenceNeverBecomesVerified(){
        VoicePathProof proof=new VoicePathProof();long current=proof.invalidate();assertTrue(proof.apply(current,false));assertFalse(proof.verified());
        assertFalse(proof.apply(current+1,true));assertFalse(proof.verified());assertTrue(proof.apply(current,true));assertTrue(proof.verified());
    }
    @Test public void delayedCallbackFromAnOlderStatsRequestIsRejectedAcrossThreads()throws Exception{
        VoicePathProof proof=new VoicePathProof();long requested=proof.revision();CountDownLatch returned=new CountDownLatch(1);ExecutorService worker=Executors.newSingleThreadExecutor();
        try{
            Future<Boolean> old=worker.submit(()->{assertTrue(returned.await(2,TimeUnit.SECONDS));return proof.apply(requested,true);});
            long newer=proof.invalidate();assertTrue(proof.apply(newer,false));returned.countDown();assertFalse(old.get(2,TimeUnit.SECONDS));assertFalse(proof.verified());
            assertTrue(proof.apply(newer,true));assertTrue(proof.verified());
        }finally{returned.countDown();worker.shutdownNow();}
    }
}
