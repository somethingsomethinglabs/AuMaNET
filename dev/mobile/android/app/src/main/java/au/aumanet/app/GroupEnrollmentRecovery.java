package au.aumanet.app;

/** Restore only the store's approved record after an unapproved attempt, never its runtime hints. */
final class GroupEnrollmentRecovery {
    static boolean tentative(boolean saved,String role,String group){return !saved&&"member".equals(role)&&group!=null&&!group.isEmpty();}
    static boolean current(long expected,long current){return expected==current;}
    private GroupEnrollmentRecovery(){}
}
