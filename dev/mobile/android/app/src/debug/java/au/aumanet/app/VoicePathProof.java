package au.aumanet.app;

/** Native selected-path evidence. A newer change permanently invalidates older async results. */
final class VoicePathProof {
    private long revision;
    private boolean verified;
    synchronized long invalidate(){verified=false;return ++revision;}
    synchronized long revision(){return revision;}
    synchronized boolean current(long expected){return revision==expected;}
    synchronized boolean verified(){return verified;}
    synchronized boolean apply(long expected,boolean valid){if(revision!=expected)return false;verified=valid;return true;}
}
