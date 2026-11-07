// Maintainer tool only. The committed HTML needs no server, npm or internet to read.
import fs from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';
import { pages, manualArchives, isUnbundledArtifact } from './docs-pages.mjs';

const root = process.cwd();
const checkOnly = process.argv.includes('--check');
const outputs = new Map();
const mapped = new Map(pages.map(([source, output]) => [path.resolve(root, source), output]));
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function rewrite(url, source, output) {
  if (/^(?:https?:|mailto:|#)/.test(url)) return url;
  const [file, fragment] = url.split('#');
  const target = path.resolve(root, path.dirname(source), file);
  if (target.endsWith('.md') && !mapped.has(target)) throw new Error(`Unmapped handbook Markdown link in ${source}: ${url}`);
  const destination = mapped.get(target) || path.relative(root, target);
  return path.relative(path.dirname(output), destination).replaceAll('\\', '/') + (fragment ? '#' + fragment : '');
}

function frame(title, body, status, source) {
  const headings = [];
  const slugs = new Set();
  body = body.replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g, (_, level, heading) => {
    const base = heading.replace(/<[^>]+>/g, '').toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-') || 'heading';
    let slug = base, suffix = 2;
    while (slugs.has(slug)) slug = `${base}-${suffix++}`;
    slugs.add(slug);
    if (level !== '2') return `<h${level} id="${slug}">${heading}</h${level}>`;
    // Keep the original numbered anchors while also supporting descriptive Markdown fragments.
    const id = `section-${headings.length + 1}`;
    headings.push(`<li><a href="#${id}">${heading}</a></li>`);
    return `<h2 id="${id}"><span id="${slug}">${heading}</span></h2>`;
  });
  const contents = headings.length > 1 ? `<details class="contents"><summary>On this page</summary><ol>${headings.join('')}</ol></details>` : '';
  const notice = status === 'archive'
    ? '<aside id="archive-notice" class="status"><strong>HISTORICAL · SUPERSEDED PI/HELTEC BASELINE</strong> · These choices and build steps do not apply to the current ESP32-S3/HaLow investigation. <a href="index.html">Current handbook</a> · <a href="archive.html">Archive context</a></aside>'
    : `<p class="status">${status === 'reference' ? 'PROTOTYPE REFERENCE' : 'CURRENT PROJECT · DESIGN / SIMULATED PROTOTYPE'} · <a href="capabilities.html">Capabilities and evidence limits</a></p>`;
  const sourceLink = source ? ` · <a data-repository-source="true" href="${esc(path.relative('docs', source).replaceAll('\\', '/'))}">Repository source</a>` : '';
  return `<!doctype html>
<html lang="en-AU" data-doc-status="${status}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${status === 'archive' ? 'Historical: ' : ''}${esc(title)} · AuMaNET</title><link rel="icon" href="assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="assets/handbook.css"></head>
<body><a class="skip" href="#main">Skip to content</a><header><a class="brand" href="index.html"><img class="brand-mark" src="assets/aumanet-mark-light.svg" width="44" height="22" alt="">AuMaNET</a><nav aria-label="Handbook"><a href="index.html">Project overview</a><a href="capabilities.html">Current status</a><a href="delivery-plan.html">Delivery plan</a><a href="decisions-current.html">Decisions</a><a href="compatibility.html">Compatibility</a><a href="archive.html">History</a></nav></header>
<main id="main">${notice}${contents}${body}</main><footer>Offline handbook · <a href="index.html#documentation">All documentation</a> · <a href="maintaining-docs.html">Maintenance</a>${sourceLink}<br>Generated from repository sources. External sources need an internet connection.</footer></body></html>\n`;
}

for (const [source, output, status] of pages) {
  const md = fs.readFileSync(source, 'utf8');
  // Some maintained tables have blank lines between rows; keep them as tables.
  const normalized = md.replace(/(\|[^\r\n]*\|)\r?\n(?:[ \t]*\r?\n)+(?=\|)/g, '$1\n');
  let html = marked.parse(normalized);
  // Reports retain artifact names without depending on workstation screenshots/APKs/videos.
  html = html.replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, (link, url, label) => {
    if (/^(?:https?:|mailto:|#)/.test(url)) return link;
    const target = path.relative(root, path.resolve(path.dirname(source), url.split('#')[0])).replaceAll('\\', '/');
    return isUnbundledArtifact(target) ? `<span class="local-artifact">${label} <small>(local artifact, not bundled: <code>${esc(target)}</code>)</small></span>` : link;
  });
  html = html.replace(/<img\b[^>]*src="([^"]+)"[^>]*>/g, (tag, url) => {
    if (/^(?:https?:|data:)/.test(url)) return tag;
    const target = path.relative(root, path.resolve(path.dirname(source), url)).replaceAll('\\', '/');
    return isUnbundledArtifact(target) ? `<span class="local-artifact">Local image, not bundled: <code>${esc(target)}</code></span>` : tag;
  });
  html = html.replace(/\b(href|src)="([^"]+)"/g, (_, attr, url) => `${attr}="${rewrite(url, source, output)}"`);
  // Tables remain semantic, and scroll within their own region on small screens.
  html = html.replaceAll('<table>', '<div class="table-wrap"><table>').replaceAll('</table>', '</table></div>');
  const title = (md.match(/^# (.+)$/m)?.[1] || 'Handbook').replace(/<[^>]*>/g, '').trim();
  outputs.set(output, frame(title, html, status, source));
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
outputs.set('docs/parts.html', frame('Historical parts and shopping register', `<h1>Historical parts and shopping register</h1><p>This Pi/Heltec one-node BOM and its AliExpress-only restriction belong to the superseded baseline. They are retained for provenance. See <a href="compatibility.html">current candidates</a> and the delivery plan's W11 for the new costed BOM; no complete current kit is released.</p><p><a href="../hardware/bom.csv">Historical CSV</a> · <a href="archive.html">Archive context</a></p>${table}`, 'archive'));

for (const output of manualArchives) {
  const original = fs.readFileSync(output, 'utf8');
  const banner = '<aside id="archive-notice" style="padding:20px;background:#2c2b24;color:#fff3d6;border:3px solid #ffd39b;position:relative;z-index:10"><strong>HISTORICAL · SUPERSEDED PI/HELTEC BASELINE.</strong> This page preserves the earlier project context. <a style="color:#c6ed82" href="index.html">Current ESP32-S3/HaLow handbook</a> · <a style="color:#c6ed82" href="archive.html">Archive context</a></aside>';
  const clean = original.replace(/<aside id="archive-notice"[\s\S]*?<\/aside>/, '');
  outputs.set(output, clean.replace(/<title>(?:Historical: )?([^<]+)<\/title>/, '<title>Historical: $1</title>').replace(/(<body[^>]*>)/, `$1${banner}`));
}

const stale = [];
for (const [output, html] of outputs) {
  if (checkOnly) {
    if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8').replaceAll('\r\n', '\n') !== html.replaceAll('\r\n', '\n')) stale.push(output);
  } else fs.writeFileSync(output, html);
}
if (stale.length) {
  console.error(`Handbook is stale; run npm run docs:build:\n${stale.join('\n')}`);
  process.exitCode = 1;
} else console.log(`${checkOnly ? 'Verified generated' : 'Built'} ${outputs.size} offline handbook pages.`);

