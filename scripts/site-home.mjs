
import { icon, layout } from './site-layout.mjs';

const pathSide = (name, place) => `<div class="path-side">
  <div class="path-device">${icon('node')}<strong>Node ${name}</strong></div>
  <div class="path-wifi">Local Wi-Fi</div>
  <div class="path-device phone">${icon('phone')}<strong>${place}</strong></div>
</div>`;

export function home() {
  const features = [
    ['chat', 'Check in by message', 'Send text and photos when the group has a usable link. Delivery feedback describes another device receiving the message.', 'android-app.html#messages-and-photos'],
    ['mic', 'Talk to the group', 'Join voice muted, choose an audio output, and use push to talk when you’re ready to speak.', 'voice-configuration.html'],
    ['map', 'Prepare maps ahead', 'Save map areas on your phone before leaving coverage. Choose separately whether to share your position with the group.', 'maps-location.html']
  ];
  return layout({
    title: 'Keep the group together',
    description: 'AuMaNET is an Android and Wi-Fi HaLow prototype for group communication beyond mobile coverage.',
    extraStyles: ['assets/landing.css'],
    body: `<main id="main" tabindex="-1">
  <section class="intro" aria-labelledby="hero-title">
    <div class="wrap intro-grid">
      <div class="intro-copy">
        <p class="eyebrow"><span></span> Android + Wi-Fi HaLow prototype</p>
        <h1 id="hero-title">Keep the group together.</h1>
        <p>AuMaNET uses portable radio nodes so your group can check in, talk and share positions beyond mobile coverage while the nodes have a link.</p>
        <div class="actions">
          <a class="button" href="getting-started.html">Choose your setup <span aria-hidden="true">→</span></a>
          <a class="button secondary" href="overview.html">See how it works</a>
        </div>
      </div>
      <div class="link-figure" id="how-it-connects">
        <figure class="link-frame">
          <h2 id="architecture-title">The connection path</h2>
          <div class="path-grid">
            ${pathSide('A', 'Your phone')}
            <div class="radio-link"><span>Wi-Fi HaLow</span></div>
            ${pathSide('B', 'Their phone')}
          </div>
          <figcaption id="network-caption">Each phone joins its own node. The two nodes carry group traffic across a direct radio link.</figcaption>
        </figure>
      </div>
    </div>
  </section>

  <section class="wrap panel-section" id="app" aria-labelledby="app-title">
    <h2 id="app-title">Before and beyond coverage</h2>
    <div class="feature-grid">
      ${features.map(([name, title, description, href]) => `<a class="feature" href="${href}">
        <span class="feature-icon">${icon(name)}</span><h3>${title}</h3>
        <p>${description}</p><span class="feature-more" aria-hidden="true">→</span>
      </a>`).join('\n')}
    </div>
  </section>

  <section class="path-section" id="documentation" aria-labelledby="docs-title">
    <div class="wrap path-layout">
      <div id="the-idea">
        <h2 id="idea-title">Start with what you have.</h2>
        <p>AuMaNET is being developed on two Android phones and two XIAO HaLow nodes. A prepared setup can follow the connection guide. A new board needs its own provisioning and recovery path.</p>
        <a class="text-action" href="compatibility.html">Check phones and hardware <span aria-hidden="true">→</span></a>
      </div>
      <div class="path-links">
        <h2 id="docs-title" class="sr-only">Choose a path</h2>
        <a href="initial-configuration.html">${icon('phone')}<span><strong>I have a provisioned node</strong><small>Connect an Android phone and check your group.</small></span><span aria-hidden="true">→</span></a>
        <a href="flash-firmware.html">${icon('node')}<span><strong>I have a new or unresponsive board</strong><small>Identify the hardware and find the USB recovery path.</small></span><span aria-hidden="true">→</span></a>
        <a href="handbook.html">${icon('kit')}<span><strong>I’m exploring AuMaNET</strong><small>Browse guides, hardware references and project history.</small></span><span aria-hidden="true">→</span></a>
      </div>
    </div>
  </section>

  <section class="wrap status-band" id="progress" aria-labelledby="progress-title">
    <div><h2 id="progress-title">Where the prototype stands</h2><p id="field-check-title">Development results cover a direct two-node link. Multi-hop, broader device support and field endurance still need acceptance. Carry an independent emergency communications option.</p></div>
    <a class="text-action" href="current-app.html">See the tested scope <span aria-hidden="true">→</span></a>
  </section>
</main>`
  });
}
