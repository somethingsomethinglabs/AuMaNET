package au.aumanet.app;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

/** Owner-issued signalling revision. Called under the native group monitor only. */
final class GroupVoiceCohort {
    static final long MAX_REVISION=9007199254740991L;
    private String group="";private long epoch,run,revision;
    private Map<String,String> recipients=Collections.emptyMap();
    /** Immutable IDs issued with the current revision; live transport probes cannot alter it. */
    java.util.Set<String> recipientIds(){return recipients.keySet();}
    long update(String group,long epoch,long run,Map<String,String> recipients){
        if(this.group.equals(group)&&this.epoch==epoch&&this.run==run&&this.recipients.equals(recipients))return revision;
        if(revision==MAX_REVISION)throw new IllegalStateException("Voice authority revision exhausted; restart explicitly");
        this.group=group;this.epoch=epoch;this.run=run;this.recipients=Collections.unmodifiableMap(new HashMap<>(recipients));return ++revision;
    }
    static boolean accepts(long current,long received){return current>0&&current<=MAX_REVISION&&current==received;}
}
