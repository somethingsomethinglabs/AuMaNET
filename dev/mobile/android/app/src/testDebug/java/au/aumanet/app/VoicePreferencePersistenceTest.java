package au.aumanet.app;

import org.junit.Test;
import static org.junit.Assert.*;
import java.util.*;

public class VoicePreferencePersistenceTest {
    private static Map<String,Object> record(){return new HashMap<>(Map.of("version",1,"sensitivity",85,"inputMode","always-on","outputRoute","usb-headset"));}
    private static final class Storage implements VoicePreferenceStore.Storage {
        Map<String,Object> record;int writes;boolean readFailure,writeFailure,throwOnWrite;
        Storage(Map<String,Object> record){this.record=new HashMap<>(record);}
        public Map<String,?> read(){if(readFailure)throw new SecurityException("injected unreadable preferences");return new HashMap<>(record);}
        public boolean write(Map<String,Object> value){writes++;record=new HashMap<>(value);if(throwOnWrite)throw new IllegalStateException("injected provider failure");return !writeFailure;}
    }
    @Test public void legacySensitivityMigratesOnlyOnExplicitSaveAndStoresOnlySafeKeys(){
        Storage storage=new Storage(Map.of("sensitivity",85,"muted",false,"deviceId",123));VoicePreferenceStore store=new VoicePreferenceStore(storage);
        VoicePreferences.State loaded=store.load();assertEquals(85,loaded.sensitivity);assertEquals("ptt",loaded.inputMode);assertEquals(VoicePreferences.OutputRoute.DEFAULT,loaded.outputRoute);assertEquals(0,storage.writes);
        store.save(new VoicePreferences.Patch(null,"always-on",null),false);
        assertEquals(Set.of("version","sensitivity","inputMode","outputRoute"),storage.record.keySet());assertEquals(1,storage.record.get("version"));assertEquals(85,storage.record.get("sensitivity"));assertEquals("always-on",storage.record.get("inputMode"));
    }
    @Test public void validVersionOneRestoresModeAndSemanticRouteWithoutSessionOrConsent(){
        Map<String,Object> raw=record();raw.put("joined",true);raw.put("muted",false);raw.put("deafened",true);raw.put("sessionId","private-session");VoicePreferences.State restored=VoicePreferences.restore(raw);
        assertEquals(85,restored.sensitivity);assertEquals("always-on",restored.inputMode);assertEquals(VoicePreferences.OutputRoute.USB_HEADSET,restored.outputRoute);assertFalse(restored.needsRepair());
        assertEquals(4,restored.encoded().size());raw.put("inputMode","ptt");assertEquals("always-on",restored.inputMode);
    }
    @Test public void malformedVersionOneKeepsValidFieldsAndRequiresExplicitRepair(){
        Map<String,Object> raw=record();raw.put("sensitivity","85");raw.put("outputRoute",22);Storage storage=new Storage(raw);VoicePreferenceStore store=new VoicePreferenceStore(storage);
        assertEquals(50,store.load().sensitivity);assertEquals("always-on",store.load().inputMode);assertEquals(VoicePreferences.OutputRoute.DEFAULT,store.load().outputRoute);assertTrue(store.load().needsRepair());assertFalse(store.load().notice.isEmpty());
        assertThrows(IllegalStateException.class,()->store.save(new VoicePreferences.Patch(50,null,null),false));assertEquals(0,storage.writes);
        assertFalse(store.save(new VoicePreferences.Patch(67,null,null),true).needsRepair());assertEquals(1,storage.writes);
    }
    @Test public void unknownFutureOrWrongVersionTypeNeverSilentlyOverwritesRecord(){
        for(Object version:new Object[]{2,"1",Long.valueOf(1)}){
            Map<String,Object> raw=record();raw.put("version",version);Storage storage=new Storage(raw);VoicePreferenceStore store=new VoicePreferenceStore(storage);
            assertTrue(store.load().needsRepair());assertEquals("ptt",store.load().inputMode);assertEquals(50,store.load().sensitivity);
            assertThrows(IllegalStateException.class,()->store.save(new VoicePreferences.Patch(null,"always-on",null),false));assertEquals(version,storage.record.get("version"));assertEquals(0,storage.writes);
            store.save(new VoicePreferences.Patch(50,null,null),true);assertEquals(1,storage.record.get("version"));
        }
    }
    @Test public void unreadablePreferencesReportDefaultsWithoutWritingUntilRepair(){
        Storage storage=new Storage(record());storage.readFailure=true;VoicePreferenceStore store=new VoicePreferenceStore(storage);
        assertEquals(VoicePreferences.StorageState.UNAVAILABLE,store.load().storage);assertEquals("ptt",store.load().inputMode);assertEquals(0,storage.writes);
        assertThrows(IllegalStateException.class,()->store.save(new VoicePreferences.Patch(50,null,null),false));assertEquals(0,storage.writes);
        assertFalse(store.save(new VoicePreferences.Patch(50,null,null),true).needsRepair());
    }
    @Test public void failedCommitCannotMakeAlreadyMutatedProviderMemoryLookConfirmed(){
        Storage storage=new Storage(record());VoicePreferenceStore store=new VoicePreferenceStore(storage);store.load();storage.writeFailure=true;
        assertThrows(IllegalStateException.class,()->store.save(new VoicePreferences.Patch(10,"ptt",VoicePreferences.OutputRoute.SPEAKER),false));
        assertEquals(10,storage.record.get("sensitivity"));assertEquals(85,store.load().sensitivity);assertEquals("always-on",store.load().inputMode);assertEquals(VoicePreferences.OutputRoute.USB_HEADSET,store.load().outputRoute);assertTrue(store.load().needsRepair());
        storage.writeFailure=false;assertEquals(85,store.save(new VoicePreferences.Patch(null,"ptt",null),true).sensitivity);assertEquals(85,storage.record.get("sensitivity"));
    }
    @Test public void thrownStorageFailureKeepsConfirmedSettingsAndCanBeExplicitlyRetried(){
        Storage storage=new Storage(record());VoicePreferenceStore store=new VoicePreferenceStore(storage);store.load();storage.throwOnWrite=true;
        assertThrows(IllegalStateException.class,()->store.save(new VoicePreferences.Patch(20,null,null),false));assertEquals(85,store.load().sensitivity);assertEquals(VoicePreferences.StorageState.UNAVAILABLE,store.load().storage);
        storage.throwOnWrite=false;assertEquals(20,store.save(new VoicePreferences.Patch(20,null,null),true).sensitivity);assertEquals("",store.load().notice);
    }
    @Test public void unsupportedModesRoutesAndEmptyWritesCannotEnterPersistence(){
        assertThrows(IllegalArgumentException.class,()->new VoicePreferences.Patch(null,null,null));assertThrows(IllegalArgumentException.class,()->new VoicePreferences.Patch(101,null,null));
        assertThrows(IllegalArgumentException.class,()->new VoicePreferences.Patch(null,"unmuted",null));assertThrows(IllegalArgumentException.class,()->VoicePreferences.OutputRoute.parse("device-22"));
        assertThrows(IllegalArgumentException.class,()->VoicePreferences.OutputRoute.parse("bluetooth-media"));
    }
    @Test public void bluetoothPreferenceRoundTripsWithoutPersistingDeviceOrMicrophoneAuthority(){
        Storage storage=new Storage(record());VoicePreferenceStore store=new VoicePreferenceStore(storage);store.load();
        assertEquals(VoicePreferences.OutputRoute.BLUETOOTH,store.save(new VoicePreferences.Patch(null,null,VoicePreferences.OutputRoute.BLUETOOTH),false).outputRoute);
        assertEquals(VoicePreferences.OutputRoute.BLUETOOTH,new VoicePreferenceStore(storage).load().outputRoute);
        assertEquals(Set.of("version","sensitivity","inputMode","outputRoute"),storage.record.keySet());
    }
}
