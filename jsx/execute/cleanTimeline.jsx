/**
 * DeepClean v2 — Timeline Cleanup (STEP 1)
 * Removes layers not in whitelist from compositions.
 * Uses ID-based matching with reverse-index deletion for safety.
 *
 * Depends on: DC_findCompById (from executeMain.jsx)
 */

function DC_cleanTimelines(proj, manifest, log) {
  log.push('[STEP1] Timeline cleanup begin');
  DC_forensicLog('==== [EXEC] Timeline Cleanup Start ====');

  var layersToRemove = manifest.layersToRemove || [];
  if (layersToRemove.length === 0) {
    log.push('[STEP1] Nothing to remove.');
    DC_forensicLog('[STEP1] Nothing to remove.');
    return;
  }

  // Create lookup for expected removals per comp to detect silent failures
  var expectedByComp = {}; 
  var removeByComp = {};
  for (var j = 0; j < layersToRemove.length; j++) {
    var r = layersToRemove[j];
    var ck = String(r.compId);
    if (!removeByComp[ck]) removeByComp[ck] = [];
    removeByComp[ck].push(r.layerId);
    if (!expectedByComp[ck]) expectedByComp[ck] = 0;
    expectedByComp[ck]++;
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
      DC_forensicLog('[ERROR][LAYER_NOT_FOUND] Comp ' + compIdStr + ' not found in AE!');
      continue;
    }

    DC_forensicLog('\n🔎 Comp: "' + comp.name + '" (id:' + comp.id + ')');
    
    // [EXEC][SNAPSHOT]
    DC_forensicLog('[EXEC][SNAPSHOT] Current AE Layers:');
    for (var s = 1; s <= comp.numLayers; s++) {
      var snapshotLyr = comp.layer(s);
      DC_forensicLog('  index=' + s + ' id=' + snapshotLyr.id + ' name="' + snapshotLyr.name + '"');
    }

    var idsToRemove = removeByComp[compIdStr];
    var removedCount = 0;
    var guardedCount = 0;
    var processedIds = {};

    // Loop REVERSE on native layer count for safety
    for (var i = comp.numLayers; i >= 1; i--) {
      var layer = null;
      var lyrId = -1;
      var lyrName = "UNKNOWN";

      try {
        layer = comp.layer(i);
        lyrId = layer.id;
        lyrName = layer.name;

        var markedForRemoval = false;
        for (var k = 0; k < idsToRemove.length; k++) {
           if (idsToRemove[k] === lyrId) { markedForRemoval = true; break; }
        }

        var inWhitelist = keepKey[compIdStr + '_' + lyrId] ? true : false;

        // [EXEC][CHECK]
        DC_forensicLog('[EXEC][CHECK] Layer: "' + lyrName + '" (id:' + lyrId + ')');
        DC_forensicLog('  markedForRemoval=' + markedForRemoval);
        DC_forensicLog('  inWhitelist=' + inWhitelist);

        // [TRACE][EXEC]
        var isTrace = (TRACE_LAYER_ID !== null && lyrId === TRACE_LAYER_ID) || 
                     (TRACE_LAYER_NAME !== null && lyrName === TRACE_LAYER_NAME);
        
        // AUTO-TRACE TRIGGER on conflict or suspicious state
        if (markedForRemoval && inWhitelist) {
          DC_forensicLog('[ERROR][EXEC_CONFLICT] Layer in both REMOVE and WHITELIST!');
          isTrace = true; // Auto-trigger trace for conflicts
        }

        if (isTrace) {
          DC_forensicLog('>>> [TRACE][EXEC] MATCH FOUND or AUTO-TRIGGERED <<<');
          DC_forensicLog('  Comp: ' + comp.name + ' (id:' + compIdStr + ')');
          DC_forensicLog('  Layer: ' + lyrName + ' (id:' + lyrId + ') index:' + i);
          DC_forensicLog('  markedForRemoval=' + markedForRemoval + ' inWhitelist=' + inWhitelist);
        }

        if (markedForRemoval) {
          if (inWhitelist) {
            guardedCount++;
            DC_forensicLog('  RESULT: PROTECTED (Whitelist conflict)');
          } else {
            // [EXEC][REMOVE_ATTEMPT]
            DC_forensicLog('  [EXEC][REMOVE_ATTEMPT] L:' + layer.locked + ' S:' + layer.shy);
            try {
              layer.locked = false;
              layer.shy    = false;
              layer.remove();
              removedCount++;
              DC_forensicLog('  [EXEC][REMOVE_SUCCESS]');
            } catch (remErr) {
              DC_forensicLog('  [EXEC][REMOVE_FAIL] error: ' + remErr.message);
              isTrace = true; // Trigger trace on failure
            }
          }
        } else {
          DC_forensicLog('  RESULT: SKIPPED (Not marked)');
        }
      } catch(e) {
        log.push('[STEP1][WARN] err processing layer index ' + i + ' in "' + comp.name + '": ' + e.message);
        DC_forensicLog('[ERROR] Crash loop index ' + i + ': ' + e.message);
      }
      DC_forensicLog('-------------------------------------');
    }

    // [EXEC][POST_CHECK] Silent Failure Detector
    var expected = expectedByComp[compIdStr] || 0;
    DC_forensicLog('[EXEC][POST_CHECK] Comp: "' + comp.name + '"');
    DC_forensicLog('  expectedToRemove=' + expected);
    DC_forensicLog('  actuallyRemoved=' + removedCount);

    if (expected !== removedCount) {
       DC_forensicLog('[CRITICAL][REMOVAL_MISMATCH] Expected ' + expected + ' but removed ' + removedCount);
       // Final scan for unremoved but expected layers
       DC_forensicLog('  [POST][UNREMOVED_LAYERS_REPORT]:');
       for (var e2 = 0; e2 < idsToRemove.length; e2++) {
         var targetId = idsToRemove[e2];
         var stillExists = false;
         var foundLayer = null;
         try {
           for (var f = 1; f <= comp.numLayers; f++) {
             if (comp.layer(f).id === targetId) { stillExists = true; foundLayer = comp.layer(f); break; }
           }
         } catch(c3) {}

         if (stillExists) {
            DC_forensicLog('  - Unremoved Layer: "' + foundLayer.name + '" (id:' + targetId + ')');
            DC_forensicLog('    REASON TRACE: inManifestRemove=true, inWhitelist=' + (keepKey[compIdStr + '_' + targetId]||false) + ', foundInComp=true');
         }
       }
    }

    log.push('[STEP1] "' + comp.name + '": removed=' + removedCount + ' guarded=' + guardedCount);
  }
}
