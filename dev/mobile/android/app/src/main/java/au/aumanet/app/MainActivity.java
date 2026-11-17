package au.aumanet.app;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import android.content.pm.ApplicationInfo;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle state) {
        LinkBenchmarkVoice.install();
        registerPlugin(LinkBenchmarkPlugin.class);
        registerPlugin(ScenarioExportPlugin.class);
        registerPlugin(GatewayRadioSettingsPlugin.class);
        registerPlugin(NodeUpdatePlugin.class);
        registerPlugin(LocationPlugin.class);
        registerPlugin(OfflineMapsPlugin.class);
        registerPlugin(au.aumanet.app.maps.GeoTiffPreparationPlugin.class);
        registerPlugin(GroupPlugin.class);
        registerPlugin(GroupMessagesPlugin.class);
        registerPlugin(InternetSharingPlugin.class);
        registerPlugin(AppearancePlugin.class);
        registerPlugin(DiagnosticsPlugin.class);
        registerPlugin(NotificationsPlugin.class);
        registerPlugin(NodeConnectionPlugin.class);
        registerPlugin(TrustedConnectionPlugin.class);
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            registerPlugin(GatewayPlugin.class);
            try { registerPlugin(Class.forName("au.aumanet.app.VoiceLabPlugin").asSubclass(Plugin.class)); }
            catch (ClassNotFoundException error) { throw new IllegalStateException("Debug voice plugin missing", error); }
        }
        super.onCreate(state);
        getBridge().setWebViewClient(new au.aumanet.app.maps.MapWebViewClient(getBridge()));
    }
}
