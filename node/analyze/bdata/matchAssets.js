// node/analyze/bdata/matchAssets.js
const path = require('path');

function hexToUtf8(hex) {
      try {
        const clean = hex.replace(/[\s\r\n]/g, "");
        if (clean.length % 2 !== 0)
          return "";
        const buf = Buffer.from(clean, "hex");
        return buf.toString("utf8");
      } catch (e) {
        return "";
      }
    }
    var PATH_REGEXES = [
      // Windows absolute: C:\... or \\server\...
      /[A-Za-z]:\\[^\x00-\x1f"*?<>|]{3,260}/g,
      /\\\\[^\x00-\x1f"*?<>|\\]{1,64}\\[^\x00-\x1f"*?<>|]{3,260}/g,
      // POSIX absolute: /Users/...
      /\/(?:Users|home|Volumes|private|mnt|srv|opt|var|tmp)[^\x00-\x1f"]{3,260}/g,
      // Generic 3+ segment POSIX
      /\/[a-zA-Z0-9_\-. ]{1,64}(?:\/[a-zA-Z0-9_\-. ]{1,64}){2,}/g
    ];
    function extractStringsFromBdata(raw) {
      const results = /* @__PURE__ */ new Set();
      for (const re of PATH_REGEXES) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(raw)) !== null) {
          results.add(m[0].trim());
        }
      }
      const printableRun = /[ -~\u00A0-\uFFFF]{3,128}/g;
      let pm;
      while ((pm = printableRun.exec(raw)) !== null) {
        const s = pm[0].trim();
        if (s.length >= 3)
          results.add(s);
      }
      return [...results];
    }

function resolveBdataDeps(bdataBlobs, maps, warnings) {
      const deps = /* @__PURE__ */ new Set();
      const allBasenames = /* @__PURE__ */ new Map();
      maps.byPath.forEach((items, normFilePath) => {
        const base = path.basename(normFilePath).toLowerCase();
        if (base.length > 3) {
          if (!allBasenames.has(base))
            allBasenames.set(base, []);
          allBasenames.get(base).push(...items);
        }
      });
      for (const blob of bdataBlobs) {
        const strings = extractStringsFromBdata(blob.decoded);
        for (const s of strings) {
          const text = s.toLowerCase();
          for (const [base, items] of allBasenames.entries()) {
            if (text.includes(base) || text.endsWith(base)) {
              items.forEach((it) => deps.add(it.id));
            }
          }
        }
      }
      return deps;
    }

module.exports = { hexToUtf8, PATH_REGEXES, extractStringsFromBdata, resolveBdataDeps };
