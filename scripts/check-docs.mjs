import fs from 'node:fs';
import path from 'node:path';
import { pages, manualArchives, isUnbundledArtifact } from './docs-pages.mjs';

// Verify the shipped offline reading path, not external network availability or hardware.
const files = fs.readdirSync('docs').filter(x => x.endsWith('.html')).map(x => path.join('docs', x));
const failures = [];
const sourceByOutput = new Map(pages.map(([source, output]) => [path.resolve(output), path.resolve(source)]));
const outputs = pages.map(([, output]) => output);
if (new Set(outputs).size !== outputs.length) failures.push('Duplicate handbook output mapping');
if (new Set(pages.map(([source]) => source)).size !== pages.length) failures.push('Duplicate handbook source mapping');
let localLinks = 0;
for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  if (!/<title>[^<]+<\/title>/.test(html) || !/<html\b[^>]*\blang="en-AU"/.test(html)) failures.push(`${file}: missing title/language`);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(x => x[1]);
  if (ids.length !== new Set(ids).size) failures.push(`${file}: duplicate IDs`);
  for (const [, tag, attr, raw] of html.matchAll(/(<[^>]*?)\b(href|src)="([^"]+)"/g)) {
    if (/^(?:https?:|mailto:|data:)/.test(raw)) continue;
    const [url, hash] = raw.split('#');
    const target = url ? path.resolve(path.dirname(file), decodeURIComponent(url)) : path.resolve(file);
    localLinks++;
    if (isUnbundledArtifact(path.relative(process.cwd(), target).replaceAll('\\', '/'))) failures.push(`${file}: workstation artifact is linked as shipped content: ${raw}`);
    if (!fs.existsSync(target)) { failures.push(`${file}: missing ${attr} ${raw}`); continue; }
    if (hash && target.endsWith('.html')) {
      const targetHtml = fs.readFileSync(target, 'utf8');
      if (!targetHtml.includes(`id="${hash}"`)) failures.push(`${file}: missing anchor ${raw}`);
    }
    if (/\.md$/.test(url) && !(tag.includes('data-repository-source="true"') && sourceByOutput.get(path.resolve(file)) === target)) failures.push(`${file}: raw Markdown outside explicit repository-source link: ${url}`);
  }
}

for (const [source, output, status] of pages) {
  const html = fs.readFileSync(output, 'utf8');
  if (!html.includes(`data-doc-status="${status}"`)) failures.push(`${output}: missing content status`);
  if (!html.includes('href="capabilities.html"') || !html.includes('href="delivery-plan.html"')) failures.push(`${output}: missing current navigation`);
  if (status === 'archive') {
    if (!html.includes('id="archive-notice"')) failures.push(`${output}: missing archive notice`);
    if (!fs.readFileSync(source, 'utf8').startsWith('> **Historical baseline')) failures.push(`${source}: missing source archive notice`);
  }
}
for (const output of [...manualArchives, 'docs/parts.html']) {
  if (!fs.readFileSync(output, 'utf8').includes('id="archive-notice"')) failures.push(`${output}: missing archive notice`);
}

// Ensure new requirements cannot silently fall out of the acceptance index.
const trace = fs.readFileSync('design/requirements-traceability.md', 'utf8');
for (const [source, prefix] of [['design/software-requirements.md', 'SW'], ['design/voice-audio-plan.md', 'V']]) {
  const pattern = new RegExp(`^\\| (${prefix}-\\d{2})\\b`, 'gm');
  const required = [...fs.readFileSync(source, 'utf8').matchAll(pattern)].map(x => x[1]);
  const covered = [...trace.matchAll(pattern)].map(x => x[1]);
  if (!required.length || new Set(required).size !== required.length) failures.push(`${source}: missing or duplicate requirement IDs`);
  if (new Set(covered).size !== covered.length) failures.push('Traceability contains duplicate requirement rows');
  for (const id of required) if (!covered.includes(id)) failures.push(`Traceability missing ${id}`);
  for (const id of covered) if (!required.includes(id)) failures.push(`Traceability has unknown requirement ${id}`);
}
const work = new Set([...fs.readFileSync('design/delivery-plan.md', 'utf8').matchAll(/^\| (W\d{2}) /gm)].map(x => x[1]));
const evidence = new Set([...fs.readFileSync('docs/evidence.md', 'utf8').matchAll(/^\| (EV-[A-Z]+) \|/gm)].map(x => x[1]));
for (const source of ['docs/capabilities.md', 'docs/compatibility.md', 'design/delivery-plan.md', 'design/requirements-traceability.md', ...pages.filter(([source]) => source.startsWith('design/decisions/')).map(([source]) => source)]) {
  const md = fs.readFileSync(source, 'utf8');
  for (const [id] of md.matchAll(/\bW\d{2}\b/g)) if (!work.has(id)) failures.push(`${source}: unknown work ID ${id}`);
  for (const [id] of md.matchAll(/\bEV-[A-Z]+\b/g)) if (!evidence.has(id)) failures.push(`${source}: unknown evidence ID ${id}`);
}
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
else console.log(`Verified ${files.length} HTML pages, ${localLinks} local references, archive notices and all SW/V requirement rows. This does not validate external listings or hardware.`);
