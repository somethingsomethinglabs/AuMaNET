package au.aumanet.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.ContextWrapper;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.util.Base64;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.nio.file.Files;
import java.util.Set;
import org.json.JSONObject;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class GroupProfilePhotosTest {
    @Rule public TemporaryFolder directory = new TemporaryFolder();

    @Test public void syncSendsChangesAndRetainsOnlyApprovedCachedPhotos() throws Exception {
        String ownerId = "AA".repeat(32), memberId = "BB".repeat(32), newId = "CC".repeat(32);
        Set<String> roster = Set.of(ownerId, memberId, newId);
        Context ownerDevice = device(), memberDevice = device(), newDevice = device();
        GroupProfilePhotos owner = new GroupProfilePhotos(ownerDevice, ownerId);
        GroupProfilePhotos member = new GroupProfilePhotos(memberDevice, memberId);
        GroupProfilePhotos newcomer = new GroupProfilePhotos(newDevice, newId);
        owner.select("group", roster);
        member.select("group", roster);
        newcomer.select("group", roster);
        String red = photo(Color.RED), blue = photo(Color.BLUE);
        owner.setOwn(red);
        member.setOwn(blue);

        assertFalse(owner.receive(new JSONObject().put(newId, blue), true, memberId, roster));
        assertTrue(owner.receive(member.changes(owner.fingerprints(true, memberId), false, ownerId, roster), true, memberId, roster));
        JSONObject firstSync = owner.changes(newcomer.fingerprints(false, ownerId), true, newId, roster);
        assertEquals(2, firstSync.length());
        assertTrue(newcomer.receive(firstSync, false, ownerId, roster));
        assertEquals(red, newcomer.image(ownerId));
        assertEquals(blue, newcomer.image(memberId));
        assertEquals(0, owner.changes(newcomer.fingerprints(false, ownerId), true, newId, roster).length());

        newcomer = new GroupProfilePhotos(newDevice, newId);
        newcomer.select("group", roster);
        assertEquals(blue, newcomer.image(memberId));
        assertEquals(0, owner.changes(newcomer.fingerprints(false, ownerId), true, newId, roster).length());
        assertEquals(blue, new GroupProfilePhotos(memberDevice, memberId).ownImage());

        member.setOwn("");
        assertTrue(owner.receive(member.changes(owner.fingerprints(true, memberId), false, ownerId, roster), true, memberId, roster));
        JSONObject removal = owner.changes(newcomer.fingerprints(false, ownerId), true, newId, roster);
        assertEquals("", removal.getString(memberId));
        assertTrue(newcomer.receive(removal, false, ownerId, roster));
        assertEquals("", newcomer.image(memberId));
        assertEquals(0, owner.changes(newcomer.fingerprints(false, ownerId), true, newId, roster).length());

        Set<String> afterRevocation = Set.of(newId);
        newcomer.select("group", afterRevocation);
        assertEquals("", newcomer.image(ownerId));
        assertFalse(newcomer.receive(firstSync, false, ownerId, afterRevocation));
        newcomer.select("another-group", roster);
        assertEquals("", newcomer.image(ownerId));
    }

    private Context device() throws Exception {
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File path = Files.createTempDirectory(directory.getRoot().toPath(), "device").toFile();
        return new ContextWrapper(target) {
            @Override public File getNoBackupFilesDir() { return path; }
        };
    }

    private String photo(int color) {
        int size = GroupProfilePhotos.EDGE;
        Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        try {
            bitmap.eraseColor(color);
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            assertTrue(bitmap.compress(Bitmap.CompressFormat.JPEG, 80, bytes));
            return Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP);
        } finally {
            bitmap.recycle();
        }
    }
}
