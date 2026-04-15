'use strict';

/**
 * Patterns that indicate a dynamic/unresolvable expression.
 */
const DYNAMIC_PATTERNS = [
  /\beval\s*\(/,
  /\bnew\s+Function\s*\(/,
  /\bthisComp\.layer\s*\(\s*[^"'1-9]/, // dynamic layer lookup (not literal)
  /\.layer\s*\(\s*(?:index|name|i\b)/,
  /\bcomp\s*\(\s*[^"']/,               // dynamic comp() lookup
  /\bfootage\s*\(\s*[^"']/,
  /\[\s*(?:[a-zA-Z_$][a-zA-Z_$0-9]*)\s*\]/, // computed bracket access on objects
  /\.sourceText\s*\.\s*value/,
  /\bXMLList\b|\bXML\b/,
];

function isDynamicExpression(src) {
  return DYNAMIC_PATTERNS.some(p => p.test(src));
}

/**
 * Fallback regex string literal extraction for broken ES3 expressions.
 */
function bruteForceExtract(src) {
  const strings = [];
  const strLiterals = src.match(/["']([^"'\n]{1,128})["']/g) || [];
  strLiterals.forEach(s => strings.push(s.replace(/^["']|["']$/g, '')));
  return strings;
}

module.exports = { DYNAMIC_PATTERNS, isDynamicExpression, bruteForceExtract };
