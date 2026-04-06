// node/analyze/expressions/resolveExpressions.js
const path = require('path');
const acorn = require('acorn');

function walkAst(node, collector, depth) {
      if (!node || typeof node !== "object" || depth > 80)
        return;
      if (node.type === "Literal" && typeof node.value === "string" && node.value.length > 1) {
        collector.push(node.value);
      }
      if (node.type === "Property" && node.key) {
        if (node.key.type === "Identifier")
          collector.push(node.key.name);
      }
      for (const key of Object.keys(node)) {
        if (key === "start" || key === "end" || key === "type")
          continue;
        const child = node[key];
        if (Array.isArray(child))
          child.forEach((c) => walkAst(c, collector, depth + 1));
        else if (child && typeof child === "object")
          walkAst(child, collector, depth + 1);
      }
    }
    function parseWithAcorn(src) {
      let ast = null;
      for (const ver of [5, 2015, 2019, 2020]) {
        try {
          ast = acorn.parse(src, { ecmaVersion: ver, sourceType: "script" });
          break;
        } catch (e) {
        }
      }
      return ast;
    }

var DYNAMIC_PATTERNS = [
      /\beval\s*\(/,
      /\bnew\s+Function\s*\(/,
      /\bthisComp\.layer\s*\(\s*[^"'1-9]/,
      // dynamic layer lookup (not literal)
      /\.layer\s*\(\s*(?:index|name|i\b)/,
      /\bcomp\s*\(\s*[^"']/,
      // dynamic comp() lookup
      /\bfootage\s*\(\s*[^"']/,
      /\[\s*(?:[a-zA-Z_$][a-zA-Z_$0-9]*)\s*\]/,
      // computed bracket access on objects
      /\.sourceText\s*\.\s*value/,
      /\bXMLList\b|\bXML\b/
    ];
    function isDynamicExpression(src) {
      return DYNAMIC_PATTERNS.some((p) => p.test(src));
    }
    function bruteForceExtract(src) {
      const strings = [];
      const strLiterals = src.match(/["']([^"'\n]{1,128})["']/g) || [];
      strLiterals.forEach((s) => strings.push(s.replace(/^["']|["']$/g, "")));
      return strings;
    }

function analyseExpression(src) {
      if (!src || src.length < 2)
        return { strings: [], isDynamic: false };
      const dynamic = isDynamicExpression(src);
      if (dynamic)
        return { strings: [], isDynamic: true };
      const strings = [];
      const ast = parseWithAcorn(src);
      if (ast) {
        walkAst(ast, strings, 0);
      } else {
        strings.push(...bruteForceExtract(src));
      }
      return { strings, isDynamic: false };
    }
    function resolveExpressionDeps(expressions, maps, warnings) {
      const deps = /* @__PURE__ */ new Set();
      let dynamicCount = 0;
      for (const expr of expressions) {
        const { strings, isDynamic } = analyseExpression(expr.expression);
        if (isDynamic) {
          dynamicCount++;
          warnings.push(
            'Dynamic expression in "' + expr.propName + '" \u2014 treating as UNUSED (aggressive mode). Preview: ' + expr.expression.substring(0, 60).replace(/\n/g, " ")
          );
          continue;
        }
        for (const s of strings) {
          const hits = maps.byName.get(s);
          if (hits)
            hits.forEach((h) => deps.add(h.id));
          const sLow = s.toLowerCase();
          maps.byPath.forEach((items, normFilePath) => {
            const base = path.basename(normFilePath).toLowerCase();
            if (base === sLow || normFilePath.toLowerCase().endsWith(sLow)) {
              items.forEach((it) => deps.add(it.id));
            }
          });
        }
      }
      return { deps, dynamicCount };
    }

module.exports = { walkAst, parseWithAcorn, DYNAMIC_PATTERNS, isDynamicExpression, bruteForceExtract, analyseExpression, resolveExpressionDeps };
