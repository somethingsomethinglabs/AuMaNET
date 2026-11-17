package au.aumanet.app;
/** Debug-only fixed vocabulary. Never accepts identifiers, body bytes, signatures
 * or provider exception messages. Bounds also protect log size under packet spam. */
final class GatewayRadioQueryTrace {
 enum Stage{SCOPE,SIGN,BIND,LOCAL_ADDRESS,ENDPOINT,SEND,WAIT,PARSE,PURPOSE,COMMON,SIGNATURE,BOOT,ACCEPTED}
 enum Failure{NONE,DEADLINE,SCOPE_CHANGED,IO,FORMAT,PROVIDER}
 Stage stage=Stage.SCOPE;Failure failure=Failure.NONE;int packets,malformed,wrongPurpose,wrongCommon,badSignature,wrongBoot;
 final boolean station;final int operation;
 GatewayRadioQueryTrace(boolean station,int operation){this.station=station;this.operation=operation;}
 String line(long elapsed){String reason=failure==Failure.DEADLINE?(packets==0?"NO_REPLY":badSignature>0?"SIGNATURE_REJECTED":wrongPurpose>0?"WRONG_PURPOSE":wrongCommon>0?"UNMATCHED_REPORT":malformed>0?"MALFORMED_REPORT":"NO_ACCEPTED_REPORT"):failure.name();return "role="+(station?"STATION":"AP")+" action="+(operation==0?"QUERY":operation==1?"TRIAL":operation==2?"COMMIT":"CANCEL")+" stage="+stage.name()+" reason="+reason+" packets="+bound(packets,9999)+" malformed="+bound(malformed,9999)+" wrongPurpose="+bound(wrongPurpose,9999)+" unmatched="+bound(wrongCommon,9999)+" signatureRejected="+bound(badSignature,9999)+" wrongBoot="+bound(wrongBoot,9999)+" elapsedMs="+bound(elapsed,60000);}
 private static long bound(long value,long max){return Math.min(max,Math.max(0,value));}
}
