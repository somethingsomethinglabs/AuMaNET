<script lang="ts">
  import {onMount} from 'svelte';
  import {voicePttReadiness,type VoicePttReadinessReason,type NativeVoiceLabClient,type VoiceLabSnapshot} from '@aumanet/core';
  export let client:NativeVoiceLabClient;
  export let state:VoiceLabSnapshot|undefined;
  export let onerror:(message:string)=>void=()=>{};
  export let blocked=false;
  let button:HTMLButtonElement;
  let hintId:string|undefined;
  let pointer:number|undefined,key:string|undefined,ownsHold=false,press=0;
  const blockedLabels:Readonly<Partial<Record<VoicePttReadinessReason,string>>>={state:'Join voice to talk',refresh:'Updating voice',join:'Join voice to talk',initializing:'Microphone not ready','input-mode':'Select Push to talk',deafened:'Undeafen to talk',muted:'Unmute to talk',interrupted:'Voice interrupted','audio-focus':'Audio interrupted','audio-route':'Choose audio output',connection:'Connection not ready',verification:'Connection not ready','local-path':'Connection not ready',processing:'Microphone not ready'};
  function stop(){
    pointer=undefined;key=undefined;++press;
    if(ownsHold){ownsHold=false;void client.endPtt();}
  }
  async function start(){
    if(disabled||!voicePttReadiness(state,client.synchronized).ready||pointer===undefined&&key===undefined)return;
    const token=++press;ownsHold=true;
    try{await client.beginPtt();if(ownsHold&&token===press)onerror('');}
    catch(error){if(token===press){stop();onerror(error instanceof Error?error.message:String(error));}}
  }
  function down(event:PointerEvent){
    // Chromium can dispatch pointer events to disabled controls. Never use the
    // browser's disabled/click behavior as the microphone's privacy boundary.
    if(event.button!==0||disabled||button.disabled||!voicePttReadiness(state,client.synchronized).ready||pointer!==undefined||key!==undefined)return;
    event.preventDefault();
    try{button.setPointerCapture(event.pointerId);}catch{return;}
    pointer=event.pointerId;void start();
  }
  function up(event:PointerEvent){if(pointer===event.pointerId)stop();}
  function move(event:PointerEvent){if(pointer!==event.pointerId)return;const bounds=button.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)stop();}
  function keyDown(event:KeyboardEvent){
    if(!['Space','Enter'].includes(event.code)||event.repeat||disabled||!voicePttReadiness(state,client.synchronized).ready||pointer!==undefined||key!==undefined)return;
    event.preventDefault();key=event.code;void start();
  }
  function keyUp(event:KeyboardEvent){if(key===event.code){event.preventDefault();stop();}}
  $: readiness=voicePttReadiness(state,client.synchronized);
  $: disabled=blocked||!readiness.ready;
  $: if(disabled&&ownsHold)stop();
  onMount(()=>{
    hintId=`ptt-help-${crypto.randomUUID()}`;
    const hide=()=>{if(document.hidden)stop();};
    window.addEventListener('blur',stop);document.addEventListener('visibilitychange',hide);
    return()=>{stop();window.removeEventListener('blur',stop);document.removeEventListener('visibilitychange',hide);};
  });
</script>
<button bind:this={button} type="button" class="primary native-ptt" {disabled} aria-label="Hold native push to talk" aria-pressed={state?.transmitting??false}
  title={readiness.message||undefined} aria-describedby={readiness.message?hintId:undefined}
  onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} onlostpointercapture={up} onblur={stop}
  onkeydown={keyDown} onkeyup={keyUp}>
  {state?.transmitting?'Transmitting':readiness.ready||['muted','deafened'].includes(readiness.reason)?'Hold to talk':readiness.reason==='audio-route'&&state?.routeInitializing?'Preparing audio':blockedLabels[readiness.reason]??'Voice not ready'}
</button>
{#if readiness.message}<span id={hintId} class="ptt-help">{readiness.message}</span>{/if}
<style>.native-ptt{touch-action:none;user-select:none;min-height:48px;white-space:nowrap}.ptt-help{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}</style>
