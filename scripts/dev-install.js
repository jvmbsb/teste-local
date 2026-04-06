/**
 * DeepClean v2 — Developer Install Script
 *
 * Creates a symlink from the Adobe CEP extensions directory to this project.
 * Also enables PlayerDebugMode so unsigned extensions load.
 *
 * Usage:
 *   node scripts/dev-install.js          (macOS / Windows admin terminal)
 *
 * IMPORTANT on Windows: run from an Administrator terminal.
 */

'use strict';

const fs    = require('fs');
const path  = require('path');
const os    = require('os');
const { execSync } = require('child_process');

const BUNDLE_ID  = 'com.deepclean.aep';
const ROOT       = path.resolve(__dirname, '..');
const BUNDLE_PATH = path.join(ROOT, 'node', 'analyze.bundle.js');

// ── Step 1: Verify bundle exists ──────────────────────────────────────────────
if (!fs.existsSync(BUNDLE_PATH)) {
  console.warn('⚠  analyze.bundle.js not found.');
  console.warn('   Run: npm install && node build.js');
  console.warn('   Then re-run this script.\n');
} else {
  const kb = (fs.statSync(BUNDLE_PATH).size / 1024).toFixed(0);
  console.log('✓ Bundle found: ' + kb + ' KB');
}

// ── Step 2: Locate CEP extensions folder ──────────────────────────────────────
function getCepDir() {
  const plat = os.platform();
  if (plat === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Adobe', 'CEP', 'extensions');
  } else if (plat === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'Adobe', 'CEP', 'extensions');
  }
  throw new Error('Unsupported platform: ' + plat);
}

// ── Step 3: Enable debug mode ─────────────────────────────────────────────────
function enableDebugMode() {
  const plat = os.platform();
  if (plat === 'darwin') {
    const keys = ['CSXS.11','CSXS.10','CSXS.9','CSXS.8'];
    let ok = true;
    keys.forEach(k => {
      try { execSync('defaults write com.adobe.' + k + ' PlayerDebugMode 1', { stdio: 'pipe' }); }
      catch (e) { ok = false; }
    });
    if (ok) console.log('✓ PlayerDebugMode enabled (macOS plist)');
    else    console.warn('  Could not set all PlayerDebugMode keys — try manually');
  } else if (plat === 'win32') {
    const keys = [
      'HKCU\\Software\\Adobe\\CSXS.11',
      'HKCU\\Software\\Adobe\\CSXS.10',
      'HKCU\\Software\\Adobe\\CSXS.9'
    ];
    keys.forEach(k => {
      try { execSync('reg add "' + k + '" /v PlayerDebugMode /t REG_SZ /d 1 /f', { stdio: 'pipe' }); }
      catch (e) {}
    });
    console.log('✓ PlayerDebugMode enabled (Windows registry)');
  }
}

// ── Step 4: Create symlink ────────────────────────────────────────────────────
try {
  const cepDir  = getCepDir();
  const linkPath = path.join(cepDir, BUNDLE_ID);

  if (!fs.existsSync(cepDir)) { fs.mkdirSync(cepDir, { recursive: true }); }

  if (fs.existsSync(linkPath)) {
    const stat = fs.lstatSync(linkPath);
    if (stat.isSymbolicLink()) {
      fs.unlinkSync(linkPath);
      console.log('Removed existing symlink: ' + linkPath);
    } else {
      console.error('ERROR: ' + linkPath + ' exists and is NOT a symlink.');
      console.error('Remove it manually and retry.');
      process.exit(1);
    }
  }

  fs.symlinkSync(ROOT, linkPath, 'dir');
  console.log('✓ Symlink created:');
  console.log('  ' + linkPath);
  console.log('  → ' + ROOT);

  enableDebugMode();

  console.log('\n✅ Dev install complete!');
  console.log('   1. Restart Adobe After Effects');
  console.log('   2. Window → Extensions → DeepClean\n');

} catch (err) {
  console.error('\nERROR: ' + err.message);
  if (err.code === 'EPERM' || err.code === 'EACCES') {
    console.error('On Windows: run this script from an Administrator terminal.');
    console.error('On macOS: try with sudo.');
  }
  process.exit(1);
}
