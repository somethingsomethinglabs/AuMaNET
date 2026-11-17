package au.aumanet.app.maps;
import java.io.*;
import java.util.*;

/** Only native-owned source/session tokens are readable; arbitrary filesystem paths are never accepted. */
public final class MapFileRegistry {
    public static final String ORIGIN="https://localhost",PREFIX="/_aumanet_maps/";
    private static final Map<String,MapPreparationFiles.Source> SOURCES=new HashMap<>();
    private static final Map<String,MapPreparationFiles.Session> SESSIONS=new HashMap<>();
    private static Object cancellationOwner;
    private static Runnable cancellation;
    public static synchronized void registerCancellation(Object owner,Runnable callback){cancellationOwner=owner;cancellation=callback;}
    public static synchronized void removeCancellation(Object owner){if(cancellationOwner==owner){cancellationOwner=null;cancellation=null;}}
    public static void cancelForNavigation(Object owner){Runnable action;synchronized(MapFileRegistry.class){action=cancellationOwner==owner?cancellation:null;}if(action!=null)action.run();}
    public static synchronized String addSource(MapPreparationFiles.Source source){SOURCES.put(source.id,source);return ORIGIN+PREFIX+"source/"+source.id;}
    public static synchronized void removeSource(String id){SOURCES.remove(id);}
    public static synchronized MapPreparationFiles.Source source(String id)throws IOException{MapPreparationFiles.Source source=SOURCES.get(id);if(source==null||!source.file().isFile()||source.file().length()!=source.bytes)throw new IOException("GeoTIFF source is unavailable");return source;}
    public static synchronized void addSession(MapPreparationFiles.Session session){SESSIONS.put(session.id,session);}
    public static synchronized void removeSession(String id){SESSIONS.remove(id);}
    public static File child(String id,int z,int x,int y)throws IOException{MapPreparationFiles.Session session;synchronized(MapFileRegistry.class){session=SESSIONS.get(id);}if(session==null)throw new IOException("Preparation session is unavailable");return session.tile(z,x,y);}
    public static String childUrl(String id,int z,int x,int y){return ORIGIN+PREFIX+"preparing/"+id+"/"+z+"/"+x+"/"+y+".png";}
}
