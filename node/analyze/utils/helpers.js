// node/analyze/utils/helpers.js
const fs = require('fs');
const path = require('path');
const os = require('os');

function normPath(p) {
      if (!p || typeof p !== "string")
        return p;
      try {
        p = decodeURIComponent(p);
      } catch (e) {
        try {
          p = decodeURI(p);
        } catch (e2) {
        }
      }
      if (p.startsWith("~/") || p.startsWith("~\\")) {
        p = path.join(os.homedir(), p.slice(2));
      } else if (p === "~") {
        p = os.homedir();
      }
      p = path.normalize(p);
      if (process.platform === "win32" && p.length > 200 && !p.startsWith("\\\\?\\")) {
        if (p.startsWith("\\\\")) {
          return "\\\\?\\UNC\\" + p.slice(2);
        } else {
          return "\\\\?\\" + p;
        }
      }
      return p;
    }
    function fileExists(p, projectDir) {
      if (!p || p.length === 0)
        return false;
      let np = normPath(p);
      try {
        if (fs.existsSync(np))
          return true;
      } catch (e) {
      }
      if (process.platform === "win32") {
        const volMatch = np.match(/^\\\\?\\.*?\\([a-zA-Z])\\(.*)/) || np.match(/^\/([a-zA-Z])\/(.*)/) || np.match(/^\\([a-zA-Z])\\(.*)/);
        if (volMatch) {
          const volPath = volMatch[1].toUpperCase() + ":\\" + volMatch[2].replace(/\//g, "\\");
          try {
            if (fs.existsSync(volPath))
              return true;
          } catch (e) {
          }
        }
      }
      if (projectDir) {
        const base = path.basename(np);
        const relPath = path.join(projectDir, base);
        try {
          if (fs.existsSync(relPath))
            return true;
        } catch (e) {
        }
      }
      return false;
    }
    function buildItemMaps(allItems) {
      const byId = /* @__PURE__ */ new Map();
      const byName = /* @__PURE__ */ new Map();
      const byPath = /* @__PURE__ */ new Map();
      for (const item of allItems) {
        byId.set(item.id, item);
        if (!byName.has(item.name))
          byName.set(item.name, []);
        byName.get(item.name).push(item);
        if (item.filePath && item.filePath.length > 3) {
          const norm = normPath(item.filePath).toLowerCase();
          if (!byPath.has(norm))
            byPath.set(norm, []);
          byPath.get(norm).push(item);
        }
      }
      return { byId, byName, byPath };
    }

var LOG_PREFIX = "[ANALYZE]";
    function log(msg) {
      process.stdout.write(LOG_PREFIX + " " + msg + "\n");
    }
    function warn(msg) {
      process.stdout.write("[WARN]    " + msg + "\n");
    }
    function validatePaths(allItems, warnings, projectDir) {
      let missing = 0;
      for (const item of allItems) {
        if (item.filePath && item.filePath.length > 3 && !fileExists(item.filePath, projectDir)) {
          warnings.push('Missing on disk: "' + item.name + '" \u2192 ' + item.filePath);
          missing++;
        }
      }
      if (missing > 0)
        log("Missing files: " + missing);
    }
    function indexExpressions(compArray, analyseExpression, globalExprReferencedNames) {
      if (!compArray)
        return;
      for (const comp of compArray) {
        if (!comp.layers)
          continue;
        for (const l of comp.layers) {
          if (l.expressions && l.expressions.length > 0) {
            l.expressions.forEach((expr) => {
              const { strings } = analyseExpression(expr.expression);
              strings.forEach((s) => globalExprReferencedNames.add(s.toLowerCase()));
            });
          }
        }
      }
    }

module.exports = { normPath, fileExists, buildItemMaps, log, warn, validatePaths, indexExpressions };
