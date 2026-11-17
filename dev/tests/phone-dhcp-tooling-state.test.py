import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'firmware/tools'))
from test_phone_dhcp import verified_app_connection, verified_image
class Test(unittest.TestCase):
    def good(self):return dict(text='Connected\nYour phone\nYour node',trusted=dict(schema='aumanet.trusted-connection.v1',source='device',state='connected',attachmentAvailable=True,configuration='ready',runId='a'*32,errorCode=''))
    def test_current_layout(self):self.assertTrue(verified_app_connection(self.good()))
    def test_cosmetic_connected_cannot_pass(self):self.assertFalse(verified_app_connection(dict(text='Your node Connected')))
    def test_native_staleness_and_unverified_attachment(self):
        for field,value in [('state','reconnecting'),('attachmentAvailable',False),('configuration','stale'),('runId',''),('source','fixture'),('errorCode','NODE_WIFI_UNAVAILABLE')]:
            sample=self.good();sample['trusted'][field]=value;self.assertFalse(verified_app_connection(sample))
    def test_exact_confirmed_image(self):
        image=dict(schema='aumanet.node-update-status.v1',imageSha256='a'*64,buildId='candidate',pendingVerification=False)
        self.assertTrue(verified_image(image,'a'*64,'candidate'))
        for key,value in [('schema','fixture'),('imageSha256','b'*64),('buildId','other'),('pendingVerification',True)]:
            self.assertFalse(verified_image(dict(image,**{key:value}),'a'*64,'candidate'))
if __name__=='__main__':unittest.main()
