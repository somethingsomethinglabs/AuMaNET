package au.aumanet.app;

/** Provider-free cache. Android callback values are authoritative; callback code
 * must not synchronously query the provider and mistake its stale/null answer
 * for loss. Readers see one immutable pair, including its initial-delivery bits. */
final class VoiceNetworkObservation<C,L> {
    static final class Snapshot<C,L> {
        final C capabilities;final L links;final boolean capabilitiesSeen,linksSeen;
        Snapshot(C c,L l,boolean cs,boolean ls){capabilities=c;links=l;capabilitiesSeen=cs;linksSeen=ls;}
        boolean complete(){return capabilitiesSeen&&linksSeen;}
    }
    private volatile Snapshot<C,L> current;
    VoiceNetworkObservation(C capabilities,L links){current=new Snapshot<>(capabilities,links,false,false);}
    Snapshot<C,L> snapshot(){return current;}
    synchronized Snapshot<C,L> capabilities(C value){Snapshot<C,L> old=current;return current=new Snapshot<>(value,old.links,true,old.linksSeen);}
    synchronized Snapshot<C,L> links(L value){Snapshot<C,L> old=current;return current=new Snapshot<>(old.capabilities,value,old.capabilitiesSeen,true);}
}
