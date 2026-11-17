package au.aumanet.app.maps;

import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

/** Small user-selected regional downloads through GA's supported map-image export API.
 * Does not scrape the cached tile service or call its disabled exportTiles operation. */
public final class GeoscienceMaps {
    public static final String SERVICE="https://services.ga.gov.au/gis/rest/services/AUSTopo_Topographic_Basemap/MapServer";
    public interface Progress { void update(int complete,int total)throws IOException; }
    public interface Fetch { byte[] image(String url)throws Exception; }
    public interface ImageCheck { void check(byte[] image)throws Exception; }
    public static final class Plan {
        public final double[] bounds;
        public final List<int[]> tiles=new ArrayList<>();
        public final String id,title;
        public Plan(double lat,double lon,int radius)throws IOException {
            if(!Double.isFinite(lat)||!Double.isFinite(lon)||lat< -44||lat> -10||lon<112||lon>154||!(radius==25||radius==50||radius==100))throw new IOException("Choose a centre within mainland Australia or Tasmania and a supported radius");
            double dy=radius/111.32,dx=dy/Math.cos(Math.toRadians(lat));
            bounds=new double[]{lon-dx,lat-dy,lon+dx,lat+dy};
            id=String.format(Locale.ROOT,"ga-topo-%d-%d-%d",Math.round((lat+90)*10000),Math.round((lon+180)*10000),radius);
            title=String.format(Locale.ROOT,"AUSTopo · %.3f, %.3f · %d km area",lat,lon,radius*2);
            for(int z=8;z<=12;z++){
                int size=1<<z,x0=(int)Math.floor((bounds[0]+180)/360*size),x1=(int)Math.ceil((bounds[2]+180)/360*size)-1;
                int y0=(int)Math.floor(toY(bounds[3],size)),y1=(int)Math.ceil(toY(bounds[1],size))-1;
                for(int x=x0;x<=x1;x++)for(int y=y0;y<=y1;y++)tiles.add(new int[]{z,x,y});
            }
            if(tiles.size()>2048)throw new IOException("This area is too large; choose a smaller radius");
        }
    }
    private static double toY(double lat,int size){double r=Math.toRadians(lat);return(1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*size;}
    public static String imageUrl(int[] t){
        double span=40075016.68557849/(1<<t[0]),west=-20037508.342789244+t[1]*span,north=20037508.342789244-t[2]*span;
        return SERVICE+"/export?f=image&format=png32&transparent=false&bboxSR=3857&imageSR=3857&size=256,256&bbox="+west+","+(north-span)+","+(west+span)+","+north;
    }
    public static byte[] fetch(String url)throws Exception {
        HttpURLConnection connection=(HttpURLConnection)new URI(url).toURL().openConnection();
        connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(15000);connection.setReadTimeout(15000);
        connection.setRequestProperty("User-Agent","AuMaNET/1.0 (user-requested offline regional map)");
        try{
            if(connection.getResponseCode()!=200)throw new IOException("Geoscience Australia download failed (HTTP "+connection.getResponseCode()+")");
            if(connection.getContentLengthLong()>512*1024)throw new IOException("Map image exceeds the download limit");
            try(InputStream in=connection.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){
                byte[] buffer=new byte[8192];int n;
                while((n=in.read(buffer))!=-1){if(Thread.currentThread().isInterrupted())throw new IOException("Download cancelled");if(out.size()+n>512*1024)throw new IOException("Map image exceeds the download limit");out.write(buffer,0,n);}
                return out.toByteArray();
            }
        }finally{connection.disconnect();}
    }
    public static JSONObject download(File staging,Plan plan,Fetch fetch,ImageCheck check,Progress progress)throws Exception {
        JSONArray tiles=new JSONArray();MessageDigest aggregate=MessageDigest.getInstance("SHA-256");int complete=0;long payload=0;
        for(int[] t:plan.tiles){
            progress.update(complete,plan.tiles.size());
            byte[] image=fetch.image(imageUrl(t));
            if(image.length<24||image.length>512*1024)throw new IOException("Invalid downloaded map image");
            payload+=image.length;if(payload>512L*1024*1024)throw new IOException("Download exceeds 512 MiB; choose a smaller area");
            java.nio.ByteBuffer png=java.nio.ByteBuffer.wrap(image);
            if(png.getLong(0)!=0x89504e470d0a1a0aL||png.getInt(12)!=0x49484452||png.getInt(16)!=256||png.getInt(20)!=256)throw new IOException("Geoscience Australia returned an invalid map image");
            check.check(image);progress.update(complete,plan.tiles.size());
            File file=new File(staging,t[0]+"/"+t[1]+"/"+t[2]+".png");
            if(!file.getParentFile().isDirectory()&&!file.getParentFile().mkdirs())throw new IOException("Cannot create download folder");
            try(FileOutputStream out=new FileOutputStream(file)){out.write(image);out.getFD().sync();}
            aggregate.update(image);
            tiles.put(new JSONObject().put("z",t[0]).put("x",t[1]).put("y",t[2]).put("bytes",image.length).put("sha256",hex(MessageDigest.getInstance("SHA-256").digest(image))));
            progress.update(++complete,plan.tiles.size());
        }
        String date=java.time.Instant.now().toString();
        JSONObject source=new JSONObject().put("name","Geoscience Australia AUSTopo").put("url","https://www.ga.gov.au/scientific-topics/national-location-information/topographic-maps")
            .put("fileName",plan.id+".map-images").put("sha256",hex(aggregate.digest())).put("attribution","© Commonwealth of Australia (Geoscience Australia). AUSTopo 1:250 000.")
            .put("license","CC BY 4.0").put("licenseUrl","https://creativecommons.org/licenses/by/4.0/").put("dataDate","Live service; edition date unknown").put("preparedAt",date)
            .put("changes","Rendered from GA map-image exports in EPSG:3857 at zooms 8–12. Regional overview at 1:250,000; not for navigation or emergency decision-making. Checksum covers ordered downloaded images.");
        JSONObject manifest=new JSONObject().put("schema","aumanet.offline-map.v1").put("id",plan.id).put("title",plan.title)
            .put("bounds",new JSONArray(plan.bounds)).put("minZoom",8).put("maxZoom",12).put("tileSize",256).put("format","image/png").put("source",source).put("tiles",tiles);
        OfflineMapValidation.validate(manifest);
        return manifest;
    }
    private static String hex(byte[] bytes){StringBuilder out=new StringBuilder();for(byte b:bytes)out.append(String.format(Locale.ROOT,"%02x",b&255));return out.toString();}
}
