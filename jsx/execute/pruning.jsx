/**
 * DeepClean v2 — External Comp Pruning (STEP 3b)
 * Selectively removes unrequired layers from external compositions.
 * Operates in reverse index order to avoid shifting.
 */

// ─── Prune unrequired layers from an external comp ───────────────────────────
function DC_pruneExternalComp(extComp, requiredLayers, log) {
  if (!requiredLayers || requiredLayers.length === 0) {
    log.push('[STEP3] "' + extComp.name + '": no pruning (empty required list)');
    return;
  }

  var reqMap = {};
  for (var ri = 0; ri < requiredLayers.length; ri++) {
    reqMap[String(requiredLayers[ri])] = true;
  }

  var pruned = 0;
  for (var li = extComp.numLayers; li >= 1; li--) {
    try {
      var layer = extComp.layer(li);
      if (!reqMap[String(layer.id)]) {
         try { layer.locked = false; } catch (e) {}
         try { layer.shy = false; } catch (e) {}
         layer.remove();
         pruned++;
      }
    } catch (ex2) {
      log.push('[STEP3][WARN] prune layer ' + li + ' in "' + extComp.name + '": ' + ex2.message);
    }
  }
  log.push('[STEP3] Pruned ' + pruned + ' layers from "' + extComp.name + '"');
}
