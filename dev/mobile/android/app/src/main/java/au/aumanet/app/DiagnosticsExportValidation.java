package au.aumanet.app;

import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** Fixed diagnostic export envelope. No caller-controlled path, filename or MIME type. */
final class DiagnosticsExportValidation {
    static final int MAX_BYTES=16384;
    static byte[] validate(String text,String acknowledgement) throws Exception {
        if(!"save-diagnostics-to-downloads".equals(acknowledgement)||text==null||text.length()>MAX_BYTES)throw new IllegalArgumentException();
        byte[] bytes=text.getBytes(StandardCharsets.UTF_8);
        if(bytes.length<2||bytes.length>MAX_BYTES)throw new IllegalArgumentException();
        JSONObject report=new JSONObject(text);
        if(!"aumanet.diagnostics.v1".equals(report.getString("schema"))||!"not-a-device-acceptance-test".equals(report.getString("acceptance")))throw new IllegalArgumentException();
        String evidence=report.getString("evidence");if(!evidence.equals("runtime")&&!evidence.equals("fixture"))throw new IllegalArgumentException();
        report.getString("webPackageVersion");report.getJSONArray("webImplementationContracts");report.getJSONObject("native");report.getJSONArray("capabilities");report.getJSONArray("components");report.getJSONObject("logs");
        return bytes;
    }
}
