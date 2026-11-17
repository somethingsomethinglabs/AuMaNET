package au.aumanet.app;
/** Learned only from this authenticated connection, never from message support or saved membership. */
final class GroupFirmwareMaintenanceCapability {
 static int read(Object value){return value instanceof Number&&((Number)value).doubleValue()==1?1:0;}
 static boolean supported(int version,boolean authorized,boolean closed,long peerRun,long currentRun){return version==1&&authorized&&!closed&&peerRun==currentRun;}
 static boolean outbound(String type,int version){return !"firmware-maintenance".equals(type)||version==1;}
 private GroupFirmwareMaintenanceCapability(){}
}
