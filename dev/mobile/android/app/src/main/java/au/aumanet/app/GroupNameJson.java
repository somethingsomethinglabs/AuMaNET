package au.aumanet.app;

import org.json.*;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;

/** Strict bounded JSON grammar before the platform's deliberately permissive org.json reader. */
final class GroupNameJson {
    private final String text;private int index;
    private GroupNameJson(String text,int max){if(text==null||text.length()>max||text.getBytes(StandardCharsets.UTF_8).length>max)throw new IllegalArgumentException("Unbounded name metadata");this.text=text;}
    static Object read(String text,int max)throws Exception{GroupNameJson parser=new GroupNameJson(text,max);parser.value(0);parser.space();if(parser.index!=text.length())throw new IllegalArgumentException("Trailing name metadata");return new JSONTokener(text).nextValue();}
    static JSONObject object(String text,int max)throws Exception{Object value=read(text,max);if(!(value instanceof JSONObject))throw new IllegalArgumentException("Expected name metadata object");return(JSONObject)value;}
    private void space(){while(index<text.length()&&" \t\r\n".indexOf(text.charAt(index))>=0)index++;}
    private char take(){if(index>=text.length())throw new IllegalArgumentException("Incomplete name metadata");return text.charAt(index++);}
    private void need(char expected){if(take()!=expected)throw new IllegalArgumentException("Invalid name metadata syntax");}
    private String string()throws Exception{int begin=index;need('"');while(true){char c=take();if(c=='"')return new JSONTokener(text.substring(begin,index)).nextValue().toString();if(c<32)throw new IllegalArgumentException("Control in name metadata");if(c=='\\'){char escape=take();if(escape=='u'){for(int n=0;n<4;n++)if("0123456789abcdefABCDEF".indexOf(take())<0)throw new IllegalArgumentException("Invalid Unicode escape");}else if("\"\\/bfnrt".indexOf(escape)<0)throw new IllegalArgumentException("Invalid JSON escape");}}}
    private boolean digit(){return index<text.length()&&text.charAt(index)>='0'&&text.charAt(index)<='9';}
    private void digits(){if(!digit())throw new IllegalArgumentException("Invalid JSON number");while(digit())index++;}
    private void value(int depth)throws Exception{
        if(depth>16)throw new IllegalArgumentException("Name metadata nesting exceeded");space();if(index>=text.length())throw new IllegalArgumentException("Missing name metadata value");char c=text.charAt(index);
        if(c=='"'){string();return;}
        if(c=='{'||c=='['){index++;space();char end=c=='{'?'}':']';if(index<text.length()&&text.charAt(index)==end){index++;return;}HashSet<String> keys=new HashSet<>();while(true){if(c=='{'){space();if(!keys.add(string()))throw new IllegalArgumentException("Duplicate name metadata key");space();need(':');}value(depth+1);space();char separator=take();if(separator==end)return;if(separator!=',')throw new IllegalArgumentException("Invalid name metadata separator");}}
        for(String literal:new String[]{"true","false","null"})if(text.startsWith(literal,index)){index+=literal.length();return;}
        if(c=='-')index++;if(index<text.length()&&text.charAt(index)=='0')index++;else digits();if(index<text.length()&&text.charAt(index)=='.'){index++;digits();}if(index<text.length()&&(text.charAt(index)=='e'||text.charAt(index)=='E')){index++;if(index<text.length()&&(text.charAt(index)=='+'||text.charAt(index)=='-'))index++;digits();}
    }
}
