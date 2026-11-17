package au.aumanet.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.content.ContextCompat;

/** Required foreground controls must remain available at app AND channel level. */
final class ServiceNotificationAccess {
    private ServiceNotificationAccess() {}
    static boolean allowed(Context context,String channelId) {
        try {
            if(Build.VERSION.SDK_INT>=33&&ContextCompat.checkSelfPermission(context,Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return false;
            NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
            if(manager==null||!manager.areNotificationsEnabled())return false;
            NotificationChannel channel=Build.VERSION.SDK_INT>=26?manager.getNotificationChannel(channelId):null;
            return channel==null||channel.getImportance()!=NotificationManager.IMPORTANCE_NONE;
        }catch(RuntimeException unavailable){return false;}
    }
}
