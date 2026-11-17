package au.aumanet.app;

import java.util.Collection;
import java.util.List;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Set;

/** Semantic route selection only; no transient Android device identity is persisted. */
final class VoiceRoutePolicy {
    static final int MAX_ROUTES=16;
    static VoicePreferences.OutputRoute forType(int type){
        switch(type){case 1:return VoicePreferences.OutputRoute.EARPIECE;case 2:return VoicePreferences.OutputRoute.SPEAKER;
            case 3:return VoicePreferences.OutputRoute.WIRED_HEADSET;case 4:return VoicePreferences.OutputRoute.WIRED_HEADPHONES;case 22:return VoicePreferences.OutputRoute.USB_HEADSET;
            case 7:case 26:return VoicePreferences.OutputRoute.BLUETOOTH;case 23:return VoicePreferences.OutputRoute.HEARING_AID;default:return null;}
    }
    static String label(int type){VoicePreferences.OutputRoute route=forType(type);return route==VoicePreferences.OutputRoute.EARPIECE?"Earpiece":route==VoicePreferences.OutputRoute.SPEAKER?"Speaker":route==VoicePreferences.OutputRoute.BLUETOOTH?"Bluetooth call audio":route==VoicePreferences.OutputRoute.HEARING_AID?"Hearing aid":"Wired / USB headset";}
    static final class Endpoint {final int id,type;Endpoint(int id,int type){this.id=id;this.type=type;}}
    /** Describes only supplied observations; no synthetic default devices. */
    static List<Endpoint> catalog(Iterable<Endpoint> observed){
        List<Endpoint> result=new ArrayList<>();Set<Integer> seen=new HashSet<>();int scanned=0;
        for(Endpoint endpoint:observed){if(++scanned>64||result.size()>=MAX_ROUTES)break;
            if(endpoint!=null&&endpoint.id>=0&&forType(endpoint.type)!=null&&seen.add(endpoint.id))result.add(endpoint);}
        return result;
    }
    static final class Choice {
        final VoicePreferences.OutputRoute selected;final String state,notice;
        Choice(VoicePreferences.OutputRoute selected,String state,String notice){this.selected=selected;this.state=state;this.notice=notice;}
    }
    static Choice choose(VoicePreferences.OutputRoute preferred,Collection<VoicePreferences.OutputRoute> available,boolean initialJoin){
        if(preferred==VoicePreferences.OutputRoute.DEFAULT){
            for(VoicePreferences.OutputRoute route:new VoicePreferences.OutputRoute[]{VoicePreferences.OutputRoute.USB_HEADSET,VoicePreferences.OutputRoute.WIRED_HEADSET,VoicePreferences.OutputRoute.BLUETOOTH,VoicePreferences.OutputRoute.HEARING_AID,
                VoicePreferences.OutputRoute.WIRED_HEADPHONES,VoicePreferences.OutputRoute.EARPIECE,VoicePreferences.OutputRoute.SPEAKER})
                if(available.contains(route))return new Choice(route,"applied","");
        }else if(available.contains(preferred))return new Choice(preferred,"applied","");
        if(initialJoin&&available.contains(VoicePreferences.OutputRoute.EARPIECE))return new Choice(VoicePreferences.OutputRoute.EARPIECE,"fallback",
            "Saved audio output is unavailable; earpiece is selected. Choose a route to change it.");
        return new Choice(null,"unavailable","Preferred audio output is unavailable; select an available route before audio resumes.");
    }
}
