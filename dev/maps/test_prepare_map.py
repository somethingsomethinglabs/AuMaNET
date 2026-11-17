import unittest,tempfile,io
from pathlib import Path
from importlib.machinery import SourceFileLoader
import numpy as np
import rasterio
from PIL import Image
from rasterio.transform import from_bounds
prepare=SourceFileLoader('prepare_map',str(Path(__file__).with_name('prepare-map.py'))).load_module()

class PartialEdgeTests(unittest.TestCase):
    def test_bottom_and_right_partial_tiles_keep_valid_rgb_and_footprint(self):
        with tempfile.TemporaryDirectory() as scratch:
            path=Path(scratch)/'fixture.tif'
            with rasterio.open(path,'w',driver='GTiff',width=100,height=100,count=3,dtype='uint8',crs='EPSG:3857',transform=from_bounds(0,0,100,100,100,100)) as source:
                source.write(np.full((3,100,100),180,dtype='uint8'))
            with rasterio.open(path) as source:
                # Tile overlaps the bottom/right of the source by exactly half.
                tile=prepare.render_tile(source,None,(50,-50,150,50))
                self.assertEqual(tile.shape,(4,256,256))
                self.assertTrue(np.all(tile[3,:128,:128]==255))
                self.assertTrue(np.all(tile[3,128:,:]==0))
                self.assertTrue(np.all(tile[3,:,128:]==0))
                self.assertGreater(float(tile[:3,:120,:120].mean()),170)
    def test_xyz_bounds_touch_without_gap_or_overlap(self):
        left=prepare.tile_bounds(14,14740,10029);right=prepare.tile_bounds(14,14741,10029);below=prepare.tile_bounds(14,14740,10030)
        self.assertAlmostEqual(left[2],right[0]);self.assertAlmostEqual(left[1],below[3])
    def test_png_encoding_preserves_full_rgba_by_default(self):
        tile=np.random.default_rng(42).integers(0,256,size=(4,256,256),dtype='uint8')
        decoded=np.array(Image.open(io.BytesIO(prepare.encode_tile(tile))).convert('RGBA')).transpose(2,0,1)
        self.assertTrue(np.array_equal(tile,decoded))
        self.assertLess(len(prepare.encode_tile(tile)),512*1024)
if __name__=='__main__':unittest.main()
