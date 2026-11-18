package au.aumanet.app;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import android.content.pm.ApplicationInfo;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    private boolean launchDark;
    @Override public void onCreate(Bundle state) {
        boolean dark=launchDark=AppearancePlugin.bootDark(this);
        setTheme(dark?R.style.AppTheme_NoActionBarLaunch_Dark:R.style.AppTheme_NoActionBarLaunch);
        LinkBenchmarkVoice.install();
        registerPlugin(LinkBenchmarkPlugin.class);
        registerPlugin(ScenarioExportPlugin.class);
        registerPlugin(GatewayRadioSettingsPlugin.class);
        registerPlugin(NodeUpdatePlugin.class);
        registerPlugin(LocationPlugin.class);
        registerPlugin(MapNavigationPlugin.class);
        registerPlugin(OfflineMapsPlugin.class);
        registerPlugin(VectorMapsPlugin.class);
        registerPlugin(au.aumanet.app.maps.GeoTiffPreparationPlugin.class);
        registerPlugin(GroupPlugin.class);
        registerPlugin(GroupMessagesPlugin.class);
        registerPlugin(InternetSharingPlugin.class);
        registerPlugin(AppearancePlugin.class);
        registerPlugin(DiagnosticsPlugin.class);
        registerPlugin(DiagnosticsExportPlugin.class);
        registerPlugin(NotificationsPlugin.class);
        registerPlugin(NodeConnectionPlugin.class);
        registerPlugin(TrustedConnectionPlugin.class);
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            registerPlugin(GatewayPlugin.class);
            try { registerPlugin(Class.forName("au.aumanet.app.VoiceLabPlugin").asSubclass(Plugin.class)); }
            catch (ClassNotFoundException error) { throw new IllegalStateException("Debug voice plugin missing", error); }
        }
        super.onCreate(state);
        DisplayBars.theme(this,dark);DisplayBars.apply(this,dark);applyTextScale();
        getBridge().setWebViewClient(new au.aumanet.app.maps.MapWebViewClient(getBridge()));
    }
    @Override protected void load(){
        android.webkit.WebView view=findViewById(com.getcapacitor.android.R.id.webview);
        if(view!=null){
            view.setBackgroundColor(launchDark?0xff182a24:0xfff4f3ec);
            if(androidx.webkit.WebViewFeature.isFeatureSupported(androidx.webkit.WebViewFeature.DOCUMENT_START_SCRIPT)){
                String theme=launchDark?"Dark":"Light";
                androidx.webkit.WebViewCompat.addDocumentStartJavaScript(view,"window.__aumanetBootAppearance='"+theme+"';",java.util.Collections.singleton("https://localhost"));
            }
        }
        super.load();
    }
    private void applyTextScale(){if(getBridge()!=null&&getBridge().getWebView()!=null)getBridge().getWebView().getSettings().setTextZoom(Math.max(100,Math.round(100*getResources().getConfiguration().fontScale)));}
    @Override public void onConfigurationChanged(android.content.res.Configuration next){super.onConfigurationChanged(next);applyTextScale();}
}
