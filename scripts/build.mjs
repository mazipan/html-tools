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
const SITE_HOME = `${SITE_URL}/`;
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

// Post-process each HTML: replace __BUILD_TIME__ and fix absolute asset paths.
const buildTime = JSON.stringify(new Date().toISOString());
const htmlFiles = await Array.fromAsync(glob('*.html', { cwd: distDir }));
log(`📄 Parcel produced ${htmlFiles.length} dist HTML files: ${htmlFiles.join(', ')}`);
for (const html of htmlFiles) {
  const htmlPath = resolve(distDir, html);
  const updated = readFileSync(htmlPath, 'utf8')
    .replace('"__BUILD_TIME__"', buildTime)
    .replace(/src="\/([^"]+)"/g, 'src="./$1"')
    .replace(/href="\/([^"]+)"/g, 'href="./$1"')
    .replace(/href=("?)index\.html\1(?=[ >])/g, 'href="/"');
  writeFileSync(htmlPath, updated);
}
log(`🔧 post-process pass — replaced __BUILD_TIME__ and rewrote relative paths in ${htmlFiles.length} files`);

// Remove source maps.
const mapFiles = await Array.fromAsync(glob('*.map', { cwd: distDir }));
for (const f of mapFiles) rmSync(resolve(distDir, f));
if (mapFiles.length) log(`🗑️  removed ${mapFiles.length} source map file${mapFiles.length === 1 ? '' : 's'}`);

// Copy static assets at the dist root. og-image.png is pre-generated and
// committed; rerun `npm run generate:og` to refresh it from src/og-image.svg.
copyFileSync(resolve(root, 'src/robots.txt'), resolve(distDir, 'robots.txt'));
copyFileSync(resolve(root, 'src/_headers'), resolve(distDir, '_headers'));
copyFileSync(resolve(root, 'src/og-image.png'), resolve(distDir, 'og-image.png'));
log('📥 copied static assets — robots.txt, _headers, og-image.png');

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
// design-system is an internal contributor page — it lives in dist/ but is
// excluded from sitemap, _redirects, FAQ injection, and cross-tool blocks.
// Visit it directly at /design-system.html.
const INTERNAL_PAGES = new Set(['design-system.html']);
const indexable = htmlFiles
  .filter(f => !f.startsWith('google'))
  .filter(f => !INTERNAL_PAGES.has(f))
  .sort();

// Generate _redirects: 301 .html paths to their clean form so old links keep working.
const redirects = indexable
  .map(f => `/${f}  ${cleanPath(f)}  301!`)
  .join('\n');
writeFileSync(resolve(distDir, '_redirects'), redirects + '\n');
log(`🔀 generated _redirects — ${indexable.length} entries`);

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
log(`🧭 generated sitemap.xml — ${indexable.length} URLs (lastmod ${today})`);

// Inject a "More tools" cross-link block before the footer on every tool
// page (not on index — it already lists every tool). Keeps internal-link
// equity flowing across the suite without hand-editing each tool file.
const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function faqBlock(slug) {
  const tool = tools.tools.find(t => t.slug === slug);
  if (!tool || !tool.faqs?.length) return '';
  const items = tool.faqs.map(({ q, a }) => `<details class="group rounded-lg border border-gray-800 hover:border-gray-700 transition-colors open:border-gray-700">
        <summary class="cursor-pointer list-none px-4 py-3 text-sm font-medium text-gray-200 flex items-center justify-between gap-3 select-none">
          <span>${escHtml(q)}</span>
          <span class="text-gray-500 transition-transform group-open:rotate-180" aria-hidden="true">▾</span>
        </summary>
        <div class="px-4 pb-4 text-sm text-gray-400 leading-relaxed">${escHtml(a)}</div>
      </details>`).join('\n      ');
  return `<section class="max-w-[${tool.maxWidth || '1100px'}] mx-auto w-full px-6 py-8 border-t border-gray-800">
    <h2 class="text-xl font-bold text-white mb-6">FAQ</h2>
    <div class="space-y-2">
      ${items}
    </div>
  </section>
  `;
}

let faqInjected = 0;
const faqSkipped = [];
for (const html of htmlFiles) {
  if (html === 'index.html') continue;
  const slug = html.replace(/\.html$/, '');
  const block = faqBlock(slug);
  if (!block) {
    if (tools.tools.some(t => t.slug === slug)) faqSkipped.push(`${slug} (no faqs)`);
    else faqSkipped.push(`${slug} (not in tools.json)`);
    continue;
  }
  const htmlPath = resolve(distDir, html);
  const content = readFileSync(htmlPath, 'utf8');
  writeFileSync(htmlPath, content.replace(/<footer/, `${block}<footer`));
  faqInjected++;
}
log(`❓ FAQ block injection — ${faqInjected} pages${faqSkipped.length ? ` (skipped: ${faqSkipped.join(', ')})` : ''}`);

function crossToolBlock(currentSlug) {
  const current = tools.tools.find(t => t.slug === currentSlug);
  const others = tools.tools.filter(t => t.slug !== currentSlug);
  const cards = others.map(t => `<a href="/${t.slug}" class="group flex items-start gap-3 p-3 rounded-lg border border-gray-800 hover:border-blue-400 transition-colors no-underline">
        <span class="text-xl shrink-0 leading-none mt-0.5" aria-hidden="true">${t.icon}</span>
        <span class="min-w-0 flex-1">
          <span class="block text-sm font-medium text-white group-hover:text-blue-400 transition-colors">${escHtml(t.name)}</span>
          <span class="block text-xs text-gray-500 mt-0.5 line-clamp-2">${escHtml(t.description)}</span>
        </span>
      </a>`).join('\n      ');
  return `<section class="max-w-[${current?.maxWidth || '1100px'}] mx-auto w-full px-6 py-8 border-t border-gray-800">
    <h2 class="text-xl font-bold text-white mb-6">More tools</h2>
    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
      ${cards}
    </div>
  </section>
  `;
}

let crossInjected = 0;
const crossSkipped = [];
for (const html of htmlFiles) {
  if (html === 'index.html') continue;
  const slug = html.replace(/\.html$/, '');
  if (!tools.tools.some(t => t.slug === slug)) {
    crossSkipped.push(`${slug} (not in tools.json)`);
    continue;
  }
  const htmlPath = resolve(distDir, html);
  const content = readFileSync(htmlPath, 'utf8');
  writeFileSync(htmlPath, content.replace(/<footer/, `${crossToolBlock(slug)}<footer`));
  crossInjected++;
}
log(`🔗 cross-tool block injection — ${crossInjected} pages${crossSkipped.length ? ` (skipped: ${crossSkipped.join(', ')})` : ''}`);

// Inject JSON-LD structured data per page (WebSite for index;
// WebApplication + BreadcrumbList for each tool).
const ldScript = obj => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;

function jsonLdForPage(filename) {
  if (filename === 'index.html') {
    return [{
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE.name,
      url: SITE_HOME,
      description: SITE.description,
      publisher: {
        '@type': 'Person',
        name: SITE.publisher.name,
        url: SITE.publisher.url,
      },
    }];
  }
  const slug = filename.replace(/\.html$/, '');
  const tool = tools.tools.find(t => t.slug === slug);
  if (!tool) return [];
  const toolUrl = `${SITE_URL}/${tool.slug}`;
  const blocks = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: tool.name,
      url: toolUrl,
      description: tool.description,
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Any',
      browserRequirements: 'Requires JavaScript',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      isPartOf: { '@type': 'WebSite', name: SITE.name, url: SITE_HOME },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: SITE.name, item: SITE_HOME },
        { '@type': 'ListItem', position: 2, name: tool.name, item: toolUrl },
      ],
    },
  ];
  if (tool.faqs?.length) {
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: tool.faqs.map(({ q, a }) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    });
  }
  return blocks;
}

// Parcel's HTML minifier strips the optional </head> tag, so inject right
// before the opening <body> instead.
let ldPages = 0;
let ldBlocks = 0;
for (const html of htmlFiles) {
  const ldObjs = jsonLdForPage(html);
  if (ldObjs.length === 0) continue;
  const htmlPath = resolve(distDir, html);
  const content = readFileSync(htmlPath, 'utf8');
  const ldHtml = ldObjs.map(ldScript).join('');
  writeFileSync(htmlPath, content.replace(/<body(\s|>)/, `${ldHtml}<body$1`));
  ldPages++;
  ldBlocks += ldObjs.length;
}
log(`🏷️  JSON-LD injection — ${ldPages} pages, ${ldBlocks} structured-data blocks total`);
log(`🎉 done in ${((Date.now() - t0) / 1000).toFixed(2)}s`);
