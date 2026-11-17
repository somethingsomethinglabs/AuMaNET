package au.aumanet.app;

import android.content.*;
import android.net.Uri;
import android.os.*;
import android.telecom.*;
import com.getcapacitor.JSObject;
import org.json.JSONArray;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.Executor;
import java.util.function.Consumer;

/** API34+ transactional representation of the already-authorized AuMaNET group
 * channel. No tel URI, PSTN call, contact lookup or default-dialer role.
 * Primary API: developer.android.com/reference/android/telecom/CallControl
 * Audio endpoints are supplied by Telecom, never made from a paired-device list.
 * AudioManager routing/focus ownership must be released before start(). */
final class VoiceTelecom {
    interface Host{boolean current();boolean beforeOpen();void changed();void privacy(String reason);void ended();void closed();}
    private final VoiceTelecomSession session;private final Handler main=new Handler(Looper.getMainLooper());
    static boolean supported(Context context){return Build.VERSION.SDK_INT>=34&&context.getPackageManager().hasSystemFeature("android.software.telecom");}
    static boolean previousCallClosed(){return VoiceTelecomSession.availableForNew();}
    VoiceTelecom(Context context,Host host,VoicePreferences.OutputRoute preference){
        Context app=context.getApplicationContext();Executor executor=work->main.post(work);
        VoiceTelecomSession.Scheduler scheduler=new VoiceTelecomSession.Scheduler(){public void execute(Runnable work){main.post(work);}public void later(Runnable work,long delay){main.postDelayed(work,delay);}};
        session=new VoiceTelecomSession(scheduler,(events,opened,failed)->{
            TelecomManager manager=app.getSystemService(TelecomManager.class);if(manager==null)throw new IllegalStateException();
            PhoneAccountHandle account=new PhoneAccountHandle(new ComponentName(app,VoiceTelecom.class),"aumanet-group-voice-v1");
            manager.registerPhoneAccount(new PhoneAccount.Builder(account,"AuMaNET voice").setCapabilities(PhoneAccount.CAPABILITY_SUPPORTS_TRANSACTIONAL_OPERATIONS).setSupportedUriSchemes(Collections.singletonList("aumanet")).build());
            CallAttributes attributes=new CallAttributes.Builder(account,CallAttributes.DIRECTION_OUTGOING,"AuMaNET voice channel",Uri.fromParts("aumanet","voice-channel",null)).setCallType(CallAttributes.AUDIO_CALL).setCallCapabilities(CallAttributes.SUPPORTS_SET_INACTIVE).build();
            CallControlCallback controls=new CallControlCallback(){
                public void onAnswer(int type,Consumer<Boolean> done){done.accept(false);}
                public void onCallStreamingStarted(Consumer<Boolean> done){done.accept(false);}
                public void onDisconnect(DisconnectCause cause,Consumer<Boolean> done){events.disconnect(done);}
                public void onSetActive(Consumer<Boolean> done){events.active(done);}
                public void onSetInactive(Consumer<Boolean> done){events.inactive(done);}
            };
            CallEventCallback observations=new CallEventCallback(){
                public void onAvailableCallEndpointsChanged(List<CallEndpoint> values){ArrayList<VoiceTelecomSession.Endpoint> found=new ArrayList<>();if(values==null||values.size()>64){events.available(null);return;}for(CallEndpoint value:values){VoiceTelecomSession.Endpoint endpoint=convert(value);if(endpoint!=null)found.add(endpoint);}events.available(found);}
                public void onCallEndpointChanged(CallEndpoint value){events.endpoint(convert(value));}
                public void onMuteStateChanged(boolean value){events.muted(value);}
                public void onCallStreamingFailed(int reason){if(host.current())host.privacy("Android call streaming is unavailable; microphone stays muted");}
                public void onEvent(String event,Bundle extras){/* No custom events carry microphone authority. */}
            };
            manager.addCall(attributes,executor,new OutcomeReceiver<CallControl,CallException>(){
                public void onResult(CallControl call){opened.accept(new VoiceTelecomSession.Control(){
                    public void active(VoiceTelecomSession.Done done){try{call.setActive(executor,outcome(done));}catch(RuntimeException unavailable){done.result(false);}}
                    public void endpoint(VoiceTelecomSession.Endpoint target,VoiceTelecomSession.Done done){if(!(target.platform instanceof CallEndpoint)){done.result(false);return;}try{call.requestCallEndpointChange((CallEndpoint)target.platform,executor,outcome(done));}catch(RuntimeException unavailable){done.result(false);}}
                    public void disconnect(VoiceTelecomSession.Done done){try{call.disconnect(new DisconnectCause(DisconnectCause.LOCAL),executor,new OutcomeReceiver<Void,CallException>(){public void onResult(Void ignored){done.result(true);}public void onError(CallException failure){done.result(failure.getCode()==CallException.CODE_CALL_IS_NOT_BEING_TRACKED);}});}catch(RuntimeException unavailable){done.result(false);}}
                });}
                public void onError(CallException failure){failed.run();}
            },controls,observations);
        },new VoiceTelecomSession.Listener(){public boolean current(){return host.current();}public boolean beforeOpen(){return host.beforeOpen();}public void changed(){host.changed();}public void privacy(String reason){host.privacy(reason);}public void ended(){host.ended();}public void closed(){host.closed();}},semantic(preference));
    }
    private static String semantic(VoicePreferences.OutputRoute route){switch(route){case EARPIECE:return "earpiece";case SPEAKER:return "speaker";case BLUETOOTH:case HEARING_AID:return "bluetooth";case WIRED_HEADSET:case WIRED_HEADPHONES:case USB_HEADSET:return "wired";default:return "default";}}
    private static OutcomeReceiver<Void,CallException> outcome(VoiceTelecomSession.Done done){return new OutcomeReceiver<Void,CallException>(){public void onResult(Void ignored){done.result(true);}public void onError(CallException failed){done.result(false);}};}
    private static VoiceTelecomSession.Endpoint convert(CallEndpoint value){if(value==null)return null;String type;switch(value.getEndpointType()){case CallEndpoint.TYPE_EARPIECE:type="earpiece";break;case CallEndpoint.TYPE_SPEAKER:type="speaker";break;case CallEndpoint.TYPE_BLUETOOTH:type="bluetooth";break;case CallEndpoint.TYPE_WIRED_HEADSET:type="wired";break;default:return null;}try{return new VoiceTelecomSession.Endpoint(value.getIdentifier().getUuid().toString(),type,label(value.getEndpointName()),value);}catch(Exception malformed){return null;}}
    private static String label(CharSequence raw){String text=raw==null?"Audio device":raw.toString();StringBuilder result=new StringBuilder();int count=0;for(int i=0;i<text.length()&&count<80;){int point=text.codePointAt(i);i+=Character.charCount(point);if(Character.isISOControl(point)||Character.getType(point)==Character.FORMAT||point>=0xd800&&point<=0xdfff)continue;String part=new String(Character.toChars(point));if((result.toString()+part).getBytes(StandardCharsets.UTF_8).length>256)break;result.append(part);count++;}return result.length()==0?"Audio device":result.toString();}
    void start(){session.start();}
    boolean ready(){return session.ready();}boolean focused(){return session.focused();}boolean systemMuted(){return session.systemMuted();}boolean quiet(){return session.quiet();}
    String selectedType(){for(VoiceTelecomSession.Endpoint e:session.endpoints())if(e.id.equals(session.selected()))return e.type;return "";}
    String selectedId(){return session.selected();}
    boolean bluetooth(String id){for(VoiceTelecomSession.Endpoint e:session.endpoints())if(e.id.equals(id))return e.type.equals("bluetooth");return false;}
    void select(String id,Consumer<Boolean> done){session.requestEndpoint(id,done::accept);}
    void close(Runnable finished){session.close(finished);}
    JSObject snapshot(){JSONArray endpoints=new JSONArray();for(VoiceTelecomSession.Endpoint e:session.endpoints())endpoints.put(new JSObject().put("id",e.id).put("type",e.type).put("label",e.label));return new JSObject().put("routeOwner","telecom").put("telecomAvailable",true).put("telecomState",session.state()).put("telecomError",session.error()).put("telecomEndpointId",session.selected()).put("telecomEndpoints",endpoints).put("telecomSystemMuted",session.systemMuted());}
}
