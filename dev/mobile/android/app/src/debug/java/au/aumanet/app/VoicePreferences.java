package au.aumanet.app;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/** Safe scalar preferences only. Never store microphone consent or a media session here. */
final class VoicePreferences {
    static final int DEFAULT_SENSITIVITY = 50;
    static final int VERSION=1;
    static final String DEFAULT_MODE="ptt";
    enum OutputRoute {
        DEFAULT("default"),EARPIECE("earpiece"),SPEAKER("speaker"),WIRED_HEADSET("wired-headset"),WIRED_HEADPHONES("wired-headphones"),USB_HEADSET("usb-headset"),BLUETOOTH("bluetooth"),HEARING_AID("hearing-aid");
        final String key;
        OutputRoute(String key){this.key=key;}
        static OutputRoute parse(String key){for(OutputRoute value:values())if(value.key.equals(key))return value;throw new IllegalArgumentException("Unsupported voice output preference");}
    }
    enum StorageState {
        DEFAULTS("defaults"),LEGACY("legacy"),CURRENT("current"),INVALID("invalid"),UNAVAILABLE("unavailable");
        final String key;StorageState(String key){this.key=key;}
    }
    static final class State {
        final int sensitivity;
        final String inputMode;
        final OutputRoute outputRoute;
        final StorageState storage;
        final String notice;
        State(int sensitivity,String inputMode,OutputRoute outputRoute,StorageState storage,String notice){
            this.sensitivity=validateSensitivity(sensitivity);this.inputMode=validateInputMode(inputMode);this.outputRoute=outputRoute;this.storage=storage;this.notice=notice;
            if(outputRoute==null||storage==null||notice==null)throw new IllegalArgumentException("Incomplete voice preferences");
        }
        boolean needsRepair(){return storage==StorageState.INVALID||storage==StorageState.UNAVAILABLE;}
        State status(StorageState value,String message){return new State(sensitivity,inputMode,outputRoute,value,message);}
        State patch(Patch patch){return new State(patch.sensitivity==null?sensitivity:patch.sensitivity,patch.inputMode==null?inputMode:patch.inputMode,
            patch.outputRoute==null?outputRoute:patch.outputRoute,StorageState.CURRENT,"");}
        Map<String,Object> encoded(){
            Map<String,Object> result=new LinkedHashMap<>();result.put("version",VERSION);result.put("sensitivity",sensitivity);result.put("inputMode",inputMode);result.put("outputRoute",outputRoute.key);
            return Collections.unmodifiableMap(result);
        }
    }
    static final class Patch {
        final Integer sensitivity;final String inputMode;final OutputRoute outputRoute;
        Patch(Integer sensitivity,String inputMode,OutputRoute outputRoute){
            if(sensitivity==null&&inputMode==null&&outputRoute==null)throw new IllegalArgumentException("Choose a voice preference to save");
            if(sensitivity!=null)validateSensitivity(sensitivity);if(inputMode!=null)validateInputMode(inputMode);
            this.sensitivity=sensitivity;this.inputMode=inputMode;this.outputRoute=outputRoute;
        }
    }
    enum Profile {
        LOW("low", 3), BALANCED("balanced", 2), HIGH("high", 0);
        final String key;
        final int gmmMode;
        Profile(String key, int gmmMode) { this.key = key; this.gmmMode = gmmMode; }
    }
    private VoicePreferences() {}
    static int validateSensitivity(int value) {
        if (value < 0 || value > 100) throw new IllegalArgumentException("Sensitivity must be an integer from 0 to 100");
        return value;
    }
    /** SharedPreferences getAll().get(...) may contain a wrong type after corruption/migration. */
    static int restoreSensitivity(Object saved) {
        if (!(saved instanceof Integer)) return DEFAULT_SENSITIVITY;
        int value = (Integer) saved;
        return value >= 0 && value <= 100 ? value : DEFAULT_SENSITIVITY;
    }
    static String validateInputMode(String value){if(!"ptt".equals(value)&&!"always-on".equals(value))throw new IllegalArgumentException("Unknown voice input mode");return value;}
    /** Output/sensitivity writes cannot replace an explicit per-run PTT mode with
     * the independently saved mode. Only a mode patch selects a new live mode. */
    static String activeMode(String current,Patch patch,State confirmed){return validateInputMode(patch.inputMode==null?current:confirmed.inputMode);}
    static State defaults(){return new State(DEFAULT_SENSITIVITY,DEFAULT_MODE,OutputRoute.DEFAULT,StorageState.DEFAULTS,"");}
    /** Decode only safe preference keys. Session, mute, deafen and device IDs are never restored. */
    static State restore(Map<String,?> saved){
        if(saved==null)throw new IllegalArgumentException("Voice preference storage returned no record");
        if(saved.isEmpty())return defaults();
        Object version=saved.get("version");
        if(!saved.containsKey("version")){
            Object raw=saved.get("sensitivity");boolean valid=!saved.containsKey("sensitivity")||raw instanceof Integer&&(Integer)raw>=0&&(Integer)raw<=100;
            return new State(restoreSensitivity(raw),DEFAULT_MODE,OutputRoute.DEFAULT,valid?StorageState.LEGACY:StorageState.INVALID,
                valid?"":"Saved voice preferences were invalid; safe defaults are in use. Apply a setting to repair them.");
        }
        if(!(version instanceof Integer)||(Integer)version!=VERSION)return defaults().status(StorageState.INVALID,
            "Stored voice preferences use an unsupported format; defaults are in use. Apply a setting to save version 1.");
        Object rawSensitivity=saved.get("sensitivity"),rawMode=saved.get("inputMode"),rawRoute=saved.get("outputRoute");
        boolean valid=rawSensitivity instanceof Integer&&(Integer)rawSensitivity>=0&&(Integer)rawSensitivity<=100;
        int sensitivity=restoreSensitivity(rawSensitivity);String mode=DEFAULT_MODE;OutputRoute route=OutputRoute.DEFAULT;
        if(rawMode instanceof String&&("ptt".equals(rawMode)||"always-on".equals(rawMode)))mode=(String)rawMode;else valid=false;
        if(rawRoute instanceof String){try{route=OutputRoute.parse((String)rawRoute);}catch(IllegalArgumentException unknown){valid=false;}}else valid=false;
        return new State(sensitivity,mode,route,valid?StorageState.CURRENT:StorageState.INVALID,valid?"":"Saved voice preferences were invalid; safe defaults are in use. Apply a setting to repair them.");
    }
    static Profile profile(int sensitivity) {
        validateSensitivity(sensitivity);
        return sensitivity <= 33 ? Profile.LOW : sensitivity <= 66 ? Profile.BALANCED : Profile.HIGH;
    }
    static String profileKey(int sensitivity) { return profile(sensitivity).key; }
}
