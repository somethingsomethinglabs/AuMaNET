package au.aumanet.app.maps;
import android.webkit.*;
import android.net.Uri;
import android.graphics.Bitmap;
import com.getcapacitor.*;
import java.io.*;
import java.util.*;

/** Replaces only app-owned raster endpoints; all Capacitor navigation/other resources retain the SDK handler. */
public final class MapWebViewClient extends BridgeWebViewClient {
    private final File root;
    private final Bridge owner;
    public MapWebViewClient(Bridge bridge){super(bridge);owner=bridge;root=new File(bridge.getContext().getFilesDir(),"offline-maps-v1");}
    @Override public void onPageStarted(WebView view,String url,Bitmap favicon){MapFileRegistry.cancelForNavigation(owner);super.onPageStarted(view,url,favicon);}
    @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
        Uri url=request.getUrl();String path=url.getEncodedPath();if(path==null||!path.startsWith(MapFileRegistry.PREFIX))return super.shouldInterceptRequest(view,request);
        try{
            if(!"https".equals(url.getScheme())||!"localhost".equals(url.getHost())||url.getPort()!=-1&&url.getPort()!=443||url.getUserInfo()!=null||url.getFragment()!=null||!"GET".equals(request.getMethod()))return failure(403,"Forbidden");
            for(String key:request.getRequestHeaders().keySet())if(key.equalsIgnoreCase("range"))return failure(416,"Range Not Satisfiable");
            String[] parts=path.substring(MapFileRegistry.PREFIX.length()).split("/");
            if(parts.length==2&&parts[0].equals("archive")&&(parts[1].equals("basemap.pmtiles")||parts[1].equals("terrain.pmtiles"))){
                android.content.res.AssetFileDescriptor asset=owner.getContext().getAssets().openFd("public/maps/outdoor-preview/"+parts[1]);
                boolean transferred=false;
                try{
                    long size=asset.getLength();long[] range=BoundedMapInputStream.query(url.getEncodedQuery(),size);
                    Map<String,String> value=headers(range[1]);value.put("X-AuMaNET-Content-Range","bytes "+range[0]+"-"+(range[0]+range[1]-1)+"/"+size);
                    WebResourceResponse response=new WebResourceResponse("application/octet-stream",null,200,"OK",value,new BoundedAssetInputStream(asset,range[0],range[1]));transferred=true;return response;
                }finally{if(!transferred)asset.close();}
            }
            if(parts.length>=5&&parts[0].equals("vector")){
                if(url.getEncodedQuery()!=null)return failure(400,"Bad Request");
                String relative;String mime;
                if(parts.length==6&&(parts[2].equals("base")||parts[2].equals("terrain"))&&parts[3].matches("[0-9]{1,2}")&&parts[4].matches("[0-9]{1,6}")&&parts[5].matches("[0-9]{1,6}\\.(pbf|webp)")){
                    int z=Integer.parseInt(parts[3]),x=Integer.parseInt(parts[4]),y=Integer.parseInt(parts[5].substring(0,parts[5].lastIndexOf('.')));if(z>15||x>=(1<<z)||y>=(1<<z))return failure(404,"Not Found");
                    relative=parts[2]+"/"+parts[3]+"/"+parts[4]+"/"+parts[5];mime=parts[2].equals("terrain")?"image/webp":"application/x-protobuf";
                }else if(parts.length==5&&parts[2].equals("glyphs")&&parts[3].equals("Noto%20Sans%20Regular")&&parts[4].matches("[0-9]{1,5}-[0-9]{1,5}\\.pbf")){relative="glyphs/"+parts[4];mime="application/x-protobuf";}else return failure(404,"Not Found");
                File file=VectorRegions.file(new File(owner.getContext().getFilesDir(),"vector-maps-v1"),parts[1],relative);
                return new WebResourceResponse(mime,null,200,"OK",headers(file.length()),file.length()==0?new ByteArrayInputStream(new byte[0]):new BoundedMapInputStream(file,0,file.length()));
            }
            if(parts.length==2&&parts[0].equals("source")&&parts[1].matches("[a-f0-9]{32}")){
                MapPreparationFiles.Source source=MapFileRegistry.source(parts[1]);long[] range=BoundedMapInputStream.query(url.getEncodedQuery(),source.bytes);
                Map<String,String> headers=headers(range[1]);headers.put("X-AuMaNET-Content-Range","bytes "+range[0]+"-"+(range[0]+range[1]-1)+"/"+source.bytes);
                return new WebResourceResponse("image/tiff",null,200,"OK",headers,new BoundedMapInputStream(source.file(),range[0],range[1]));
            }
            if(url.getEncodedQuery()!=null||url.getFragment()!=null)return failure(400,"Bad Request");
            if(parts.length==5&&(parts[0].equals("region")||parts[0].equals("preparing"))&&parts[2].matches("\\d{1,2}")&&parts[3].matches("\\d{1,6}")&&parts[4].matches("\\d{1,6}\\.png")){
                int z=Integer.parseInt(parts[2]),x=Integer.parseInt(parts[3]),y=Integer.parseInt(parts[4].substring(0,parts[4].length()-4));if(z>18||x>=(1<<z)||y>=(1<<z))return failure(404,"Not Found");File image;
                if(parts[0].equals("preparing")&&parts[1].matches("[a-f0-9]{32}"))image=MapFileRegistry.child(parts[1],z,x,y);
                else if(parts[0].equals("region")&&parts[1].matches("[a-z0-9][a-z0-9-]{0,79}\\.[a-f0-9]{32}")){
                    File region=new File(root,parts[1]);if(!new File(region,"manifest.json").isFile())return failure(404,"Not Found");image=new File(region,z+"/"+x+"/"+y+".png");
                }else return failure(404,"Not Found");
                if(!image.isFile()||image.length()<24||image.length()>512*1024)return failure(404,"Not Found");
                return new WebResourceResponse("image/png",null,200,"OK",headers(image.length()),new BoundedMapInputStream(image,0,image.length()));
            }
            return failure(404,"Not Found");
        }catch(Exception error){return failure(404,"Not Found");}
    }
    private static Map<String,String> headers(long bytes){Map<String,String> value=new HashMap<>();value.put("Content-Length",Long.toString(bytes));value.put("Cache-Control","no-store");value.put("X-Content-Type-Options","nosniff");return value;}
    private static WebResourceResponse failure(int status,String reason){return new WebResourceResponse("text/plain","UTF-8",status,reason,headers(0),new ByteArrayInputStream(new byte[0]));}
}
