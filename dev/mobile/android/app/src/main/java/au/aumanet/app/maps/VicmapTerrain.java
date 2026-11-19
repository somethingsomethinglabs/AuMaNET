package au.aumanet.app.maps;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

final class VicmapTerrain {
    static final String SERVICE = "https://tiles-ap1.arcgis.com/P744lA0wf4LlBZ84/arcgis/rest/services/Vicmap_10m_DEM/ImageServer";
    static final String PATH = "/P744lA0wf4LlBZ84/arcgis/rest/services/Vicmap_10m_DEM/ImageServer/tile/";
    static final String ATTRIBUTION = "Vicmap Elevation 10m DEM © State of Victoria (Department of Transport and Planning), CC BY 4.0. Resampled for offline rendering.";
    static final int MAX_TILE_BYTES = 512 * 1024;
    private static final int CONCURRENT_TILES = 6;
    private static final byte[] MAGIC = "CntZImage ".getBytes(StandardCharsets.US_ASCII);

    private VicmapTerrain() {}

    static boolean includes(double[] bounds) {
        // Service full extent in WGS84. A tile's own mask decides actual coverage near the border.
        return bounds[2] >= 140.1577 && bounds[0] <= 150.2229
            && bounds[3] >= -39.1801 && bounds[1] <= -33.8052;
    }

    static void read(List<int[]> tiles, VectorPmtiles.Check check, VectorPmtiles.TileConsumer consumer) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(CONCURRENT_TILES);
        try {
            for (int first = 0; first < tiles.size(); first += CONCURRENT_TILES) {
                check.check();
                int end = Math.min(tiles.size(), first + CONCURRENT_TILES);
                List<Callable<byte[]>> batch = new ArrayList<>();
                for (int i = first; i < end; i++) {
                    int[] tile = tiles.get(i);
                    batch.add(() -> request(tile, check));
                }
                List<Future<byte[]>> results = pool.invokeAll(batch);
                for (int i = 0; i < results.size(); i++) {
                    check.check();
                    byte[] bytes;
                    try {
                        bytes = results.get(i).get();
                    } catch (ExecutionException error) {
                        throw new IOException("Could not read Victorian elevation", error.getCause());
                    }
                    consumer.accept(tiles.get(first + i), bytes);
                }
            }
        } finally {
            pool.shutdownNow();
        }
    }

    private static byte[] request(int[] tile, VectorPmtiles.Check check) throws IOException {
        try {
            byte[] bytes = VectorPmtiles.get(SERVICE + "/tile/" + tile[0] + "/" + tile[2] + "/" + tile[1], MAX_TILE_BYTES, check);
            return completeGrid(bytes) ? bytes : null;
        } catch (IOException unavailable) {
            check.check();
            return null;
        }
    }

    /** Accept the service's single band, complete 257-point grid for a 256-cell tile. */
    static boolean completeGrid(byte[] bytes) {
        if (bytes.length < 66 || bytes.length > MAX_TILE_BYTES) return false;
        for (int i = 0; i < MAGIC.length; i++) if (bytes[i] != MAGIC[i]) return false;
        ByteBuffer input = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN);
        if (input.getInt(10) != 11 || input.getInt(14) != 8
            || input.getInt(18) != 257 || input.getInt(22) != 257) return false;
        if (input.getInt(34) != 0 || input.getInt(38) != 0 || input.getInt(42) != 0
            || input.getFloat(46) != 1) return false;
        int rows = input.getInt(50), columns = input.getInt(54), dataBytes = input.getInt(58);
        return rows >= 1 && rows <= 257 && columns >= 1 && columns <= 257
            && dataBytes >= 0 && dataBytes <= bytes.length - 66 && bytes.length - 66 - dataBytes <= 3;
    }
}
