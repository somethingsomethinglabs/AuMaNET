package au.aumanet.app;

import android.content.Context;
import java.lang.reflect.Method;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;

/** Fixed debug-native adapter; release builds never manufacture a voice capability.
 * The three intent suppliers must be lock-free native run flags. Group authority
 * is checked independently by the backend and the native media gate. */
final class TrustedVoiceResumeBridge {
    static final class Result {
        final String status,code;final boolean pttReady;
        Result(String status,boolean pttReady,String code){this.status=status;this.pttReady=pttReady;this.code=code;}
    }
    private static final String BACKEND="au.aumanet.app.TrustedVoiceResumeNative";
    static boolean joinMutedAvailable(){try{method("joinMuted",Context.class,TrustedConnectionScope.class,String.class,long.class,BooleanSupplier.class,BooleanSupplier.class,BooleanSupplier.class,Consumer.class);return true;}catch(ReflectiveOperationException|LinkageError unavailable){return false;}}
    static void resume(Context context,TrustedConnectionScope scope,String runId,long generation,String mode,
                       BooleanSupplier current,BooleanSupplier foreground,BooleanSupplier readiness,Consumer<Result> done){
        AtomicBoolean completed=new AtomicBoolean();Consumer<Result> once=result->{if(completed.compareAndSet(false,true))done.accept(result);};
        try{method("resume",Context.class,TrustedConnectionScope.class,String.class,long.class,String.class,BooleanSupplier.class,BooleanSupplier.class,BooleanSupplier.class,Consumer.class)
            .invoke(null,context,scope,runId,generation,mode,current,foreground,readiness,once);
        }catch(ReflectiveOperationException|LinkageError unavailable){cancel(context,runId,generation);once.accept(new Result("blocked",false,"native-voice-unavailable"));}
    }
    /** Explicit normal Join only. The commit is a short native run/privacy CAS,
     * invoked after atomic idle admission; it must not call SDK, storage or Group APIs. */
    static void joinMuted(Context context,TrustedConnectionScope scope,String runId,long generation,
                          BooleanSupplier current,BooleanSupplier foreground,BooleanSupplier commit,Consumer<Result> done){
        AtomicBoolean completed=new AtomicBoolean();Consumer<Result> once=result->{if(completed.compareAndSet(false,true))done.accept(result);};
        try{method("joinMuted",Context.class,TrustedConnectionScope.class,String.class,long.class,BooleanSupplier.class,BooleanSupplier.class,BooleanSupplier.class,Consumer.class)
            .invoke(null,context,scope,runId,generation,current,foreground,commit,once);
        }catch(ReflectiveOperationException|LinkageError unavailable){once.accept(new Result("blocked",false,"native-voice-unavailable"));}
    }
    /** Fast exact-run invalidation; backend posts only resource disposal. Safe under Group monitor. */
    static void cancel(Context context,String runId,long generation){invokeFast("cancel",context,runId,generation);}
    /** Mute changes readiness only; group membership and voice consent remain intact. */
    static void suppressReadiness(Context context,String runId,long generation){invokeFast("suppressReadiness",context,runId,generation);}
    /** Range loss closes PCM immediately, preserving only this run's existing FGS lease. */
    static void interrupt(Context context,String runId,long generation){invokeFast("interrupt",context,runId,generation);}
    /** Caller must enter this BEFORE the Group monitor. Runs only bounded scoped state changes. */
    static boolean switchWhenMediaIdle(Runnable operation){
        try{return Boolean.TRUE.equals(method("switchWhenMediaIdle",Runnable.class).invoke(null,operation));}
        catch(ClassNotFoundException releaseWithoutNativeVoice){operation.run();return true;}
        catch(ReflectiveOperationException|LinkageError unavailable){return false;}
    }
    static boolean switchWhenMediaIdle(String runId,long generation,Runnable operation){
        try{return Boolean.TRUE.equals(method("switchWhenMediaIdle",String.class,long.class,Runnable.class).invoke(null,runId,generation,operation));}
        catch(ClassNotFoundException releaseWithoutNativeVoice){operation.run();return true;}
        catch(ReflectiveOperationException|LinkageError unavailable){return false;}
    }
    private static Method method(String name,Class<?>...types)throws ReflectiveOperationException{return Class.forName(BACKEND).getDeclaredMethod(name,types);}
    private static void invokeFast(String name,Context context,String runId,long generation){try{method(name,Context.class,String.class,long.class).invoke(null,context,runId,generation);}catch(ReflectiveOperationException|LinkageError unavailable){/* No native owner can be created by an unavailable adapter. */}}
    private TrustedVoiceResumeBridge(){}
}
