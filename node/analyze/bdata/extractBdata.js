'use strict';

/**
 * Convert a hex string to UTF-8 text.
 */
function hexToUtf8(hex) {
  try {
    const clean = hex.replace(/[\s\r\n]/g, '');
    if (clean.length % 2 !== 0) return '';
    const buf = Buffer.from(clean, 'hex');
    return buf.toString('utf8');
  } catch (e) { return ''; }
}

/**
 * File path patterns for bdata mining.
 */
const PATH_REGEXES = [
  // Windows absolute: C:\... or \\server\...
  /[A-Za-z]:\\[^\x00-\x1f"*?<>|]{3,260}/g,
  /\\\\[^\x00-\x1f"*?<>|\\]{1,64}\\[^\x00-\x1f"*?<>|]{3,260}/g,
  // POSIX absolute: /Users/...
  /\/(?:Users|home|Volumes|private|mnt|srv|opt|var|tmp)[^\x00-\x1f"]{3,260}/g,
  // Generic 3+ segment POSIX
  /\/[a-zA-Z0-9_\-. ]{1,64}(?:\/[a-zA-Z0-9_\-. ]{1,64}){2,}/g
];

/**
 * Extract printable strings from decoded bdata.
 */
function extractStringsFromBdata(raw) {
  const results = new Set();

  // File paths
  for (const re of PATH_REGEXES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(raw)) !== null) {
      results.add(m[0].trim());
    }
  }

  // Printable run extraction (≥3 printable chars between nulls)
  const printableRun = /[ -~\u00A0-\uFFFF]{3,128}/g;
  let pm;
  while ((pm = printableRun.exec(raw)) !== null) {
    const s = pm[0].trim();
    if (s.length >= 3) results.add(s);
  }

  return [...results];
}

module.exports = { hexToUtf8, PATH_REGEXES, extractStringsFromBdata };
