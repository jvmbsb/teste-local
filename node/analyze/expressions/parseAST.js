'use strict';

const acorn = require('acorn');

/**
 * Walk an acorn AST and collect all string literal values and identifiers.
 */
function walkAst(node, collector, depth) {
  if (!node || typeof node !== 'object' || depth > 80) return;
  if (node.type === 'Literal' && typeof node.value === 'string' && node.value.length > 1) {
    collector.push(node.value);
  }
  // Property keys
  if (node.type === 'Property' && node.key) {
    if (node.key.type === 'Identifier') collector.push(node.key.name);
  }
  for (const key of Object.keys(node)) {
    if (key === 'start' || key === 'end' || key === 'type') continue;
    const child = node[key];
    if (Array.isArray(child)) child.forEach(c => walkAst(c, collector, depth + 1));
    else if (child && typeof child === 'object') walkAst(child, collector, depth + 1);
  }
}

/**
 * Parse expression source using Acorn.
 */
function parseWithAcorn(src) {
  let ast = null;
  for (const ver of [5, 2015, 2019, 2020]) {
    try {
      ast = acorn.parse(src, { ecmaVersion: ver, sourceType: 'script' });
      break;
    } catch (e) {}
  }
  return ast;
}

module.exports = { walkAst, parseWithAcorn };
