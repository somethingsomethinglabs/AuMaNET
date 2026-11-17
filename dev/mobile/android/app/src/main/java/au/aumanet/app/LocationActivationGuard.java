package au.aumanet.app;

/** Short native metadata guard. Callbacks MUST only write local primitive/reference
 * fields: no Group/provider/SDK/controller calls while this monitor is held. */
final class LocationActivationGuard {
    static final class Token {
        final Object source;final long run,revision;
        Token(Object source,long run,long revision){if(source==null||run<0||revision<0)throw new IllegalArgumentException("Invalid location consent token");this.source=source;this.run=run;this.revision=revision;}
        boolean same(Token other){return other!=null&&source==other.source&&run==other.run&&revision==other.revision;}
    }
    private Token current;private boolean closed;
    LocationActivationGuard(Token initial){current=initial;}
    synchronized boolean update(Token expected,Runnable fields){if(closed||!current.same(expected))return false;fields.run();return true;}
    synchronized boolean replace(Token expected,Token next,Runnable fields){if(closed||!current.same(expected))return false;current=next;fields.run();return true;}
    synchronized boolean cancel(Token expected,Runnable fields){if(closed||!current.same(expected))return false;closed=true;fields.run();return true;}
    synchronized void close(Runnable fields){closed=true;fields.run();}
}
