package au.aumanet.app;
import org.json.*;
/** Existing consented phone fixes only. Separation is a phone proxy, not a
 * measured RF path length; node placement and GPS uncertainty are independent. */
final class LinkBenchmarkMetadata {
    static JSONObject fix(JSONObject raw)throws Exception{if(raw==null)return null;double lat=raw.getDouble("latitude"),lon=raw.getDouble("longitude"),accuracy=raw.getDouble("accuracy");long age=LinkBenchmarkWire.integer(raw,"ageMs",60000),stamp=LinkBenchmarkWire.integer(raw,"timestamp",GroupNamePolicy.MAX_REVISION);if(!Double.isFinite(lat)||!Double.isFinite(lon)||!Double.isFinite(accuracy)||Math.abs(lat)>90||Math.abs(lon)>180||accuracy<0||accuracy>1e6)return null;return new JSONObject().put("latitude",lat).put("longitude",lon).put("accuracy",accuracy).put("ageMs",age).put("timestamp",stamp).put("mock",raw.optBoolean("mock",false));}
    static JSONObject capture(JSONArray radio,JSONObject own,JSONObject peer)throws Exception{return capture(radio,own,peer,null);}
    static JSONObject capture(JSONArray radio,JSONObject own,JSONObject peer,JSONArray configurations)throws Exception{JSONObject positions=new JSONObject();JSONObject a=null,b=null;try{a=fix(own);}catch(Exception unavailable){}try{b=fix(peer);}catch(Exception unavailable){}if(a!=null)positions.put("own",a);if(b!=null)positions.put("peer",b);JSONObject result=new JSONObject().put("radioSignals",new JSONArray(radio.toString())).put("positions",positions);if(configurations!=null){String encoded=configurations.toString();if(configurations.length()>2||encoded.getBytes(java.nio.charset.StandardCharsets.UTF_8).length>2048)throw new IllegalArgumentException("Radio configuration observation bound exceeded");result.put("radioConfigurations",new JSONArray(encoded));}if(a!=null&&b!=null){double lat1=Math.toRadians(a.getDouble("latitude")),lat2=Math.toRadians(b.getDouble("latitude")),dlat=lat2-lat1,dlon=Math.toRadians(b.getDouble("longitude")-a.getDouble("longitude"));double h=Math.sin(dlat/2)*Math.sin(dlat/2)+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dlon/2)*Math.sin(dlon/2);result.put("phoneSeparationMeters",6371008.8*2*Math.atan2(Math.sqrt(Math.max(0,Math.min(1,h))),Math.sqrt(Math.max(0,1-h))));}return result;}
    /** A lost-scope start observation is historical evidence, never a new end
     * observation. Do not relabel it, reset its age, or supply it as final GPS. */
    static void observations(JSONObject result,JSONObject start,JSONObject end)throws Exception{
        result.remove("observationsAtStart");result.remove("observationsAtEnd");result.remove("phoneSeparationMeters");result.remove("radioConfigurations");result.put("radioSignals",new JSONArray()).put("positions",new JSONObject());
        if(start!=null)result.put("observationsAtStart",new JSONObject(start.toString()));
        if(end!=null){JSONObject frozen=new JSONObject(end.toString());result.put("observationsAtEnd",frozen).put("radioSignals",frozen.getJSONArray("radioSignals")).put("positions",frozen.getJSONObject("positions"));if(frozen.has("radioConfigurations"))result.put("radioConfigurations",frozen.getJSONArray("radioConfigurations"));if(frozen.has("phoneSeparationMeters"))result.put("phoneSeparationMeters",frozen.get("phoneSeparationMeters"));}
    }
    private LinkBenchmarkMetadata(){}
}
