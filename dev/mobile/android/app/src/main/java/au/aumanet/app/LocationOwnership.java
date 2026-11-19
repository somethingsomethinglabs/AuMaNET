package au.aumanet.app;

import java.util.concurrent.atomic.AtomicReference;

/** Native demand policy only: foreground view and an explicit, cancellable sharing-service lease. */
final class LocationOwnership {
    static final class View {
        final boolean foreground,background,pending;private final State marker;
        private View(State state){foreground=!state.foreground.isEmpty();background=!state.background.isEmpty();pending=!state.pending.isEmpty();marker=state;}
        boolean hasSharingDemand(){return pending||background;}
    }
    private static final class State {
        final String foreground,background,pending;final long revision;
        State(String foreground,String background,String pending,long revision){this.foreground=foreground;this.background=background;this.pending=pending;this.revision=revision;}
    }
    private final AtomicReference<State> state=new AtomicReference<>(new State("","","",0));
    void foreground(String token){if(token==null||token.isEmpty())throw new IllegalArgumentException("Missing location owner");while(true){State before=state.get();if(state.compareAndSet(before,new State(token,before.background,before.pending,before.revision)))return;}}
    void endForeground(String token){while(true){State before=state.get();if(!before.foreground.equals(token))return;if(state.compareAndSet(before,new State("",before.background,before.pending,before.revision)))return;}}
    long prepareBackground(String token){
        if(token==null||token.isEmpty())throw new IllegalArgumentException("Missing sharing owner");
        while(true){State before=state.get();if(!before.background.isEmpty()&&!before.background.equals(token))throw new IllegalStateException("Another location-sharing owner is active");
            State after=new State(before.foreground,before.background,token,before.revision+1);if(state.compareAndSet(before,after))return after.revision;}
    }
    boolean activateBackground(String token,long revision){while(true){State before=state.get();if(before.revision!=revision||!before.pending.equals(token))return false;if(state.compareAndSet(before,new State(before.foreground,token,"",revision)))return true;}}
    boolean endBackground(String token){while(true){State before=state.get();if(!before.background.equals(token)&&!before.pending.equals(token))return false;if(state.compareAndSet(before,new State(before.foreground,"","",before.revision+1)))return true;}}
    /** A delayed pause may release only the provider activation it captured. */
    boolean endBackground(String token,long revision){while(true){State before=state.get();if(before.revision!=revision||!before.background.equals(token)&&!before.pending.equals(token))return false;if(state.compareAndSet(before,new State(before.foreground,"","",before.revision+1)))return true;}}
    void interrupt(){while(true){State before=state.get();if(state.compareAndSet(before,new State("","","",before.revision+1)))return;}}
    boolean wantsCapture(){State value=state.get();return !value.foreground.isEmpty()||!value.background.isEmpty();}
    boolean foreground(){return !state.get().foreground.isEmpty();}
    boolean ownsForeground(String token){return state.get().foreground.equals(token)&&!token.isEmpty();}
    boolean background(){return !state.get().background.isEmpty();}
    boolean background(String token){return state.get().background.equals(token)&&!token.isEmpty();}
    boolean pending(){return !state.get().pending.isEmpty();}
    View view(){return new View(state.get());}
    boolean current(View view){return view!=null&&state.get()==view.marker;}
}
