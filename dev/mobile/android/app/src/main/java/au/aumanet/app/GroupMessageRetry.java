package au.aumanet.app;

/** Persisted attempt numbers select bounded delays; offline time never creates
 * additional attempts. The worker emits at most one due operation per tick. */
final class GroupMessageRetry {
    static final int LIMIT=5;
    private static final long[] DELAYS={10000,30000,60000,120000};
    static long next(int attempts,long last,long now){
        if(attempts<0||last<0||now<0)throw new IllegalArgumentException("Invalid retry clock");
        if(attempts==0)return now;
        if(attempts>=LIMIT)return 0;
        long delay=DELAYS[attempts-1];
        return last>9007199254740991L-delay?0:last+delay;
    }
    static boolean due(int attempts,long last,long now){long next=next(attempts,last,now);return attempts<LIMIT&&next>0&&now>=next;}
}
