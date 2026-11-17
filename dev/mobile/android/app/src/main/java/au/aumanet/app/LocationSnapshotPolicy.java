package au.aumanet.app;

/** Coherent/conservative projection even when permissions, group consent and service ownership race. */
final class LocationSnapshotPolicy {
    static final class View {
        final boolean active,includeFix;
        final String permission,status,publication,ownership,backgroundSharing;
        View(boolean active,boolean includeFix,String permission,String status,String publication,String ownership,String backgroundSharing){
            this.active=active;this.includeFix=includeFix;this.permission=permission;this.status=status;this.publication=publication;this.ownership=ownership;this.backgroundSharing=backgroundSharing;
        }
    }
    static View project(boolean precise,boolean coarse,boolean requested,boolean wasPrecise,boolean subscribed,
        LocationOwnership.View demand,String servicePublication,String previousStatus,boolean interruption,boolean hasFix,long fixElapsed,long now,long subscriptionStarted){
        String permission=precise?"precise":coarse?"approximate":requested?"denied":"prompt";
        boolean allowed=(precise||coarse)&&!(wasPrecise&&!precise),includeFix=allowed&&hasFix;
        String publication=allowed?servicePublication:"off";
        if(publication.equals("sharing")&&!demand.background)publication="off";
        if(publication.equals("starting")&&!demand.background&&!demand.pending)publication="off";
        boolean committed=publication.equals("sharing")&&demand.background;
        String ownership=committed?"sharing":allowed&&demand.foreground?"foreground":"none";
        String background=publication.equals("starting")?"starting":committed?"active":interruption?"interrupted":"off";
        boolean active=allowed&&subscribed&&(demand.foreground||committed);
        String status=previousStatus;
        if(active)status=includeFix&&fixElapsed>=subscriptionStarted&&fixElapsed<=now&&now-fixElapsed<=60000?"active":"acquiring";
        else if(status.equals("active")||status.equals("acquiring"))status="stopped";
        return new View(active,includeFix,permission,status,publication,ownership,background);
    }
}
