// Maintainer tool only. The committed HTML needs no server, npm or internet to read.
import fs from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';

const root = process.cwd();
const pages = [
  ['docs/start-here.md', 'docs/start-here.html'],
  ['docs/maintaining-docs.md', 'docs/maintaining-docs.html'],
  ['docs/current-design.md', 'docs/current-design.html'],
  ['docs/firmware-review.md', 'docs/firmware-review.html'],
  ['docs/power-review.md', 'docs/power-review.html'],
  ['docs/upgrades.md', 'docs/upgrades.html'],
  ['docs/requirements.md', 'docs/requirements.html'],
  ['docs/build-and-test.md', 'docs/build-and-test.html'],
  ['docs/release-readiness.md', 'docs/release-readiness.html'],
  ['docs/decisions.md', 'docs/decisions.html'],
  ['hardware/portable-node.md', 'docs/portable-node.html'],
  ['hardware/diy-selection.md', 'docs/diy-selection.html'],
  ['hardware/heltec-hc01p-v2.md', 'docs/heltec-hc01p-v2.html'],
  ['hardware/antennas.md', 'docs/antennas.html'],
  ['hardware/battery-candidate-01.md', 'docs/battery-candidate-01.html'],
  ['hardware/converter-candidate-01.md', 'docs/converter-candidate-01.html'],
  ['field-tests/build-record-template.md', 'docs/build-record.html']
];
const mapped = new Map(pages.map(([source, output]) => [path.resolve(root, source), output]));
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function rewrite(url, source, output) {
  if (/^(?:https?:|mailto:|#)/.test(url)) return url;
  const [file, fragment] = url.split('#');
  const target = path.resolve(root, path.dirname(source), file);
  const destination = mapped.get(target) || path.relative(root, target);
  return path.relative(path.dirname(output), destination).replaceAll('\\', '/') + (fragment ? '#' + fragment : '');
}

function frame(title, body) {
  return `<!doctype html>
<html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)} · AuMaNET</title><link rel="stylesheet" href="assets/handbook.css"></head>
<body><a class="skip" href="#main">Skip to content</a><header><a class="brand" href="index.html">AuMaNET</a><nav aria-label="Handbook"><a href="start-here.html">Start here</a><a href="current-design.html">Current design</a><a href="parts.html">Parts</a><a href="upgrades.html">Upgrades</a><a href="release-readiness.html">Build status</a></nav></header>
<main id="main"><p class="status">DESIGN PROTOTYPE · Some parts and assembly steps remain unverified</p>${body}</main><footer>Updated 5 November 2026 · Offline handbook · <a href="index.html">Project overview</a><br>Generated from the repository's Markdown/CSV sources. External sources need an internet connection.</footer></body></html>\n`;
}

for (const [source, output] of pages) {
  const md = fs.readFileSync(source, 'utf8');
  let html = marked.parse(md);
  html = html.replace(/\b(href|src)="([^"]+)"/g, (_, attr, url) => `${attr}="${rewrite(url, source, output)}"`);
  // Tables remain semantic, and scroll within their own region on small screens.
  html = html.replaceAll('<table>', '<div class="table-wrap"><table>').replaceAll('</table>', '</table></div>');
  const title = md.match(/^# (.+)$/m)?.[1] || 'Handbook';
  fs.writeFileSync(output, frame(title, html));
}

// CSV parser supports quoted fields and embedded newlines; no extra runtime dependency.
function csv(input) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') { if (quoted && input[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(field); field = ''; }
    else if (c === '\n' && !quoted) { row.push(field.replace(/\r$/, '')); if (row.some(Boolean)) rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (quoted) throw new Error('Unclosed CSV quote');
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}
const [columns, ...parts] = csv(fs.readFileSync('hardware/bom.csv', 'utf8'));
if (parts.some(row => row.length !== columns.length)) throw new Error('BOM column count mismatch');
const table = `<div class="table-wrap"><table><thead><tr>${columns.map(x => `<th>${esc(x.replaceAll('_', ' '))}</th>`).join('')}</tr></thead><tbody>${parts.map(row => `<tr>${row.map(x => `<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
fs.writeFileSync('docs/parts.html', frame('Parts and shopping register', `<h1>Parts and shopping register</h1><p>Quantities are for <strong>one node</strong>. Multiply required items by three for the proposed pilot only after one node is verified. Optional experiments and shared tools are identified separately. A candidate is not an instruction to buy.</p><p><strong>AliExpress only for purchased components.</strong> Existing phones are user-owned; the enclosure is printed or made to the released CAD when available. Technical reference brands do not establish a matching AliExpress listing. No complete buy-ready kit is released.</p><p><a href="../hardware/bom.csv">Download CSV</a> · <a href="start-here.html">First-build stages</a> · <a href="release-readiness.html">Unresolved build gates</a></p>${table}`));
console.log(`Built ${pages.length + 1} offline handbook pages.`);
