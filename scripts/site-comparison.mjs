const comparisonRows = [
  ['Best for', 'Calls and internet wherever you have service', 'Quick spoken calls on a shared channel', 'Short check-ins and positions over a low-power mesh', 'Voice, photos and a shared map for a nearby group off-grid'],
  ['Live voice', 'Phone calls', 'Push-to-talk', '<a href="https://meshtastic.org/docs/configuration/module/audio/">Experimental on select hardware</a>', 'In-app group voice'],
  ['Text', 'SMS and messaging apps', 'No', 'Short mesh messages', 'Group messages'],
  ['Photos', 'Via messaging apps', 'No', 'No in standard chat', 'Group photos'],
  ['Shared position', 'Via compatible apps', 'Voice directions', 'GPS position updates', 'Opt-in group positions'],
  ['Saved maps', 'With an offline map app', 'Separate device', '<a href="https://meshtastic.org/docs/software/android/user/map-and-waypoints/">Supported in the Android app</a>', 'Download areas in the app'],
  ['Internet for apps', 'Mobile data', 'No', 'No general internet access', '<a href="internet-sharing.html">Opt-in sharing</a> from a phone with mobile data'],
  ['How it reaches', 'Through a carrier tower and network', 'Direct radio or via a repeater', 'Direct LoRa or relayed by other mesh radios', 'Direct link between two HaLow nodes in the tested setup'],
  ['What you carry', 'Phone with carrier service', 'UHF CB radio at each end', 'Compatible LoRa radio at each end', 'Android phone and powered HaLow node at each end']
];

// Coordinates are shared across all four views so the vehicles stay put.
const points = {
  A: [82, 233],
  B: [214, 195],
  C: [391, 105],
  tower: [418, 48],
  repeater: [266, 80]
};

const maps = [
  {
    title: 'Mobile network',
    description: 'Vehicle C has service near the tower. Vehicles A and B are outside this example coverage area.',
    routes: [['C', 'tower']],
    station: ['tower', 'Cell tower'],
    area: '<path d="M309 20C340 2 414 4 460 25L480 56V138C455 161 417 162 386 149C355 136 367 115 344 92C324 72 296 55 309 20Z"/>'
  },
  {
    title: 'UHF CB radio',
    description: 'Vehicles A and C can talk because both can reach the ridge repeater. A direct call also works where two radios can hear each other.',
    routes: [['A', 'repeater', 'C']],
    station: ['repeater', 'Ridge repeater']
  },
  {
    title: 'Meshtastic',
    description: 'Vehicle B relays a short text from A to C. Each leg only has to reach the next compatible LoRa radio.',
    routes: [['A', 'B', 'C']]
  },
  {
    title: 'AuMaNET',
    description: 'Nearby vehicles A and B have a direct HaLow link for voice, text, photos and positions. Vehicle C is beyond this example link.',
    routes: [['A', 'B']],
    area: '<ellipse cx="151" cy="216" rx="127" ry="64" transform="rotate(-18 151 216)"/>'
  }
];

function coverageMap({ title, description, routes, station, area }) {
  const vehicleMarkers = ['A', 'B', 'C'].map(vehicle => {
    const [x, y] = points[vehicle];
    const reachable = routes.some(route => route.includes(vehicle));
    return `<g class="vehicle-marker${reachable ? ' reachable' : ''}" transform="translate(${x} ${y})"><circle r="14"/><text y="5">${vehicle}</text></g>`;
  }).join('');
  const lines = routes.map(route => `<polyline points="${route.map(point => points[point].join(',')).join(' ')}"/>`).join('');
  const stationMarker = station ? `<g class="station-marker" transform="translate(${points[station[0]].join(' ')})"><path d="M0 -7 7 0 0 7 -7 0Z"/><text y="-15">${station[1]}</text></g>` : '';
  return `<figure class="coverage-card">
    <h4>${title}</h4>
    <div class="coverage-map" aria-hidden="true">
      <img src="assets/landing/high-country-overhead.jpg" width="1200" height="800" alt="" loading="lazy" decoding="async">
      <svg viewBox="0 0 480 320" focusable="false">
        <g class="coverage-area">${area || ''}</g>
        <g class="coverage-route">${lines}</g>
        ${vehicleMarkers}${stationMarker}
      </svg>
    </div>
    <figcaption>${description}</figcaption>
  </figure>`;
}

export function comparison() {
  return `<section class="wrap panel-section" id="compare" aria-labelledby="compare-title">
    <div class="section-copy">
      <h2 id="compare-title">Which connection fits the trip?</h2>
      <p>Start with what you need to send. A quick voice call, a short check-in and a photo with a location each ask something different of a radio link.</p>
    </div>
    <p class="matrix-scroll-hint">Scroll the table to compare all four options.</p>
    <div class="comparison-scroll" role="region" aria-label="Scrollable communication comparison" tabindex="0">
      <table class="comparison-matrix">
        <caption class="sr-only">Features and equipment by communication option</caption>
        <thead><tr><th scope="col">Feature</th>${maps.map(({ title }) => `<th scope="col">${title}</th>`).join('')}</tr></thead>
        <tbody>
          ${comparisonRows.map(([label, ...cells]) => `<tr><th scope="row">${label}</th>${cells.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('\n')}
        </tbody>
      </table>
    </div>
    <p class="comparison-sources"><a href="https://www.acma.gov.au/mobile-network-coverage-maps-standard">Mobile coverage</a><a href="https://www.acma.gov.au/licences/citizen-band-radio-stations-class-licence">Australian UHF CB</a><a href="https://meshtastic.org/docs/introduction/">Meshtastic</a><a href="current-app.html">AuMaNET test scope</a></p>

    <section class="coverage-section" aria-labelledby="coverage-title">
      <div class="section-copy">
        <h3 id="coverage-title">Same valley, four ways to connect</h3>
        <p>Three vehicles are spread along one track. Each view uses the same positions. Lines show usable links in this example, and shading shows assumed coverage.</p>
      </div>
      <p class="coverage-note">Illustrative paths on generated terrain. Actual reach depends on terrain, equipment, settings and available repeaters. AuMaNET’s field range is still being tested.</p>
      <div class="coverage-grid">
        ${maps.map(coverageMap).join('\n')}
      </div>
    </section>

    <div class="comparison-takeaway">
      <h3>Where AuMaNET fits</h3>
      <p>Two nearby crews lose mobile service at a fork. They can talk through the decision, send a photo of the turn and share a position on a saved map while their radios stay linked. If one phone later picks up mobile data, its owner can <a href="internet-sharing.html">choose to share that connection</a> with the other phone.</p>
    </div>
  </section>`;
}
