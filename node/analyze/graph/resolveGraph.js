'use strict';

const { resolveExpressionDeps } = require('../expressions/variableResolver');

/**
 * Standard comp clean traversal.
 */
function processCompAsStandard(compId, selComp, maps, graph, standardCleanQueue, whitelist, layersToRemove, warnings, globalExprReferencedNames, log) {
  if (!selComp) return;

  log('Standard Comp Clean: "' + selComp.name + '" (' + selComp.layers.length + ' layers)');
  const parentIds = new Set();
  const matteIds = new Set();
  const effectReferencedLayerIds = new Set();

  selComp.layers.forEach(l => {
    if (l.parentId) parentIds.add(l.parentId);
    if (l.hasTrackMatte) {
      matteIds.add(l.id);     
      if (l.trackMatteTargetId) matteIds.add(l.trackMatteTargetId);
    }
    if (l.isTrackMatte) matteIds.add(l.id);
    if (l.effectLayerReferences && l.effectLayerReferences.length > 0) {
      l.effectLayerReferences.forEach(id => effectReferencedLayerIds.add(id));
    }
  });

  for (const layer of selComp.layers) {
    let keep   = false;
    const reasons = [];

    // ── Determine KEEP status 
    if (layer.name && layer.name.toUpperCase().startsWith('[KEEP]')) {
      keep = true; reasons.push('keep-tag');
    } else if (layer.enabled) {
      keep = true; reasons.push('enabled');
    } else if (layer.guideLayer) {
      keep = true; reasons.push('guide');
    } else if (parentIds.has(layer.id)) {
      keep = true; reasons.push('is-parent');
    } else if (matteIds.has(layer.id)) {
      keep = true; reasons.push('track-matte');
    } else if (effectReferencedLayerIds.has(layer.id)) {
      keep = true; reasons.push('effect-target');
    } else if (layer.isNull) {
      keep = true; reasons.push('is-null-object');
    } else if (layer.effectMatchNames && layer.effectMatchNames.length > 0 && layer.expressions && layer.expressions.length > 0) {
      keep = true; reasons.push('has-fx-and-expr');
    } else if (layer.name && globalExprReferencedNames.has(layer.name.toLowerCase())) {
      keep = true; reasons.push('expr-target-global');
    }

    if (keep) {
      if (layer.sourceId) {
        const srcItem = maps.byId.get(layer.sourceId);
        if (srcItem) {
          graph.link(selComp.id, layer.sourceId);
          reasons.push('source:' + srcItem.name);
          if (srcItem.type === 'CompItem') {
            standardCleanQueue.push(srcItem.id); // Triggers recursive nested cleanup
          }
        }
      }
      if (layer.effectMatchNames && layer.effectMatchNames.length > 0) {
        reasons.push('effects:' + layer.effectMatchNames.length);
      }
      if (layer.expressions && layer.expressions.length > 0) {
        const { deps, dynamicCount } = resolveExpressionDeps(layer.expressions, maps, warnings);
        deps.forEach(depId => graph.link(selComp.id, depId));
        if (deps.size > 0) reasons.push('expr-deps:' + deps.size);
        if (dynamicCount > 0) reasons.push('dynamic-exprs:' + dynamicCount);
      }

      whitelist.push({ compId: selComp.id, compName: selComp.name, layerId: layer.id, layerName: layer.name, reason: reasons.join(',') });
    } else {
      layersToRemove.push({ compId: selComp.id, compName: selComp.name, layerId: layer.id });
    }
  }
}

/**
 * BFS queue driving processCompAsStandard.
 */
function runStandardCleanQueue(selectedIds, allCompsData, maps, graph, whitelist, layersToRemove, warnings, globalExprReferencedNames, log) {
  const processedStandard = new Set();
  const standardCleanQueue = [...selectedIds];

  while (standardCleanQueue.length > 0) {
    const cid = standardCleanQueue.shift();
    if (!processedStandard.has(cid)) {
      processedStandard.add(cid);
      const selComp = allCompsData.get(cid);
      processCompAsStandard(cid, selComp, maps, graph, standardCleanQueue, whitelist, layersToRemove, warnings, globalExprReferencedNames, log);
    }
  }
  return processedStandard;
}

module.exports = { processCompAsStandard, runStandardCleanQueue };
