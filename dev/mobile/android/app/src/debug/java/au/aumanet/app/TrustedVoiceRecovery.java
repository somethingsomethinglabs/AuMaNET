package au.aumanet.app;

/** Exact-run caller owns this budget across master replacements. No consent,
 * microphone, provider, network or storage operation is performed here. */
final class TrustedVoiceRecovery {
    enum Decision { NONE, WAIT, REBUILD, REVIEW }
    static final int MAX_CONSECUTIVE=2;
    private int attempts;
    private long due=-1,lastAttempt=-1,stableProof;
    static TrustedVoiceRecovery continueRun(TrustedVoiceRecovery previous,String oldId,long oldGeneration,String id,long generation){
        return previous!=null&&oldId!=null&&oldId.equals(id)&&oldGeneration==generation?previous:new TrustedVoiceRecovery();
    }
    static String masterFailure(String reason){
        return "Selected Wi-Fi network or address changed; reconnect explicitly".equals(reason)||
            "Selected Wi-Fi network lost; restart explicitly".equals(reason)||
            "Selected Wi-Fi address changed; reconnect explicitly".equals(reason)||"Native ICE gathering route expired".equals(reason)?"transport":"review";
    }
    Decision observe(String kind,long verifiedStableAt,long now){
        if(now<0||verifiedStableAt<0||verifiedStableAt>now)return Decision.REVIEW;
        // A proof is emitted only after 30 continuous seconds of all verified
        // native peers. Old proofs cannot replenish a rapid failure loop.
        if(verifiedStableAt>stableProof&&verifiedStableAt>lastAttempt){attempts=0;stableProof=verifiedStableAt;due=-1;}
        if(kind.equals("review"))return Decision.REVIEW;
        if(kind.equals("none")){due=-1;return Decision.NONE;}
        if(!kind.equals("transport"))return Decision.REVIEW;
        if(due<0){if(attempts>=MAX_CONSECUTIVE)return Decision.REVIEW;long delay=attempts==0?2000:5000;if(now>Long.MAX_VALUE-delay)return Decision.REVIEW;due=now+delay;}
        if(now<due)return Decision.WAIT;
        attempts++;lastAttempt=now;due=-1;return Decision.REBUILD;
    }
    int attempts(){return attempts;}
}
