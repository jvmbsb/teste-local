'use strict';

const { fileExists } = require('./maps');

const LOG_PREFIX = '[ANALYZE]';

function log(msg)  { process.stdout.write(LOG_PREFIX + ' ' + msg + '\n'); }
function warn(msg) { process.stdout.write('[WARN]    ' + msg + '\n'); }

/**
 * Missing file checks.
 */
function validatePaths(allItems, warnings, projectDir) {
  let missing = 0;
  for (const item of allItems) {
    if (item.filePath && item.filePath.length > 3 && !fileExists(item.filePath, projectDir)) {
      warnings.push('Missing on disk: "' + item.name + '" → ' + item.filePath);
      missing++;
    }
  }
  if (missing > 0) log('Missing files: ' + missing);
}

/**
 * Builds globalExprReferencedNames Set.
 * Note: analyseExpression should be passed in or required to avoid circular dependency.
 */
function indexExpressions(compArray, analyseExpression, globalExprReferencedNames) {
  if (!compArray) return;
  for (const comp of compArray) {
    if (!comp.layers) continue;
    for (const l of comp.layers) {
      if (l.expressions && l.expressions.length > 0) {
        l.expressions.forEach(expr => {
          const { strings } = analyseExpression(expr.expression);
          strings.forEach(s => globalExprReferencedNames.add(s.toLowerCase()));
        });
      }
    }
  }
}

module.exports = {
  log,
  warn,
  validatePaths,
  indexExpressions
};
