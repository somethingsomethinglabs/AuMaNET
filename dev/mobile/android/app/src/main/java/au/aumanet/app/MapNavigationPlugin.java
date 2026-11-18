package au.aumanet.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Locale;

@CapacitorPlugin(name = "AuMaNETMapNavigation")
public class MapNavigationPlugin extends Plugin {
    @PluginMethod
    public void openDestination(PluginCall call) {
        Double latitude = call.getDouble("latitude");
        Double longitude = call.getDouble("longitude");
        if (!validCoordinate(latitude, 90) || !validCoordinate(longitude, 180)) {
            call.reject("Invalid destination coordinates", "INVALID_DESTINATION");
            return;
        }

        Uri destination = Uri.parse(String.format(Locale.ROOT, "geo:0,0?q=%.6f,%.6f", latitude, longitude));
        Intent intent = new Intent(Intent.ACTION_VIEW, destination);
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().startActivity(intent);
                call.resolve();
            } catch (ActivityNotFoundException unavailable) {
                call.reject("No compatible map app is installed", "NO_MAP_APP");
            } catch (SecurityException blocked) {
                call.reject("Could not open a map app", "MAP_APP_UNAVAILABLE");
            }
        });
    }

    private static boolean validCoordinate(Double coordinate, int limit) {
        return coordinate != null && coordinate >= -limit && coordinate <= limit;
    }
}
