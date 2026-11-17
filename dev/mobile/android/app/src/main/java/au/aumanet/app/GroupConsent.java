package au.aumanet.app;

import java.util.concurrent.atomic.AtomicReference;

/** Last-intent native consent. A queued grant cannot overtake a later synchronous privacy denial. */
final class GroupConsent {
    static final class View {final long revision;final boolean enabled;View(long revision,boolean enabled){this.revision=revision;this.enabled=enabled;}}
    private static final class State {
        final long revision;final boolean enabled;
        State(long revision,boolean enabled){this.revision=revision;this.enabled=enabled;}
    }
    private final AtomicReference<State> current=new AtomicReference<>(new State(0,false));
    long requestEnable(){
        while(true){State before=current.get();if(before.enabled)return before.revision;State after=new State(before.revision+1,false);if(current.compareAndSet(before,after))return after.revision;}
    }
    long requestEnable(long expectedRevision){
        while(true){State before=current.get();if(before.revision!=expectedRevision||before.enabled)return -1;
            State after=new State(before.revision+1,false);if(current.compareAndSet(before,after))return after.revision;}
    }
    void deny(){
        while(true){State before=current.get();if(current.compareAndSet(before,new State(before.revision+1,false)))return;}
    }
    boolean grant(long request){
        while(true){State before=current.get();if(before.revision!=request)return false;if(before.enabled)return true;
            if(current.compareAndSet(before,new State(before.revision,true)))return true;}
    }
    boolean enabled(){return current.get().enabled;}
    View view(){State state=current.get();return new View(state.revision,state.enabled);}
    /** Native control-thread grant capture; -1 never represents consent. */
    long enabledRevision(){State state=current.get();return state.enabled?state.revision:-1;}
    boolean current(long revision){return current.get().revision==revision;}
    boolean granted(long revision){State state=current.get();return state.revision==revision&&state.enabled;}
    boolean denyIfCurrent(long revision){return denyIfCurrent(revision,false);}
    boolean denyIfCurrent(long revision,boolean requireEnabled){while(true){State before=current.get();if(before.revision!=revision||requireEnabled&&!before.enabled)return false;if(current.compareAndSet(before,new State(before.revision+1,false)))return true;}}
}
