export type InputMode = 'Push to talk' | 'Always on';
export const members = [
  { name: 'Rowan', node: 'AUMA-01', initials: 'R', online: true },
  { name: 'Alex', node: 'AUMA-02', initials: 'A', online: true },
  { name: 'Sam', node: 'AUMA-03', initials: 'S', online: true },
  { name: 'Jess', node: '', initials: 'J', online: false }
];
export const nodes = [
  { id: 'AUMA-01', name: 'Rowan’s node', battery: 82 },
  { id: 'AUMA-02', name: 'Relay', battery: 76 },
  { id: 'AUMA-03', name: 'Camp', battery: 91 }
];
export const categories = [
  ['Nodes', 'Pair, configure and manage devices', 'Router'],
  ['Group & members', 'Invitations, roles and membership', 'Users'],
  ['Voice & audio', 'Input mode, detection and audio route', 'AudioLines'],
  ['Internet sharing', 'Choose a source, sharing and data limits', 'Globe'],
  ['Maps & storage', 'Offline regions and local storage', 'Map'],
  ['Location & privacy', 'Sharing, permissions and history', 'MapPin'],
  ['Notifications', 'Messages, voice and connection alerts', 'Bell'],
  ['Appearance', 'Theme, text and units', 'Palette'],
  ['Diagnostics & about', 'Connection logs and app information', 'Info']
];
export type Message = { id: number; author: string; text: string; time: string; status?: string };
export const initialMessages: Message[] = [
  { id: 1, author: 'Alex', text: 'At the river crossing. Track looks clear.', time: '10:18' },
  { id: 2, author: 'Sam', text: 'Copy. Two minutes behind you.', time: '10:19' },
  { id: 3, author: 'Rowan', text: 'We’ll wait at the junction.', time: '10:20', status: 'Sent' }
];
