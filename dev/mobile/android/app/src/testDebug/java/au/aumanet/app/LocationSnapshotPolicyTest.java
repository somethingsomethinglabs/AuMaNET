package au.aumanet.app;

import org.junit.Test;
import static org.junit.Assert.*;

public class LocationSnapshotPolicyTest {
    private LocationOwnership.View demand(boolean foreground,boolean background,boolean pending){
        LocationOwnership owner=new LocationOwnership();if(foreground)owner.foreground("view");
        if(background){long request=owner.prepareBackground("service");assertTrue(owner.activateBackground("service",request));}
        if(pending&&!background)owner.prepareBackground("pending");return owner.view();
    }
    @Test public void everyMixedInputProjectsOneCoherentConservativeTuple(){
        for(int bits=0;bits<128;bits++)for(String publication:new String[]{"off","starting","sharing"}){
            boolean fine=(bits&1)!=0,coarse=(bits&2)!=0,foreground=(bits&4)!=0,background=(bits&8)!=0,pending=(bits&16)!=0,subscribed=(bits&32)!=0,wasFine=(bits&64)!=0;
            LocationSnapshotPolicy.View view=LocationSnapshotPolicy.project(fine,coarse,true,wasFine,subscribed,demand(foreground,background,pending),publication,"active",false,true,9500,10000,9000);
            assertEquals(view.ownership.equals("sharing"),view.backgroundSharing.equals("active"));
            if(view.publication.equals("sharing")){assertTrue(background);assertEquals("sharing",view.ownership);assertEquals("active",view.backgroundSharing);assertTrue(fine||coarse);}
            if(view.publication.equals("starting"))assertEquals("starting",view.backgroundSharing);
            if(view.active){assertTrue(fine||coarse);assertTrue(view.status.equals("active")||view.status.equals("acquiring"));}
            else assertFalse(view.status.equals("active")||view.status.equals("acquiring"));
            if(!(fine||coarse)||wasFine&&!fine){assertFalse(view.active);assertFalse(view.includeFix);assertEquals("off",view.publication);}
        }
    }
    @Test public void offBetweenServiceReadAndDemandReadCannotReportSharingWithoutOwner(){
        LocationOwnership owner=new LocationOwnership();long revision=owner.prepareBackground("service");assertTrue(owner.activateBackground("service",revision));
        LocationOwnership.View before=owner.view();owner.endBackground("service");assertFalse(owner.current(before));
        LocationSnapshotPolicy.View view=LocationSnapshotPolicy.project(true,true,true,true,true,owner.view(),"sharing","active",false,true,9500,10000,9000);
        assertEquals("off",view.publication);assertEquals("none",view.ownership);assertEquals("off",view.backgroundSharing);assertFalse(view.active);assertEquals("stopped",view.status);
    }
    @Test public void permissionRevocationAndPrecisionDowngradeNeverExposeCachedFix(){
        for(boolean approximate:new boolean[]{false,true}){
            LocationSnapshotPolicy.View view=LocationSnapshotPolicy.project(false,approximate,true,true,true,demand(false,true,false),"sharing","active",true,true,9500,10000,9000);
            assertFalse(view.includeFix);assertFalse(view.active);assertEquals("off",view.publication);assertEquals("none",view.ownership);assertEquals("interrupted",view.backgroundSharing);
        }
    }
    @Test public void validSharingCanWaitForFirstFixWithoutInventingActiveObservation(){
        LocationSnapshotPolicy.View view=LocationSnapshotPolicy.project(false,true,true,false,true,demand(false,true,false),"sharing","acquiring",false,false,0,10000,9000);
        assertEquals("sharing",view.publication);assertEquals("sharing",view.ownership);assertEquals("active",view.backgroundSharing);assertEquals("approximate",view.permission);
        assertTrue(view.active);assertEquals("acquiring",view.status);assertFalse(view.includeFix);
    }
}
