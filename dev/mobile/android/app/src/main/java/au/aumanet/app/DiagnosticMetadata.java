package au.aumanet.app;

/** Pure bounds policy. No identity, source logs, storage contents or paths enter it. */
final class DiagnosticMetadata {
    static final long MAX_SAFE_INTEGER=9007199254740991L;
    static boolean safeVersion(String version){return version!=null&&version.length()<=32&&version.matches("[0-9]{1,4}\\.[0-9]{1,4}\\.[0-9]{1,4}(?:-(?:dev|alpha|beta|rc)(?:\\.[0-9]{1,4})?)?");}
    static boolean appAvailable(String version,long code){return safeVersion(version)&&code>=0&&code<=MAX_SAFE_INTEGER;}
    static boolean volumeAvailable(long free,long total){return free>=0&&total>0&&free<=total&&total<=MAX_SAFE_INTEGER;}
}
