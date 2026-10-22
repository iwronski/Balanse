const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const result = spawnSync('pnpm', ['exec', 'expo', 'export', '--platform', 'web', '--output-dir', 'dist-web'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' },
});
if (result.status !== 0) process.exit(result.status ?? 1);
const out = path.join(root, 'dist-web');
const icon = fs.readFileSync(path.join(root, 'assets/images/icon.png'));
const iconName = `karb-icon-${createHash('sha256').update(icon).digest('hex').slice(0, 12)}.png`;
fs.writeFileSync(path.join(out, iconName), icon);
fs.writeFileSync(path.join(out, 'karb-icon.png'), icon);
fs.writeFileSync(path.join(out, 'manifest.webmanifest'), JSON.stringify({
  id: '/', name: 'Balanse', short_name: 'Balanse', lang: 'nb',
  start_url: '/', scope: '/', display: 'standalone',
  background_color: '#F1F1EF', theme_color: '#383838',
  icons: [{ src: `/${iconName}`, sizes: '1024x1024', type: 'image/png', purpose: 'any' }],
}));
const file = path.join(out, 'index.html');
let html = fs.readFileSync(file, 'utf8').replace(/<html[^>]*>/, '<html lang="nb">');
html = html.replace(/<title>.*?<\/title>/, '<title>Balanse</title>');
html = html.replace('</head>', `
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/${iconName}">
<meta name="theme-color" content="#383838">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Balanse">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="description" content="Din måltidslogg med karbohydratberegning og norsk matvaretabell.">
<meta name="robots" content="noindex,nofollow">
</head>`);
fs.writeFileSync(file, html);
console.log('Karb web app built with home-screen manifest and same-origin API.');
