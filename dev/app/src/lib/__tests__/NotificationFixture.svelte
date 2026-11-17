<script lang="ts">
  import NotificationSettings from '../NotificationSettings.svelte';
  import type {NotificationClient} from '../notifications/preferences';
  import '../appearance/theme.css';
  export let client:NotificationClient;
  export let dark=false;
</script>
<div class="app-shell live-shell" class:dark>
  <header><div class="brandline"><strong>AuMaNET</strong></div><p class="hint">Notification settings fixture · No Android notification is posted</p></header>
  <main><NotificationSettings {client}/></main>
</div>
