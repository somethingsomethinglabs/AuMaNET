package au.aumanet.app;

/** One-use scoped foreground confirmation; does not own, stop or restart any runtime session. */
final class GroupNameRepair {
    interface Write {void run()throws Exception;}
    static final long TTL=30000;
    static final class Scope {
        final String process,self,group;final long epoch,selfRevision,groupRevision,generation,run;
        Scope(String p,String s,String g,long e,long sr,long gr,long n,long r){process=p;self=s;group=g;epoch=e;selfRevision=sr;groupRevision=gr;generation=n;run=r;}
        boolean same(Scope other){return other!=null&&process.equals(other.process)&&self.equals(other.self)&&group.equals(other.group)&&epoch==other.epoch&&selfRevision==other.selfRevision&&groupRevision==other.groupRevision&&generation==other.generation&&run==other.run;}
    }
    private Scope scope;private String token;private long expires;
    void prepare(Scope expected,Scope current,String token,long now){clear();if(!expected.same(current)||!token.matches("[a-f0-9]{64}")||now<0||now>Long.MAX_VALUE-TTL)throw new IllegalStateException("Name repair scope changed");GroupNamePolicy.next(current.generation);scope=current;this.token=token;expires=now+TTL;}
    long consume(Scope expected,Scope current,String supplied,long now){Scope captured=scope;String issued=token;long deadline=expires;clear();if(captured==null||!captured.same(expected)||!captured.same(current)||now<0||now>=deadline||!GroupWire.equal(issued,supplied))throw new IllegalStateException("Name repair confirmation expired or changed");return GroupNamePolicy.next(current.generation);}
    void clear(){scope=null;token=null;expires=0;}
    static GroupNameJournal replace(GroupNameJournal current,long generation,Write commit)throws Exception{if(generation!=GroupNamePolicy.next(current.generation()))throw new IllegalStateException("Name repair generation changed");GroupNameJournal fresh=new GroupNameJournal("[]",generation);try{commit.run();}catch(Exception uncertain){current.poison();throw new GroupNameJournal.Uncertain(null);}catch(Error interrupted){current.poison();throw interrupted;}return fresh;}
}
