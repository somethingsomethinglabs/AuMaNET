<script lang="ts">
  import {onMount} from 'svelte';
  import {UsbBenchAdapter} from '@aumanet/core';
  import type {BenchRole, BenchSnapshot} from '@aumanet/protocol';
  import '../../styles.css';

  const roles: BenchRole[] = ['A', 'B'];
  const adapter = new UsbBenchAdapter();
  let snapshots: Partial<Record<BenchRole, BenchSnapshot>> = {};
  let errors: Partial<Record<BenchRole, string>> = {};
  let drafts: Record<BenchRole, string> = {A: '', B: ''};
  let sending: Record<BenchRole, boolean> = {A: false, B: false};
  let pending: Partial<Record<BenchRole, {id: string; text: string}>> = {};
  let notices: Partial<Record<BenchRole, string>> = {};
  let refreshing = false, disposed = false;
  const bytes = (text: string) => new TextEncoder().encode(text).length;
  const connected = (snapshot?: BenchSnapshot) => !!snapshot?.radio.interface_up &&
    (snapshot.role === 'A' ? snapshot.radio.ap_peer_state === 3 : snapshot.radio.station_state === 2);

  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    await Promise.all(roles.map(async role => {
      try {
        const snapshot = await adapter.snapshot(role);
        if (!disposed) { snapshots = {...snapshots, [role]: snapshot}; errors = {...errors, [role]: ''}; }
      } catch (error) {
        if (!disposed) errors = {...errors, [role]: error instanceof Error ? error.message : 'Node unavailable'};
      }
    }));
    refreshing = false;
  }
  async function send(role: BenchRole) {
    const text = drafts[role];
    if (sending[role] || errors[role] || !connected(snapshots[role]) || !text.trim() || bytes(text)>240) return;
    const previous = pending[role];
    const request = previous?.text === text ? previous : {
      id: Array.from(crypto.getRandomValues(new Uint8Array(8)), n=>n.toString(16).padStart(2,'0')).join(''), text
    };
    pending = {...pending, [role]: request};
    sending = {...sending, [role]: true}; notices = {...notices, [role]: ''};
    try {
      const message = await adapter.send(role, request.id, text);
      if (message.state === 'delivered_to_peer') {
        drafts = {...drafts, [role]: ''};
        delete pending[role]; pending = {...pending};
        notices = {...notices, [role]: 'Peer node acknowledged this message.'};
      } else notices = {...notices, [role]: 'Delivery unconfirmed. Retry keeps the same message ID.'};
    } catch (error) {
      notices = {...notices, [role]: error instanceof Error ? error.message : 'Send failed; delivery unconfirmed'};
    } finally {
      sending = {...sending, [role]: false};
      await refresh();
    }
  }
  onMount(() => {
    refresh();
    const timer = setInterval(refresh, 1000);
    return () => { disposed = true; clearInterval(timer); };
  });
</script>

<svelte:head><title>AuMaNET · Hardware messages</title><meta name="description" content="Live AuMaNET messages between two physical HaLow nodes." /></svelte:head>
<div class="hardware-shell">
  <header class="hardware-header">
    <a href="/" class="hardware-brand"><img src="/brand/aumanet-mark.svg" alt="" width="44" height="22"/>AuMaNET</a>
    <span class="pill">LIVE HARDWARE BENCH</span>
    <h1>Messages across HaLow</h1>
    <p>Send from either physical node. USB connects this app to each local board; messages and acknowledgements cross the radio link.</p>
  </header>
  <main class="hardware-main">
    <div class="hardware-note">Development session · Last eight messages are saved on each board and restored after reboot. Older messages are evicted when this limit is reached. Peer acknowledgement means receipt stored by the other node, not that a person has read it.</div>
    <div class="hardware-panels">
      {#each roles as role}
        {@const snapshot = snapshots[role]}
        <section class="hardware-node" aria-label={`Node ${role}`}>
          <div class="hardware-heading"><h2>Node {role}</h2><span class:warning={!!errors[role] || !connected(snapshot)} class="pill">{errors[role] ? 'Unavailable' : connected(snapshot) ? 'Peer connected' : 'Connecting'}</span></div>
          {#if snapshot}<p class="hardware-meta">ID …{snapshot.node.slice(-4).toUpperCase()} · Firmware {snapshot.firmware} · {snapshot.radio.centre_hz/1000000} MHz</p>{/if}
          {#if errors[role]}<p class="hardware-error" role="status">{errors[role]}{snapshot ? ' · Displayed history is stale.' : ''}</p>{/if}
          <div class="hardware-conversation" aria-label={`Node ${role} messages`}>
            {#each snapshot?.messages ?? [] as message (message.from + message.id)}
              <article class:hardware-own={message.from === role} class="hardware-message" data-message-id={message.id}>
                <strong>Node {message.from}</strong><p>{message.text}</p>
                <small>{message.state === 'received' ? `Received by node ${role}` : message.state === 'delivered_to_peer' ? 'Delivered to peer node' : 'Delivery unconfirmed'}</small>
              </article>
            {:else}<p class="hardware-empty">No messages on this board yet.</p>{/each}
          </div>
          <form onsubmit={event=>{event.preventDefault();send(role);}}>
            <label for={`draft-${role}`}>Message from node {role}</label>
            <textarea id={`draft-${role}`} aria-label={`Message from node ${role}`} bind:value={drafts[role]} oninput={()=>{notices = {...notices, [role]: ''};}} rows="3" placeholder={`Send to node ${role === 'A' ? 'B' : 'A'}`} disabled={sending[role]}></textarea>
            <div class="hardware-send"><small class:hardware-over={bytes(drafts[role])>240}>{bytes(drafts[role])}/240 bytes</small><button class="primary" type="submit" aria-label={`Send from node ${role}`} disabled={sending[role] || !!errors[role] || !connected(snapshot) || !drafts[role].trim() || bytes(drafts[role])>240}>{sending[role] ? 'Sending…' : pending[role]?.text === drafts[role] ? 'Retry message' : 'Send message'}</button></div>
          </form>
          <p class="hardware-notice" role="status">{notices[role] ?? ''}</p>
        </section>
      {/each}
    </div>
    <p class="hardware-footer">This bench exercises real text transport. Voice, maps, group enrollment and internet sharing remain separate development work. <a href="/">Open the UI prototype</a></p>
  </main>
</div>

<style>
  .hardware-shell{--bg:#fbf8ef;--card:#fffdf6;--line:#dedfd2;--muted:#657367;--sage:#e2edce;--green:#164b32;max-width:1080px;margin:24px auto;padding:12px 24px;background:var(--bg);border:1px solid var(--line);border-radius:24px;color:#173e2c}
  .hardware-header{padding:18px 4px}.hardware-brand{display:inline-flex;align-items:center;gap:8px;font-size:26px;font-weight:750;text-decoration:none;color:inherit;margin-right:18px}.hardware-header h1{margin-top:24px;font-size:34px}.hardware-header p{max-width:760px;font-size:15px}.hardware-main{overflow:visible;isolation:auto;padding:0 4px;flex:none}.hardware-note{padding:14px 18px;border-radius:12px;background:#edf0df;font-size:13px;line-height:1.6;margin-bottom:24px}.hardware-panels{display:grid;grid-template-columns:1fr 1fr;gap:24px}.hardware-node{padding:20px;background:var(--card);border:1px solid var(--line);border-radius:18px;min-width:0}.hardware-heading,.hardware-send{display:flex;align-items:center;justify-content:space-between;gap:12px}.hardware-meta{font-size:12px}.hardware-error{color:#8d3d24}.hardware-conversation{height:310px;overflow:auto;padding:8px 0;scrollbar-width:thin}.hardware-message{background:#eef0e6;border-radius:12px;padding:12px;margin-bottom:12px;overflow-wrap:anywhere}.hardware-message.hardware-own{background:#e0ebd0;margin-left:20px}.hardware-message strong{font-size:12px}.hardware-message p{font-size:15px;white-space:pre-wrap;color:inherit;margin:6px 0}.hardware-message small{font-size:11px}.hardware-empty{padding:38px 0;text-align:center}.hardware-node label{display:block;font-size:13px;font-weight:650;margin:16px 0 8px}.hardware-node textarea{font:inherit;width:100%;resize:vertical;min-height:88px;background:white;border:1px solid #b5c4ae;border-radius:10px;padding:12px;color:inherit;outline-offset:3px}.hardware-node textarea:focus-visible{outline:3px solid #bd751f}.hardware-send{margin-top:12px}.hardware-send button{min-height:44px;padding:10px 18px;border:0;border-radius:10px}.hardware-notice{min-height:38px;font-size:12px}.hardware-over{color:#a13b27}.hardware-footer{font-size:12px;padding:18px 0}.hardware-footer a{color:#164b32}
  @media(max-width:700px){.hardware-shell{margin:0;padding:12px 14px;border-radius:0;min-height:100dvh}.hardware-panels{grid-template-columns:1fr;gap:16px}.hardware-header h1{font-size:28px}.hardware-header .pill{margin-top:12px}.hardware-conversation{height:260px}.hardware-node{padding:16px}}
</style>
