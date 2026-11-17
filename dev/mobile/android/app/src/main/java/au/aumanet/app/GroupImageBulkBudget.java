package au.aumanet.app;
/** One coalesced low-priority bulk slot, never an overdue catch-up burst. */
final class GroupImageBulkBudget {
    static final long IDLE_MS=250,JOINED_MS=500,VOICE_MS=2000;
    private long last=-1;
    boolean ready(long now,boolean voice){return ready(now,voice,voice);}
    boolean claim(long now,boolean voice){return claim(now,voice,voice);}
    boolean ready(long now,boolean joined,boolean active){long spacing=active?VOICE_MS:joined?JOINED_MS:IDLE_MS;return now>=0&&(last<0||now>=last&&now-last>=spacing);}
    boolean claim(long now,boolean joined,boolean active){if(!ready(now,joined,active))return false;last=now;return true;}
}
