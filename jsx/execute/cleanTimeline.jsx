/**
 * DeepClean v2 — Timeline Cleanup (STEP 1)
 * Removes layers not in whitelist from compositions.
 * Uses ID-based matching with reverse-index deletion for safety.
 *
 * Depends on: DC_findCompById (from executeMain.jsx)
 */

function DC_cleanTimelines(proj, manifest, log) {
  log.push('[STEP1] Timeline cleanup begin');

  var layersToRemove = manifest.layersToRemove || [];
  if (layersToRemove.length === 0) {
    log.push('[STEP1] Nothing to remove.');
    return;
  }

  // Group by compId
  var removeByComp = {};
  for (var j = 0; j < layersToRemove.length; j++) {
    var r = layersToRemove[j];
    var ck = String(r.compId);
    if (!removeByComp[ck]) removeByComp[ck] = [];
    removeByComp[ck].push(r.layerId);
  }

  // Build whitelist lookup { compId_layerId: true } to prevent disaster
  var whitelist = manifest.whitelist || [];
  var keepKey = {};
  for (var w = 0; w < whitelist.length; w++) {
    keepKey[String(whitelist[w].compId) + '_' + String(whitelist[w].layerId)] = true;
  }

  for (var compIdStr in removeByComp) {
    var comp = DC_findCompById(proj, parseInt(compIdStr, 10));
    if (!comp) {
      log.push('[STEP1][WARN] Comp id ' + compIdStr + ' not found — skipped');
      continue;
    }

    var idsToRemove = removeByComp[compIdStr];
    var removed = 0;
    var guarded = 0;

    // Loop REVERSE on native layer count for safety
    for (var i = comp.numLayers; i >= 1; i--) {
      try {
        var layer = comp.layer(i);
        var lyrId = layer.id;

        var marked = false;
        for (var k = 0; k < idsToRemove.length; k++) {
           if (idsToRemove[k] === lyrId) { marked = true; break; }
        }

        if (marked) {
          if (keepKey[compIdStr + '_' + lyrId]) {
             guarded++;
          } else {
             layer.remove();
             removed++;
          }
        }
      } catch(e) {
        log.push('[STEP1][WARN] err removing layer in "' + comp.name + '": ' + e.message);
      }
    }

    log.push('[STEP1] "' + comp.name + '": removed=' + removed + ' guarded=' + guarded);
  }
}
