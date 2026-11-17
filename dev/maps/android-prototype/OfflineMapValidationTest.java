package au.aumanet.app.maps;
import org.json.*;
import java.nio.file.*;

/** Bounded metadata fixtures: no large raster buffers are created. */
public final class OfflineMapValidationTest {
    /** Android libcore's coercive getters are intentionally emulated, independently of the desktop jar. */
    private static final class AndroidObject extends JSONObject{
        AndroidObject(JSONObject value)throws Exception{super(value.toString());}
        @Override public String getString(String key)throws JSONException{return String.valueOf(get(key));}
        @Override public int getInt(String key)throws JSONException{Object value=get(key);return value instanceof Number?((Number)value).intValue():Integer.parseInt(String.valueOf(value));}
        @Override public double getDouble(String key)throws JSONException{Object value=get(key);return value instanceof Number?((Number)value).doubleValue():Double.parseDouble(String.valueOf(value));}
        @Override public JSONObject getJSONObject(String key)throws JSONException{try{return new AndroidObject(super.getJSONObject(key));}catch(Exception failure){throw new JSONException(failure);}}
        @Override public JSONArray getJSONArray(String key)throws JSONException{return new AndroidArray(super.getJSONArray(key));}
    }
    private static final class AndroidArray extends JSONArray{
        AndroidArray(JSONArray value)throws JSONException{super(value.toString());}
        @Override public double getDouble(int index)throws JSONException{Object value=get(index);return value instanceof Number?((Number)value).doubleValue():Double.parseDouble(String.valueOf(value));}
        @Override public JSONObject getJSONObject(int index)throws JSONException{try{return new AndroidObject(super.getJSONObject(index));}catch(Exception failure){throw new JSONException(failure);}}
    }
    private static double latitude(double y){return Math.atan(Math.sinh(Math.PI*(1-2*y/64)))*180/Math.PI;}
    private static JSONObject region(int width,int height)throws Exception{
        JSONObject source=new JSONObject().put("name","Fixture").put("url","https://example.org/map").put("fileName","fixture.tif").put("sha256","a".repeat(64)).put("attribution","Synthetic fixture only").put("license","CC0").put("licenseUrl","https://creativecommons.org/publicdomain/zero/1.0/").put("dataDate","Unknown").put("preparedAt","2026-11-10").put("changes","Synthetic fixture");
        JSONArray tiles=new JSONArray();for(int y=10;y<10+height;y++)for(int x=10;x<10+width;x++)tiles.put(new JSONObject().put("z",6).put("x",x).put("y",y).put("bytes",512*1024).put("sha256","b".repeat(64)));
        return new JSONObject().put("schema","aumanet.offline-map.v1").put("id","fixture").put("title","Fixture").put("bounds",new JSONArray(new double[]{(10+.001)/64*360-180,latitude(10+height-.001),(10+width-.001)/64*360-180,latitude(10+.001)})).put("minZoom",6).put("maxZoom",6).put("tileSize",256).put("format","image/png").put("source",source).put("tiles",tiles);
    }
    private interface Work{void run()throws Exception;}
    private static void rejected(Work work)throws Exception{try{work.run();}catch(Exception expected){return;}throw new AssertionError("Invalid native manifest accepted");}
    public static void main(String[] args)throws Exception{
        JSONObject maximum=region(32,32);OfflineMapValidation.validate(maximum);if(OfflineMapValidation.payload(maximum)!=512L*1024*1024)throw new AssertionError("Incorrect native quota");rejected(()->OfflineMapValidation.validate(region(41,25)));
        JSONObject missing=region(2,2);missing.getJSONArray("tiles").remove(0);rejected(()->OfflineMapValidation.validate(missing));
        for(String url:new String[]{"https://","https://user:secret@example.org/map","javascript:alert(1)"}){JSONObject invalid=region(2,2);invalid.getJSONObject("source").put("url",url);rejected(()->OfflineMapValidation.validate(invalid));}
        if(args.length>0){JSONObject fixture=new JSONObject(Files.readString(Path.of(args[0])));OfflineMapValidation.validate(new AndroidObject(fixture.getJSONObject("base")));JSONArray cases=fixture.getJSONArray("cases");for(int index=0;index<cases.length();index++){
            JSONObject item=cases.getJSONObject(index),changed=new JSONObject(fixture.getJSONObject("base").toString());JSONArray path=item.getJSONArray("path");Object target=changed;for(int i=0;i<path.length()-1;i++){Object key=path.get(i);target=target instanceof JSONObject?((JSONObject)target).get((String)key):((JSONArray)target).get(((Number)key).intValue());}Object last=path.get(path.length()-1);if(target instanceof JSONObject)((JSONObject)target).put((String)last,item.get("value"));else((JSONArray)target).put(((Number)last).intValue(),item.get("value"));
            rejected(()->OfflineMapValidation.validate(new AndroidObject(changed)));
        }System.out.println("PASS "+cases.length()+" raw-type parity cases with coercive Android getters");}
        if(args.length>1){JSONObject actual=new JSONObject(Files.readString(Path.of(args[1])));OfflineMapValidation.validate(new AndroidObject(actual));System.out.println("PASS actual full-colour manifest: "+actual.getJSONArray("tiles").length()+" tiles, "+OfflineMapValidation.payload(actual)+" bytes");}
        System.out.println("PASS shared native manifest512MiB/incomplete/HTTPS metadata scenarios");
    }
}
