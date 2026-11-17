package com.getcapacitor;

import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;
import java.util.WeakHashMap;
import java.util.Map;

/** Exact WebView owner registry. Values never retain their weak WebView key. */
public final class WebViewLifetime {
    private static final WeakHashMap<WebView,Entry> OWNERS=new WeakHashMap<>();
    private static final class Entry {final BridgeReplyScope scope=new BridgeReplyScope();final Handler ui=new Handler(Looper.getMainLooper());volatile boolean destroyed;}
    private static synchronized Entry entry(WebView view){if(view==null)throw new IllegalArgumentException("Missing UI owner");Entry found=OWNERS.get(view);if(found==null){found=new Entry();OWNERS.put(view,found);}return found;}
    public static BridgeReplyScope.Ticket capture(WebView view){return entry(view).scope.capture();}
    public static boolean accepts(WebView view,BridgeReplyScope.Ticket ticket){return entry(view).scope.accepts(ticket);}
    public static boolean isClosed(WebView view){return entry(view).scope.isClosed();}
    public static boolean isDestroyed(WebView view){return entry(view).destroyed;}
    public static boolean post(WebView view,BridgeReplyScope.Ticket ticket,Runnable delivery){Entry owner=entry(view);return owner.scope.post(ticket,action->owner.ui.post(action),delivery);}
    public static boolean post(WebView view,Runnable delivery){return post(view,capture(view),delivery);}
    public static <K,V> boolean retain(WebView view,BridgeReplyScope.Ticket ticket,Map<K,V> map,K key,V value){return entry(view).scope.retain(ticket,map,key,value);}
    private static void requireUi(){if(Looper.myLooper()!=Looper.getMainLooper())throw new IllegalStateException("UI lifetime changes must run on the main thread");}
    // Lifecycle changes and actual provider calls share the UI thread, so no
    // destroy/navigation can run between a delivery check and its WebView call.
    public static void navigate(WebView view,Map<?,?> retained){requireUi();Entry owner=entry(view);owner.scope.advanceAndClear(retained);owner.ui.removeCallbacksAndMessages(null);}
    public static void close(WebView view){requireUi();Entry owner=entry(view);owner.scope.close();owner.ui.removeCallbacksAndMessages(null);}
    public static void beforeDestroy(WebView view){requireUi();Entry owner=entry(view);owner.scope.close();owner.destroyed=true;owner.ui.removeCallbacksAndMessages(null);}
    private WebViewLifetime(){}
}
