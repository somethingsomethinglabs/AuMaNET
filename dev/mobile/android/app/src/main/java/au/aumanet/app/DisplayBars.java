package au.aumanet.app;
import android.app.Activity;
import android.os.Build;
import android.view.*;

/** Display-only system icon contrast. Does not change layout, preferences or sessions. */
final class DisplayBars {
  static void apply(Activity activity,boolean dark){
    if(activity==null||activity.isFinishing()||activity.isDestroyed())return;
    Window window=activity.getWindow();View decor=window.getDecorView();
    if(Build.VERSION.SDK_INT>=30&&window.getInsetsController()!=null){
      int mask=WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
      window.getInsetsController().setSystemBarsAppearance(dark?0:mask,mask);
    }else{
      int mask=View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
      int flags=decor.getSystemUiVisibility();decor.setSystemUiVisibility(dark?flags&~mask:flags|mask);
    }
    // Android 15+ enforces transparent edge-to-edge bars; leave its layout intact.
    if(Build.VERSION.SDK_INT<35){int color=dark?0xff20362c:0xfffffef8;window.setStatusBarColor(color);window.setNavigationBarColor(color);}
  }
  static void theme(Activity activity,boolean dark){
    if(activity instanceof androidx.appcompat.app.AppCompatActivity){
      ((androidx.appcompat.app.AppCompatActivity)activity).getDelegate().setLocalNightMode(dark?androidx.appcompat.app.AppCompatDelegate.MODE_NIGHT_YES:androidx.appcompat.app.AppCompatDelegate.MODE_NIGHT_NO);
    }
    activity.getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(dark?0xff182a24:0xfff4f3ec));
    if(activity instanceof com.getcapacitor.BridgeActivity){com.getcapacitor.Bridge bridge=((com.getcapacitor.BridgeActivity)activity).getBridge();if(bridge!=null&&bridge.getWebView()!=null)bridge.getWebView().setBackgroundColor(dark?0xff182a24:0xfff4f3ec);}
  }
}
