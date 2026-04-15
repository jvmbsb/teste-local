// node/analyze/analyze.src.js
const fs = require("fs");
const path = require("path");
const sax = require("sax");

const { normPath, fileExists, buildItemMaps, log, warn, validatePaths, indexExpressions } = require("./utils/helpers.js");
const { Graph, processCompAsStandard, runStandardCleanQueue } = require("./graph/resolveGraph.js");
const { walkAst, parseWithAcorn, DYNAMIC_PATTERNS, isDynamicExpression, bruteForceExtract, analyseExpression, resolveExpressionDeps } = require("./expressions/resolveExpressions.js");
const { hexToUtf8, PATH_REGEXES, extractStringsFromBdata, resolveBdataDeps } = require("./bdata/matchAssets.js");
const { expandExternalLayers, applyExtremePruning } = require("./solo/soloResolver.js");

function parseAepx(aepxPath) {
  return new Promise((resolve, reject) => {
    if (!aepxPath || !fileExists(aepxPath)) {
      log("No usable .aepx \u2014 skipping XML pass");
      return resolve({ bdataBlobs: [], layerSources: [] });
    }
    log("Streaming AEPX: " + aepxPath);
    const result = {
      bdataBlobs: [],
      layerSources: []
    };
    const parser = sax.createStream(false, {
      lowercase: true,
      trim: false,
      normalize: false,
      position: false
    });
    let compStack = [];
    let layerName = null;
    let inBdata = false;
    let bdataBuf = "";
    let layerSrc = null;
    parser.on("opentag", (node) => {
      const name = node.name;
      const attrs = node.attributes || {};
      if (name === "compitem" || name === "composition") {
        const cn = attrs["ae:name"] || attrs["name"] || attrs["id"] || null;
        compStack.push(cn);
      }
      if (name === "layer" || name === "avlayer" || name === "textlayer" || name === "shapelayer") {
        layerName = attrs["ae:name"] || attrs["name"] || null;
        layerSrc = attrs["ae:source"] || attrs["src"] || null;
        if (layerSrc && compStack.length > 0) {
          result.layerSources.push({
            compName: compStack[compStack.length - 1],
            layerName,
            sourceName: layerSrc
          });
        }
      }
      if (name === "bdata") {
        inBdata = true;
        bdataBuf = "";
      }
    });
    parser.on("text", (text) => {
      if (inBdata)
        bdataBuf += text;
    });
    parser.on("cdata", (data) => {
      if (inBdata)
        bdataBuf += data;
    });
    parser.on("closetag", (name) => {
      if (name === "bdata") {
        inBdata = false;
        const hex = bdataBuf.trim();
        if (hex.length > 8) {
          const decoded = hexToUtf8(hex);
          if (decoded.length > 3) {
            result.bdataBlobs.push({
              compName: compStack.length > 0 ? compStack[compStack.length - 1] : null,
              layerName,
              raw: hex,
              decoded
            });
          }
        }
        bdataBuf = "";
      }
      if (name === "compitem" || name === "composition")
        compStack.pop();
      if (name === "layer" || name === "avlayer" || name === "textlayer" || name === "shapelayer") {
        layerName = null;
        layerSrc = null;
      }
    });
    parser.on("error", (e) => {
      warn("SAX error (non-fatal): " + e.message.substring(0, 80));
      try {
        parser._parser.resume();
      } catch (ex) {
      }
    });
    parser.on("end", () => {
      log("AEPX done. bdata blobs: " + result.bdataBlobs.length);
      resolve(result);
    });
    const stream = fs.createReadStream(normPath(aepxPath), { encoding: "utf8", highWaterMark: 128 * 1024 });
    stream.on("error", (err) => {
      warn("Cannot read .aepx: " + err.message);
      resolve(result);
    });
    stream.pipe(parser);
  });
}
var snapshotPath = process.argv[2];
if (!snapshotPath) {
  process.stderr.write("ERROR: Usage: node analyze.bundle.js <snapshot_project.json>\n");
  process.exit(1);
}
async function main() {
  log("Reading snapshot: " + snapshotPath);
  const raw = fs.readFileSync(normPath(snapshotPath), "utf8");
  const snapshot = JSON.parse(raw);
  const { tempDir, aepxPath, selectedComps, allItems, externalCompLayers } = snapshot;
  const projectDir = snapshot.projectPath ? path.dirname(normPath(snapshot.projectPath)) : null;
  const warnings = [];
  const maps = buildItemMaps(allItems);
  log("Items indexed: " + allItems.length);
  const forceKeep = /* @__PURE__ */ new Set();
  for (const item of allItems) {
    if (item.name && item.name.toUpperCase().startsWith("[KEEP]")) {
      forceKeep.add(item.id);
      log('[KEEP] override: "' + item.name + '"');
    }
  }
  validatePaths(allItems, warnings, projectDir);
  const aepxData = await parseAepx(aepxPath);
  const graph = new Graph();
  const selectedIds = new Set(selectedComps.map((c) => c.id));
  const whitelist = [];
  const layersToRemove = [];
  if (externalCompLayers) {
    for (const ec of externalCompLayers) {
      if (selectedIds.has(ec.compId)) {
        warnings.push('Snapshot conflict: comp "' + ec.compName + '" (#' + ec.compId + ") in both sets.");
      }
    }
  }
  selectedIds.forEach((id) => graph.add(id));
  const globalExprReferencedNames = /* @__PURE__ */ new Set();
  indexExpressions(selectedComps, analyseExpression, globalExprReferencedNames);
  indexExpressions(externalCompLayers, analyseExpression, globalExprReferencedNames);
  const allCompsData = /* @__PURE__ */ new Map();
  selectedComps.forEach((c) => allCompsData.set(c.id, c));
  if (externalCompLayers) {
    externalCompLayers.forEach((c) => {
      c.id = c.compId;
      allCompsData.set(c.id, c);
    });
  }

  // ─── Auditoria de Integridade de Dados (Fingerprinting) ─────────────────────
  let totalLayersSnapshot = 0;
  let totalLayersAnalyze = 0;
  const snapshotMap = new Map(); // fingerprint -> layer
  const analyzeMap = new Map();  // fingerprint -> layer

  log('==== DATA INTEGRITY AUDIT START ====');

  allCompsData.forEach((comp) => {
    log('\n[ANALYZE] Comp "' + comp.name + '" (id:' + comp.id + ')');
    
    // Mapear layers do analyze (que vieram do snapshot)
    comp.layers.forEach((l) => {
      // Re-calcular fingerprint (deve bater com index.jsx)
      const fp = l.name + '|' + l.index + '|' + (l.sourceName || 'no-src');
      l.fingerprint = fp;
      analyzeMap.set(fp, l);
      totalLayersAnalyze++;

      log('[ANALYZE][LAYER] fingerprint=' + fp);
      log('  id=' + l.id + ' name="' + l.name + '" enabled=' + l.enabled + ' solo=' + l.solo + ' guide=' + l.guideLayer + ' null=' + l.isNull + ' adj=' + l.isAdj + ' parentId=' + l.parentId + ' sourceId=' + l.sourceId);
    });
  });

  // Mapear layers originais do snapshot bruto para comparação
  const allSnapshotComps = [...selectedComps];
  if (externalCompLayers) externalCompLayers.forEach(ec => allSnapshotComps.push(ec));

  allSnapshotComps.forEach(comp => {
    comp.layers.forEach(l => {
      const fp = l.name + '|' + l.index + '|' + (l.sourceName || 'no-src');
      snapshotMap.set(fp, l);
      totalLayersSnapshot++;
    });
  });

  // Verificação de Match Explícito
  log('\n[CHECK] Cross-Validation Logic:');
  snapshotMap.forEach((sLyr, fp) => {
    const aLyr = analyzeMap.get(fp);
    if (!aLyr) {
      log('[CRITICAL][MISSING_IN_ANALYZE] Fingerprint not found in analyze: ' + fp);
    } else {
      if (String(sLyr.id) !== String(aLyr.id)) {
        log('[CRITICAL][ID_MISMATCH] Fingerprint: ' + fp + ' | SnapshotID: ' + sLyr.id + ' | AnalyzeID: ' + aLyr.id);
      }
      // Verificar flags críticas
      if (sLyr.enabled !== aLyr.enabled || sLyr.solo !== aLyr.solo || sLyr.guideLayer !== aLyr.guideLayer) {
        log('[CRITICAL][FLAG_MISMATCH] Fingerprint: ' + fp + ' Flags changed!');
      }
    }
  });

  log('\n[GLOBAL COUNTS]');
  log('TOTAL COMPS: ' + allCompsData.size);
  log('TOTAL LAYERS SNAPSHOT: ' + totalLayersSnapshot);
  log('TOTAL LAYERS ANALYZE: ' + totalLayersAnalyze);
  log('-------------------------------------\n');

  // Log [PRE-GRAPH] para cada comp antes de processar
  selectedIds.forEach((id) => {
    const comp = allCompsData.get(id);
    if (comp) {
      log('[PRE-GRAPH] Comp "' + comp.name + '" layers sent=' + comp.layers.length);
    }
  });

  const processedStandard = runStandardCleanQueue(selectedIds, allCompsData, maps, graph, whitelist, layersToRemove, warnings, globalExprReferencedNames, log);
  const preReachable = graph.resolve([...selectedIds]);
  forceKeep.forEach((id) => preReachable.add(id));
  log("Pre-Bdata Reachable ids: " + preReachable.size);
  const { externalCompsManifest, compsToCollect } = applyExtremePruning(allItems, preReachable, processedStandard, maps, allCompsData, globalExprReferencedNames, graph, whitelist, layersToRemove, warnings, log);
  const whitelistKeys = /* @__PURE__ */ new Set();
  for (const entry of whitelist) {
    if (entry.compName && entry.layerName)
      whitelistKeys.add(entry.compName + "::" + entry.layerName);
  }
  const conditionalBdataBlobs = (aepxData.bdataBlobs || []).filter((blob) => whitelistKeys.has(blob.compName + "::" + blob.layerName));
  const bdataDeps = resolveBdataDeps(conditionalBdataBlobs, maps, warnings);
  bdataDeps.forEach((id) => {
    graph.add(id);
    selectedIds.forEach((sId) => graph.link(sId, id));
  });
  log("Conditional bdata deps: " + bdataDeps.size);
  const reachable = graph.resolve([...selectedIds]);
  forceKeep.forEach((id) => reachable.add(id));
  log("Final Reachable ids: " + reachable.size);
  const itemsToMoveToLimbo = [];
  for (const item of allItems) {
    if (item.type === "FolderItem")
      continue;
    if (reachable.has(item.id))
      continue;
    itemsToMoveToLimbo.push({ id: item.id, name: item.name });
  }
  const savedBytes = 0;
  const manifest = {
    version: "2.0.0",
    timestamp: (/* @__PURE__ */ new Date()).getTime(),
    whitelist,
    layersToRemove,
    itemsToMoveToLimbo,
    externalComps: externalCompsManifest,
    compsToCollect,
    warnings,
    stats: {
      selectedComps: selectedComps.length,
      totalItems: allItems.length,
      reachableItems: reachable.size,
      layersToRemove: layersToRemove.length,
      itemsToLimbo: itemsToMoveToLimbo.length,
      externalComps: externalCompsManifest.length,
      dynamicExprs: warnings.filter((w) => w.includes("Dynamic expression")).length,
      missingFiles: warnings.filter((w) => w.includes("Missing on disk")).length,
      estimatedSavedMB: (savedBytes / 1048576).toFixed(2),
      warningCount: warnings.length
    }
  };
  const manifestPath = path.join(tempDir, "manifest_execution.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  process.stdout.write("MANIFEST_READY|" + manifestPath + "\n");
}
main().catch((err) => {
  process.stderr.write("FATAL: " + err.stack + "\n");
  process.exit(1);
});
