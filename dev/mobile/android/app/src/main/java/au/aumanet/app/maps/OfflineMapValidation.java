package au.aumanet.app.maps;
import org.json.*;
import java.io.IOException;
import java.util.*;
/** Shared prepared/imported raster manifest policy. */
public final class OfflineMapValidation {
    public static final long MAX_PAYLOAD_BYTES=512L*1024*1024;
    public static long payload(JSONObject m)throws Exception{long bytes=0;JSONArray tiles=m.getJSONArray("tiles");for(int i=0;i<tiles.length();i++)bytes+=integer(tiles.getJSONObject(i),"bytes",8,512*1024);return bytes;}
    public static String string(JSONObject o,String key)throws Exception{Object value=o.get(key);if(!(value instanceof String))throw new IOException("Invalid map "+key+" type");return(String)value;}
    public static double number(Object value)throws IOException{if(!(value instanceof Number))throw new IOException("Map coordinates and dimensions must be numbers");double number=((Number)value).doubleValue();if(!Double.isFinite(number))throw new IOException("Map number must be finite");return number;}
    public static int integer(JSONObject o,String key,int min,int max)throws Exception{double value=number(o.get(key));if(value!=Math.rint(value)||Math.abs(value)>9007199254740991D||value<min||value>max)throw new IOException("Invalid map "+key);return(int)value;}
    public static String text(JSONObject o,String key,int limit)throws Exception{String s=string(o,key);if(s.replaceAll("[\\s\\p{Z}\\uFEFF]","").isEmpty()||s.length()>limit||s.matches("(?s).*[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f].*"))throw new IOException("Invalid map "+key);return s;}
    public static void https(JSONObject o,String key)throws Exception{java.net.URI uri=new java.net.URI(text(o,key,2000));if(!"https".equals(uri.getScheme())||uri.getHost()==null||uri.getRawUserInfo()!=null)throw new IOException("Invalid map source link");}
    public static void validate(JSONObject m)throws Exception{
        if(!string(m,"schema").equals("aumanet.offline-map.v1")||!string(m,"id").matches("[a-z0-9][a-z0-9-]{0,79}")||integer(m,"tileSize",256,256)!=256||!string(m,"format").equals("image/png"))throw new IOException("Unsupported map pack");
        text(m,"title",120);int min=integer(m,"minZoom",0,18),max=integer(m,"maxZoom",min,18);
        JSONArray b=m.getJSONArray("bounds");if(b.length()!=4)throw new IOException("Invalid map bounds");double w=number(b.get(0)),s=number(b.get(1)),e=number(b.get(2)),n=number(b.get(3));
        if(!Double.isFinite(w)||!Double.isFinite(s)||!Double.isFinite(e)||!Double.isFinite(n)||w< -180||e>180||s< -85.05112878||n>85.05112878||w>=e||s>=n)throw new IOException("Invalid map coverage");
        JSONObject source=m.getJSONObject("source");text(source,"name",120);text(source,"fileName",240);text(source,"attribution",2000);text(source,"license",160);text(source,"dataDate",80);text(source,"preparedAt",80);text(source,"changes",2000);https(source,"url");https(source,"licenseUrl");if(!string(source,"sha256").matches("[a-f0-9]{64}"))throw new IOException("Invalid source checksum");
        JSONArray tiles=m.getJSONArray("tiles");if(tiles.length()<1||tiles.length()>8192)throw new IOException("Map must contain 1–8192 tiles");Set<String>seen=new HashSet<>();long sum=0;
        for(int i=0;i<tiles.length();i++){JSONObject t=tiles.getJSONObject(i);int z=integer(t,"z",min,max),x=integer(t,"x",0,(1<<z)-1),y=integer(t,"y",0,(1<<z)-1),bytes=integer(t,"bytes",8,512*1024);if(!string(t,"sha256").matches("[a-f0-9]{64}")||!seen.add(z+"/"+x+"/"+y))throw new IOException("Invalid map tile index");sum+=bytes;}
        if(sum>MAX_PAYLOAD_BYTES)throw new IOException("Map exceeds the 512 MiB pack limit");
        long expected=0;for(int z=min;z<=max;z++){int size=1<<z,x0=(int)Math.floor((w+180)/360*size),x1=Math.min(size-1,(int)Math.ceil((e+180)/360*size)-1),y0=Math.max(0,(int)Math.floor(latitudeY(n,size))),y1=Math.min(size-1,(int)Math.ceil(latitudeY(s,size))-1);expected+=(long)(x1-x0+1)*(y1-y0+1);if(expected>8192)throw new IOException("Map coverage exceeds the tile limit");for(int x=x0;x<=x1;x++)for(int y=y0;y<=y1;y++)if(!seen.contains(z+"/"+x+"/"+y))throw new IOException("Map index is incomplete for its declared coverage");}if(expected!=tiles.length())throw new IOException("Map contains tiles outside its declared coverage");
    }
    public static double latitudeY(double latitude,int size){double tangent=Math.tan(latitude*Math.PI/180);return(1-Math.log(tangent+Math.sqrt(tangent*tangent+1))/Math.PI)/2*size;}
}
