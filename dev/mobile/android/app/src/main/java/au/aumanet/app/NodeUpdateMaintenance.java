package au.aumanet.app;
import java.util.function.BooleanSupplier;
/** Privacy lease and global maintenance exclusion; never an update authorization. */
final class NodeUpdateMaintenance {
 static final class Ticket implements AutoCloseable {
  private final GroupRadioMaintenance.Ticket quiet;private final long connectionIntent;
  Ticket(GroupRadioMaintenance.Ticket quiet,long connectionIntent){this.quiet=quiet;this.connectionIntent=connectionIntent;}
  boolean current(){return retained()&&quiet.current();}
  /** Privacy/admission continuity only; fresh updater identity proof is separate. */
  boolean retained(){return connectionIntent==TrustedConnectionController.intentEpoch()&&quiet.retained();}
  @Override public void close(){quiet.close();}
 }
 static Ticket prepare(GroupSession group,InternetSharingScope scope,String operationId,BooleanSupplier retained)throws Exception{long intent=TrustedConnectionController.intentEpoch();GroupRadioMaintenance.Ticket quiet=group.firmwareMaintenance().prepare(scope,operationId,retained);Ticket ticket=new Ticket(quiet,intent);if(!ticket.retained()){ticket.close();throw new SecurityException("Connection update intent changed");}return ticket;}
 private NodeUpdateMaintenance(){}
}
