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
    if(Build.VERSION.SDK_INT<35){int color=dark?0xff15291f:0xfffbf8ef;window.setStatusBarColor(color);window.setNavigationBarColor(color);}
  }
}
