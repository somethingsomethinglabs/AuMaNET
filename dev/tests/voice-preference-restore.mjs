// Shared code-acceptance policy; importing never reads a phone or changes a setting.
const routes=new Set(['default','earpiece','speaker','wired-headset','wired-headphones','usb-headset','bluetooth','hearing-aid']);
export function savedVoicePreferences(snapshot){
  const value=snapshot?.voicePreferences;if(value===undefined)return undefined; // Old APK mode/route controls were ephemeral.
  if(!value||typeof value!=='object'||value.version!==1||!Number.isSafeInteger(value.sensitivity)||value.sensitivity<0||value.sensitivity>100||
    !['ptt','always-on'].includes(value.inputMode)||!routes.has(value.outputRoute)||value.needsRepair!==false||!['defaults','legacy','current'].includes(value.storageState))
    throw new Error('Repair saved voice preferences before acceptance; the original values cannot be restored safely');
  return Object.freeze({sensitivity:value.sensitivity,inputMode:value.inputMode,outputRoute:value.outputRoute});
}
export function voicePreferenceRestorePatch(saved){return{...saved,requireIdle:true};}
export function voicePreferencesRestored(snapshot,saved){
  const value=savedVoicePreferences(snapshot);return !!value&&value.sensitivity===saved.sensitivity&&value.inputMode===saved.inputMode&&value.outputRoute===saved.outputRoute&&
    snapshot.joined===false&&snapshot.captureActive===false&&snapshot.playbackActive===false;
}
