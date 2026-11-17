package au.aumanet.app;

import java.util.*;
import java.util.concurrent.atomic.*;
import java.util.function.*;

/** Platform-independent lifetime of ONE explicit group call representation.
 * All platform callbacks are serialized by Scheduler; close denies immediately
 * on any caller thread. This policy never opens a microphone or grants consent. */
final class VoiceTelecomSession {
    static final int MAX_ENDPOINTS=16;
    static final AtomicReference<VoiceTelecomSession> owner=new AtomicReference<>();
    interface Scheduler{void execute(Runnable work);void later(Runnable work,long delay);}
    interface Done{void result(boolean confirmed);}
    interface Control{void active(Done done);void endpoint(Endpoint endpoint,Done done);void disconnect(Done done);}
    interface Platform{void open(Events events,Consumer<Control> opened,Runnable failed)throws Exception;}
    interface Listener{boolean current();boolean beforeOpen();void changed();void privacy(String reason);void ended();void closed();}
    interface Events{void available(List<Endpoint> endpoints);void endpoint(Endpoint endpoint);void muted(boolean muted);void active(Consumer<Boolean> done);void inactive(Consumer<Boolean> done);void disconnect(Consumer<Boolean> done);}
    static final class Endpoint{
        final String id,type,label;final Object platform;
        Endpoint(String id,String type,String label,Object platform){if(id==null||!id.matches("[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}")||!Arrays.asList("earpiece","speaker","bluetooth","wired").contains(type))throw new IllegalArgumentException("Unsupported Android call endpoint");this.id=id;this.type=type;this.label=label;this.platform=platform;}
    }
    private final Scheduler scheduler;private final Platform platform;private final Listener listener;
    private final AtomicBoolean closed=new AtomicBoolean();private final AtomicBoolean begun=new AtomicBoolean();
    private volatile String state="pending",error="",selected="";private volatile boolean active,systemMuted,confirmed;
    private volatile List<Endpoint> endpoints=Collections.emptyList();
    private Control control;private boolean opening,disconnecting,finishDelivered,muteKnown,routeAccepted,routeExplicit,initialAttempted;private volatile boolean routePending,initialApplied;private long routeOperation,activityOperation;private volatile String requested="";private Done routeDone;private final String preferred;
    private final ArrayList<Runnable> finishes=new ArrayList<>();
    VoiceTelecomSession(Scheduler scheduler,Platform platform,Listener listener){this(scheduler,platform,listener,"default");}
    VoiceTelecomSession(Scheduler scheduler,Platform platform,Listener listener,String preferred){this.scheduler=scheduler;this.platform=platform;this.listener=listener;this.preferred=preferred;initialApplied=preferred.equals("default");}
    static boolean availableForNew(){return owner.get()==null;}
    boolean live(){return !closed.get()&&owner.get()==this&&listener.current();}
    boolean quiet(){return confirmed;}
    String state(){return state;}String error(){return error;}String selected(){return selected;}boolean systemMuted(){return systemMuted;}
    List<Endpoint> endpoints(){return endpoints;}
    boolean focused(){return live()&&active;}
    boolean ready(){if(!focused()||!initialApplied||routePending||!error.isEmpty()||selected.isEmpty())return false;for(Endpoint e:endpoints)if(e.id.equals(selected))return requested.isEmpty()||requested.equals(selected);return false;}
    void start(){if(!begun.compareAndSet(false,true))return;scheduler.execute(()->{
        if(closed.get()||!listener.current()||!owner.compareAndSet(null,this)){state="failed";error="Android call routing is already owned or this voice session ended";closed.set(true);confirmed=true;listener.changed();finish();return;}
        if(!listener.beforeOpen()){fail("Android call notification could not be started");confirmClosed();return;}
        opening=true;
        try{platform.open(events,returned->{opening=false;control=returned;if(!live()){closePlatform();return;}long operation=++activityOperation;returned.active(ok->{if(!live()||operation!=activityOperation)return;if(!ok){fail("Android could not activate this voice channel");return;}active=true;state="active";maybeRestore();listener.changed();});scheduler.later(()->{if(live()&&activityOperation==operation&&!active&&state.equals("pending"))fail("Android call activation timed out; leave and join again");},8000);},()->{opening=false;fail("Android call registration failed; leave and join again");confirmClosed();});}
        catch(Exception unavailable){fail("Android call registration was not confirmed; restart the app before retrying");}
        scheduler.later(()->{if(opening&&!closed.get())fail("Android call registration timed out; leave and join again");},10000);
        scheduler.later(this::health,200);
    });}
    private void health(){if(!closed.get()){if(!listener.current()){close(()->{});return;}scheduler.later(this::health,200);}}
    private final Events events=new Events(){
        public void available(List<Endpoint> values){if(!live())return;if(values==null||values.size()>MAX_ENDPOINTS){fail("Android returned an unsupported call endpoint list");return;}LinkedHashMap<String,Endpoint> unique=new LinkedHashMap<>();for(Endpoint e:values){if(e==null||unique.put(e.id,e)!=null){fail("Android returned an inconsistent call endpoint list");return;}}boolean removed=!selected.isEmpty()&&!unique.containsKey(selected);if(removed)listener.privacy("Android call audio device was removed; microphone stays muted");endpoints=Collections.unmodifiableList(new ArrayList<>(unique.values()));if(removed)selected="";if(routePending&&!unique.containsKey(requested))finishRoute(false);maybeRestore();listener.changed();}
        public void endpoint(Endpoint value){if(!live())return;if(value==null){listener.privacy("Unsupported Android call audio endpoint; microphone stays muted");selected="";listener.changed();return;}if(!selected.isEmpty()&&!selected.equals(value.id)&&(!routePending||routeExplicit||!requested.equals(value.id)))listener.privacy("Android call audio changed; microphone stays muted");selected=value.id;if(routePending&&routeAccepted&&selected.equals(requested))finishRoute(true);maybeRestore();listener.changed();}
        public void muted(boolean muted){if(!live())return;if((muteKnown&&systemMuted!=muted)||!muteKnown&&muted)listener.privacy(muted?"Muted by Android call controls":"Android call controls changed; unmute explicitly in AuMaNET");systemMuted=muted;muteKnown=true;listener.changed();}
        public void active(Consumer<Boolean> done){if(!live()){done.accept(false);return;}if(state.equals("held"))listener.privacy("Android call resumed; microphone stays muted");activityOperation++;active=true;state="active";maybeRestore();listener.changed();done.accept(true);}
        public void inactive(Consumer<Boolean> done){if(!live()){done.accept(false);return;}if(!state.equals("held"))listener.privacy("Android call held; microphone stays muted");activityOperation++;active=false;state="held";listener.changed();done.accept(true);}
        public void disconnect(Consumer<Boolean> done){if(!live()){done.accept(false);return;}listener.privacy("Android ended this voice channel");closed.set(true);active=false;state="ended";finishRoute(false);listener.changed();done.accept(true);listener.ended();closePlatform();}
    };
    void requestEndpoint(String id,Done done){listener.privacy("Changing Android call audio; microphone stays muted");scheduler.execute(()->{if(!live()||control==null||routePending){done.result(false);return;}Endpoint target=null;for(Endpoint e:endpoints)if(e.id.equals(id))target=e;if(target==null){done.result(false);return;}initialApplied=true;select(target,true,done);});}
    private void maybeRestore(){if(!live()||control==null||!active||initialApplied||routePending||initialAttempted)return;Endpoint target=null;for(Endpoint e:endpoints)if(e.type.equals(preferred)){target=e;break;}if(target==null){error="Saved Android call audio is unavailable; choose a supplied endpoint";return;}if(target.id.equals(selected)){initialApplied=true;error="";return;}initialAttempted=true;select(target,false,ok->{if(ok)initialApplied=true;});}
    private void select(Endpoint target,boolean explicit,Done done){final long operation=++routeOperation;requested=target.id;routePending=true;routeAccepted=false;routeExplicit=explicit;routeDone=done;error="";listener.changed();control.endpoint(target,ok->{if(!live()||operation!=routeOperation)return;if(!ok){error="Android could not select this call audio device";listener.privacy(error);finishRoute(false);}else{routeAccepted=true;if(selected.equals(requested))finishRoute(true);}listener.changed();});scheduler.later(()->{if(live()&&routePending&&operation==routeOperation){error="Android call audio selection timed out";listener.privacy(error);finishRoute(false);listener.changed();}},8000);}
    private void finishRoute(boolean accepted){if(!routePending)return;routePending=false;routeOperation++;Done done=routeDone;routeDone=null;if(done!=null)done.result(accepted);}
    void close(Runnable finished){listener.privacy("Android call routing is closing; microphone stays muted");closed.set(true);active=false;scheduler.execute(()->{if(finishDelivered){finished.run();return;}finishRoute(false);if(finishes.size()<16)finishes.add(finished);else finished.run();if(state.equals("pending")||state.equals("active")||state.equals("held"))state="ended";listener.changed();closePlatform();scheduler.later(this::finish,6000);});}
    private void closePlatform(){if(control==null){if(!opening)confirmClosed();return;}if(disconnecting)return;disconnecting=true;control.disconnect(ok->{if(ok)confirmClosed();else{error="Android call teardown was not confirmed; restart the app before retrying";listener.changed();finish();}});}
    private void fail(String reason){listener.privacy(reason);error=reason;state="failed";closed.set(true);active=false;finishRoute(false);listener.changed();closePlatform();}
    private void confirmClosed(){if(confirmed)return;confirmed=true;owner.compareAndSet(this,null);listener.closed();finish();}
    private void finish(){if(finishDelivered)return;finishDelivered=true;for(Runnable work:new ArrayList<>(finishes))work.run();finishes.clear();}
}
