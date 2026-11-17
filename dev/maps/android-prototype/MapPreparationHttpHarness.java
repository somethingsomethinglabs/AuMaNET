package au.aumanet.maps.prototype;

import com.sun.net.httpserver.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.Executors;
import javax.imageio.ImageIO;

/** Local-only desktop integration fixture. This does not simulate AndroidX origin checks or SAF. */
public final class MapPreparationHttpHarness {
    private static MapPreparationFiles files;
    private static MapPreparationFiles.Source source;
    private static MapPreparationFiles.Session session;
    private static File ready;
    private static final Map<String,String> ATTRIBUTION=Map.of("name","Getlost Maps","url","https://www.getlost.com.au/current-map-information/","attribution","Getlost Maps; OpenStreetMap contributors and Victorian Government/DELWP; source data modified by Getlost Maps.","license","CC BY-NC-ND 4.0 · private non-commercial preparation","licenseUrl","https://creativecommons.org/licenses/by-nc-nd/4.0/","dataDate","May 2023 · V16b");
    public static void main(String[] args)throws Exception{
        files=new MapPreparationFiles(new File(args[0]),MapPreparationFiles.PROPOSED_PAYLOAD_BYTES);files.cleanOrphans();try(InputStream input=new FileInputStream(args[1])){source=files.copySource(input,new File(args[1]).getName(),()->false);}
        HttpServer server=HttpServer.create(new InetSocketAddress("127.0.0.1",Integer.parseInt(args[2])),0);server.setExecutor(Executors.newFixedThreadPool(2));server.createContext("/",MapPreparationHttpHarness::serve);server.start();System.out.println("READY local integration fixture; source bytes="+source.bytes);
        Runtime.getRuntime().addShutdownHook(new Thread(()->{try{if(session!=null)session.cancel();else if(source!=null)files.discardSource(source);}catch(Exception ignored){}server.stop(0);}));
    }
    private static void serve(HttpExchange exchange)throws IOException{
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin","http://127.0.0.1:4178");exchange.getResponseHeaders().set("Access-Control-Allow-Methods","GET,POST,OPTIONS");exchange.getResponseHeaders().set("Access-Control-Allow-Headers","Content-Type,Range");exchange.getResponseHeaders().set("Access-Control-Expose-Headers","Content-Range,Content-Length");
        if(exchange.getRequestMethod().equals("OPTIONS")){exchange.sendResponseHeaders(204,-1);exchange.close();return;}
        try{
            String path=exchange.getRequestURI().getPath();Map<String,String> query=query(exchange.getRequestURI().getRawQuery());
            if(path.equals("/native/source")){json(exchange,200,"{\"sourceId\":"+quote(source.id)+",\"fileName\":"+quote(source.fileName)+",\"bytes\":"+source.bytes+",\"sha256\":"+quote(source.sha256)+",\"path\":\"/source.tif\"}");return;}
            if(path.equals("/native/begin")){
                double[] bounds={Double.parseDouble(query.get("w")),Double.parseDouble(query.get("s")),Double.parseDouble(query.get("e")),Double.parseDouble(query.get("n"))};var plan=new MapPreparationFiles.Plan(bounds,Integer.parseInt(query.get("min")),Integer.parseInt(query.get("max")));
                session=files.begin(source,plan,new MapPreparationFiles.Metadata("getlost-moe-native-worker-v16b","Moe–Traralgon · native sink prototype",ATTRIBUTION),(data,offset,length)->{var image=ImageIO.read(new ByteArrayInputStream(data,offset,length));if(image==null||image.getWidth()!=256||image.getHeight()!=256)throw new IOException("PNG decode failed");});
                json(exchange,200,"{\"sessionId\":"+quote(session.id)+",\"total\":"+plan.tileCount+",\"payloadLimitBytes\":"+MapPreparationFiles.PROPOSED_PAYLOAD_BYTES+"}");return;
            }
            if(path.equals("/native/write")){
                byte[] frame=exchange.getRequestBody().readNBytes(MapPreparationFiles.HEADER_BYTES+MapPreparationFiles.MAX_TILE_BYTES+1);MapPreparationFiles.Ack[] result={null};if(!session.offer(frame,Runnable::run,ack->result[0]=ack))throw new IOException("Frame not accepted");var ack=result[0];json(exchange,200,"{\"schema\":\"aumanet.map-preparation-ack.v1\",\"sessionId\":"+quote(ack.sessionId)+",\"sequence\":"+ack.sequence+",\"ok\":"+ack.ok+",\"storedBytes\":"+ack.storedBytes+",\"totalBytes\":"+ack.totalBytes+",\"error\":"+quote(ack.error)+"}");return;
            }
            if(path.equals("/native/child")){int z=Integer.parseInt(query.get("z")),x=Integer.parseInt(query.get("x")),y=Integer.parseInt(query.get("y"));session.tile(z,x,y);json(exchange,200,"{\"path\":\"/tile/"+z+"/"+x+"/"+y+".png\"}");return;}
            if(path.equals("/native/finish")){ready=session.finish();session=null;source=null;json(exchange,200,"{\"instanceId\":"+quote(ready.getName())+"}");System.out.println("COMMITTED "+ready.getName());return;}
            if(path.equals("/native/cancel")){if(session!=null)session.cancel();else if(source!=null)files.discardSource(source);session=null;source=null;json(exchange,200,"{}");return;}
            if(path.equals("/files/source.tif")){binary(exchange,source.file(),true);return;}
            if(path.matches("/files/tile/\\d+/\\d+/\\d+\\.png")){String[] parts=path.substring("/files/tile/".length()).replace(".png","").split("/");binary(exchange,session.tile(Integer.parseInt(parts[0]),Integer.parseInt(parts[1]),Integer.parseInt(parts[2])),false);return;}
            json(exchange,404,"{\"error\":\"Fixture route unavailable\"}");
        }catch(Exception failure){json(exchange,400,"{\"error\":"+quote(failure.getMessage()==null?"Fixture failed":failure.getMessage())+"}");}finally{exchange.close();}
    }
    private static void binary(HttpExchange exchange,File file,boolean requiredRange)throws Exception{
        String range=exchange.getRequestHeaders().getFirst("Range");long start=0,end=file.length()-1;int status=200;
        if(range!=null){if(!range.matches("bytes=\\d+-\\d+"))throw new IOException("Single range required");String[] parts=range.substring(6).split("-");start=Long.parseLong(parts[0]);end=Long.parseLong(parts[1]);if(start<0||start>end||end>=file.length()||end-start+1>2*1024*1024)throw new IOException("Range outside fixture file");status=206;exchange.getResponseHeaders().set("Content-Range","bytes "+start+"-"+end+"/"+file.length());}else if(requiredRange)throw new IOException("Full-file source read rejected");
        exchange.getResponseHeaders().set("Content-Type",requiredRange?"image/tiff":"image/png");exchange.sendResponseHeaders(status,end-start+1);try(RandomAccessFile input=new RandomAccessFile(file,"r");OutputStream out=exchange.getResponseBody()){input.seek(start);byte[] buffer=new byte[65536];long left=end-start+1;while(left>0){int n=input.read(buffer,0,(int)Math.min(buffer.length,left));if(n<0)throw new EOFException();out.write(buffer,0,n);left-=n;}}
    }
    private static Map<String,String> query(String raw){Map<String,String> result=new HashMap<>();if(raw!=null)for(String pair:raw.split("&")){String[] fields=pair.split("=",2);result.put(URLDecoder.decode(fields[0],StandardCharsets.UTF_8),fields.length>1?URLDecoder.decode(fields[1],StandardCharsets.UTF_8):"");}return result;}
    private static String quote(String value){return"\""+value.replace("\\","\\\\").replace("\"","\\\"").replace("\n"," ").replace("\r"," ")+"\"";}
    private static void json(HttpExchange exchange,int status,String body)throws IOException{byte[] bytes=body.getBytes(StandardCharsets.UTF_8);exchange.getResponseHeaders().set("Content-Type","application/json");exchange.sendResponseHeaders(status,bytes.length);exchange.getResponseBody().write(bytes);}
}
