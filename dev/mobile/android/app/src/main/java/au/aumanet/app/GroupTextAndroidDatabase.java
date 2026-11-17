package au.aumanet.app;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import java.io.File;
import java.util.*;
/** Private durable state is deliberately excluded from automatic OS backup. */
final class GroupTextAndroidDatabase implements GroupTextDatabase {
    private final SQLiteDatabase database;
    GroupTextAndroidDatabase(Context context)throws Exception{
        File root=context.getNoBackupFilesDir();if(!root.isDirectory()&&!root.mkdirs()&&!root.isDirectory())throw new IllegalStateException("Private message storage is unavailable");
        database=SQLiteDatabase.openOrCreateDatabase(new File(root,"aumanet-group-messages-v1.sqlite"),null);
        try{database.enableWriteAheadLogging();exec("PRAGMA synchronous=FULL");rows("PRAGMA journal_size_limit=2097152");rows("PRAGMA wal_autocheckpoint=256");long page=((Number)rows("PRAGMA page_size").get(0).values().iterator().next()).longValue();if(page<512||page>65536)throw new IllegalStateException("Unsupported message database page size");rows("PRAGMA max_page_count="+(32L*1024*1024/page));}catch(Exception|Error failure){try{database.close();}catch(Exception close){failure.addSuppressed(close);}throw failure;}
    }
    public void exec(String sql,Object...args){database.execSQL(sql,args);}
    public List<Map<String,Object>> rows(String sql,String...args){List<Map<String,Object>> result=new ArrayList<>();try(Cursor cursor=database.rawQuery(sql,args)){while(cursor.moveToNext()){Map<String,Object> row=new LinkedHashMap<>();for(int i=0;i<cursor.getColumnCount();i++){Object value=cursor.isNull(i)?null:cursor.getType(i)==Cursor.FIELD_TYPE_INTEGER?cursor.getLong(i):cursor.getType(i)==Cursor.FIELD_TYPE_FLOAT?cursor.getDouble(i):cursor.getString(i);row.put(cursor.getColumnName(i),value);}result.add(row);}}return result;}
    public void begin(){database.beginTransactionNonExclusive();}
    public void commit(){database.setTransactionSuccessful();database.endTransaction();}
    public void rollback(){if(database.inTransaction())database.endTransaction();}
    public void close(){database.close();}
}
