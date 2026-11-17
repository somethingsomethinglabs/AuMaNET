package au.aumanet.app;

/** A passive beacon is only a hint to retry the existing checked attachment.
 * It never authenticates a node, changes a profile or grants application data. */
final class NodeRecoveryScan {
    static final long MAX_AGE_MS=90000;
    enum Result { WAITING,READY,UNAVAILABLE }
    static boolean matches(String expectedSsid,String expectedBssid,long lostAt,long now,
                           String ssid,String bssid,long scanMicros){
        if(expectedSsid==null||expectedBssid==null||ssid==null||bssid==null||lostAt<0||now<lostAt||scanMicros<=0||!bssid.matches("(?i)(?:[0-9a-f]{2}:){5}[0-9a-f]{2}"))return false;
        long seen=scanMicros/1000;
        return seen>lostAt&&seen<=now&&now-seen<=MAX_AGE_MS&&expectedSsid.equals(ssid)&&
            expectedBssid.equalsIgnoreCase(bssid.replace(":",""));
    }
    private NodeRecoveryScan(){}
}
