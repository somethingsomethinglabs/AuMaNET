package au.aumanet.app;

import java.nio.charset.StandardCharsets;
import java.text.Normalizer;

/** Labels are presentation only. This policy never grants membership or media authority. */
final class GroupNamePolicy {
    static final long MAX_REVISION=9007199254740991L;
    static final int RECEIPTS=16;
    static String label(String value,int max){
        if(value==null)throw new IllegalArgumentException("Enter a name");
        int begin=0,end=value.length();while(begin<end&&space(value.codePointAt(begin)))begin+=Character.charCount(value.codePointAt(begin));while(end>begin&&space(value.codePointBefore(end)))end-=Character.charCount(value.codePointBefore(end));value=Normalizer.normalize(value.substring(begin,end),Normalizer.Form.NFC);
        int count=0;
        for(int i=0;i<value.length();){
            char first=value.charAt(i);int cp=value.codePointAt(i);
            if(Character.isSurrogate(first)&&(!Character.isHighSurrogate(first)||i+1>=value.length()||!Character.isLowSurrogate(value.charAt(i+1))))throw new IllegalArgumentException("Name contains invalid Unicode");
            if(Character.isISOControl(cp)||cp==0x061c||cp==0x200e||cp==0x200f||cp>=0x202a&&cp<=0x202e||cp>=0x2066&&cp<=0x2069)throw new IllegalArgumentException("Name contains control or direction characters");
            count++;i+=Character.charCount(cp);
        }
        if(count<1||count>max||value.getBytes(StandardCharsets.UTF_8).length>max*4)throw new IllegalArgumentException("Name is empty or too long");
        return value;
    }
    private static boolean space(int cp){return cp>=9&&cp<=13||cp==0x20||cp==0xa0||cp==0x1680||cp>=0x2000&&cp<=0x200a||cp==0x2028||cp==0x2029||cp==0x202f||cp==0x205f||cp==0x3000||cp==0xfeff;}
    static long next(long revision){if(revision<0||revision>=MAX_REVISION)throw new IllegalStateException("Name revision exhausted");return revision+1;}
    static void scope(String expectedProcess,String process,String expectedGroup,String group,long expectedEpoch,long epoch,long expectedRevision,long revision){
        if(!process.equals(expectedProcess)||!group.equals(expectedGroup)||expectedEpoch!=epoch)throw new IllegalStateException("Name edit scope changed; refresh before editing");
        if(expectedRevision!=revision)throw new IllegalStateException("Name revision changed; review the current name");
    }
    static void owner(boolean actualOwner,boolean hosting){if(!actualOwner||!hosting)throw new IllegalStateException("Only the connected group owner can rename this group");}
    static void profile(long current,String currentName,long incoming,String incomingName){
        if(incoming<current||incoming==current&&!currentName.equals(incomingName))throw new IllegalArgumentException("Stale member name revision");
    }
    private GroupNamePolicy(){}
}
