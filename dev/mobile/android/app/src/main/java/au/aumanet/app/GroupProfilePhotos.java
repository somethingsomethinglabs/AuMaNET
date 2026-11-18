package au.aumanet.app;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.AtomicFile;
import android.util.Base64;
import java.io.DataInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;
import org.json.JSONException;
import org.json.JSONObject;

/** Small, optional thumbnails. Access is serialized by the group session lock. */
final class GroupProfilePhotos {
    static final int EDGE = 96;
    static final int MAX_BYTES = 6144;
    private static final int MAX_BASE64 = MAX_BYTES / 3 * 4;
    private static final int MAX_CACHE = GroupWire.MAX_MEMBERS * (2 * MAX_BASE64 + 100);

    private final AtomicFile localFile;
    private final AtomicFile cacheFile;
    private final String self;
    private final Map<String, Photo> peers = new HashMap<>();
    private String scope;
    private Photo own;

    GroupProfilePhotos(Context context, String self) {
        this.self = self;
        File directory = context.getNoBackupFilesDir();
        localFile = new AtomicFile(new File(directory, "profile-photo"));
        cacheFile = new AtomicFile(new File(directory, "profile-photo-cache"));
        String data = stored(localFile, self.length() + 1 + MAX_BASE64);
        if (data.startsWith(self + ":")) own = read(data.substring(self.length() + 1));
    }

    void select(String groupId, Set<String> approved) throws JSONException {
        String nextScope = self + ":" + groupId;
        if (!nextScope.equals(scope)) {
            scope = nextScope;
            peers.clear();
            load(approved);
            saveCache();
        }
        if (peers.keySet().removeIf(id -> !approved.contains(id))) saveCache();
    }

    void clearGroup() {
        peers.clear();
        scope = null;
        cacheFile.delete();
    }

    String ownImage() {
        return own == null ? "" : own.image;
    }

    String image(String id) {
        Photo photo = id.equals(self) ? own : peers.get(id);
        return photo == null ? "" : photo.image;
    }

    void setOwn(String image) throws IOException {
        Photo next = read(image);
        if (!image.isEmpty() && next == null) throw new IllegalArgumentException("Choose a valid profile photo");
        if (ownImage().equals(image)) return;
        String data = self + ":" + image;
        write(localFile, data);
        if (!data.equals(stored(localFile, data.length()))) throw new IOException("Could not save the profile photo");
        own = next;
    }

    JSONObject fingerprints(boolean owner, String peerId) throws JSONException {
        JSONObject result = new JSONObject();
        for (Map.Entry<String, Photo> entry : peers.entrySet()) {
            if (!owner || entry.getKey().equals(peerId)) result.put(entry.getKey(), entry.getValue().digest);
        }
        return result;
    }

    JSONObject changes(JSONObject seen, boolean owner, String peerId, Set<String> approved) throws JSONException {
        JSONObject result = new JSONObject();
        for (String id : approved) {
            // The owner relays other members' photos. A member can publish only its own.
            if (owner ? id.equals(peerId) : !id.equals(self)) continue;
            Photo photo = id.equals(self) ? own : peers.get(id);
            String digest = photo == null ? "" : photo.digest;
            if (!digest.equals(seen.optString(id, ""))) result.put(id, photo == null ? "" : photo.image);
        }
        return result;
    }

    boolean receive(JSONObject changes, boolean owner, String peerId, Set<String> approved) throws JSONException {
        if (changes == null || changes.length() > (owner ? 1 : GroupWire.MAX_MEMBERS - 1)) return false;
        boolean changed = false;
        Iterator<String> keys = changes.keys();
        while (keys.hasNext()) {
            String id = keys.next();
            if (id.equals(self) || !approved.contains(id) || (owner && !id.equals(peerId))) continue;
            Object value = changes.opt(id);
            if (!(value instanceof String)) continue;
            String image = (String) value;
            if (image.equals(image(id))) continue;
            if (image.isEmpty()) peers.remove(id);
            else {
                Photo photo = read(image);
                if (photo == null) continue;
                peers.put(id, photo);
            }
            changed = true;
        }
        if (changed) saveCache();
        return changed;
    }

    private void load(Set<String> approved) {
        String data = stored(cacheFile, MAX_CACHE);
        String prefix = scope + "\n";
        if (!data.startsWith(prefix)) return;
        try {
            JSONObject stored = new JSONObject(data.substring(prefix.length()));
            for (String id : approved) {
                if (id.equals(self)) continue;
                Photo photo = read(stored.optString(id, ""));
                if (photo != null) peers.put(id, photo);
            }
        } catch (JSONException ignored) {
            // An unreadable cache can be filled again by connected peers.
        }
    }

    private void saveCache() throws JSONException {
        JSONObject result = new JSONObject();
        for (Map.Entry<String, Photo> entry : peers.entrySet()) result.put(entry.getKey(), entry.getValue().image);
        try { write(cacheFile, scope + "\n" + result); }
        catch (IOException ignored) {
            // Keep the in-memory copy. Peers can refill it after a restart.
        }
    }

    private static String stored(AtomicFile file, int max) {
        try (FileInputStream input = file.openRead()) {
            long size = input.getChannel().size();
            if (size < 1 || size > max) return "";
            byte[] bytes = new byte[(int) size];
            new DataInputStream(input).readFully(bytes);
            return new String(bytes, StandardCharsets.US_ASCII);
        } catch (IOException ignored) {
            return "";
        }
    }

    private static void write(AtomicFile file, String value) throws IOException {
        FileOutputStream output = file.startWrite();
        try {
            output.write(value.getBytes(StandardCharsets.US_ASCII));
            file.finishWrite(output);
        } catch (IOException failure) {
            file.failWrite(output);
            throw failure;
        }
    }

    private static Photo read(String image) {
        if (image.isEmpty() || image.length() > MAX_BASE64) return null;
        try {
            byte[] bytes = Base64.decode(image, Base64.NO_WRAP);
            if (bytes.length < 4 || bytes.length > MAX_BYTES ||
                (bytes[0] & 255) != 255 || (bytes[1] & 255) != 216 ||
                (bytes[bytes.length - 2] & 255) != 255 || (bytes[bytes.length - 1] & 255) != 217 ||
                !Base64.encodeToString(bytes, Base64.NO_WRAP).equals(image)) return null;
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
            if (!"image/jpeg".equals(bounds.outMimeType) || bounds.outWidth != EDGE || bounds.outHeight != EDGE) return null;
            Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            if (bitmap == null) return null;
            bitmap.recycle();
            return new Photo(image, GroupTextWire.hash(bytes));
        } catch (Exception invalid) {
            return null;
        }
    }

    private static final class Photo {
        final String image;
        final String digest;

        Photo(String image, String digest) {
            this.image = image;
            this.digest = digest;
        }
    }
}
