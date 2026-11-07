// Package the committed handbook for GitHub Pages, preserving its offline sources.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const docs = path.resolve(root, 'docs');
const output = path.resolve(root, 'dist/pages');
const repository = 'https://github.com/somethingsomethinglabs/AuMaNET';
const ref = process.env.GITHUB_SHA || 'main';
if (!/^[\w./-]+$/.test(ref)) throw new Error('Invalid repository revision');
// Only clean this tool's fixed output, never another workspace directory.
if (path.relative(root, output).replaceAll('\\', '/') !== 'dist/pages') throw new Error('Unsafe output directory');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
fs.cpSync(docs, output, { recursive: true, dereference: false });

function filesIn(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlinks cannot be published: ${file}`);
    return entry.isDirectory() ? filesIn(file) : [file];
  });
}

const files = filesIn(output);
let repositoryLinks = 0;
let embeddedImages = 0;
for (const file of files.filter(file => file.endsWith('.html'))) {
  const source = path.join(docs, path.relative(output, file));
  const html = fs.readFileSync(file, 'utf8').replace(/\b(href|src)="([^"]+)"/g, (attribute, kind, url) => {
    if (/^(?:[a-z]+:|#|\/\/)/i.test(url)) return attribute;
    const [pathname, fragment] = url.split('#');
    const target = path.resolve(path.dirname(source), decodeURIComponent(pathname));
    const relative = path.relative(docs, target);
    if (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) return attribute;
    const repositoryPath = path.relative(root, target).replaceAll('\\', '/');
    if (repositoryPath.startsWith('../') || path.isAbsolute(repositoryPath) || !fs.existsSync(target)) throw new Error(`Invalid repository reference: ${url}`);
    const encoded = repositoryPath.split('/').map(encodeURIComponent).join('/');
    // Embedded images must load for visitors even when the repository is private.
    if (kind === 'src') {
      const destination = path.join(output, 'assets/references', repositoryPath);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(target, destination);
      embeddedImages++;
      return `${kind}="${path.relative(path.dirname(file), destination).replaceAll('\\', '/')}"`;
    }
    const binary = !/\.(?:md|txt|csv|json|ya?ml|mjs|js|ts|py|ps1)$/i.test(target);
    const prefix = binary && fs.statSync(target).isFile()
      ? `https://raw.githubusercontent.com/somethingsomethinglabs/AuMaNET/${ref}`
      : `${repository}/${fs.statSync(target).isDirectory() ? 'tree' : 'blob'}/${ref}`;
    repositoryLinks++;
    return `${kind}="${prefix}/${encoded}${fragment ? `#${fragment}` : ''}"`;
  });
  fs.writeFileSync(file, html);
}
fs.writeFileSync(path.join(output, '.nojekyll'), '');

// Check the published tree itself: it must work at /AuMaNET/, not only at /.
let localLinks = 0;
for (const file of files.filter(file => /\.(?:html|css)$/.test(file))) {
  const content = fs.readFileSync(file, 'utf8');
  const references = file.endsWith('.html')
    ? [...content.matchAll(/\b(?:href|src)="([^"]+)"/g)].map(match => match[1])
    : [...content.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(match => match[1]);
  for (const url of references) {
    if (/^(?:[a-z]+:|\/\/)/i.test(url)) continue;
    if (url.startsWith('/')) throw new Error(`Root-relative URL breaks project Pages: ${url}`);
    const [pathname, fragment] = url.split('#');
    const target = path.resolve(path.dirname(file), decodeURIComponent(pathname || path.basename(file)));
    const relative = path.relative(output, target);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || !fs.existsSync(target)) throw new Error(`Missing published reference in ${file}: ${url}`);
    if (fragment && target.endsWith('.html') && !fs.readFileSync(target, 'utf8').includes(`id="${fragment}"`)) throw new Error(`Missing published anchor: ${url}`);
    localLinks++;
  }
}
console.log(`Built dist/pages: ${filesIn(output).length} files, ${localLinks} local references verified, ${embeddedImages} embedded images bundled, ${repositoryLinks} repository references linked to ${ref}.`);
