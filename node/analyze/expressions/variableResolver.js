'use strict';

const path = require('path');
const { parseWithAcorn, walkAst } = require('./parseAST');
const { isDynamicExpression, bruteForceExtract } = require('./bruteForce');

/**
 * combines AST + brute force + dynamic check.
 */
function analyseExpression(src) {
  if (!src || src.length < 2) return { strings: [], isDynamic: false };

  const dynamic = isDynamicExpression(src);
  if (dynamic) return { strings: [], isDynamic: true };

  const strings = [];
  const ast = parseWithAcorn(src);

  if (ast) {
    walkAst(ast, strings, 0);
  } else {
    // Fallback: naive string literal extraction
    strings.push(...bruteForceExtract(src));
  }

  return { strings, isDynamic: false };
}

/**
 * Resolves expression strings to item IDs.
 */
function resolveExpressionDeps(expressions, maps, warnings) {
  const deps = new Set();
  let dynamicCount = 0;

  for (const expr of expressions) {
    const { strings, isDynamic } = analyseExpression(expr.expression);

    if (isDynamic) {
      dynamicCount++;
      warnings.push(
        'Dynamic expression in "' + expr.propName + '" — treating as UNUSED (aggressive mode). ' +
        'Preview: ' + expr.expression.substring(0, 60).replace(/\n/g, ' ')
      );
      continue;
    }

    for (const s of strings) {
      // Match against item names
      const hits = maps.byName.get(s);
      if (hits) hits.forEach(h => deps.add(h.id));

      // Match against file paths (filename or basename)
      const sLow = s.toLowerCase();
      maps.byPath.forEach((items, normFilePath) => {
        const base = path.basename(normFilePath).toLowerCase();
        if (base === sLow || normFilePath.toLowerCase().endsWith(sLow)) {
          items.forEach(it => deps.add(it.id));
        }
      });
    }
  }

  return { deps, dynamicCount };
}

module.exports = { analyseExpression, resolveExpressionDeps };
