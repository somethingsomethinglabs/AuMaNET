package android.graphics;
import java.awt.image.*;import java.io.*;import java.util.*;import javax.imageio.*;import javax.imageio.stream.*;
/** Host boundary: real desktop JPEG encoder honors quality; not Android codec evidence. */
public final class Bitmap{
 final BufferedImage image;public static final List<Integer> qualities=new ArrayList<>();public static int recycled;
 Bitmap(BufferedImage image){this.image=image;}public enum CompressFormat{JPEG}
 public boolean compress(CompressFormat format,int quality,OutputStream out){qualities.add(quality);ImageWriter writer=ImageIO.getImageWritersByFormatName("jpeg").next();try(ImageOutputStream target=new MemoryCacheImageOutputStream(out)){writer.setOutput(target);ImageWriteParam options=writer.getDefaultWriteParam();options.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);options.setCompressionQuality(quality/100f);writer.write(null,new IIOImage(image,null,null),options);target.flush();return true;}catch(IOException e){return false;}finally{writer.dispose();}}
 public void recycle(){recycled++;}
}
