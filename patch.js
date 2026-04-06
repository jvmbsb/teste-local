const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'node', 'analyze.src.js');
let src = fs.readFileSync(filePath, 'utf8');

// 1. Remove globalBdataStrings initialization
src = src.replace(/\s*\/\/\s*── Global Bdata Strings.*?if \(aepxData \S\S aepxData\.bdataBlobs\) \{[\s\S]*?\}\s*(?=\/\/ Process each selected comp)/, '\n\n  ');

// 2. Replace the main execution loop to a BFS standard queue
const oldLoopStart = '// Process each selected comp\n  for (const selComp of selectedComps) {';
const newLoopCode = `// ── Differential Pruning (Nested vs External) ────────────────────────────
  const allCompsData = new Map();
  selectedComps.forEach(c => allCompsData.set(c.id, c));
  if (externalCompLayers) {
    externalCompLayers.forEach(c => { c.id = c.compId; allCompsData.set(c.id, c); });
  }

  const processedStandard = new Set();
  const standardCleanQueue = [...selectedIds];

  const processCompAsStandard = (compId) => {
    const selComp = allCompsData.get(compId);
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
  };

  while (standardCleanQueue.length > 0) {
    const cid = standardCleanQueue.shift();
    if (!processedStandard.has(cid)) {
      processedStandard.add(cid);
      processCompAsStandard(cid);
    }
  }`;

// Find end of old loop
const loopEndIndex = src.indexOf('  // ── Resolve bdata plugin refs (Conditional via Whitelist)');
const loopStartIndex = src.indexOf('  // Process each selected comp');

if (loopStartIndex !== -1 && loopEndIndex !== -1) {
  src = src.substring(0, loopStartIndex) + newLoopCode + '\n\n' + src.substring(loopEndIndex);
}

// 3. Replace External Comps handling to rely on processedStandard and Extreme Pruning
const extHandlingIndex = src.indexOf('  // ── External comp handling');
const endExtHandlingIndex = src.indexOf('  // ── Items to move to LIMBO');

const newExtHandling = `  // ── Extreme Pruning & COLLECT protocol ────────────────────────────────────
  const externalCompsManifest = [];
  const compsToCollect = [];
  
  for (const item of allItems) {
    if (item.type === 'CompItem' && reachable.has(item.id) && !processedStandard.has(item.id)) {
      compsToCollect.push(item.id);
    }
  }

  // For each non-nested reachable comp, apply the Extreme Pruning
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

  manifest.compsToCollect = compsToCollect;
`;

if (extHandlingIndex !== -1 && endExtHandlingIndex !== -1) {
  src = src.substring(0, extHandlingIndex) + newExtHandling + '\n' + src.substring(endExtHandlingIndex);
}

fs.writeFileSync(filePath, src);
console.log('Successfully patched analyze.src.js');
