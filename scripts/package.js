/**
 * DeepClean v2 — ZXP Packager
 *
 * Packs the extension into a distributable .zip (rename to .zxp for signing).
 * Sign with Adobe ZXPSignCmd for production distribution.
 *
 * Usage:
 *   node scripts/package.js
 *
 * Output:
 *   dist/DeepClean-2.0.0.zip
 */

'use strict';

const path    = require('path');
const fs      = require('fs');
const { execSync } = require('child_process');

const ROOT    = path.resolve(__dirname, '..');
const VERSION = '2.0.0';
const DIST    = path.join(ROOT, 'dist');
const OUT     = path.join(DIST, 'DeepClean-' + VERSION + '.zip');

// Check bundle exists
const BUNDLE = path.join(ROOT, 'node', 'analyze.bundle.js');
if (!fs.existsSync(BUNDLE)) {
  console.error('ERROR: analyze.bundle.js not found. Run: node build.js first.');
  process.exit(1);
}

if (!fs.existsSync(DIST)) fs.mkdirSync(DIST);

// Files/dirs to include
const INCLUDE = ['CSXS', 'jsx', 'node', 'panel', '.debug'];
// Within node/ — exclude source deps (bundle is self-contained)
const EXCLUDE_PATTERNS = [
  'node/node_modules',
  'node/analyze.src.js',
  'node/package.json',
  'node/package-lock.json',
  'node_modules',
  'dist',
  'scripts',
  '.git',
  'build.js',
  'package.json',
  'package-lock.json'
];

// Use system zip (available on macOS/Linux; on Windows use 7z or PowerShell)
const platform = process.platform;

if (platform === 'win32') {
  // PowerShell Compress-Archive
  const includeStr = INCLUDE.map(i => '"' + path.join(ROOT, i) + '"').join(',');
  const cmd = `powershell -Command "Compress-Archive -Path ${includeStr} -DestinationPath '${OUT}' -Force"`;
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
  } catch (e) {
    console.error('PowerShell zip failed: ' + e.message);
    process.exit(1);
  }
} else {
  // macOS/Linux: use zip
  const excludeArgs = EXCLUDE_PATTERNS.map(p => '--exclude "' + p + '/*"').join(' ');
  const includeArgs = INCLUDE.join(' ');
  const cmd = `zip -r "${OUT}" ${includeArgs} ${excludeArgs}`;
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
  } catch (e) {
    console.error('zip failed: ' + e.message);
    process.exit(1);
  }
}

if (fs.existsSync(OUT)) {
  const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
  console.log('\n✓ Package: ' + OUT + ' (' + kb + ' KB)');
  console.log('\nTo sign for distribution:');
  console.log('  ZXPSignCmd -selfSignedCert US CA Company alias pass cert.p12');
  console.log('  ZXPSignCmd -sign . dist/DeepClean-' + VERSION + '.zxp cert.p12 pass\n');
} else {
  console.error('ERROR: Output file not created.');
  process.exit(1);
}
