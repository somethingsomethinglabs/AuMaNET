package au.aumanet.app;

/** Conservative local pacing includes the one bootstrap grant, separately from BOOT traffic. */
final class GatewayBindBudget {
    private long started=-1;private int reserved;
    boolean reserve(int count,long now){if(count<1||count>4||now<0)throw new IllegalArgumentException("Invalid gateway send budget");if(started>=0&&now<started)return false;if(started<0||now-started>=1100){started=now;reserved=0;}if(reserved+count>4)return false;reserved+=count;return true;}
}
