// node/analyze/graph/resolveGraph.js
const { resolveExpressionDeps } = require('../expressions/resolveExpressions.js');

var Graph = class {
  constructor() {
    this.edges = new Map();
  }
  add(id) {
    if (!this.edges.has(id)) this.edges.set(id, new Set());
  }
  link(from, to) {
    this.add(from);
    this.add(to);
    this.edges.get(from).add(to);
  }
  resolve(seeds) {
    const visited = new Set();
    const queue = [...seeds];
    while (queue.length > 0) {
      const id = queue.shift();
      if (visited.has(id)) continue;
      visited.add(id);
      const deps = this.edges.get(id);
      if (deps) deps.forEach((d) => queue.push(d));
    }
    return visited;
  }
};

function processCompAsStandard(
  compId,
  selComp,
  maps,
  graph,
  standardCleanQueue,
  whitelist,
  layersToRemove,
  warnings,
  globalExprReferencedNames,
  log
) {
  if (!selComp) return;

  log('[DC] Comp: "' + selComp.name + '" (' + selComp.layers.length + ' layers)');

  // ─────────────────────────────────────────────
  // SOLO DETECTION
  // ─────────────────────────────────────────────
  const hasSolo = selComp.layers.some(l => l.solo === true);

  // ─────────────────────────────────────────────
  // LAYER LOOKUP
  // ─────────────────────────────────────────────
  const layerById = new Map();
  for (const l of selComp.layers) {
    layerById.set(l.id, l);
  }

  // ─────────────────────────────────────────────
  // STEP 1 — BUILD DEPENDENCIES
  // ─────────────────────────────────────────────
  const parentMap = new Map(); // child → parent
  const matteMap = new Map();  // layer → matte
  const effectMap = new Map(); // layer → [targets]

  for (const l of selComp.layers) {
    if (l.parentId) parentMap.set(l.id, l.parentId);

    if (l.hasTrackMatte && l.trackMatteTargetId) {
      matteMap.set(l.id, l.trackMatteTargetId);
    }

    if (l.effectLayerReferences && l.effectLayerReferences.length > 0) {
      effectMap.set(l.id, l.effectLayerReferences.slice());
    }
  }

  // ─────────────────────────────────────────────
  // STEP 2 — FIND TRUE VISIBLE ROOTS
  // ─────────────────────────────────────────────
  const roots = new Set();

  for (const layer of selComp.layers) {
    const isKeep = layer.name && layer.name.toUpperCase().startsWith('[KEEP]');
    const isGuide = layer.guideLayer;
    const isActive = hasSolo ? layer.solo : layer.enabled;

    if (isKeep || isGuide) {
      roots.add(layer.id);
      continue;
    }

    if (!isActive) continue;

    // 🔥 STRICT renderable definition (CRUCIAL FIX)
    const isRenderable =
      !layer.isNull &&
      (
        layer.sourceId ||
        layer.isText ||
        layer.isShape
      );

    if (isRenderable) {
      roots.add(layer.id);
    }
  }

  log('[DC] Roots: ' + roots.size);

  // ─────────────────────────────────────────────
  // STEP 3 — BACKWARD DEPENDENCY WALK
  // ─────────────────────────────────────────────
  const required = new Set();
  const queue = [...roots];

  while (queue.length > 0) {
    const id = queue.shift();
    if (required.has(id)) continue;

    required.add(id);

    const layer = layerById.get(id);
    if (!layer) continue;

    // parent chain
    const parentId = parentMap.get(id);
    if (parentId && !required.has(parentId)) {
      queue.push(parentId);
    }

    // matte dependency
    const matteId = matteMap.get(id);
    if (matteId && !required.has(matteId)) {
      queue.push(matteId);
    }

    // effect dependencies
    const effects = effectMap.get(id);
    if (effects) {
      for (const eid of effects) {
        if (!required.has(eid)) {
          queue.push(eid);
        }
      }
    }
  }

  log('[DC] Required after BFS: ' + required.size);

  // ─────────────────────────────────────────────
  // STEP 4 — BUILD FINAL RESULT
  // ─────────────────────────────────────────────
  for (const layer of selComp.layers) {
    const isRequired = required.has(layer.id);

    if (isRequired) {
      const reasons = [];

      if (layer.name && layer.name.toUpperCase().startsWith('[KEEP]')) {
        reasons.push('keep-tag');
      }

      if (hasSolo && layer.solo) reasons.push('solo');
      else if (!hasSolo && layer.enabled) reasons.push('enabled');

      if (layer.parentId) reasons.push('parent');
      if (layer.hasTrackMatte) reasons.push('matte');
      if (layer.effectLayerReferences && layer.effectLayerReferences.length > 0) {
        reasons.push('effect');
      }

      // graph linking (important for external comps)
      if (layer.sourceId) {
        const srcItem = maps.byId.get(layer.sourceId);
        if (srcItem) {
          graph.link(selComp.id, layer.sourceId);

          if (srcItem.type === "CompItem") {
            standardCleanQueue.push(srcItem.id);
          }
        }
      }

      // expressions
      if (layer.expressions && layer.expressions.length > 0) {
        const { deps } = resolveExpressionDeps(layer.expressions, maps, warnings);
        deps.forEach(depId => graph.link(selComp.id, depId));
      }

      whitelist.push({
        compId: selComp.id,
        compName: selComp.name,
        layerId: layer.id,
        layerName: layer.name,
        reason: reasons.join(',')
      });

    } else {
      layersToRemove.push({
        compId: selComp.id,
        compName: selComp.name,
        layerId: layer.id
      });
    }
  }

  log('[DC] Final keep: ' + required.size + ' | remove: ' + (selComp.layers.length - required.size));
}

function runStandardCleanQueue(
  selectedIds,
  allCompsData,
  maps,
  graph,
  whitelist,
  layersToRemove,
  warnings,
  globalExprReferencedNames,
  log
) {
  const processed = new Set();
  const queue = [...selectedIds];

  while (queue.length > 0) {
    const cid = queue.shift();
    if (processed.has(cid)) continue;

    processed.add(cid);

    const comp = allCompsData.get(cid);
    processCompAsStandard(
      cid,
      comp,
      maps,
      graph,
      queue,
      whitelist,
      layersToRemove,
      warnings,
      globalExprReferencedNames,
      log
    );
  }

  return processed;
}

module.exports = {
  Graph,
  processCompAsStandard,
  runStandardCleanQueue
};
