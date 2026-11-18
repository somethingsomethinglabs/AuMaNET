
export const repository = 'https://github.com/somethingsomethinglabs/AuMaNET';
export const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export function icon(name) {
  return `<img class="icon" src="assets/brand/${name}.svg" alt="" width="24" height="24">`;
}

export function layout({ title, description, section, body, status, extraStyles = [], scripts = [] }) {
  const logo = '<picture><source media="(prefers-color-scheme: dark)" srcset="assets/brand/logo-lockup-reverse.svg"><img src="assets/brand/logo-lockup-primary.svg" width="154" height="30" alt="AuMaNET"></picture>';
  const nav = [
    ['overview.html', 'How it works'],
    ['getting-started.html', 'Set up'],
    ['handbook.html', 'Guides'],
    ['troubleshooting.html', 'Get help']
  ];
  return `<!doctype html>
<html lang="en-AU"${status ? ` data-doc-status="${status}"` : ''}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(description)}">
  <title>${escapeHtml(title)} · AuMaNET</title>
  <link rel="icon" href="assets/brand/logo-mark-primary.svg" type="image/svg+xml">
  <link rel="stylesheet" href="assets/site.css">
  ${extraStyles.map(href => `<link rel="stylesheet" href="${href}">`).join('\n  ')}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="wordmark" href="index.html" aria-label="AuMaNET home">${logo}</a>
    <nav aria-label="Site">${nav.map(([href, label]) => `<a${href === section ? ' aria-current="true"' : ''} href="${href}">${label}</a>`).join('')}</nav>
    <a class="button compact" href="downloads.html">Downloads</a>
  </div>
</header>
${body}
<footer class="site-footer">
  <div class="wrap footer-inner">
    <a class="wordmark" href="index.html" aria-label="AuMaNET home">${logo}</a>
    <nav aria-label="Project links">
      <a href="project-legal.html">Licensing &amp; privacy</a>
      <a href="archive.html">Project history</a>
      <a href="${repository}">GitHub</a>
    </nav>
  </div>
</footer>
${scripts.map(src => `<script src="${src}" defer></script>`).join('\n')}
</body>
</html>
`;
}
