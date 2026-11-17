<script lang="ts">
  import PanelHeading from './PanelHeading.svelte';
  export let page=false;
  export let onback:()=>void=()=>{};
  import HelpButton from './HelpButton.svelte';
  import {onMount} from 'svelte';
  import {Bell} from '@lucide/svelte';
  import {nativeNotifications,type NotificationClient,type NotificationState} from './native-notifications';
  export let client:NotificationClient|undefined=nativeNotifications();
  let state:NotificationState|undefined=client?.state;
  $: switchedOn=!!state?.savedEnabled&&!state.runtimeSuppressed;
  onMount(()=>{if(!client)return;const stop=client.subscribe(value=>state=value);void client.refresh();const timer=setInterval(()=>{if(document.visibilityState==='visible')void client?.refresh();},2000);const resume=()=>{if(document.visibilityState==='visible')void client?.refresh();};document.addEventListener('visibilitychange',resume);return()=>{stop();clearInterval(timer);document.removeEventListener('visibilitychange',resume);};});
  async function change(input:HTMLInputElement){const enabled=input.checked;try{const next=await client?.setEnabled(enabled);if(enabled&&next?.savedEnabled&&!next.runtimeSuppressed&&next.permission==='not-granted')await client?.requestPermission();}catch{/* A current native status/error remains visible. */}finally{input.checked=!!client?.state.savedEnabled&&!client.state.runtimeSuppressed;}}
</script>

<section class="card notification-settings" aria-labelledby={page?'live-settings-title':'notification-settings-title'}>
  <PanelHeading title="Notifications" id="notification-settings-title" icon={Bell} {page} {onback}><HelpButton title="Notification privacy"><p>Group alerts hide message text, names, group details and location previews. Android may ask for notification permission.</p><p>Active voice and location controls keep their separate required Android notifications. Group alerts cover new messages; optional voice and connection alerts are not available yet.</p><p>Missed or earlier messages are not replayed when alerts are enabled. Android channel settings and Do Not Disturb may silence alerts.</p></HelpButton></PanelHeading>
  <p class="hint">Alerts hide message text, names and locations. Android may ask for permission.</p>
  <label class="switch-row"><span>Group alerts<small>New group messages on this device</small></span><input type="checkbox" aria-label="Group alerts" checked={switchedOn} disabled={!client||!state?.loaded||(!switchedOn&&(!state.writable||state.busy))} onchange={event=>void change(event.currentTarget)}/></label>
  {#if !client}<p class="hint">Group alerts are available in the Android app. This browser does not request notification permission or send alerts.</p>
  {:else if state}
    {#if state.error}<p class="notification-error" role="alert">{state.error}</p>{/if}
    {#if state.busy}<p class="hint" role="status">Checking or saving notification settings…</p>
    {:else if state.runtimeSuppressed&&state.savedEnabled}<p class="hint" role="status">Group alerts are off for this run, but Off has not been confirmed as saved. They may resume after restarting until Off is saved.</p><button class="outline" onclick={()=>void client?.setEnabled(false)}>Save Group alerts Off</button>
    {:else if !state.savedEnabled}<p class="hint" role="status">Group alerts are off. Missed or earlier messages are not replayed when alerts are enabled.</p>
    {:else if state.effective}<p class="hint" role="status">Group alerts are enabled for newly stored messages, in the foreground and background. Android channel settings and Do Not Disturb may silence them.</p>
    {:else}<p class="hint" role="status">Group alerts are saved On. {state.permission==='not-granted'?'Android notification permission is not allowed.':!state.appEnabled?'Android has disabled app notifications.':state.channel==='blocked'?'The Group messages notification channel is blocked.':'Alert permission, channel status or saved settings are unavailable.'}</p>{/if}
    {#if state.savedEnabled&&!state.runtimeSuppressed&&state.permission==='not-granted'}<button class="outline" disabled={state.busy} onclick={()=>void client?.requestPermission()}>Allow notifications</button>{/if}
    {#if ['invalid','unsupported'].includes(state.storage)}<button class="outline" disabled={state.busy} onclick={()=>void client?.reset()}>Reset Group alerts to Off</button>{/if}
    {#if state.storage==='unavailable'}<button class="outline" disabled={state.busy} onclick={()=>void client?.refresh()}>Reload notification settings</button>{/if}
    <button class="text-button" onclick={()=>void client?.openSettings()}>Open Android notification settings</button>
  {/if}
  
</section>
<style>.notification-settings .switch-row{margin:18px 0;gap:14px}.notification-settings .switch-row span{min-width:0}.notification-settings .switch-row small{font-size:12px}.notification-settings button{max-width:100%;white-space:normal;margin-top:8px}.notification-error{color:var(--error-ink,#9f301f);background:var(--error-bg,#fff0e7);padding:12px;border-radius:10px;overflow-wrap:anywhere}.notification-settings{min-width:0}
</style>
