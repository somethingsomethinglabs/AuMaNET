package au.aumanet.app;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Bundle;
import android.os.SystemClock;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.io.FileInputStream;
import java.lang.reflect.Field;
import java.net.Inet4Address;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;
import java.util.StringJoiner;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

/** Explicit real-member Wi-Fi acceptance. Requires an already provisioned checked
 * profile, runtime permissions and cellular Internet. An operator may approve the
 * first Android network chooser externally. No enrollment/group resume, grants,
 * media, text, permissions or SSID configuration is performed by this test.
 * Instrumentation may restart the target: run only on a reviewed idle member.
 */
@RunWith(AndroidJUnit4.class)
public class NativeNodeConnectionTest {
    private final Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
    private NodeConnectionOwner owner;
    private MainActivity activity;
    private final AtomicBoolean firstAllowed=new AtomicBoolean(true),secondAllowed=new AtomicBoolean(true);
    private String firstToken,secondToken;

    @Test public void actualLocalOnlyAttachmentAndRetiredCallbackIsolation()throws Exception {
        phase("entered");
        assertTrue("Explicit idle-member opt-in is required","true".equals(InstrumentationRegistry.getArguments().getString("aumanetNodeWifiTest")));
        try{
            GroupSession group=GroupSession.get(context);assertIdle(group);
            JSONObject initial=group.snapshot();
            assertTrue("An approved saved member is required","member".equals(initial.getString("role"))&&initial.has("group"));
            owner=NodeConnectionOwner.get(context);JSONObject selected=initial.getJSONObject("group");
            assertTrue("A matching checked node attachment is required",owner.profileMatches(initial.getJSONObject("identity").getString("id"),selected.getString("id"),selected.getString("ownerId"),selected.getLong("epoch"))&&"ready".equals(owner.storage()));
            assertTrue("A separate attachment must not already be running","off".equals(owner.connectionState()));
            String attachmentDigest=owner.attachmentDigest();
            assertTrue("A checked attachment digest is required",attachmentDigest.matches("[A-F0-9]{64}"));
            phase("activity-launching");activity=(MainActivity)InstrumentationRegistry.getInstrumentation().startActivitySync(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            InstrumentationRegistry.getInstrumentation().waitForIdleSync();assertIdle(group);assertPendingUiIdle();
            String savedBefore=savedDigest(),mapsBefore=mapDigest(),textBefore=textDigest(group);
            String groupBefore=authorityDigest(group.snapshot());
            ConnectivityManager manager=(ConnectivityManager)context.getSystemService(Context.CONNECTIVITY_SERVICE);
            assertTrue("Connectivity observation is unavailable",manager!=null);
            assertTrue("The process must not be globally bound",manager.getBoundNetworkForProcess()==null);

            Observation first=new Observation();phase("first-attach-requested");
            firstToken=owner.attach(attachmentDigest,firstAllowed::get,first);
            Network firstNetwork=awaitNetwork(first,firstToken,45000);assertCheckedNetwork(manager,firstNetwork);
            awaitCellularDefault(manager);assertCheckedNetwork(manager,firstNetwork);assertIdle(group);phase("first-attachment-cellular-preserved");
            ConnectivityManager.NetworkCallback oldCallback=actualCallback(firstToken);
            owner.detach(firstToken);
            assertTrue("Detach must immediately retire its exact attachment",owner.currentNetwork(firstToken)==null);
            InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{});

            Observation second=new Observation();phase("second-attach-requested");
            secondToken=owner.attach(attachmentDigest,secondAllowed::get,second);
            Network secondNetwork=awaitNetwork(second,secondToken,45000);assertCheckedNetwork(manager,secondNetwork);awaitCellularDefault(manager);assertCheckedNetwork(manager,secondNetwork);
            int firstAvailable=first.available.get(),firstLost=first.lost.get(),firstUnavailable=first.unavailable.get();
            int secondAvailable=second.available.get(),secondLost=second.lost.get(),secondUnavailable=second.unavailable.get();
            // The retired guard remains TRUE: exact attachment ownership, rather
            // than a conveniently false guard, must reject all these stale events.
            InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{oldCallback.onAvailable(secondNetwork);oldCallback.onLost(secondNetwork);oldCallback.onUnavailable();});
            owner.detach(firstToken);
            assertTrue("Retired callbacks or Stop affected the replacement",secondNetwork.equals(owner.currentNetwork(secondToken))&&"available".equals(owner.connectionState()));
            assertTrue("A retired callback reached its old listener",first.available.get()==firstAvailable&&first.lost.get()==firstLost&&first.unavailable.get()==firstUnavailable);
            assertTrue("A retired callback reached the new listener",second.available.get()==secondAvailable&&second.lost.get()==secondLost&&second.unavailable.get()==secondUnavailable);
            assertCheckedNetwork(manager,secondNetwork);awaitCellularDefault(manager);assertIdle(group);
            assertTrue("Saved identities or membership changed",savedBefore.equals(savedDigest())&&groupBefore.equals(authorityDigest(group.snapshot())));
            assertTrue("Prepared maps changed",mapsBefore.equals(mapDigest()));
            assertTrue("Native message history, outbox or draft changed",textBefore.equals(textDigest(group)));
            assertTrue("Checked node setup changed",attachmentDigest.equals(owner.attachmentDigest()));
            phase("replacement-isolation-preservation-complete");
        }catch(AssertionError failure){throw failure;}
        catch(Exception privateFailure){throw new AssertionError("Native checked-attachment acceptance could not complete; inspect the fixed phase marker");}
        finally{
            firstAllowed.set(false);secondAllowed.set(false);
            if(owner!=null){if(secondToken!=null)owner.detach(secondToken);if(firstToken!=null)owner.detach(firstToken);}
            InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{});
            if(owner!=null){assertTrue("Owned first attachment survived cleanup",firstToken==null||owner.currentNetwork(firstToken)==null);assertTrue("Owned replacement attachment survived cleanup",secondToken==null||owner.currentNetwork(secondToken)==null);}
            phase("owned-cleanup-complete");
        }
    }

    private static final class Observation implements NodeConnectionOwner.Listener {
        final AtomicReference<Network> network=new AtomicReference<>();
        final AtomicInteger available=new AtomicInteger(),lost=new AtomicInteger(),unavailable=new AtomicInteger();
        public void available(Network value){network.set(value);available.incrementAndGet();}
        public void lost(){lost.incrementAndGet();}
        public void unavailable(String ignored){unavailable.incrementAndGet();}
    }
    private Network awaitNetwork(Observation observation,String token,long timeout){
        long end=SystemClock.elapsedRealtime()+timeout;
        while(SystemClock.elapsedRealtime()<end){assertTrue("Android rejected the checked attachment",observation.unavailable.get()==0);Network delivered=observation.network.get(),current=owner.currentNetwork(token);if(delivered!=null&&delivered.equals(current))return delivered;SystemClock.sleep(80);}
        throw new AssertionError("Checked local-only attachment did not become available within the reviewed window");
    }
    private void assertCheckedNetwork(ConnectivityManager manager,Network network)throws Exception {
        NetworkCapabilities caps=manager.getNetworkCapabilities(network);LinkProperties links=manager.getLinkProperties(network);
        assertTrue("Selected attachment is not local Wi-Fi",caps!=null&&caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)&&!caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN));
        assertTrue("Selected attachment has no checked private IPv4 prefix",links!=null&&links.getLinkAddresses().stream().anyMatch(value->value.getAddress() instanceof Inet4Address&&value.getPrefixLength()==24&&value.getAddress().isSiteLocalAddress()));
        // currentNetwork revalidates the private stored exact address, not merely
        // the generic prefix observed above. No address or profile is printed.
        assertTrue("Selected attachment no longer matches the checked profile",network.equals(owner.currentNetwork(secondToken!=null?secondToken:firstToken)));
        assertTrue("A local-only request globally bound the process",manager.getBoundNetworkForProcess()==null);
    }
    private void awaitCellularDefault(ConnectivityManager manager){
        long end=SystemClock.elapsedRealtime()+15000;
        while(SystemClock.elapsedRealtime()<end){Network active=manager.getActiveNetwork();NetworkCapabilities caps=active==null?null:manager.getNetworkCapabilities(active);if(manager.getBoundNetworkForProcess()==null&&caps!=null&&caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)&&!caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)&&caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)&&caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET))return;SystemClock.sleep(100);}
        throw new AssertionError("Validated cellular Internet did not remain the default while local Wi-Fi was owned");
    }
    private ConnectivityManager.NetworkCallback actualCallback(String token)throws Exception {
        AtomicReference<?> owned=(AtomicReference<?>)field(NodeConnectionOwner.class,"current").get(owner);Object attachment=owned.get();
        assertTrue("Test no longer owns its first actual attachment",attachment!=null&&token.equals(field(attachment.getClass(),"token").get(attachment)));
        Object callback=field(attachment.getClass(),"callback").get(attachment);assertTrue("Actual Android callback is unavailable",callback instanceof ConnectivityManager.NetworkCallback);return(ConnectivityManager.NetworkCallback)callback;
    }
    private void assertIdle(GroupSession group)throws Exception {
        JSONObject state=group.snapshot();assertTrue("The group must remain disconnected",java.util.Arrays.asList("idle","interrupted","failed").contains(state.getString("status")));
        assertTrue("Group media must remain off",!state.getBoolean("voiceJoined")&&!state.getBoolean("sharingLocation")&&state.getJSONArray("pending").length()==0);
        assertTrue("Native voice must remain idle",VoiceLabService.active==null&&!VoiceLabService.startReservation.pending());
        assertTrue("Gateway must remain idle",GatewayLeaseIssuer.get(context).current()==null&&GatewayLeaseService.availableForStart());
        assertTrue("Location sharing must remain idle",!LocationSharingService.holdsNativeIntent());LocationOwner location=LocationOwner.peek();if(location!=null){LocationOwnership.View view=location.ownership.view();assertTrue("Own-position/location must remain idle",!view.foreground&&!view.background&&!view.pending);}
    }
    private void assertPendingUiIdle(){InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{assertTrue("Reviewed Activity is not resumed",!activity.isDestroyed()&&activity.getLifecycle().getCurrentState().isAtLeast(androidx.lifecycle.Lifecycle.State.RESUMED));GroupPlugin plugin=(GroupPlugin)activity.getBridge().getPlugin("AuMaNETGroup").getInstance();assertTrue("A location permission/start flow is already pending",!plugin.sharingStartPending());});}
    private String savedDigest()throws Exception {SharedPreferences saved=context.getSharedPreferences("aumanet-group-v1",Context.MODE_PRIVATE);return digest(new JSONObject().put("profile",saved.getString("profile",null)).put("membership",saved.getString("membership",null)));}
    private static String authorityDigest(JSONObject state)throws Exception{return digest(new JSONObject().put("identity",state.getJSONObject("identity")).put("group",state.getJSONObject("group")).put("members",state.getJSONArray("members")));}
    private String mapDigest()throws Exception {
        File root=new File(context.getFilesDir(),"offline-maps-v1");File[] entries=root.listFiles();List<String> manifests=new ArrayList<>();long bytes=0;
        if(entries!=null)for(File entry:entries){File manifest=new File(entry,"manifest.json");if(manifest.isFile()){assertTrue("Map inventory exceeded test bound",manifests.size()<64);byte[] content;try(FileInputStream in=new FileInputStream(manifest)){content=in.readNBytes(524289);}bytes+=content.length;assertTrue("Map manifest exceeded test bound",content.length<=524288&&bytes<=4194304);manifests.add(entry.getName()+":"+hex(MessageDigest.getInstance("SHA-256").digest(content)));}}
        Collections.sort(manifests);return hex(MessageDigest.getInstance("SHA-256").digest(String.join("\n",manifests).getBytes(StandardCharsets.UTF_8)));
    }
    private static String textDigest(GroupSession group)throws Exception {
        GroupMessages messages=group.messages();CompletableFuture<JSONObject> reply=new CompletableFuture<>();messages.submit(messages::snapshot,new GroupMessages.Reply(){public void resolve(JSONObject result){reply.complete(result);}public void reject(Exception ignored){reply.completeExceptionally(new AssertionError("Private message observation unavailable"));}});JSONObject state=reply.get(15,TimeUnit.SECONDS);assertTrue("Native message store must be ready and settled",state.getBoolean("storeReady")&&state.getJSONArray("outbox").length()==0);return digest(new JSONObject().put("scope",state.getJSONObject("scope")).put("storeRevision",state.getLong("storeRevision")).put("draft",state.getString("draft")).put("history",state.getJSONArray("history")).put("outbox",state.getJSONArray("outbox")));
    }
    private static String digest(JSONObject value)throws Exception{return hex(MessageDigest.getInstance("SHA-256").digest(canonical(value).getBytes(StandardCharsets.UTF_8)));}
    private static String canonical(Object value)throws Exception {
        if(value instanceof JSONObject){JSONObject object=(JSONObject)value;List<String> keys=new ArrayList<>();Iterator<String> iterator=object.keys();while(iterator.hasNext())keys.add(iterator.next());Collections.sort(keys);StringJoiner result=new StringJoiner(",","{","}");for(String key:keys)result.add(JSONObject.quote(key)+":"+canonical(object.get(key)));return result.toString();}
        if(value instanceof JSONArray){JSONArray array=(JSONArray)value;StringJoiner result=new StringJoiner(",","[","]");for(int i=0;i<array.length();i++)result.add(canonical(array.get(i)));return result.toString();}return value instanceof String?JSONObject.quote((String)value):String.valueOf(value);
    }
    private static String hex(byte[] value){StringBuilder result=new StringBuilder();for(byte part:value)result.append(String.format(java.util.Locale.ROOT,"%02x",part&255));return result.toString();}
    private static Field field(Class<?> type,String name)throws Exception{Field value=type.getDeclaredField(name);value.setAccessible(true);return value;}
    private static void phase(String value){Bundle status=new Bundle();status.putString("nodeWifiPhase",value);InstrumentationRegistry.getInstrumentation().sendStatus(1,status);}
}
