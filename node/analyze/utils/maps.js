'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * Windows long-path prefix, URI decoding, and tilde expansion.
 */
function normPath(p) {
  if (!p || typeof p !== 'string') return p;
  
  try {
    p = decodeURIComponent(p);
  } catch(e) {
    try { p = decodeURI(p); } catch(e2) {}
  }

  if (p.startsWith('~/') || p.startsWith('~\\')) {
    p = path.join(os.homedir(), p.slice(2));
  } else if (p === '~') {
    p = os.homedir();
  }

  p = path.normalize(p);

  if (process.platform === 'win32' && p.length > 200 && !p.startsWith('\\\\?\\')) {
    if (p.startsWith('\\\\')) {
      return '\\\\?\\UNC\\' + p.slice(2);
    } else {
      return '\\\\?\\' + p;
    }
  }
  return p;
}

/**
 * Multi-strategy file existence check.
 */
function fileExists(p, projectDir) {
  if (!p || p.length === 0) return false;
  let np = normPath(p);
  try { if (fs.existsSync(np)) return true; } catch (e) {}

  // Fallback 1: Drive mapping removal (Windows specific)
  if (process.platform === 'win32') {
    const volMatch = np.match(/^\\\\?\\.*?\\([a-zA-Z])\\(.*)/) || np.match(/^\/([a-zA-Z])\/(.*)/) || np.match(/^\\([a-zA-Z])\\(.*)/);
    if (volMatch) {
      const volPath = volMatch[1].toUpperCase() + ':\\' + volMatch[2].replace(/\//g, '\\');
      try { if (fs.existsSync(volPath)) return true; } catch(e) {}
    }
  }

  // Fallback 2: Project relative
  if (projectDir) {
    const base = path.basename(np);
    const relPath = path.join(projectDir, base);
    try { if (fs.existsSync(relPath)) return true; } catch(e) {}
  }
  return false;
}

/**
 * Build item maps for fast lookup.
 */
function buildItemMaps(allItems) {
  const byId   = new Map();
  const byName = new Map();
  const byPath = new Map();

  for (const item of allItems) {
    byId.set(item.id, item);

    if (!byName.has(item.name)) byName.set(item.name, []);
    byName.get(item.name).push(item);

    if (item.filePath && item.filePath.length > 3) {
      const norm = normPath(item.filePath).toLowerCase();
      if (!byPath.has(norm)) byPath.set(norm, []);
      byPath.get(norm).push(item);
    }
  }
  return { byId, byName, byPath };
}

module.exports = {
  normPath,
  fileExists,
  buildItemMaps
};
