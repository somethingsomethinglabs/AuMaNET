package au.aumanet.app;

/** A pending permission/service claim. Conditional release cannot erase a newer caller. */
final class VoiceStartReservation {
    private String session="";
    private long generation;
    synchronized boolean pending(){return !session.isEmpty();}
    synchronized boolean owns(String expected){return !session.isEmpty()&&session.equals(expected);}
    synchronized boolean matches(String expected,long revision){return owns(expected)&&generation==revision;}
    synchronized boolean newerThan(long revision){return pending()&&generation>revision;}
    synchronized boolean reserve(String expected,long revision){
        if(expected==null||!expected.matches("[a-f0-9]{32}")||revision<1)throw new IllegalArgumentException("Invalid native start reservation");
        if(pending())return false;session=expected;generation=revision;return true;
    }
    synchronized boolean release(String expected,long revision){if(!matches(expected,revision))return false;session="";return true;}
    synchronized void cancel(){session="";}
}
