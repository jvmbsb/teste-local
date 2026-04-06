'use strict';

const path = require('path');
const { extractStringsFromBdata } = require('./extractBdata');

/**
 * Resolves items referenced by bdata blobs.
 */
function resolveBdataDeps(bdataBlobs, maps, warnings) {
  const deps = new Set();
  
  // Cache root basenames to match inside hex logs
  const allBasenames = new Map();
  maps.byPath.forEach((items, normFilePath) => {
    const base = path.basename(normFilePath).toLowerCase();
    if (base.length > 3) {
      if (!allBasenames.has(base)) allBasenames.set(base, []);
      allBasenames.get(base).push(...items);
    }
  });

  for (const blob of bdataBlobs) {
    const strings = extractStringsFromBdata(blob.decoded);
    for (const s of strings) {
      const sLow = s.toLowerCase();
      // Only match basename containment
      for (const [base, items] of allBasenames.entries()) {
        if (sLow.includes(base)) {
          items.forEach(it => deps.add(it.id));
        }
      }
    }
  }

  return deps;
}

module.exports = { resolveBdataDeps };
