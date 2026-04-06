/**
 * DeepClean v2 — Build Script
 *
 * Bundles node/analyze.src.js + all npm deps into node/analyze.bundle.js
 * The bundle is self-contained: no npm install needed by end users.
 *
 * Usage (developer):
 *   node build.js
 *   node build.js --watch
 *
 * Prerequisites:
 *   npm install   (installs esbuild as devDependency)
 *
 * Output:
 *   node/analyze.bundle.js  (~300 KB — shipped with extension)
 */

'use strict';

const path  = require('path');
const fs    = require('fs');

const ROOT   = __dirname;
const SRC    = path.join(ROOT, 'node', 'analyze', 'index.js');
const OUT    = path.join(ROOT, 'node', 'analyze.bundle.js');
const WATCH  = process.argv.includes('--watch');

if (!fs.existsSync(SRC)) {
  console.error('ERROR: Source not found: ' + SRC);
  process.exit(1);
}

// Ensure esbuild is installed
let esbuild;
try {
  esbuild = require('esbuild');
} catch (e) {
  console.error('esbuild not found. Run: npm install');
  process.exit(1);
}

const config = {
  entryPoints: [SRC],
  bundle:      true,
  platform:    'node',
  target:      'node14',       // CEP ships Node 14+
  outfile:     OUT,
  external:    ['electron'],   // never used, but esbuild flags it otherwise
  minify:      false,          // keep readable for debugging
  sourcemap:   false,
  logLevel:    'info',
};

if (WATCH) {
  esbuild.context(config).then(ctx => {
    ctx.watch();
    console.log('Watching for changes…');
  });
} else {
  esbuild.build(config).then(() => {
    const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
    console.log('\n✓ Bundle written: ' + OUT);
    console.log('  Size: ' + kb + ' KB');
    console.log('  Target: Node 14 (CEP compatible)');
    console.log('\nThe extension is ready — no npm install required by end users.\n');
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
