package au.aumanet.app;
import java.util.concurrent.atomic.AtomicBoolean;

public final class TrustedPttArmTest {
    static int assertions;static void check(boolean value){assertions++;if(!value)throw new AssertionError("Trusted PTT arm assertion failed");}
    static void rejects(Runnable action){assertions++;try{action.run();}catch(IllegalStateException expected){return;}throw new AssertionError("Unsafe PTT arm accepted");}
    public static void main(String[] args){
        VoiceGate gate=new VoiceGate();gate.join();gate.connection(true);AtomicBoolean allowed=new AtomicBoolean(true);long epoch=gate.epoch;
        TrustedPttArm.arm(gate,epoch,allowed::get);check(!gate.muted&&!gate.open(1000)&&gate.token.isEmpty());
        String first="11111111111111111111111111111111";gate.hold(first,gate.epoch,1000);check(gate.open(1001));
        gate.interrupt();check(gate.muted&&!gate.open(1002)&&gate.token.isEmpty());rejects(()->TrustedPttArm.arm(gate,epoch,allowed::get));
        long queuedEpoch=gate.epoch;allowed.set(false);rejects(()->TrustedPttArm.arm(gate,queuedEpoch,allowed::get));check(gate.muted&&!gate.open(1003));
        allowed.set(true);TrustedPttArm.arm(gate,gate.epoch,allowed::get);check(!gate.open(1004));rejects(()->gate.hold(first,gate.epoch,1004));
        gate.mute(true);gate.mode("always-on");long always=gate.epoch;rejects(()->TrustedPttArm.arm(gate,always,allowed::get));check(gate.muted&&!gate.open(1005));
        allowed.set(false);rejects(()->TrustedPttArm.prepare(gate,gate.epoch,allowed::get));check(gate.mode.equals("always-on")&&gate.muted);
        allowed.set(true);long beforePreparation=gate.epoch;TrustedPttArm.prepare(gate,beforePreparation,allowed::get);check(gate.mode.equals("ptt")&&gate.muted&&gate.epoch>beforePreparation&&!gate.open(1006));
        gate.mode("always-on");rejects(()->TrustedPttArm.prepare(gate,beforePreparation,allowed::get));check(gate.mode.equals("always-on")&&gate.muted);
        gate.mode("ptt");gate.deafen(true);rejects(()->TrustedPttArm.arm(gate,gate.epoch,allowed::get));gate.deafen(false);gate.leave();rejects(()->TrustedPttArm.arm(gate,gate.epoch,allowed::get));
        System.out.println("{\"status\":\"pass\",\"assertions\":"+assertions+",\"scope\":\"actual native gate; no microphone or device\"}");
    }
}
