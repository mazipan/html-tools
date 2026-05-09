import { Parcel } from '@parcel/core';
import { writeFileSync, readFileSync, rmSync, copyFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { glob } from 'fs/promises';

const SITE_URL = 'https://tools.mazipan.space';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const distDir = resolve(root, 'dist');

const entries = await Array.fromAsync(glob('src/*.html', { cwd: root }));

const bundler = new Parcel({
  entries: entries.map(f => resolve(root, f)),
  defaultConfig: '@parcel/config-default',
  mode: 'production',
  additionalReporters: [
    { packageName: '@parcel/reporter-cli', resolveFrom: root },
  ],
  defaultTargetOptions: {
    distDir,
    sourceMaps: false,
    publicUrl: './',
  },
});

await bundler.run();

// Post-process each HTML: replace __BUILD_TIME__ and fix absolute asset paths.
const buildTime = JSON.stringify(new Date().toISOString());
const htmlFiles = await Array.fromAsync(glob('*.html', { cwd: distDir }));
for (const html of htmlFiles) {
  const htmlPath = resolve(distDir, html);
  const updated = readFileSync(htmlPath, 'utf8')
    .replace('"__BUILD_TIME__"', buildTime)
    .replace(/src="\/([^"]+)"/g, 'src="./$1"')
    .replace(/href="\/([^"]+)"/g, 'href="./$1"')
    .replace(/href=("?)index\.html\1(?=[ >])/g, 'href="/"');
  writeFileSync(htmlPath, updated);
}

// Inline all .js files into the HTML that reference them, then remove them.
// The Hub serves .js with application/octet-stream + nosniff, which browsers refuse.
const jsFiles = await Array.fromAsync(glob('*.js', { cwd: distDir }));
for (const js of jsFiles) {
  const jsContent = readFileSync(resolve(distDir, js), 'utf8');
  const tag = new RegExp(`<script[^>]+src=["']?\\.?\\/?${js}["']?[^>]*><\\/script>`, 'g');
  for (const html of htmlFiles) {
    const htmlPath = resolve(distDir, html);
    const content = readFileSync(htmlPath, 'utf8');
    if (tag.test(content)) {
      writeFileSync(htmlPath, content.replace(tag, `<script>${jsContent}</script>`));
    }
  }
  rmSync(resolve(distDir, js));
}

// Remove source maps.
const mapFiles = await Array.fromAsync(glob('*.map', { cwd: distDir }));
for (const f of mapFiles) rmSync(resolve(distDir, f));

// Copy static assets at the dist root. og-image.png is pre-generated and
// committed; rerun `npm run generate:og` to refresh it from src/og-image.svg.
copyFileSync(resolve(root, 'src/robots.txt'), resolve(distDir, 'robots.txt'));
copyFileSync(resolve(root, 'src/_headers'), resolve(distDir, '_headers'));
copyFileSync(resolve(root, 'src/og-image.png'), resolve(distDir, 'og-image.png'));

const cleanPath = f => f === 'index.html' ? '/' : `/${f.replace(/\.html$/, '')}`;
const indexable = htmlFiles.filter(f => !f.startsWith('google')).sort();

// Generate _redirects: 301 .html paths to their clean form so old links keep working.
const redirects = indexable
  .map(f => `/${f}  ${cleanPath(f)}  301!`)
  .join('\n');
writeFileSync(resolve(distDir, '_redirects'), redirects + '\n');

const today = new Date().toISOString().split('T')[0];
const sitemapUrls = indexable
  .map(f => {
    const loc = `${SITE_URL}${cleanPath(f)}`;
    return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`;
  })
  .join('\n');
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls}
</urlset>
`;
writeFileSync(resolve(distDir, 'sitemap.xml'), sitemap);
