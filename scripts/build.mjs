import { Parcel } from '@parcel/core';
import { writeFileSync, readFileSync, rmSync, copyFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { glob } from 'fs/promises';

const existsFile = existsSync;

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const distDir = resolve(root, 'dist');

const t0 = Date.now();
const log = (...args) => console.log('[build]', ...args);

const tools = JSON.parse(readFileSync(resolve(root, 'src/tools.json'), 'utf8'));
const SITE = tools.site;
const SITE_URL = SITE.url;
log(`📋 tools.json loaded — ${tools.tools.length} tools: ${tools.tools.map(t => t.slug).join(', ')}`);

const entries = await Array.fromAsync(glob('src/*.html', { cwd: root }));
log(`📦 Parcel entries — ${entries.length} HTML files`);

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

// Post-process each HTML: replace __BUILD_TIME__ / __COMMIT_SHA__ and fix
// absolute asset paths. COMMIT_REF is set by Netlify on every build; for
// local `npm run build` it is undefined and the SHA link is omitted.
const buildTime = JSON.stringify(new Date().toISOString());
const commitSha = JSON.stringify(process.env.COMMIT_REF ?? '');
const htmlFiles = await Array.fromAsync(glob('*.html', { cwd: distDir }));
log(`📄 Parcel produced ${htmlFiles.length} dist HTML files: ${htmlFiles.join(', ')}`);
for (const html of htmlFiles) {
  const htmlPath = resolve(distDir, html);
  const updated = readFileSync(htmlPath, 'utf8')
    .replace('"__BUILD_TIME__"', buildTime)
    .replace('"__COMMIT_SHA__"', commitSha)
    .replace(/src="\/([^"]+)"/g, 'src="./$1"')
    .replace(/href="\/([^"]+)"/g, 'href="./$1"')
    .replace(/href=("?)index\.html\1(?=[ >])/g, 'href="/"');
  writeFileSync(htmlPath, updated);
}
log(`🔧 post-process pass — replaced __BUILD_TIME__ / __COMMIT_SHA__ and rewrote relative paths in ${htmlFiles.length} files`);

// Remove source maps.
const mapFiles = await Array.fromAsync(glob('*.map', { cwd: distDir }));
for (const f of mapFiles) rmSync(resolve(distDir, f));
if (mapFiles.length) log(`🗑️  removed ${mapFiles.length} source map file${mapFiles.length === 1 ? '' : 's'}`);

// Copy static assets at the dist root. og-image.png is pre-generated and
// committed; rerun `npm run generate:og` to refresh it from src/og-image.svg.
copyFileSync(resolve(root, 'src/robots.txt'), resolve(distDir, 'robots.txt'));
copyFileSync(resolve(root, 'src/_headers'), resolve(distDir, '_headers'));
copyFileSync(resolve(root, 'src/og-image.png'), resolve(distDir, 'og-image.png'));
copyFileSync(resolve(root, 'src/BingSiteAuth.xml'), resolve(distDir, 'BingSiteAuth.xml'));
log('📥 copied static assets — robots.txt, _headers, og-image.png, BingSiteAuth.xml');

// Inline js-yaml's UMD bundle into json-to-yaml.html. Parcel's bundler
// can't split js-yaml's internal ES modules into a classic script and
// `type="module"` leaves the imports unresolved, so we side-step it by
// pasting the pre-built UMD bundle. After this, `window.jsyaml` is global.
const yamlPagePath = resolve(distDir, 'json-to-yaml.html');
if (existsFile(yamlPagePath)) {
  const yamlUmd = readFileSync(resolve(root, 'node_modules/js-yaml/dist/js-yaml.min.js'), 'utf8');
  const marker = /<meta\s+name=["']?x-yaml-lib-injection-point["']?\s*\/?>/;
  const content = readFileSync(yamlPagePath, 'utf8');
  if (marker.test(content)) {
    const injected = content.replace(marker, `<script>${yamlUmd}</script>`);
    writeFileSync(yamlPagePath, injected);
    log(`📚 inlined js-yaml UMD into json-to-yaml.html (${(yamlUmd.length / 1024).toFixed(1)} kB)`);
  } else {
    log('⚠️  json-to-yaml.html missing x-yaml-lib-injection-point meta — js-yaml NOT inlined');
  }
}

const cleanPath = f => f === 'index.html' ? '/' : `/${f.replace(/\.html$/, '')}`;
// Internal pages (e.g. the design-system contributor reference) are routable
// — so the clean URL works for direct visits — but excluded from the sitemap.
// The FAQ / More tools / JSON-LD blocks are also skipped for them; see the
// matching filter in scripts/generate-sections.mjs. robots.txt also disallows
// them. The source of truth is the `internal: true` flag in tools.json.
const INTERNAL_PAGES = new Set(
  tools.tools.filter(t => t.internal).map(t => `${t.slug}.html`),
);
const routable = htmlFiles.filter(f => !f.startsWith('google')).sort();
const sitemapPages = routable.filter(f => !INTERNAL_PAGES.has(f));

// Generate _redirects: 301 .html paths to their clean form so old links keep working.
const redirects = routable
  .map(f => `/${f}  ${cleanPath(f)}  301!`)
  .join('\n');
writeFileSync(resolve(distDir, '_redirects'), redirects + '\n');
log(`🔀 generated _redirects — ${routable.length} entries`);

const today = new Date().toISOString().split('T')[0];
// `changefreq` is set to `daily` for every page while the site is under active
// development (see issue #63's update). The homepage gets `priority` 1.0 and
// tool pages 0.8 so crawlers know which to prioritise.
const sitemapUrls = sitemapPages
  .map(f => {
    const loc = `${SITE_URL}${cleanPath(f)}`;
    const priority = f === 'index.html' ? '1.0' : '0.8';
    return [
      `  <url>`,
      `    <loc>${loc}</loc>`,
      `    <lastmod>${today}</lastmod>`,
      `    <changefreq>daily</changefreq>`,
      `    <priority>${priority}</priority>`,
      `  </url>`,
    ].join('\n');
  })
  .join('\n');
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls}
</urlset>
`;
writeFileSync(resolve(distDir, 'sitemap.xml'), sitemap);
log(`🧭 generated sitemap.xml — ${sitemapPages.length} URLs (lastmod ${today})`);

// FAQ, "More tools" cross-link, and JSON-LD blocks are *not* injected here —
// they live in src/*.html, written by scripts/generate-sections.mjs so they
// show up in `npm run dev` and bundle through Parcel like any other markup.
// Re-run `npm run generate:sections` after editing src/tools.json.
log(`🎉 done in ${((Date.now() - t0) / 1000).toFixed(2)}s`);
