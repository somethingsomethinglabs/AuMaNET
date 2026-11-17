package au.aumanet.app;

import org.junit.Test;
import static org.junit.Assert.*;
import java.util.*;
import static au.aumanet.app.VoicePreferences.OutputRoute.*;

public class VoiceRoutePolicyTest {
    @Test public void bluetoothCallRoutesAndHearingAidsAreSelectableButMediaOnlyA2dpIsNot(){
        assertEquals(BLUETOOTH,VoicePreferences.OutputRoute.parse("bluetooth"));
        assertEquals(HEARING_AID,VoicePreferences.OutputRoute.parse("hearing-aid"));
        assertEquals(BLUETOOTH,VoiceRoutePolicy.choose(DEFAULT,List.of(EARPIECE,SPEAKER,BLUETOOTH),true).selected);
        assertEquals(BLUETOOTH,VoiceRoutePolicy.choose(BLUETOOTH,List.of(BLUETOOTH,USB_HEADSET),false).selected);
        assertNull(VoiceRoutePolicy.choose(BLUETOOTH,List.of(EARPIECE,SPEAKER),false).selected);
        assertEquals(EARPIECE,VoiceRoutePolicy.choose(BLUETOOTH,List.of(EARPIECE,SPEAKER),true).selected);
        assertNull(VoiceRoutePolicy.forType(8));
    }
    @Test public void defaultPrefersPrivateAvailableOutputBeforeSpeaker(){
        assertEquals(USB_HEADSET,VoiceRoutePolicy.choose(DEFAULT,List.of(SPEAKER,EARPIECE,USB_HEADSET),true).selected);
        assertEquals(EARPIECE,VoiceRoutePolicy.choose(DEFAULT,List.of(SPEAKER,EARPIECE),true).selected);
        assertEquals(SPEAKER,VoiceRoutePolicy.choose(DEFAULT,List.of(SPEAKER),true).selected);
    }
    @Test public void explicitAvailablePreferenceIsAppliedWithoutChangingItsSemanticValue(){
        VoiceRoutePolicy.Choice result=VoiceRoutePolicy.choose(SPEAKER,List.of(USB_HEADSET,EARPIECE,SPEAKER),true);assertEquals(SPEAKER,result.selected);assertEquals("applied",result.state);assertEquals("",result.notice);
    }
    @Test public void missingSavedHeadsetAtFreshJoinCanOnlyFallBackToEarpieceAndReportsIt(){
        VoiceRoutePolicy.Choice safe=VoiceRoutePolicy.choose(USB_HEADSET,List.of(SPEAKER,EARPIECE),true);assertEquals(EARPIECE,safe.selected);assertEquals("fallback",safe.state);assertFalse(safe.notice.isEmpty());
        VoiceRoutePolicy.Choice blocked=VoiceRoutePolicy.choose(USB_HEADSET,List.of(SPEAKER),true);assertNull(blocked.selected);assertEquals("unavailable",blocked.state);
    }
    @Test public void activeUnavailablePreferenceNeverSilentlySwitchesToAnotherOutput(){
        VoiceRoutePolicy.Choice result=VoiceRoutePolicy.choose(USB_HEADSET,List.of(EARPIECE,SPEAKER),false);assertNull(result.selected);assertEquals("unavailable",result.state);
        assertNull(VoiceRoutePolicy.choose(DEFAULT,Collections.emptyList(),true).selected);
    }
    @Test public void catalogReportsOnlyObservedSupportedTypesAndNeverInventsDevices(){
        List<VoiceRoutePolicy.Endpoint> devices=VoiceRoutePolicy.catalog(List.of(new VoiceRoutePolicy.Endpoint(1,1),new VoiceRoutePolicy.Endpoint(2,2),new VoiceRoutePolicy.Endpoint(3,7),new VoiceRoutePolicy.Endpoint(4,8),new VoiceRoutePolicy.Endpoint(5,26)));
        assertEquals(4,devices.size());assertEquals(EARPIECE,VoiceRoutePolicy.forType(devices.get(0).type));assertEquals(SPEAKER,VoiceRoutePolicy.forType(devices.get(1).type));assertEquals(BLUETOOTH,VoiceRoutePolicy.forType(7));assertEquals(BLUETOOTH,VoiceRoutePolicy.forType(26));assertNull(VoiceRoutePolicy.forType(8));assertEquals(HEARING_AID,VoiceRoutePolicy.forType(23));assertTrue(VoiceRoutePolicy.catalog(Collections.emptyList()).isEmpty());
        assertEquals("Earpiece",VoiceRoutePolicy.label(1));assertEquals("Speaker",VoiceRoutePolicy.label(2));assertEquals("Wired / USB headset",VoiceRoutePolicy.label(22));
    }
    @Test public void catalogBoundsAndDeduplicatesTransientIdsWithoutSavingThemAsPreferences(){
        List<VoiceRoutePolicy.Endpoint> observed=new ArrayList<>();observed.add(new VoiceRoutePolicy.Endpoint(-1,1));observed.add(new VoiceRoutePolicy.Endpoint(1,1));observed.add(new VoiceRoutePolicy.Endpoint(1,2));
        for(int id=2;id<=100;id++)observed.add(new VoiceRoutePolicy.Endpoint(id,22));
        List<VoiceRoutePolicy.Endpoint> result=VoiceRoutePolicy.catalog(observed);assertEquals(16,result.size());assertEquals(16,result.stream().map(device->device.id).distinct().count());
        assertEquals("usb-headset",VoiceRoutePolicy.forType(result.get(15).type).key);assertEquals(Set.of("version","sensitivity","inputMode","outputRoute"),VoicePreferences.defaults().encoded().keySet());
    }
}
