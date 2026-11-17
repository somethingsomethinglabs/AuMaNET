package au.aumanet.app;
import java.util.Set;
/** First authenticated hydration may follow an epoch-bearing challenge; established pins are immutable at that epoch. */
final class GroupRosterEpoch {
    static void require(long current,long incoming,boolean established,Set<String> before,Set<String> after){if(incoming<current||established&&incoming==current&&!before.equals(after))throw new SecurityException("Membership pins changed without a new authority epoch");}
}
