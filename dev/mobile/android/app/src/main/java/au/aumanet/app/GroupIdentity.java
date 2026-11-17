package au.aumanet.app;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.security.keystore.KeyInfo;
import android.os.Build;
import com.getcapacitor.JSObject;
import org.json.JSONArray;
import org.json.JSONObject;
import java.math.BigInteger;
import java.net.Socket;
import java.security.KeyPairGenerator;
import java.security.KeyFactory;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.Principal;
import java.security.PrivateKey;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.Date;
import javax.net.ssl.KeyManager;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLEngine;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509ExtendedKeyManager;
import javax.net.ssl.X509TrustManager;
import javax.security.auth.x500.X500Principal;

/** One app-private non-exportable key. No fleet/shared private key or group secret. */
final class GroupIdentity {
    private static final String ALIAS = "aumanet-device-identity-v1";
    final X509Certificate certificate;
    final String pin;
    private final PrivateKey privateKey;
    interface PinPolicy { boolean accept(String pin); }
    GroupIdentity() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (!store.containsAlias(ALIAS)) {
            KeyPairGenerator generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore");
            long now = System.currentTimeMillis();
            generator.initialize(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_SIGN | KeyProperties.PURPOSE_VERIFY)
                // Conscrypt signs TLS transcript digests via NONEwithECDSA. This is an
                // AndroidKeyStore authorization for established TLS, not an unhashed wire protocol.
                .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1")).setDigests(KeyProperties.DIGEST_NONE,KeyProperties.DIGEST_SHA256)
                .setCertificateSubject(new X500Principal("CN=AuMaNET device"))
                .setCertificateSerialNumber(new BigInteger(128, new SecureRandom()).add(BigInteger.ONE))
                .setCertificateNotBefore(new Date(now - 86400000L)).setCertificateNotAfter(new Date(now + 30L * 365 * 86400000L))
                .setUserAuthenticationRequired(false).build());
            generator.generateKeyPair();
        }
        certificate = (X509Certificate)store.getCertificate(ALIAS);
        privateKey = (PrivateKey)store.getKey(ALIAS, null);
        if (certificate == null || privateKey == null) throw new IllegalStateException("Device identity unavailable; do not replace it silently");
        pin = fingerprint(certificate);
    }
    static String fingerprint(X509Certificate certificate) throws Exception { return GroupWire.hex(MessageDigest.getInstance("SHA-256").digest(certificate.getEncoded())); }
    byte[] signOfflineEnrollment(byte[] canonical)throws Exception{
        String value=new String(canonical,java.nio.charset.StandardCharsets.US_ASCII);
        if(canonical.length>11000||(!value.startsWith("AuMaNET/offline-enrollment/request/v1\0")&&!value.startsWith("AuMaNET/offline-enrollment/approval/v1\0")))throw new SecurityException("Wrong enrollment signature domain");
        Signature signer=Signature.getInstance("SHA256withECDSA");signer.initSign(privateKey);signer.update(canonical);return signer.sign();
    }
    byte[] signGroupText(byte[] canonical)throws Exception{
        if(canonical==null||canonical.length<24||canonical.length>4096)throw new IllegalArgumentException("Invalid bounded group text signature input");
        String prefix=new String(canonical,0,Math.min(canonical.length,32),java.nio.charset.StandardCharsets.US_ASCII);
        if(!prefix.startsWith("AuMaNET/group-text/v1\0")&&!prefix.startsWith("AuMaNET/group-text-receipt/v1\0")&&!prefix.startsWith("AuMaNET/group-message/v2\0")&&!prefix.startsWith("AuMaNET/group-context/v1\0"))throw new SecurityException("Wrong group text signature domain");
        Signature signer=Signature.getInstance("SHA256withECDSA");signer.initSign(privateKey);signer.update(canonical);return signer.sign();
    }
    /** Native owner-authority caller must recheck its exact live scope before emission.
     * This distinct domain cannot sign text, TLS transcripts or arbitrary payloads. */
    byte[] signGatewayBinding(byte[] canonical,String group,long epoch,String target)throws Exception{
        GatewayPublicKeyPolicy.checked(certificate.getPublicKey());
        if(!GatewayGrantCodec.scopedBinding(canonical,group,epoch,target))throw new SecurityException("Invalid scoped gateway binding");
        Signature signer=Signature.getInstance("SHA256withECDSA");signer.initSign(privateKey);signer.update(canonical);
        byte[] signed=signer.sign();
        if(signed.length<8||signed.length>72)throw new SecurityException("Unsupported gateway signature encoding");
        return signed;
    }
    JSONObject signNodeLan(String group,long epoch,String node,int index,long revision,long issued)throws Exception{
        byte[] key=gatewayPublicKey();String control=GatewayBootCodec.hash(key);byte[] body=GatewayLanProfile.body(group,epoch,node,control,index,revision,issued);
        Signature signer=Signature.getInstance("SHA256withECDSA");signer.initSign(privateKey);signer.update(body);byte[] signature=signer.sign();
        JSONObject result=new JSONObject().put("bodyHex",GroupWire.hex(body).toLowerCase(java.util.Locale.ROOT)).put("signatureDerHex",GroupWire.hex(signature).toLowerCase(java.util.Locale.ROOT)).put("ownerPublicKeyDerHex",GroupWire.hex(key).toLowerCase(java.util.Locale.ROOT)).put("ownerCertificateDerHex",GroupWire.hex(certificate.getEncoded()).toLowerCase(java.util.Locale.ROOT));
        GatewayLanProfile.read(result,group,epoch,pin,node);return result;
    }
    /** Native checked-node/nonce policy only; no raw signing bridge exists. */
    byte[] signGatewayControl(GatewayBootCodec.Message message,String group,long epoch,String target,String relay)throws Exception{
        String ownerSpki=GatewayBootCodec.hash(gatewayPublicKey());
        if(!message.relay.equals(relay)||!GatewayBootCodec.scopedOwner(message.body(),group,epoch,target,ownerSpki))throw new SecurityException("Gateway control signing scope changed");
        Signature signer=Signature.getInstance("SHA256withECDSA");signer.initSign(privateKey);signer.update(message.body());byte[] signature=signer.sign();GatewayBootCodec.envelope(message,signature);return signature;
    }
    byte[] signGatewayRadio(GatewayRadioConfigCodec.Message message,String group,long epoch,String target,String relay)throws Exception{
        GatewayRadioConfigCodec.Message checked=GatewayRadioConfigCodec.parse(message.body());String owner=GatewayBootCodec.hash(gatewayPublicKey());
        if((checked.kind!='Q'&&checked.kind!='C')||!checked.group.equals(group)||checked.epoch!=epoch||!checked.target.equals(target)||!checked.relay.equals(relay)||!checked.owner.equals(owner))throw new SecurityException("Checked radio signing scope changed");
        Signature signer=Signature.getInstance("SHA256withECDSA");signer.initSign(privateKey);signer.update(checked.body());byte[] signature=signer.sign();GatewayRadioConfigCodec.envelope(checked,signature);return signature;
    }
    /** Only the native checked updater can request these domain-separated purposes. */
    byte[] signGatewayUpdate(NodeUpdateCodec.Message message,String group,long epoch,String target,String relay)throws Exception{
        NodeUpdateCodec.Message checked=NodeUpdateCodec.parse(message.body());String owner=GatewayBootCodec.hash(gatewayPublicKey());
        if((checked.kind!='Q'&&checked.kind!='S'&&checked.kind!='C')||!checked.group.equals(group)||checked.epoch!=epoch||!checked.target.equals(target)||!checked.relay.equals(relay)||!checked.owner.equalsIgnoreCase(owner))throw new SecurityException("Checked update signing scope changed");
        if(checked.kind=='S'){int n=checked.body[640]&255;NodeReleaseManifest.checked(checked.descriptor,java.util.Arrays.copyOfRange(checked.body,641,641+n));}
        Signature signer=Signature.getInstance("SHA256withECDSA");signer.initSign(privateKey);signer.update(NodeUpdateCodec.DOMAIN);signer.update(checked.body());byte[] signature=signer.sign();NodeUpdateCodec.envelope(checked,signature);return signature;
    }
    /** Public provisioning material only. The Android Keystore private key is never exported. */
    byte[] gatewayPublicKey()throws Exception{return GatewayPublicKeyPolicy.checked(certificate.getPublicKey());}
    /** Caller must first prove debuggable + no active/approved membership; never migrate a trusted key silently. */
    static void deleteUnacceptedDevelopmentKey(String expectedPin)throws Exception{
        KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
        X509Certificate existing=(X509Certificate)store.getCertificate(ALIAS);
        if(existing==null||!GroupWire.equal(expectedPin,fingerprint(existing)))throw new SecurityException("Development identity changed; reset refused");
        store.deleteEntry(ALIAS);
    }
    /** Called only by the app-debuggable diagnostics API; no private key/signature bytes leave native code. */
    JSObject diagnostics() {
        JSObject result = new JSObject().put("keyAlgorithm",privateKey.getAlgorithm()).put("privateKeyClass",privateKey.getClass().getName())
            .put("privateKeyExportable",privateKey.getEncoded()!=null).put("certificateSignatureAlgorithm",certificate.getSigAlgName());
        try {
            KeyInfo info = KeyFactory.getInstance(privateKey.getAlgorithm(),"AndroidKeyStore").getKeySpec(privateKey,KeyInfo.class);
            result.put("authorizedDigests",new JSONArray(java.util.Arrays.asList(info.getDigests()))).put("keySize",info.getKeySize());
            if(Build.VERSION.SDK_INT>=31)result.put("securityLevel",info.getSecurityLevel());
        } catch(Exception failure) { result.put("keyInfoFailure",GroupDiagnostics.causes(failure)); }
        JSONArray operations = new JSONArray();
        for(String algorithm:new String[]{"SHA256withECDSA","NONEwithECDSA"}){
            JSObject operation = new JSObject().put("algorithm",algorithm);
            try {
                byte[] input = new byte[32];new SecureRandom().nextBytes(input);
                Signature signer = Signature.getInstance(algorithm);signer.initSign(privateKey);signer.update(input);byte[] signed=signer.sign();
                Signature verifier=Signature.getInstance(algorithm);verifier.initVerify(certificate.getPublicKey());verifier.update(input);
                operation.put("verified",verifier.verify(signed)).put("signingProvider",signer.getProvider().getName());
                java.util.Arrays.fill(input,(byte)0);java.util.Arrays.fill(signed,(byte)0);
            } catch(Exception failure) { operation.put("verified",false).put("causes",GroupDiagnostics.causes(failure)); }
            operations.put(operation);
        }
        return result.put("signingSelfTests",operations);
    }
    SSLContext context(PinPolicy policy) throws Exception {
        X509ExtendedKeyManager keys = new X509ExtendedKeyManager() {
            public String[] getClientAliases(String type, Principal[] issuers) { return type != null && type.startsWith("EC") ? new String[]{ALIAS} : null; }
            public String chooseClientAlias(String[] types, Principal[] issuers, Socket socket) { for (String type : types) if (type.startsWith("EC")) return ALIAS; return null; }
            public String[] getServerAliases(String type, Principal[] issuers) { return getClientAliases(type, issuers); }
            public String chooseServerAlias(String type, Principal[] issuers, Socket socket) { return type != null && type.startsWith("EC") ? ALIAS : null; }
            public String chooseEngineClientAlias(String[] types, Principal[] issuers, SSLEngine engine) { return chooseClientAlias(types, issuers, null); }
            public String chooseEngineServerAlias(String type, Principal[] issuers, SSLEngine engine) { return chooseServerAlias(type, issuers, null); }
            public X509Certificate[] getCertificateChain(String alias) { return ALIAS.equals(alias) ? new X509Certificate[]{certificate} : null; }
            public PrivateKey getPrivateKey(String alias) { return ALIAS.equals(alias) ? privateKey : null; }
        };
        X509TrustManager pins = new X509TrustManager() {
            private void verify(X509Certificate[] chain) throws CertificateException {
                try {
                    if (chain == null || chain.length != 1 || !(chain[0].getPublicKey() instanceof ECPublicKey) ||
                        ((ECPublicKey)chain[0].getPublicKey()).getParams().getCurve().getField().getFieldSize()!=256) throw new CertificateException("Expected a single P-256 device identity certificate");
                    chain[0].checkValidity(); chain[0].verify(chain[0].getPublicKey());
                    if (!policy.accept(fingerprint(chain[0]))) throw new CertificateException("Device identity pin was not authorized");
                } catch (CertificateException failure) { throw failure; }
                catch (Exception failure) { throw new CertificateException("Device identity verification failed", failure); }
            }
            public void checkClientTrusted(X509Certificate[] chain, String type) throws CertificateException { verify(chain); }
            public void checkServerTrusted(X509Certificate[] chain, String type) throws CertificateException { verify(chain); }
            public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
        };
        SSLContext context = SSLContext.getInstance("TLS"); context.init(new KeyManager[]{keys}, new TrustManager[]{pins}, new SecureRandom()); return context;
    }
}
