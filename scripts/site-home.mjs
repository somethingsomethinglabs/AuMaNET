
import { icon, layout } from './site-layout.mjs';
import { comparison } from './site-comparison.mjs';

const pathSide = (name, place) => `<div class="path-side">
  <div class="path-device">${icon('node')}<strong>Node ${name}</strong></div>
  <div class="path-wifi">Local Wi-Fi</div>
  <div class="path-device phone">${icon('phone')}<strong>${place}</strong></div>
</div>`;

export function home() {
  const screens = [
    ['01-messages', 'Messages', 'A group conversation with a text check-in and a photo', 'Send a check-in or a photo of the turnoff. Delivery feedback tells you when another phone received it.'],
    ['02-voice', 'Group voice', 'A voice channel showing who is listening and a button to join muted', 'Join the group voice channel and hold to talk when a decision is easier to say out loud.'],
    ['03-map', 'Offline map', 'A saved map with position markers for group members', 'Save the map before leaving. See positions from members who choose to share while the group has a link.']
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
          <a class="button secondary" href="#the-idea">See how it works</a>
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

  <section class="wrap panel-section product-grid" id="the-idea" aria-labelledby="idea-title">
    <div class="section-copy">
      <h2 id="idea-title">A local network you carry.</h2>
      <p>AuMaNET is an open-source prototype for small groups travelling beyond mobile coverage. It combines an Android app with a portable radio box, called a node. In the current two-person setup, each person has a phone and a node.</p>
    </div>
    <dl class="product-parts">
      <div>
        <dt><span class="part-icon">${icon('phone')}</span> Android app</dt>
        <dd>Your phone joins the nearby node using its usual Wi-Fi. The app is where you message, talk and see the map.</dd>
      </div>
      <div>
        <dt><span class="part-icon">${icon('node')}</span> Portable radio node</dt>
        <dd>The two nodes talk directly over Wi-Fi HaLow, a type of Wi-Fi built for longer radio links. This carries group traffic without a mobile tower or internet connection.</dd>
      </div>
    </dl>
  </section>

  <section class="field-section" aria-labelledby="field-title">
    <div class="wrap panel-section field-grid">
      <div class="section-copy">
        <h2 id="field-title">A check-in past the last bar.</h2>
        <p>Imagine two vehicles on a gravel road. Mobile service drops out, and the lead vehicle needs to tell the other where to stop.</p>
        <ol class="field-steps">
          <li><strong>Before leaving</strong> Connect each phone to its node, join the same group and save the map area.</li>
          <li><strong>With a radio link</strong> From the turnout, send “I’m here” with a photo of the entrance, or give directions over group voice.</li>
          <li><strong>If the link drops</strong> The saved map still opens. Live voice and new updates need a working link again.</li>
        </ol>
      </div>
      <figure class="field-photo">
        <img src="assets/landing/high-country-track.jpg" width="1536" height="1024" alt="Two vehicles separated along a winding gravel road through eucalyptus forest" loading="lazy" decoding="async">
        <figcaption>Illustrative scene · generated image</figcaption>
      </figure>
    </div>
  </section>

  <section class="showcase" id="app" aria-labelledby="app-title">
    <div class="wrap panel-section">
      <div class="section-copy">
        <h2 id="app-title">See what’s on the phone.</h2>
        <p>Design previews show example conversations and positions. Hardware tests so far cover two phones.</p>
      </div>
      <div class="screen-grid">
        ${screens.map(([file, title, alt, description]) => `<figure class="app-screen">
          <a class="screen-image" href="style-guide/screenshots/${file}.jpg" aria-label="View full-size ${title.toLowerCase()} preview">
            <img src="style-guide/screenshots/${file}.jpg" width="390" height="844" alt="${alt}" loading="lazy" decoding="async">
            <span>View full size <span aria-hidden="true">↗</span></span>
          </a>
          <figcaption><h3>${title}</h3><p>${description}</p></figcaption>
        </figure>`).join('\n')}
      </div>
      <a class="text-action" href="android-app.html">Explore the Android app <span aria-hidden="true">→</span></a>
    </div>
  </section>

  ${comparison()}

  <section class="wrap status-band" id="progress" aria-labelledby="progress-title">
    <div><h2 id="progress-title">What’s been tested?</h2><p id="field-check-title">Development tests cover two specific Android phones and two directly linked nodes. Range, battery life, larger groups and forwarding through a third node still need field validation. Carry independent emergency communications.</p></div>
    <a class="text-action" href="current-app.html">See the tested scope <span aria-hidden="true">→</span></a>
  </section>

  <section class="path-section" id="documentation" aria-labelledby="docs-title">
    <div class="wrap path-layout">
      <div>
        <h2 id="docs-title">Try the prototype.</h2>
        <p>Check the hardware used in development and choose the guide that matches the equipment you have.</p>
        <a class="text-action" href="compatibility.html">Check phones and hardware <span aria-hidden="true">→</span></a>
      </div>
      <div class="path-links">
        <a href="initial-configuration.html">${icon('phone')}<span><strong>Connect to a prepared node</strong><small>Pair your Android phone and check the group connection.</small></span><span aria-hidden="true">→</span></a>
        <a href="flash-firmware.html">${icon('node')}<span><strong>Set up or recover a radio board</strong><small>Identify the board and find its USB instructions.</small></span><span aria-hidden="true">→</span></a>
        <a href="handbook.html">${icon('kit')}<span><strong>Browse the guides</strong><small>Read setup, hardware and troubleshooting guides.</small></span><span aria-hidden="true">→</span></a>
      </div>
    </div>
  </section>

</main>`
  });
}
