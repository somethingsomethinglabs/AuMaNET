package au.aumanet.app;

import java.util.Map;

/** Last confirmed safe values survive a failed disk commit, including providers that already changed memory. */
final class VoicePreferenceStore {
    interface Storage {Map<String,?> read();boolean write(Map<String,Object> record);}
    private final Storage storage;
    private VoicePreferences.State current;
    VoicePreferenceStore(Storage storage){this.storage=storage;}
    synchronized VoicePreferences.State load(){
        if(current==null)try{current=VoicePreferences.restore(storage.read());}
        catch(RuntimeException unavailable){current=VoicePreferences.defaults().status(VoicePreferences.StorageState.UNAVAILABLE,"Voice preferences could not be read; safe defaults are in use. Apply a setting to retry.");}
        return current;
    }
    synchronized VoicePreferences.State save(VoicePreferences.Patch patch,boolean repair){
        VoicePreferences.State before=load();
        if(before.needsRepair()&&!repair)throw new IllegalStateException("Repair saved voice preferences in Voice / Audio settings before changing them");
        VoicePreferences.State candidate=before.patch(patch);
        try{if(!storage.write(candidate.encoded()))throw new IllegalStateException("Voice preference commit failed");}
        catch(RuntimeException unavailable){current=before.status(VoicePreferences.StorageState.UNAVAILABLE,"Voice preferences could not be saved; last confirmed settings remain selected. Apply a setting to retry.");
            throw new IllegalStateException("Voice preferences could not be saved; previous settings remain selected");}
        current=candidate;return current;
    }
}
