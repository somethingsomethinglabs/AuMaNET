package au.aumanet.app;
import java.util.function.BooleanSupplier;
import java.util.function.LongSupplier;
/** Both wall expiry and the captured monotonic deadline are checked at actual dequeue/write. */
final class GroupTextExpiry {
    static BooleanSupplier guard(long expires,long now,long elapsed,LongSupplier wall,LongSupplier ticks){long deadline=elapsed+Math.max(0,Math.min(GroupTextWire.TTL,expires-now));return()->wall.getAsLong()<expires&&ticks.getAsLong()<deadline;}
}
