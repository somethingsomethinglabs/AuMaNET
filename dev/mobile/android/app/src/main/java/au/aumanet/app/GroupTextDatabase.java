package au.aumanet.app;
import java.util.*;
/** Minimal SQL boundary shared by Android SQLite and the actual-database JVM test adapter. */
interface GroupTextDatabase extends AutoCloseable {
    void exec(String sql,Object...args)throws Exception;
    List<Map<String,Object>> rows(String sql,String...args)throws Exception;
    void begin()throws Exception;void commit()throws Exception;void rollback()throws Exception;
    void close()throws Exception;
}
