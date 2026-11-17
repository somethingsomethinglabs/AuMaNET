package au.aumanet.app;

import android.content.Context;
import android.util.AtomicFile;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;

/** Private NoBackup permission metadata only. No node credentials or active run. */
final class TrustedConnectionDisk implements TrustedConnectionStore.Storage {
    private final AtomicFile file;
    TrustedConnectionDisk(Context context){file=new AtomicFile(new File(context.getNoBackupFilesDir(),"trusted-connection-v1.json"));}
    @Override public String read()throws Exception{try(java.io.InputStream input=file.openRead()){byte[] bytes=new byte[8193];int used=0,n;while(used<bytes.length&&(n=input.read(bytes,used,bytes.length-used))>=0){if(n==0)throw new IllegalStateException("Remembered connection read stalled");used+=n;}if(used>8192)throw new IllegalArgumentException("Remembered connection oversized");return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes,0,used)).toString();}catch(FileNotFoundException missing){if(file.getBaseFile().exists())throw missing;return null;}}
    @Override public boolean write(String value)throws Exception{byte[] bytes=value.getBytes(StandardCharsets.UTF_8);if(bytes.length>8192)throw new IllegalArgumentException("Remembered connection oversized");FileOutputStream out=null;try{out=file.startWrite();out.write(bytes);out.flush();out.getFD().sync();file.finishWrite(out);return true;}catch(Exception failed){if(out!=null)file.failWrite(out);throw failed;}}
}
