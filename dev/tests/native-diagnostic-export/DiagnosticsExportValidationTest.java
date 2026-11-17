package au.aumanet.app;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import org.json.JSONObject;

public final class DiagnosticsExportValidationTest {
    static String report(){return "{\"schema\":\"aumanet.diagnostics.v1\",\"acceptance\":\"not-a-device-acceptance-test\",\"evidence\":\"runtime\",\"webPackageVersion\":\"0.0.0\",\"webImplementationContracts\":[],\"native\":{},\"capabilities\":[],\"components\":[],\"logs\":{}}";}
    static void rejected(String text,String ack)throws Exception{try{DiagnosticsExportValidation.validate(text,ack);}catch(Exception expected){return;}throw new AssertionError("Invalid export accepted");}
    public static void main(String[] args)throws Exception{
        String ack="save-diagnostics-to-downloads",text=report()+"\n";
        if(!Arrays.equals(text.getBytes(StandardCharsets.UTF_8),DiagnosticsExportValidation.validate(text,ack)))throw new AssertionError("Exact reviewed bytes changed");
        rejected(text,"save-scenario-to-downloads");rejected(text,null);rejected(null,ack);rejected("[]",ack);rejected("{",ack);
        for(String key:new String[]{"schema","acceptance","evidence"}){JSONObject value=new JSONObject(report());value.put(key,"invalid");rejected(value.toString(),ack);}
        for(String key:new String[]{"webPackageVersion","webImplementationContracts","native","capabilities","components","logs"}){JSONObject value=new JSONObject(report());value.remove(key);rejected(value.toString(),ack);}
        rejected(report()+" ".repeat(16384),ack);
        // Bound UTF-8 bytes, not Java character count.
        JSONObject multibyte=new JSONObject(report());multibyte.put("webPackageVersion","位".repeat(6000));String oversized=multibyte.toString();
        if(oversized.length()>=16384)throw new AssertionError("Invalid multibyte test");rejected(oversized,ack);
        JSONObject fixture=new JSONObject(report());fixture.put("evidence","fixture");DiagnosticsExportValidation.validate(fixture.toString(),ack);
        String boundary=report()+" ".repeat(16384-report().getBytes(StandardCharsets.UTF_8).length);if(DiagnosticsExportValidation.validate(boundary,ack).length!=16384)throw new AssertionError("Boundary rejected");
        System.out.println("Diagnostics export JVM validation PASS: exact bytes, acknowledgement, schema/acceptance/evidence, required envelope, UTF-8 bounds.");
    }
}
