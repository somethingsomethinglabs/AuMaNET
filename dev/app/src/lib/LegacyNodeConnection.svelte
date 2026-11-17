<script lang="ts">
  import {Bluetooth,RefreshCw,Router} from '@lucide/svelte';
  import type {BluetoothSnapshot,BluetoothState} from '@aumanet/core';
  export let native=false,secure=false,supported=false,busy=false;
  export let available:boolean|undefined=undefined;
  export let connection:BluetoothState='disconnected';
  export let snapshot:BluetoothSnapshot|undefined=undefined;
  export let updated='';
  export let onconnect:(reconnect?:boolean)=>void;
  export let ondisconnect:()=>void;
  export let onrefresh:()=>void;
  export let onstart:()=>void;
  export let onpermissions:()=>void;
  $: connected=connection==='connected';
</script>
<div class="legacy-node-grid">
  <section class="card"><h2>{native?'Legacy Bluetooth node':'Your node'}</h2><p>Connect directly over Bluetooth, then start its provisioned HaLow radio.</p>
    {#if !secure&&!native}<p class="legacy-error">Open this app on localhost or HTTPS to enable device access.</p>
    {:else if !supported}<p class="legacy-error">Bluetooth access is unavailable here. Use the Android app or open this web app in desktop Chrome or Edge.</p>
    {:else if available===false}<p class="legacy-error">Bluetooth adapter is unavailable. Check that Bluetooth is on.</p>{/if}
    <div class="legacy-actions"><button class="primary" disabled={!supported||busy} onclick={()=>onconnect()}><Bluetooth size={20}/>{connection==='connecting'?'Connecting…':connected?'Choose another node':'Connect a node'}</button>
      {#if connected}<button class="outline" disabled={busy} onclick={ondisconnect}>Disconnect</button>{:else}<button class="outline" disabled={!supported||busy} onclick={()=>onconnect(true)}>Reconnect</button>{/if}</div>
    {#if native}<button class="outline" disabled={busy} onclick={onpermissions}>Open app permissions</button>{/if}
    <p class="hint">Select your AuMaNET node in the {native?'device':'browser'} chooser, then inspect its hardware ID. {native?'Nearby devices permission is requested when you connect.':'Browser permission is local to this website.'}</p>
    <p class="hint">Legacy bench firmware only. Field gateway firmware uses Wi-Fi and does not advertise Bluetooth. These development controls do not establish authenticated group membership.</p>
  </section>
  <section class="card"><div class="title-row"><h2>Node status</h2><button class="square" aria-label="Refresh node" disabled={!connected||busy} onclick={onrefresh}><RefreshCw size={19}/></button></div>
    {#if snapshot&&connected}<div class="info-row"><span>Node ID</span><strong>{snapshot.node}</strong></div><div class="info-row"><span>Role / firmware</span><strong>{snapshot.role} / {snapshot.firmware}</strong></div><div class="info-row"><span>HaLow radio</span><strong>{snapshot.radio_started?'Started':'Stopped'}</strong></div><div class="info-row"><span>Persistent message storage</span><strong>{snapshot.storage_ready?'Ready':'Unavailable'}</strong></div><div class="info-row"><span>Board uptime</span><strong>{Math.floor(snapshot.uptime_ms/1000)} seconds</strong></div>
      <button class="primary full" disabled={busy||snapshot.radio_started} onclick={onstart}>{snapshot.radio_started?'Radio started':'Start HaLow radio'}</button><p class="hint">Updated {updated}. Starting the radio also enables startup after reboot. Peer delivery is confirmed in Messages.</p>
    {:else}<div class="empty"><Router size={40}/><p>No live Bluetooth node status. Connect a legacy node to inspect it.</p></div>{/if}
  </section>
</div>
<style>
  .legacy-node-grid{display:grid;gap:16px}.legacy-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.legacy-node-grid .card p{line-height:1.65}.legacy-node-grid .info-row strong{overflow-wrap:anywhere}.legacy-error{color:#9f301f;background:#fff0e7;padding:10px;border-radius:9px;overflow-wrap:anywhere}.legacy-node-grid .primary.full{margin-top:16px}@media(min-width:800px){.legacy-node-grid{grid-template-columns:1fr 1fr}}
</style>
