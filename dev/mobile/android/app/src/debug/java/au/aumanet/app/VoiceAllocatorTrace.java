package au.aumanet.app;

import android.content.Context;
import android.os.SystemClock;
import com.getcapacitor.JSObject;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.webrtc.Logging;

/** Explicit DEBUG-only private logcat capture window. No recording, audio owner,
 * network request, source, track or session is created. Timer survives UI teardown. */
final class VoiceAllocatorTrace {
    private static final VoiceAllocatorTraceWindow WINDOW=new VoiceAllocatorTraceWindow();
    private static final ScheduledExecutorService TIMER=Executors.newSingleThreadScheduledExecutor(work->{Thread thread=new Thread(work,"aumanet-allocator-trace-expiry");thread.setDaemon(true);return thread;});
    static synchronized JSObject begin(Context context,long duration){
        if((context.getApplicationInfo().flags&android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)==0)throw new IllegalStateException("Allocator trace is unavailable");
        // Load only the SDK library; never create a factory/ADM or ask permissions.
        VoiceLabEngine.initializeLibrary(context);
        VoiceAllocatorTraceWindow.Ticket ticket=WINDOW.begin(SystemClock.elapsedRealtime(),duration);
        try{Logging.enableLogToDebugOutput(Logging.Severity.LS_INFO);
            TIMER.schedule(()->expire(ticket),duration,TimeUnit.MILLISECONDS);
        }catch(RuntimeException|LinkageError failure){WINDOW.cancel(ticket);Logging.enableLogToDebugOutput(Logging.Severity.LS_WARNING);throw failure;}
        return new JSObject().put("schema","aumanet.voice-allocator-trace.v1").put("source","device").put("enabled",true).put("expiresInMs",duration).put("privateLogcatOnly",true);
    }
    private static synchronized void expire(VoiceAllocatorTraceWindow.Ticket ticket){long now=SystemClock.elapsedRealtime();if(WINDOW.expire(ticket,now))Logging.enableLogToDebugOutput(Logging.Severity.LS_WARNING);else{long remaining=WINDOW.remaining(ticket,now);if(remaining>0)TIMER.schedule(()->expire(ticket),remaining,TimeUnit.MILLISECONDS);}}
    private VoiceAllocatorTrace(){}
}
