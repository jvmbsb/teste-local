/**
 * DeepClean v2 — NODE 1: Snapshot Collector (Entry Point)
 * ExtendScript ES3-compatible
 *
 * Protocol:
 *   1. Double-Save: temp .aep → temp .aepx  (flushes plugin metadata)
 *   2. Deep Snapshot: all items + selected comp layers + external comp layers
 *   3. Stability check: poll .aepx size until 2 consecutive identical readings
 *   4. Write snapshot_project.json
 *   5. Return ONLY: "SUCCESS|<path>" string
 *
 * NEVER passes large JSON via evalScript.
 *
 * Loaded via $.evalFile() from host.jsx.
 * Sub-modules loaded via #include in dependency order.
 */

// ─── Module Includes ──────────────────────────────────────────────────────────
#include "../shared/polyfills.jsx"
#include "utils.jsx"
#include "walkProperties.jsx"
#include "extractExpressions.jsx"
#include "extractLayerRefs.jsx"

// ─── Double-Save Protocol ─────────────────────────────────────────────────────
// Step 1: save .aep  (binary, forces all data flush)
// Step 2: save .aepx (XML, exposes plugin bdata)
function DC_doubleSave(proj, tempDir) {
  var aepPath  = tempDir + '/DC_snap.aep';
  var aepxPath = tempDir + '/DC_snap.aepx';

  // --- Pass 1: binary .aep ---
  var aepFile = new File(aepPath);
  try {
    proj.save(aepFile);
  } catch (e) {
    throw new Error('Failed to save temp .aep: ' + e.message);
  }
  if (!DC_waitStable(aepPath, 20000, 400)) {
    $.writeln('[DC] WARNING: .aep stability timeout');
  }

  // --- Pass 2: XML .aepx ---
  var aepxFile = new File(aepxPath);
  var aepxOk   = false;
  try {
    proj.save(aepxFile);
    if (DC_waitStable(aepxPath, 25000, 500)) {
      aepxFile.encoding = 'UTF-8';
      aepxFile.open('r');
      var head = aepxFile.read(10);
      aepxFile.close();
      aepxOk = (head.indexOf('<?xml') !== -1 || head.indexOf('<Afte') !== -1);
    }
  } catch (e) {
    $.writeln('[DC] WARNING: .aepx save failed: ' + e.message);
  }

  return {
    aepPath:  aepPath,
    aepxPath: aepxOk ? aepxPath : ''
  };
}

// ─── Collect all project items ────────────────────────────────────────────────
function DC_collectAllItems(proj) {
  var items = [];
  var n = proj.items.length;
  for (var i = 1; i <= n; i++) {
    var item = proj.items[i];
    if (!item) continue;
    var entry = {
      id:         item.id,
      name:       item.name,
      type:       DC_itemType(item),
      parentId:   null,
      filePath:   '',
      hasVideo:   false,
      hasAudio:   false,
      duration:   0,
      width:      0,
      height:     0,
      frameRate:  0,
      numLayers:  0
    };

    // Parent folder id (null = root)
    try {
      if (item.parentFolder && item.parentFolder !== proj.rootFolder) {
        entry.parentId = item.parentFolder.id;
      }
    } catch (e) {}

    // File path via File.decode (handles URL-encoded paths)
    entry.filePath = DC_decodePath(item);

    // Metadata
    try { entry.hasVideo  = item.hasVideo;  } catch (e) {}
    try { entry.hasAudio  = item.hasAudio;  } catch (e) {}
    try { entry.duration  = item.duration;  } catch (e) {}

    if (item instanceof CompItem) {
      try { entry.width     = item.width;     } catch (e) {}
      try { entry.height    = item.height;    } catch (e) {}
      try { entry.frameRate = item.frameRate; } catch (e) {}
      try { entry.numLayers = item.numLayers; } catch (e) {}
    }

    items.push(entry);
  }
  return items;
}

// ─── Collect layers from a CompItem ──────────────────────────────────────────
function DC_collectLayers(comp) {
  var layers = [];
  var n = comp.numLayers;
  $.writeln('\n[SNAPSHOT] Comp "' + comp.name + '" numLayers=' + n);

  for (var i = 1; i <= n; i++) {
    var layer = comp.layer(i);
    var entry = {
      id:          layer.id,
      index:       layer.index,
      name:        layer.name,
      enabled:     layer.enabled,
      solo:        layer.solo,
      shy:         layer.shy,
      guideLayer:  false,
      isNull:      false,
      isText:      false,
      isShape:     false,
      isCamera:    false,
      isLight:     false,
      isAdj:       false,
      hasTrackMatte: false,
      isTrackMatte: false,
      inPoint:     layer.inPoint,
      outPoint:    layer.outPoint,
      sourceId:    null,
      sourceName:  'no-src',
      parentId:    null,
      trackMatteTargetId: null,
      effectMatchNames: [],
      effectLayerReferences: [],
      expressions: []
    };

    try { entry.guideLayer = layer.guideLayer; } catch (e) {}
    // Matte definitions
    try { entry.hasTrackMatte = layer.hasTrackMatte; } catch (e) {}
    try { entry.isTrackMatte = layer.isTrackMatte; } catch (e) {}

    if (layer.hasTrackMatte) {
      try {
        var matteIdx = layer.index - 1;
        if (matteIdx > 0 && matteIdx <= comp.numLayers) {
          entry.trackMatteTargetId = comp.layer(matteIdx).id;
        }
      } catch(e) {}
    }

    if (layer instanceof AVLayer) {
      try { entry.isNull  = layer.nullLayer;     } catch (e) {}
      try { entry.isAdj   = layer.adjustmentLayer; } catch (e) {}
      if (layer.source) {
        try { 
          entry.sourceId = layer.source.id; 
          entry.sourceName = layer.source.name;
        } catch (e) {}
      }
    }
    try { entry.isText   = (layer instanceof TextLayer);   } catch (e) {}
    try { entry.isShape  = (layer instanceof ShapeLayer);  } catch (e) {}
    try { entry.isCamera = (layer instanceof CameraLayer); } catch (e) {}
    try { entry.isLight  = (layer instanceof LightLayer);  } catch (e) {}

    // Fingerprint: name | index | sourceName
    var fp = entry.name + '|' + entry.index + '|' + entry.sourceName;
    entry.fingerprint = fp;

    // Log [SNAPSHOT][LAYER]
    $.writeln('[SNAPSHOT][LAYER] fingerprint=' + fp);
    $.writeln('  id=' + entry.id + ' name="' + entry.name + '" index=' + entry.index);

    // Parent chain setup
    try {
      if (layer.parent && layer.parent.id) entry.parentId = layer.parent.id;
    } catch (e) {}

    // Effect match names and parameter layer references
    try {
      var fx = layer.property('ADBE Effect Parade');
      if (fx) {
        for (var e = 1; e <= fx.numProperties; e++) {
          try {
            var effectProp = fx.property(e);
            entry.effectMatchNames.push(effectProp.matchName);
            DC_walkEffects(effectProp, entry.effectLayerReferences, comp);
          } catch (ex) {}
        }
      }
    } catch (e) {}

    // Expressions
    try {
      entry.expressions = DC_layerExpressions(layer);
    } catch (e) {}

    layers.push(entry);
  }
  $.writeln('[SNAPSHOT] Collected layers: ' + layers.length);
  return layers;
}

// ─── Collect selected compositions ───────────────────────────────────────────
function DC_collectSelectedComps(proj) {
  var selected = [];
  for (var i = 0; i < proj.selection.length; i++) {
    var item = proj.selection[i];
    if (item instanceof CompItem) {
      selected.push({
        id:       item.id,
        name:     item.name,
        layers:   DC_collectLayers(item)
      });
    }
  }
  return selected;
}

// ─── Collect ALL comp layers (for external comp deep analysis) ───────────────
function DC_collectAllCompLayers(proj, selectedIds, maxComps) {
  maxComps = maxComps || 150;
  var result = [];
  var count  = 0;
  for (var i = 1; i <= proj.items.length; i++) {
    var item = proj.items[i];
    if (!(item instanceof CompItem)) continue;
    if (selectedIds[item.id]) continue;
    if (count >= maxComps) break;
    count++;
    try {
      result.push({
        compId:   item.id,
        compName: item.name,
        layers:   DC_collectLayers(item)
      });
    } catch (e) {
      $.writeln('[DC] Could not collect layers for comp: ' + item.name);
    }
  }
  return result;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
function DC_runSnapshot() {
  try {
    var proj = app.project;
    if (!proj) return 'ERROR|No project is open.';

    // Must have at least one comp selected
    var selectedComps = DC_collectSelectedComps(proj);
    if (selectedComps.length === 0) {
      return 'ERROR|No compositions selected. Select one or more comps in the Project panel first.';
    }

    var tempDir = DC_getTempDir();

    // ── Double-save protocol ──────────────────────────────────────────────────
    var saved;
    try {
      saved = DC_doubleSave(proj, tempDir);
    } catch (e) {
      return 'ERROR|Double-save failed: ' + e.message;
    }

    // ── Deep snapshot ─────────────────────────────────────────────────────────
    var allItems = DC_collectAllItems(proj);

    // Build selectedIds lookup for external comp collection
    var selectedIdLookup = {};
    for (var s = 0; s < selectedComps.length; s++) {
      selectedIdLookup[selectedComps[s].id] = true;
    }

    var externalCompLayers = DC_collectAllCompLayers(proj, selectedIdLookup, 150);

    // ── Build snapshot object ─────────────────────────────────────────────────
    var snapshot = {
      version:             '2.0.0',
      timestamp:           (new Date()).getTime(),
      timestampISO:        (new Date()).toString(),
      projectName:         proj.file ? proj.file.name          : 'Untitled',
      projectPath:         proj.file ? File.decode(proj.file.absoluteURI) : '',
      tempDir:             tempDir,
      aepPath:             saved.aepPath,
      aepxPath:            saved.aepxPath,
      selectedComps:       selectedComps,
      allItems:            allItems,
      externalCompLayers:  externalCompLayers
    };

    // ── Write JSON ────────────────────────────────────────────────────────────
    var snapshotPath = tempDir + '/snapshot_project.json';
    DC_writeFile(snapshotPath, DC_JSON.stringify(snapshot));

    // Verify
    var verify = new File(snapshotPath);
    if (!verify.exists || verify.length < 10) {
      return 'ERROR|Snapshot file write failed or is empty.';
    }

    return 'SUCCESS|' + snapshotPath;

  } catch (err) {
    return 'ERROR|Unexpected: ' + err.message + ' (line ' + err.line + ')';
  }
}
