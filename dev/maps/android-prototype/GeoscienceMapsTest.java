package au.aumanet.app.maps;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import org.json.*;
import java.awt.image.BufferedImage;
import javax.imageio.ImageIO;

public final class GeoscienceMapsTest {
    interface Action {void run()throws Exception;}
    static void rejects(Action action)throws Exception{try{action.run();throw new AssertionError("Expected failure");}catch(IOException expected){}}
    public static void main(String[] args)throws Exception{
        for(double lat:new double[]{-43,-37.814,-10})for(int radius:new int[]{25,50,100}){
            GeoscienceMaps.Plan plan=new GeoscienceMaps.Plan(lat,145,radius);
            if(plan.tiles.isEmpty()||plan.tiles.size()>2048)throw new AssertionError("Tile bound");
        }
        rejects(()->new GeoscienceMaps.Plan(Double.NaN,145,50));rejects(()->new GeoscienceMaps.Plan(-37,0,50));rejects(()->new GeoscienceMaps.Plan(-37,145,500));
        File root=new File(args[0]);root.mkdirs();
        ByteArrayOutputStream output=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(256,256,BufferedImage.TYPE_INT_ARGB),"png",output);byte[] png=output.toByteArray();
        GeoscienceMaps.Plan plan=new GeoscienceMaps.Plan(-37.814,144.963,25);
        JSONObject manifest=GeoscienceMaps.download(new File(root,"valid"),plan,url->{if(!url.startsWith(GeoscienceMaps.SERVICE+"/export?"))throw new AssertionError("Wrong endpoint");return png;},image->{},(done,total)->{});
        OfflineMapValidation.validate(manifest);
        if(manifest.getJSONArray("tiles").length()!=plan.tiles.size())throw new AssertionError("Incomplete coverage");
        rejects(()->GeoscienceMaps.download(new File(root,"bad"),plan,url->new byte[24],image->{},(done,total)->{}));
        rejects(()->GeoscienceMaps.download(new File(root,"cancel"),plan,url->{throw new AssertionError("Fetched after cancellation");},image->{},(done,total)->{throw new IOException("Cancelled");}));
        if(Arrays.asList(args).contains("--live")){
            byte[] image=GeoscienceMaps.fetch(GeoscienceMaps.imageUrl(plan.tiles.get(plan.tiles.size()-1)));
            BufferedImage decoded=ImageIO.read(new ByteArrayInputStream(image));
            if(decoded==null||decoded.getWidth()!=256||decoded.getHeight()!=256)throw new AssertionError("Live map image invalid");
            Files.write(new File(root,"live-ga.png").toPath(),image);
            System.out.println("Live GA export: "+image.length+" bytes, 256 × 256 PNG");
        }
        System.out.println("Geoscience planning, coverage, manifest, invalid image and cancellation checks passed; "+plan.tiles.size()+" images for 50 km area.");
    }
}
