package au.aumanet.app;

/** First initialization only. The engine keeps receive/transmit closed until a
 * real target is stable after capture activation. Never used to rearm a call. */
final class VoiceInitialRoute {
    static final long SETTLE_MS=300,DEADLINE_MS=3000;
    enum Decision{WAIT,CONFIRM,FAILED}
    final VoiceRouteObservation.Selection selection;
    final String state,notice;
    private long started=-1,stable=-1,last=-1;private boolean finished;
    VoiceInitialRoute(VoiceRouteObservation.Selection selection,String state,String notice){this.selection=selection;this.state=state;this.notice=notice;}
    boolean started(){return started>=0;}
    boolean pending(){return !finished;}
    void cancel(){finished=true;}
    Decision observe(VoiceRouteObservation.Selection current,boolean captureStarted,int actual,boolean readable,long now){
        if(finished||current!=selection||!readable||now<0||last>now){finished=true;return Decision.FAILED;}last=now;
        if(started<0){if(!captureStarted)return Decision.WAIT;started=now;}
        if(now-started>=DEADLINE_MS){finished=true;return Decision.FAILED;}
        if(!captureStarted||actual!=selection.id||actual<0){stable=-1;return Decision.WAIT;}
        if(stable<0)stable=now;
        if(now-stable<SETTLE_MS)return Decision.WAIT;
        finished=true;return Decision.CONFIRM;
    }
}
