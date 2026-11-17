package au.aumanet.app;

/** Benchmark owns no microphone consent. Optional native voice must explicitly
 * confirm its exact managed media is quiet before measurement can begin. */
final class LinkBenchmarkVoice {
    private static boolean installed;
    static synchronized void install(){
        if(installed)return;
        LinkBenchmarkTraffic.install(new LinkBenchmarkTraffic.Quiet(){
            public boolean enter(Object ticket){
                try{return Boolean.TRUE.equals(Class.forName("au.aumanet.app.TrustedVoiceResumeNative").getDeclaredMethod("benchmarkEnter",Object.class).invoke(null,ticket));}
                catch(ClassNotFoundException noNativeVoice){return true;}
                catch(ReflectiveOperationException|LinkageError unavailable){return false;}
            }
            public void leave(Object ticket){
                try{Class.forName("au.aumanet.app.TrustedVoiceResumeNative").getDeclaredMethod("benchmarkLeave",Object.class).invoke(null,ticket);}
                catch(ReflectiveOperationException|LinkageError unavailable){/* Never create media from an unavailable backend. */}
            }
        });
        installed=true;
    }
    private LinkBenchmarkVoice(){}
}
