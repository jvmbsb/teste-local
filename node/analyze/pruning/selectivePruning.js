'use strict';

const { expandExternalLayers } = require('../solo/soloResolver');

/**
 * Apply extreme pruning (differential pruning) loop.
 */
function applyExtremePruning(allItems, preReachable, processedStandard, maps, allCompsData, globalExprReferencedNames, graph, whitelist, layersToRemove, warnings, log) {
  const externalCompsManifest = [];
  const compsToCollect = [];
  
  for (const item of allItems) {
    if (item.type === 'CompItem' && preReachable.has(item.id) && !processedStandard.has(item.id)) {
      compsToCollect.push(item.id);
    }
  }

  for (const extId of compsToCollect) {
    const extItem = maps.byId.get(extId);
    const comp = allCompsData.get(extId);
    if (!extItem || !comp) continue;

    const extremeSeeds = new Set();
    for (const layer of comp.layers) {
      if (layer.name && globalExprReferencedNames.has(layer.name.toLowerCase())) {
        extremeSeeds.add(layer.id);
      }
      if (layer.effectLayerReferences && layer.effectLayerReferences.length > 0) {
        layer.effectLayerReferences.forEach(eid => extremeSeeds.add(eid));
      }
    }

    const requiredLayerIds = [...expandExternalLayers(comp, [...extremeSeeds], maps, warnings)];
    const reqSet = new Set(requiredLayerIds);

    for (const layer of comp.layers) {
      if (reqSet.has(layer.id)) {
        whitelist.push({ compId: comp.id, compName: comp.name, layerId: layer.id, layerName: layer.name, reason: 'extreme-required' });
        if (layer.sourceId) graph.link(comp.id, layer.sourceId);
      } else {
        layersToRemove.push({ compId: comp.id, compName: comp.name, layerId: layer.id });
      }
    }

    externalCompsManifest.push({
      compId:         extId,
      compName:       extItem.name,
      requiredLayers: requiredLayerIds
    });

    log('Extreme Pruning "' + extItem.name + '": kept ' + requiredLayerIds.length + ' layers.');
  }

  return { externalCompsManifest, compsToCollect };
}

module.exports = { applyExtremePruning };
