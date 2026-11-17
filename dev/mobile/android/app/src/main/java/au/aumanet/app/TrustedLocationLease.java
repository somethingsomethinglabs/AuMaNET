package au.aumanet.app;

import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;

/** Process-local privacy tickets. A saved preference is never an activation. */
final class TrustedLocationLease {
    static final class Activation {
        final TrustedLocationLease owner;final TrustedConnectionScope scope;final BooleanSupplier verified;
        private Activation(TrustedLocationLease owner,TrustedConnectionScope scope,BooleanSupplier verified){this.owner=owner;this.scope=scope;this.verified=verified;}
    }
    final String id;final long generation;final TrustedConnectionScope authority;
    private final BooleanSupplier alive;private final AtomicBoolean retired=new AtomicBoolean();
    private final AtomicReference<Activation> activation=new AtomicReference<>();
    private final AtomicReference<Object> foregroundOwner=new AtomicReference<>();
    TrustedLocationLease(String id,long generation,TrustedConnectionScope authority,BooleanSupplier alive){if(!TrustedConnectionScope.id(id)||generation<1||generation>TrustedConnectionScope.MAX_REVISION||authority==null||!authority.saved||alive==null)throw new IllegalArgumentException("Invalid remembered location owner");this.id=id;this.generation=generation;this.authority=authority;this.alive=alive;}
    boolean matches(String id,long generation){return this.id.equals(id)&&this.generation==generation;}
    boolean alive(){try{return!retired.get()&&alive.getAsBoolean();}catch(RuntimeException unavailable){return false;}}
    boolean accepts(TrustedConnectionScope scope){return scope!=null&&authority.source==scope.source&&authority.process.equals(scope.process)&&authority.sameAuthority(scope);}
    Activation begin(TrustedConnectionScope scope,BooleanSupplier verified,boolean foreground,Object retained){if(!alive()||!accepts(scope)||!scope.live||scope.recovering||verified==null||!safe(verified)||!foreground&&!holdsForeground(retained))return null;Activation next=new Activation(this,scope,verified);activation.set(next);if(!current(next)){activation.compareAndSet(next,null);return null;}return next;}
    boolean current(Activation expected){return expected!=null&&expected.owner==this&&activation.get()==expected&&alive()&&safe(expected.verified);}
    boolean pause(Activation expected){return activation.compareAndSet(expected,null);}
    /** Called only AFTER Android startForeground returned for this exact service. */
    boolean holdForeground(Object owner){if(owner==null||!alive())return false;Object previous=foregroundOwner.get();if(previous!=owner&&!foregroundOwner.compareAndSet(null,owner))return false;if(!alive()){foregroundOwner.compareAndSet(owner,null);return false;}return true;}
    boolean holdsForeground(Object owner){return owner!=null&&foregroundOwner.get()==owner&&alive();}
    void releaseForeground(Object owner){if(owner!=null)foregroundOwner.compareAndSet(owner,null);}
    boolean close(){if(!retired.compareAndSet(false,true))return false;activation.set(null);foregroundOwner.set(null);return true;}
    private static boolean safe(BooleanSupplier supplier){try{return supplier.getAsBoolean();}catch(RuntimeException unavailable){return false;}}
}
