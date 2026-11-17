package au.aumanet.app;

import android.content.Context;
import android.util.AtomicFile;
import android.system.Os;
import android.system.OsConstants;
import java.io.*;
import java.nio.charset.StandardCharsets;

/** App-private no-backup monotonic counters. A cached preference value is not commit evidence. */
final class GatewaySequenceFile implements GatewaySequenceStore.Storage {
    private final AtomicFile file;
    GatewaySequenceFile(Context context){this(context,"gateway-sequences-v1.json");}
    GatewaySequenceFile(Context context,String name){if(!name.equals("gateway-sequences-v1.json")&&!name.equals("gateway-config-v1.json")&&!name.equals("gateway-prepared-time-v1.json"))throw new IllegalArgumentException("Invalid gateway private file");File directory=context.getNoBackupFilesDir();if(directory==null||!directory.isDirectory())throw new IllegalStateException("Gateway no-backup storage is unavailable");file=new AtomicFile(new File(directory,name));}
    public String read()throws Exception{
        File base=file.getBaseFile();if(!base.exists()&&!new File(base.getPath()+".bak").exists()){if(new File(base.getPath()+".new").exists())throw new IOException("Unconfirmed gateway sequence file");return null;}
        try(InputStream input=file.openRead();ByteArrayOutputStream output=new ByteArrayOutputStream()){byte[] buffer=new byte[1024];int count,total=0;while((count=input.read(buffer))!=-1){total+=count;if(total>32768)throw new IOException("Unbounded gateway sequence file");output.write(buffer,0,count);}return GroupWire.decode(output.toByteArray());}
    }
    public boolean write(String encoded)throws Exception{
        byte[] bytes=encoded.getBytes(StandardCharsets.UTF_8);if(bytes.length>32768)throw new IOException("Unbounded gateway sequence file");FileOutputStream output=null;
        try{output=file.startWrite();output.write(bytes);output.getFD().sync();file.finishWrite(output);output=null;FileDescriptor directory=Os.open(file.getBaseFile().getParent(),OsConstants.O_RDONLY|OsConstants.O_CLOEXEC,0);try{if(!OsConstants.S_ISDIR(Os.fstat(directory).st_mode))throw new IOException("Gateway private parent is not a directory");Os.fsync(directory);}finally{Os.close(directory);}return encoded.equals(read());}
        catch(Exception failed){if(output!=null)file.failWrite(output);throw new IOException("Gateway sequence commit could not be confirmed");}
        catch(Error interrupted){if(output!=null)file.failWrite(output);throw interrupted;}
    }
}
