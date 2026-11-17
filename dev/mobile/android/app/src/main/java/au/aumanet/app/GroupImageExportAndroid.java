package au.aumanet.app;
import android.content.*;import android.net.Uri;import android.os.*;import android.provider.MediaStore;import java.io.*;

/** API29+ own-media insertion needs no broad storage permission.
 * https://developer.android.com/training/data-storage/shared/media#toggle-pending-status */
final class GroupImageExportAndroid implements GroupImageExport.Store{
    private final ContentResolver resolver;
    static boolean available(){return Build.VERSION.SDK_INT>=29;}
    GroupImageExportAndroid(Context context){resolver=context.getApplicationContext().getContentResolver();}
    @Override public GroupImageExport.Pending insert(String name)throws Exception{
        if(!available())throw new GroupImageExport.SaveException(false);
        ContentValues values=new ContentValues();values.put(MediaStore.Images.Media.DISPLAY_NAME,name);values.put(MediaStore.Images.Media.MIME_TYPE,"image/jpeg");values.put(MediaStore.Images.Media.RELATIVE_PATH,Environment.DIRECTORY_PICTURES+"/AuMaNET");values.put(MediaStore.Images.Media.IS_PENDING,1);
        Uri uri=resolver.insert(MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY),values);if(uri==null)return null;
        return new GroupImageExport.Pending(){
            public OutputStream open()throws Exception{ParcelFileDescriptor fd=resolver.openFileDescriptor(uri,"w");return fd==null?null:new ParcelFileDescriptor.AutoCloseOutputStream(fd);}
            public boolean publish(){ContentValues completed=new ContentValues();completed.put(MediaStore.Images.Media.IS_PENDING,0);return resolver.update(uri,completed,null,null)==1;}
            public boolean delete(){return resolver.delete(uri,null,null)==1;}
        };
    }
}
