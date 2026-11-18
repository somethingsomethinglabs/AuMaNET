
const sections = [
  ['Set up', [
    ['getting-started.html', 'Choose your setup'], ['initial-configuration.html', 'Connect a provisioned node'],
    ['joining-group.html', 'Check your group'], ['first-trip.html', 'Prepare for a trip'],
    ['compatibility.html', 'Phones and hardware'], ['downloads.html', 'Downloads']
  ]],
  ['Use the app', [
    ['android-app.html', 'Android controls'], ['maps-location.html', 'Offline maps and location'],
    ['voice-configuration.html', 'Voice and audio'], ['internet-sharing.html', 'Shared internet'],
    ['groups-configuration.html', 'Membership'], ['configuration.html', 'Settings']
  ]],
  ['Get help', [
    ['troubleshooting.html', 'Fix a connection'], ['diagnostics.html', 'Report a problem'],
    ['connection-tests.html', 'Test the link'], ['faq.html', 'Common questions']
  ]],
  ['Maintain or build a node', [
    ['hardware.html', 'Hardware overview'], ['devices.html', 'Boards and node roles'],
    ['serial-connection.html', 'USB and serial'], ['flash-firmware.html', 'USB firmware and recovery'],
    ['firmware-updates.html', 'Wireless updates'], ['device-configuration.html', 'Node management'],
    ['radio-configuration.html', 'Radio settings'], ['antennas-power.html', 'Antennas and power'],
    ['enclosures.html', 'CAD and print files'], ['board-reference.html', 'Board measurements'],
    ['enclosure-reference.html', 'Enclosure study'], ['cad-reference.html', 'CAD sources'],
    ['screw-mounts.html', 'Mounting references'], ['print-workshop.html', 'Print workshop'],
    ['print-profiles.html', 'Print profiles'], ['print-verification.html', 'Print verification']
  ]],
  ['Project and reference', [
    ['overview.html', 'How it works'], ['current-app.html', 'Builds and tested scope'],
    ['capabilities.html', 'Project status'], ['software.html', 'Software overview'],
    ['web-app.html', 'Web development interface'], ['cli.html', 'Planned operator CLI'],
    ['node-firmware.html', 'Node firmware'], ['release-channels.html', 'Release channels'],
    ['project-legal.html', 'Licensing and privacy'], ['glossary.html', 'Glossary'],
    ['contributing.html', 'Contribute'], ['development-guide.html', 'Development'],
    ['documentation-roadmap.html', 'Documentation roadmap'], ['maintaining-docs.html', 'Maintain the site']
  ], 'Engineering records'],
  ['History', [
    ['archive.html', 'Historical documentation'], ['parts.html', 'Historical parts register']
  ], 'Earlier project pages']
];

export function documentationNavigation(pages) {
  const assigned = new Set(['handbook.html', ...sections.flatMap(([, items]) => items.map(([href]) => href))]);
  return sections.map(([title, items, referenceLabel]) => ({
    title,
    items: items.map(([href, label]) => ({ href, label })),
    referenceLabel,
    references: referenceLabel ? pages.flatMap(([source, output, status]) => {
      const href = output.replace(/^docs\//, '');
      return assigned.has(href) || (status === 'archive') !== (title === 'History') ? [] : [{ href, source }];
    }) : []
  }));
}
