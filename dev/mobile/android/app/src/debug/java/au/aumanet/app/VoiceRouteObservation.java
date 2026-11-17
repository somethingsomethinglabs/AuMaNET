package au.aumanet.app;

/** Route callback payloads describe an earlier event. Only a fresh platform read
 * for the same exact accepted selection can invalidate current route readiness. */
final class VoiceRouteObservation {
    static final class Selection {
        final int id;final long invalidations;
        Selection(int id){this(id,0);}
        Selection(int id,long invalidations){this.id=id;this.invalidations=invalidations;}
    }
    static boolean invalidates(Selection observed,Selection current,int actualId,boolean readSucceeded){
        return observed!=null&&observed==current&&(!readSucceeded||actualId<0||actualId!=current.id);
    }
    static boolean confirms(Selection pending,Selection current,long invalidations,int actualId,boolean readSucceeded){
        return pending!=null&&pending==current&&pending.invalidations==invalidations&&readSucceeded&&actualId>=0&&actualId==pending.id;
    }
    private VoiceRouteObservation(){}
}
