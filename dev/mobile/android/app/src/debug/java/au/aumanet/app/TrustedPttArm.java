package au.aumanet.app;
import java.util.function.BooleanSupplier;

/** The last native readiness commit. A successful arm still has no PTT lease. */
final class TrustedPttArm {
    static void prepare(VoiceGate gate,long epoch,BooleanSupplier intent){synchronized(gate){
        if(!intent.getAsBoolean()||gate.epoch!=epoch||!gate.joined||!gate.muted)throw new IllegalStateException("Remembered PTT preparation was superseded");
        gate.mode("ptt");gate.interrupt();
    }}
    static void arm(VoiceGate gate,long epoch,BooleanSupplier intent){synchronized(gate){
        if(!intent.getAsBoolean()||!gate.mode.equals("ptt")||gate.epoch!=epoch||!gate.joined||!gate.connected||gate.deafened)throw new IllegalStateException("Remembered PTT readiness was superseded");
        gate.arm(epoch);
    }}
    private TrustedPttArm(){}
}
