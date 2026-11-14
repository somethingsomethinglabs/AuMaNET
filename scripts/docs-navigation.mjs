// Reader-facing documentation structure. Entries use generated HTML filenames.
// New long-form references are collected automatically so no mapped page is orphaned.
export const navigationSections = [
  ['About', [
    ['handbook.html', 'Introduction'], ['overview.html', 'How AuMaNET works'],
    ['current-app.html', 'The app now'], ['capabilities.html', 'Project status'],
    ['contributing.html', 'Contributing'], ['faq.html', 'FAQs']
  ]],
  ['Getting started', [
    ['getting-started.html', 'Before you begin'], ['serial-connection.html', 'USB & serial connection'],
    ['flash-firmware.html', 'Install node firmware'], ['initial-configuration.html', 'Initial configuration'],
    ['joining-group.html', 'Join a group'], ['first-trip.html', 'First trip checklist']
  ]],
  ['Configuration', [
    ['configuration.html', 'Configuration overview'], ['radio-configuration.html', 'Radio channel & width'],
    ['groups-configuration.html', 'Groups & membership'], ['maps-location.html', 'Offline maps & location'],
    ['voice-configuration.html', 'Voice & audio'], ['internet-sharing.html', 'Internet sharing'],
    ['device-configuration.html', 'Node management & recovery']
  ]],
  ['Hardware', [
    ['hardware.html', 'Hardware overview'], ['devices.html', 'Nodes & phones'],
    ['antennas-power.html', 'Antennas & power'], ['enclosures.html', 'Enclosures & printing'],
    ['compatibility.html', 'Compatibility'], ['board-reference.html', 'Board measurements'],
    ['enclosure-reference.html', 'Enclosure study'], ['cad-reference.html', 'CAD sources'],
    ['screw-mounts.html', 'Mounting references'], ['print-workshop.html', 'Print workshop'],
    ['print-profiles.html', 'Print profiles'], ['print-verification.html', 'Print verification']
  ]],
  ['Software', [
    ['software.html', 'Software overview'], ['android-app.html', 'Android app'],
    ['web-app.html', 'Web app & design demo'], ['cli.html', 'Operator CLI · planned'],
    ['node-firmware.html', 'Node firmware'], ['firmware-updates.html', 'Firmware updates'],
    ['release-channels.html', 'Release channels & publishing']
  ]],
  ['Troubleshooting', [
    ['troubleshooting.html', 'Connection & recovery'], ['connection-tests.html', 'Test the connection'],
    ['diagnostics.html', 'Logs & diagnostics']
  ]],
  ['Development', [
    ['development-guide.html', 'Development overview'], ['documentation-roadmap.html', 'Documentation roadmap'],
    ['maintaining-docs.html', 'Maintain this site']
  ]],
  ['Reference & history', [
    ['glossary.html', 'Glossary'], ['project-legal.html', 'Licensing & privacy'], ['archive.html', 'Historical documentation'], ['parts.html', 'Historical parts register']
  ]]
];

export function documentationNavigation(pages) {
  const sections = navigationSections.map(([title, items]) => ({title, items: items.map(([href, label]) => ({href, label}))}));
  const assigned = new Set(sections.flatMap(section => section.items.map(item => item.href)));
  const references = [], history = [];
  for (const [source, output, status] of pages) {
    const href = output.replace(/^docs\//, '');
    if (assigned.has(href)) continue;
    (status === 'archive' ? history : references).push({href, source});
  }
  sections[6].references = references;
  sections[7].references = history;
  return sections;
}
