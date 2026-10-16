// Construction d’Apogée dans dist/ (esbuild) ; --serve pour un serveur local de développement.
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const serve = process.argv.includes('--serve');
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
cpSync('public', 'dist', { recursive: true });
cpSync('index.html', 'dist/index.html');

const options = {
  entryPoints: { app: 'src/main.tsx', auth: 'src/auth.ts' },
  bundle: true,
  outdir: 'dist',
  format: 'esm',
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]',
  target: ['es2020', 'chrome90', 'safari15'],
  minify: !serve,
  sourcemap: serve,
  loader: { '.json': 'json' },
  define: { 'process.env.NODE_ENV': serve ? '"development"' : '"production"' },
  jsx: 'automatic',
  legalComments: 'none',
  logLevel: 'info',
};

function walk(dir, base = dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p, base) : [p.slice(base.length + 1).replace(/\\/g, '/')];
  });
}

// Les modules de démarrage sont annoncés dans index.html : le navigateur les télécharge en parallèle d'app.js
// (sans cela : HTML, puis app.js, puis les modules, une attente réseau de plus à chaque niveau).
function preloadChunks() {
  const seen = new Set();
  const visit = (file) => {
    const src = readFileSync(join('dist', file), 'utf8');
    for (const m of src.matchAll(/(?:from|import)\s*"\.\/(chunks\/[^"]+\.js)"/g)) if (!seen.has(m[1])) { seen.add(m[1]); visit(m[1]); }
  };
  visit('app.js');
  const tags = [...seen].map((f) => `  <link rel="modulepreload" href="${f}">`).join('\n');
  const html = readFileSync('dist/index.html', 'utf8');
  const all = '  <link rel="modulepreload" href="app.js">\n' + tags;
  if (!html.includes('  <!-- modulepreload -->')) throw new Error('marqueur modulepreload absent de index.html');
  writeFileSync('dist/index.html', html.replace('  <!-- modulepreload -->', all));
  console.log('modulepreload', seen.size, 'modules');
}

function writeServiceWorker() {
  const files = walk('dist').filter((f) => !f.endsWith('.map') && f !== 'sw.js' && f !== 'auth.html' && f !== 'auth.js');
  const hash = createHash('sha256');
  for (const f of files) hash.update(readFileSync(join('dist', f)));
  const version = hash.digest('hex').slice(0, 10);
  const sw = readFileSync('src/sw.template.js', 'utf8')
    .replace('__VERSION__', version)
    .replace('__FILES__', JSON.stringify(['./', ...files.filter((f) => f !== 'index.html')]));
  writeFileSync('dist/sw.js', sw);
  console.log('service worker', version, files.length, 'fichiers');
}

if (serve) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: 'dist', port: 5173, host: '127.0.0.1' });
  console.log('http://127.0.0.1:' + port);
} else {
  await esbuild.build(options);
  preloadChunks();
  writeServiceWorker();
}
