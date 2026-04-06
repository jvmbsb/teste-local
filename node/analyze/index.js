'use strict';

const fs    = require('fs');
const path  = require('path');
const sax   = require('sax');
const { normPath, fileExists, buildItemMaps } = require('./utils/maps');
const { log, warn, validatePaths, indexExpressions } = require('./utils/cache');
const { Graph } = require('./graph/buildGraph');
const { runStandardCleanQueue } = require('./graph/resolveGraph');
const { analyseExpression } = require('./expressions/variableResolver');
const { hexToUtf8, extractStringsFromBdata } = require('./bdata/extractBdata');
const { resolveBdataDeps } = require('./bdata/matchAssets');
const { applyExtremePruning } = require('./pruning/selectivePruning');

/**
 * Stream-parse the .aepx XML file.
 */
function parseAepx(aepxPath) {
  return new Promise((resolve, reject) => {
    if (!aepxPath || !fileExists(aepxPath)) {
      log('No usable .aepx — skipping XML pass');
      return resolve({ bdataBlobs: [], layerSources: [] });
    }

    log('Streaming AEPX: ' + aepxPath);

    const result = {
      bdataBlobs:   [],
      layerSources: []
    };

    const parser = sax.createStream(false, {
      lowercase:    true,
      trim:         false,
      normalize:    false,
      position:     false
    });

    let compStack  = [];
    let layerName  = null;
    let inBdata    = false;
    let bdataBuf   = '';
    let layerSrc   = null;

    parser.on('opentag', node => {
      const name = node.name;
      const attrs = node.attributes || {};
      if (name === 'compitem' || name === 'composition') {
        const cn = attrs['ae:name'] || attrs['name'] || attrs['id'] || null;
        compStack.push(cn);
      }
      if (name === 'layer' || name === 'avlayer' || name === 'textlayer' || name === 'shapelayer') {
        layerName = attrs['ae:name'] || attrs['name'] || null;
        layerSrc  = attrs['ae:source'] || attrs['src'] || null;
        if (layerSrc && compStack.length > 0) {
          result.layerSources.push({
            compName:   compStack[compStack.length - 1],
            layerName:  layerName,
            sourceName: layerSrc
          });
        }
      }
      if (name === 'bdata') {
        inBdata   = true;
        bdataBuf  = '';
      }
    });

    parser.on('text', text => { if (inBdata) bdataBuf += text; });
    parser.on('cdata', data => { if (inBdata) bdataBuf += data; });

    parser.on('closetag', name => {
      if (name === 'bdata') {
        inBdata = false;
        const hex = bdataBuf.trim();
        if (hex.length > 8) {
          const decoded = hexToUtf8(hex);
          if (decoded.length > 3) {
            result.bdataBlobs.push({
              compName:  compStack.length > 0 ? compStack[compStack.length - 1] : null,
              layerName: layerName,
              raw:       hex,
              decoded:   decoded
            });
          }
        }
        bdataBuf = '';
      }
      if (name === 'compitem' || name === 'composition') compStack.pop();
      if (name === 'layer' || name === 'avlayer' || name === 'textlayer' || name === 'shapelayer') {
        layerName = null;
        layerSrc  = null;
      }
    });

    parser.on('error', e => {
      warn('SAX error (non-fatal): ' + e.message.substring(0, 80));
      try { parser._parser.resume(); } catch (ex) {}
    });

    parser.on('end', () => {
      log('AEPX done. bdata blobs: ' + result.bdataBlobs.length);
      resolve(result);
    });

    const stream = fs.createReadStream(normPath(aepxPath), { encoding: 'utf8', highWaterMark: 128 * 1024 });
    stream.on('error', err => {
      warn('Cannot read .aepx: ' + err.message);
      resolve(result);
    });
    stream.pipe(parser);
  });
}

/**
 * CLI Argument Handling
 */
const snapshotPath = process.argv[2];
if (!snapshotPath) {
  process.stderr.write('ERROR: Usage: node analyze.bundle.js <snapshot_project.json>\n');
  process.exit(1);
}

/**
 * Main Analysis Pipeline
 */
async function main() {
  log('Reading snapshot: ' + snapshotPath);
  const raw      = fs.readFileSync(normPath(snapshotPath), 'utf8');
  const snapshot = JSON.parse(raw);

  const { tempDir, aepxPath, selectedComps, allItems, externalCompLayers } = snapshot;
  const projectDir = snapshot.projectPath ? path.dirname(normPath(snapshot.projectPath)) : null;
  const warnings = [];

  const maps = buildItemMaps(allItems);
  log('Items indexed: ' + allItems.length);

  const forceKeep = new Set();
  for (const item of allItems) {
    if (item.name && item.name.toUpperCase().startsWith('[KEEP]')) {
      forceKeep.add(item.id);
      log('[KEEP] override: "' + item.name + '"');
    }
  }

  validatePaths(allItems, warnings, projectDir);

  const aepxData = await parseAepx(aepxPath);

  const graph = new Graph();
  const selectedIds      = new Set(selectedComps.map(c => c.id));
  const whitelist        = [];
  const layersToRemove   = [];
  
  if (externalCompLayers) {
    for (const ec of externalCompLayers) {
      if (selectedIds.has(ec.compId)) {
        warnings.push('Snapshot conflict: comp "' + ec.compName + '" (#' + ec.compId + ') in both sets.');
      }
    }
  }

  selectedIds.forEach(id => graph.add(id));

  const globalExprReferencedNames = new Set();
  indexExpressions(selectedComps, analyseExpression, globalExprReferencedNames);
  indexExpressions(externalCompLayers, analyseExpression, globalExprReferencedNames);

  const allCompsData = new Map();
  selectedComps.forEach(c => allCompsData.set(c.id, c));
  if (externalCompLayers) {
    externalCompLayers.forEach(c => { c.id = c.compId; allCompsData.set(c.id, c); });
  }

  const processedStandard = runStandardCleanQueue(selectedIds, allCompsData, maps, graph, whitelist, layersToRemove, warnings, globalExprReferencedNames, log);

  const preReachable = graph.resolve([...selectedIds]);
  forceKeep.forEach(id => preReachable.add(id));
  log('Pre-Bdata Reachable ids: ' + preReachable.size);

  const { externalCompsManifest, compsToCollect } = applyExtremePruning(allItems, preReachable, processedStandard, maps, allCompsData, globalExprReferencedNames, graph, whitelist, layersToRemove, warnings, log);

  const whitelistKeys = new Set();
  for (const entry of whitelist) {
    if (entry.compName && entry.layerName) whitelistKeys.add(entry.compName + "::" + entry.layerName);
  }

  const conditionalBdataBlobs = (aepxData.bdataBlobs || []).filter(blob => whitelistKeys.has(blob.compName + "::" + blob.layerName));
  const bdataDeps = resolveBdataDeps(conditionalBdataBlobs, maps, warnings);
  bdataDeps.forEach(id => {
    graph.add(id);
    selectedIds.forEach(sId => graph.link(sId, id));
  });
  log('Conditional bdata deps: ' + bdataDeps.size);

  const reachable = graph.resolve([...selectedIds]);
  forceKeep.forEach(id => reachable.add(id));
  log('Final Reachable ids: ' + reachable.size);

  const itemsToMoveToLimbo = [];
  for (const item of allItems) {
    if (item.type === 'FolderItem') continue;
    if (reachable.has(item.id)) continue;
    itemsToMoveToLimbo.push({ id: item.id, name: item.name });
  }

  // Estimate saved bytes (dummy implementation for parity)
  const savedBytes = 0; 

  const manifest = {
    version: '2.0.0',
    timestamp: (new Date()).getTime(),
    whitelist,
    layersToRemove,
    itemsToMoveToLimbo,
    externalComps: externalCompsManifest,
    compsToCollect,
    warnings,
    stats: {
      selectedComps:    selectedComps.length,
      totalItems:       allItems.length,
      reachableItems:   reachable.size,
      layersToRemove:   layersToRemove.length,
      itemsToLimbo:     itemsToMoveToLimbo.length,
      externalComps:    externalCompsManifest.length,
      dynamicExprs:     warnings.filter(w => w.includes('Dynamic expression')).length,
      missingFiles:     warnings.filter(w => w.includes('Missing on disk')).length,
      estimatedSavedMB: (savedBytes / 1048576).toFixed(2),
      warningCount:     warnings.length
    }
  };

  const manifestPath = path.join(tempDir, 'manifest_execution.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  process.stdout.write('MANIFEST_READY|' + manifestPath + '\n');
}

main().catch(err => {
  process.stderr.write('FATAL: ' + err.stack + '\n');
  process.exit(1);
});
