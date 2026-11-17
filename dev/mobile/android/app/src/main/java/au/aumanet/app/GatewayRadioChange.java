package au.aumanet.app;

/** Pure conditional-commit truth. Merely sending a command never means applied. */
final class GatewayRadioChange {
 final String transaction,aRun,bRun;final int target,power,beforeActual;final long beforeGeneration;
 GatewayRadioChange(String tx,int target,GatewayRadioConfigCodec.Message a,GatewayRadioConfigCodec.Message b){if(!GroupWire.id(tx)||target<1||target>23||a.kind!='R'||b.kind!='R'||a.station||!a.canChange||!b.station||a.state!=0||b.state!=0||a.actual==0||b.actual==0||a.actual!=b.actual||target==a.actual||!b.associated||a.power!=b.power||a.generation>=GroupNamePolicy.MAX_REVISION)throw new IllegalArgumentException("Radio nodes are not ready");transaction=tx;this.target=target;beforeActual=a.actual;aRun=a.run;bRun=b.run;beforeGeneration=a.generation;power=a.power;}
 boolean targetSeen(GatewayRadioConfigCodec.Message a,GatewayRadioConfigCodec.Message b){return a.kind=='R'&&b.kind=='R'&&!a.station&&b.station&&aRun.equals(a.run)&&bRun.equals(b.run)&&transaction.equals(a.transaction)&&a.generation==beforeGeneration&&a.state==3&&a.trial==target&&a.actual==target&&b.actual==target&&b.associated&&a.power==power&&b.power==power;}
 boolean committed(GatewayRadioConfigCodec.Message a,GatewayRadioConfigCodec.Message b){return a.kind=='R'&&b.kind=='R'&&!a.station&&b.station&&aRun.equals(a.run)&&bRun.equals(b.run)&&transaction.equals(a.transaction)&&a.generation==beforeGeneration+1&&a.state==0&&a.persistenceKnown&&a.persisted==target&&a.actual==target&&b.actual==target&&b.associated&&a.power==power&&b.power==power;}
}
