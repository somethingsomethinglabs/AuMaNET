// Maintainer tool only. The committed HTML needs no server, npm or internet to read.
import fs from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';
import { pages, manualArchives, isUnbundledArtifact } from './docs-pages.mjs';
import { documentationNavigation } from './docs-navigation.mjs';
import { escapeHtml as esc, layout } from './site-layout.mjs';
import { home } from './site-home.mjs';

const root = process.cwd();
const checkOnly = process.argv.includes('--check');
const outputs = new Map();
const mapped = new Map(pages.map(([source, output]) => [path.resolve(root, source), output]));
const navigation = documentationNavigation(pages);
const pageTitle = source => (fs.readFileSync(source, 'utf8').match(/^# (.+)$/m)?.[1] || source).replace(/<[^>]*>/g, '').trim();
const labelFor = item => item.label || pageTitle(item.source);
const allItems = section => [...section.items, ...section.references];
outputs.set('docs/index.html', home());
function sidebar(current) {
  const link = item => `<li><a href="${esc(item.href)}"${item.href === current ? ' aria-current="page"' : ''}>${esc(labelFor(item))}</a></li>`;
  return `<details class="mobile-navigation" open><summary>Browse documentation</summary><div class="sidebar-inner"><a class="docs-home" href="handbook.html"${current === 'handbook.html' ? ' aria-current="page"' : ''}>Guides</a><div class="page-filter" hidden><label for="docs-filter">Filter guides by title</label><input id="docs-filter" type="search" placeholder="e.g. offline maps" autocomplete="off"><p id="filter-status" role="status" aria-live="polite"></p></div><nav aria-label="Documentation sections">${navigation.map(section => {
    const all = allItems(section);
    const active = all.some(item => item.href === current);
    return `<details class="nav-section"${active ? ' open' : ''}><summary>${esc(section.title)}</summary><ul>${section.items.map(link).join('')}</ul>${section.references?.length ? `<details class="nav-references"${section.references.some(item => item.href === current) ? ' open' : ''}><summary>${esc(section.referenceLabel)}</summary><ul>${section.references.map(link).join('')}</ul></details>` : ''}</details>`;
  }).join('')}</nav></div></details>`;
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
  const contents = headings.length ? `<aside class="page-contents" aria-label="On this page"><details open><summary>On this page</summary><ul>${headings.join('')}</ul></details></aside>` : '';
  const section = navigation.find(group => allItems(group).some(item => item.href === current));
  const notice = status === 'archive'
    ? '<aside id="archive-notice" class="status archive"><strong>Historical reference.</strong> This page covers the earlier Pi/Heltec design. <a href="getting-started.html">See the current setup</a> or read the <a href="archive.html">archive context</a>.</aside>'
    : section?.references.some(item => item.href === current) || status === 'reference'
      ? '<aside class="status"><strong>Project reference.</strong> Check the date, build and test scope before using this information.</aside>'
      : '';
  const sourceLink = source ? `<a data-repository-source="true" href="${esc(path.relative('docs', source).replaceAll('\\', '/'))}">Page source</a>` : '';
  const category = section?.title;
  const adjacent = (item, direction) => item ? `<a href="${esc(item.href)}"><small>${direction}</small><strong>${esc(labelFor(item))}</strong></a>` : '';
  const siblings = section?.items.some(item => item.href === current) ? section.items : section?.references ?? [];
  const position = siblings.findIndex(item => item.href === current);
  const pagination = siblings.length > 1 && position >= 0 ? `<nav class="page-pagination" aria-label="Previous and next pages">${adjacent(siblings[position - 1], 'Previous')}${adjacent(siblings[position + 1], 'Next')}</nav>` : '';
  return layout({
    title: status === 'archive' ? `Historical · ${title}` : title,
    description: `${title}. AuMaNET prototype documentation.`,
    section: ['overview.html', 'troubleshooting.html', 'getting-started.html'].includes(current) ? current : 'handbook.html',
    status,
    extraStyles: ['assets/handbook.css'],
    scripts: ['assets/handbook.js'],
    body: `<div class="wrap docs-layout">
<aside class="docs-sidebar" aria-label="Documentation navigation">${sidebar(current)}</aside>
${contents}
<div class="article-column"><main id="main" tabindex="-1">
${category ? `<p class="breadcrumb"><a href="handbook.html">Guides</a><span aria-hidden="true">/</span>${esc(category)}</p>` : ''}
${notice}<article>${body}</article>${pagination}</main>
<div class="page-meta">${sourceLink}<a href="maintaining-docs.html">Maintain these guides</a></div>
</div></div>`
  });
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
  html = html.replaceAll('<table>', '<div class="table-wrap" tabindex="0" role="region" aria-label="Scrollable table"><table>').replaceAll('</table>', '</table></div>');
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
const table = `<div class="table-wrap" tabindex="0" role="region" aria-label="Scrollable table"><table><thead><tr>${columns.map(x => `<th>${esc(x.replaceAll('_', ' '))}</th>`).join('')}</tr></thead><tbody>${parts.map(row => `<tr>${row.map(x => `<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
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
