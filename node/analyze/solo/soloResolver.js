// node/analyze/solo/soloResolver.js
const { resolveExpressionDeps } = require('../expressions/resolveExpressions.js');

function expandExternalLayers(extCompEntry, seedIds, maps, warnings) {
      let layers = extCompEntry.layers || [];
      const hasSolo = layers.some((l) => l.solo === true);
      if (hasSolo) {
        layers = layers.filter((l) => l.solo === true);
      }
      const byId = new Map(layers.map((l) => [l.id, l]));
      const required = new Set(seedIds);
      const queue = [...seedIds];
      while (queue.length > 0) {
        const id = queue.shift();
        const layer = byId.get(id);
        if (!layer)
          continue;
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

function applyExtremePruning(allItems, preReachable, processedStandard, maps, allCompsData, globalExprReferencedNames, graph, whitelist, layersToRemove, warnings, log) {
      const externalCompsManifest = [];
      const compsToCollect = [];
      for (const item of allItems) {
        if (item.type === "CompItem" && preReachable.has(item.id) && !processedStandard.has(item.id)) {
          compsToCollect.push(item.id);
        }
      }
      for (const extId of compsToCollect) {
        const extItem = maps.byId.get(extId);
        const comp = allCompsData.get(extId);
        if (!extItem || !comp)
          continue;
        const extremeSeeds = /* @__PURE__ */ new Set();
        for (const layer of comp.layers) {
          if (layer.name && globalExprReferencedNames.has(layer.name.toLowerCase())) {
            extremeSeeds.add(layer.id);
          }
          if (layer.effectLayerReferences && layer.effectLayerReferences.length > 0) {
            layer.effectLayerReferences.forEach((eid) => extremeSeeds.add(eid));
          }
        }
        const requiredLayerIds = [...expandExternalLayers(comp, [...extremeSeeds], maps, warnings)];
        const reqSet = new Set(requiredLayerIds);
        for (const layer of comp.layers) {
          if (reqSet.has(layer.id)) {
            whitelist.push({ compId: comp.id, compName: comp.name, layerId: layer.id, layerName: layer.name, reason: "extreme-required" });
            if (layer.sourceId)
              graph.link(comp.id, layer.sourceId);
          } else {
            layersToRemove.push({ compId: comp.id, compName: comp.name, layerId: layer.id });
          }
        }
        externalCompsManifest.push({
          compId: extId,
          compName: extItem.name,
          requiredLayers: requiredLayerIds
        });
        log('Extreme Pruning "' + extItem.name + '": kept ' + requiredLayerIds.length + " layers.");
      }
      return { externalCompsManifest, compsToCollect };
    }

module.exports = { expandExternalLayers, applyExtremePruning };
