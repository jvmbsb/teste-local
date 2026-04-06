'use strict';

const { resolveExpressionDeps } = require('../expressions/variableResolver');

/**
 * Expand external layers to include parent chain + expression dependencies.
 */
function expandExternalLayers(extCompEntry, seedIds, maps, warnings) {
  const layers    = extCompEntry.layers || [];
  const byId      = new Map(layers.map(l => [l.id, l]));
  const required  = new Set(seedIds);
  const queue     = [...seedIds];

  while (queue.length > 0) {
    const id = queue.shift();
    const layer = byId.get(id);
    if (!layer) continue;

    // Parent chain
    if (layer.parentId && !required.has(layer.parentId)) {
      required.add(layer.parentId);
      queue.push(layer.parentId);
    }

    if (layer.expressions && layer.expressions.length > 0) {
      const { deps } = resolveExpressionDeps(layer.expressions, maps, warnings);
      for (const layer2 of layers) {
        if (layer2.sourceId && deps.has(layer2.sourceId)) {
          if (!required.has(layer2.id)) {
            required.add(layer2.id);
            queue.push(layer2.id);
          }
        }
      }
    }
  }

  return required;
}

module.exports = { expandExternalLayers };
