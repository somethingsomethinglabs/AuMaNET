package au.aumanet.app;
/** Native random service token prevents operation-ID/generation reuse after process death. */
final class NodeUpdateServiceScope {
 static boolean matches(String id,String token,long generation,String suppliedId,String suppliedToken,long suppliedGeneration){return GroupWire.id(id)&&GroupWire.id(token)&&id.equals(suppliedId)&&NotificationSessionScope.matches(token,generation,suppliedToken,suppliedGeneration);}
 private NodeUpdateServiceScope(){}
}
