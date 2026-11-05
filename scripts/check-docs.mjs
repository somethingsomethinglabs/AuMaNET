import fs from 'node:fs';
import path from 'node:path';

// Verify the shipped offline reading path, not external network availability or hardware.
const files = fs.readdirSync('docs').filter(x => x.endsWith('.html')).map(x => path.join('docs', x));
const failures = [];
let localLinks = 0;
for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  if (!/<title>[^<]+<\/title>/.test(html) || !/<html lang="en-AU">/.test(html)) failures.push(`${file}: missing title/language`);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(x => x[1]);
  if (ids.length !== new Set(ids).size) failures.push(`${file}: duplicate IDs`);
  for (const [, attr, raw] of html.matchAll(/\b(href|src)="([^"]+)"/g)) {
    if (/^(?:https?:|mailto:|data:)/.test(raw)) continue;
    const [url, hash] = raw.split('#');
    const target = url ? path.resolve(path.dirname(file), decodeURIComponent(url)) : path.resolve(file);
    localLinks++;
    if (!fs.existsSync(target)) { failures.push(`${file}: missing ${attr} ${raw}`); continue; }
    if (hash && target.endsWith('.html')) {
      const targetHtml = fs.readFileSync(target, 'utf8');
      if (!targetHtml.includes(`id="${hash}"`)) failures.push(`${file}: missing anchor ${raw}`);
    }
    if (file !== path.join('docs', 'index.html') && /\.md$/.test(url)) failures.push(`${file}: raw Markdown in offline handbook: ${url}`);
  }
}
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
else console.log(`Verified ${files.length} HTML pages and ${localLinks} local references. This does not validate external listings or hardware.`);
