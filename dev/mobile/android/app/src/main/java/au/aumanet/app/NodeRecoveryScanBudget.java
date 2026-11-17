package au.aumanet.app;
/** A retained explicit connection may refresh a missing beacon, never infer trust
 * from scan success. Shared across retries/scopes to avoid quota-reset bursts. */
final class NodeRecoveryScanBudget {
 static final long INTERVAL_MS=60000;
 private long last=-1;
 synchronized boolean claim(long now){if(now<0||last>=0&&(now<last||now-last<INTERVAL_MS))return false;last=now;return true;}
}
