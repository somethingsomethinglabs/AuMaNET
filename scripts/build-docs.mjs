// Maintainer tool only. The committed HTML needs no server, npm or internet to read.
import fs from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';
import { pages, manualArchives, isUnbundledArtifact } from './docs-pages.mjs';
import { documentationNavigation } from './docs-navigation.mjs';

const root = process.cwd();
const checkOnly = process.argv.includes('--check');
const outputs = new Map();
const mapped = new Map(pages.map(([source, output]) => [path.resolve(root, source), output]));
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const navigation = documentationNavigation(pages);
const pageTitle = source => (fs.readFileSync(source, 'utf8').match(/^# (.+)$/m)?.[1] || source).replace(/<[^>]*>/g, '').trim();
const labelFor = item => item.label || pageTitle(item.source);
const navigationItems = navigation.flatMap(section => [...section.items, ...(section.references || [])]);
function sidebar(current) {
  const link = item => `<li><a href="${esc(item.href)}"${item.href === current ? ' aria-current="page"' : ''}>${esc(labelFor(item))}</a></li>`;
  return `<details class="mobile-navigation" open><summary>Browse documentation</summary><div class="sidebar-inner"><a class="docs-home" href="handbook.html">Documentation</a><div class="page-filter" hidden><label for="docs-filter">Find a page</label><input id="docs-filter" type="search" placeholder="Radio, Android, CLI…" autocomplete="off"><p id="filter-status" role="status" aria-live="polite"></p></div><nav aria-label="Documentation sections">${navigation.map(section => {
    const all = [...section.items, ...(section.references || [])];
    const active = all.some(item => item.href === current);
    return `<details class="nav-section"${active ? ' open' : ''}><summary>${esc(section.title)}</summary><ul>${section.items.map(link).join('')}</ul>${section.references?.length ? `<details class="nav-references"${section.references.some(item => item.href === current) ? ' open' : ''}><summary>${section.title === 'Development' ? 'Engineering & evidence' : 'Earlier project pages'}</summary><ul>${section.references.map(link).join('')}</ul></details>` : ''}</details>`;
  }).join('')}</nav><p class="sidebar-note">Prototype documentation<br>Reviewed 15 November 2026</p></div></details>`;
}

function rewrite(url, source, output) {
  if (/^(?:https?:|mailto:|#)/.test(url)) return url;
  const [file, fragment] = url.split('#');
  const target = path.resolve(root, path.dirname(source), file);
  if (target.endsWith('.md') && !mapped.has(target)) throw new Error(`Unmapped handbook Markdown link in ${source}: ${url}`);
  const destination = mapped.get(target) || path.relative(root, target);
  return path.relative(path.dirname(output), destination).replaceAll('\\', '/') + (fragment ? '#' + fragment : '');
}

function frame(title, body, status, source) {
  const current = source ? mapped.get(path.resolve(root, source)).replace(/^docs\//, '') : 'parts.html';
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
  const contents = headings.length ? `<aside class="page-contents" aria-label="On this page"><details open><summary>On this page</summary><ol>${headings.join('')}</ol></details></aside>` : '';
  const notice = status === 'archive'
    ? '<aside id="archive-notice" class="status"><strong>HISTORICAL · SUPERSEDED PI/HELTEC BASELINE</strong> · These choices and build steps do not apply to the current ESP32-S3/HaLow investigation. <a href="index.html">Current handbook</a> · <a href="archive.html">Archive context</a></aside>'
    : `<p class="status">${status === 'guide' || ['docs/index.md', 'docs/current-app.md', 'docs/capabilities.md', 'docs/compatibility.md', 'docs/maintaining-docs.md'].includes(source) ? 'PROTOTYPE DOCUMENTATION · REVIEWED 15 NOVEMBER 2026' : 'DATED DESIGN / IMPLEMENTATION REFERENCE · CHECK THE SOURCE SCOPE'} · <a href="capabilities.html">Current status</a></p>`;
  const sourceLink = source ? ` · <a data-repository-source="true" href="${esc(path.relative('docs', source).replaceAll('\\', '/'))}">Repository source</a>` : '';
  const category = navigation.find(section => [...section.items, ...(section.references || [])].some(item => item.href === current))?.title || 'Reference & history';
  const uniqueItems = navigationItems.filter((item, index, items) => items.findIndex(other => other.href === item.href) === index);
  const position = uniqueItems.findIndex(item => item.href === current);
  const adjacent = (item, direction) => item ? `<a href="${esc(item.href)}"><small>${direction}</small><strong>${esc(labelFor(item))}</strong></a>` : '<span></span>';
  const pagination = position >= 0 ? `<nav class="page-pagination" aria-label="Previous and next pages">${adjacent(uniqueItems[position - 1], 'Previous')}${adjacent(uniqueItems[position + 1], 'Next')}</nav>` : '';
  return `<!doctype html>
<html lang="en-AU" data-doc-status="${status}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${status === 'archive' ? 'Historical: ' : ''}${esc(title)} · AuMaNET</title><link rel="icon" href="assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="assets/handbook.css"></head>
<body><a class="skip" href="#main">Skip to content</a><header class="docs-header"><a class="brand" href="index.html"><img class="brand-mark" src="assets/aumanet-mark-light.svg" width="44" height="22" alt="">AuMaNET <span class="header-divider">/</span><span class="header-docs">Docs</span></a><nav aria-label="Site"><a href="index.html">Project home</a><a href="current-app.html">Latest update</a><a href="https://github.com/somethingsomethinglabs/AuMaNET">GitHub ↗</a></nav></header>
<div class="docs-layout"><aside class="docs-sidebar" aria-label="Documentation navigation">${sidebar(current)}</aside><div class="article-column"><main id="main"><p class="breadcrumb"><a href="handbook.html">Docs</a><span aria-hidden="true">/</span>${esc(category)}</p>${notice}<article>${body}</article>${pagination}</main><footer><a href="documentation-roadmap.html">Documentation roadmap</a> · <a href="maintaining-docs.html">Maintenance</a>${sourceLink}<br>Built from repository sources. Local HTML works offline; external sources need internet.</footer></div>${contents}</div><script src="assets/handbook.js" defer></script></body></html>\n`;
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

