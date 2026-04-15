/**
 * DeepClean v2 — Final Sweep (STEP 5)
 * Finds orphaned items (usedIn.length === 0) and moves them
 * to the _ORPHANS folder inside _LIMBO_DeepClean.
 * CompItems are now included, except system comps (__COLLECT__, **DC_ANCHOR**).
 * Selected comps are NEVER moved.
 */

function DC_finalSweep(proj, log, selectedCompIds) {
  var orphanFolder = null;
  var limboFolder = null;
  for (var f = 1; f <= proj.numItems; f++) {
    var it = proj.item(f);
    if (it instanceof FolderItem) {
       if (it.name === '_ORPHANS') orphanFolder = it;
       if (it.name === '_LIMBO_DeepClean') limboFolder = it;
    }
  }
  if (!orphanFolder) {
    if (!limboFolder) limboFolder = proj.items.addFolder('_LIMBO_DeepClean');
    orphanFolder = proj.items.addFolder('_ORPHANS');
    orphanFolder.parentFolder = limboFolder;
  }
  var orphaned = 0;
  for (var i = 1; i <= proj.numItems; i++) {
    try {
      var item = proj.item(i);
      if (item instanceof FolderItem) continue;

      // Protect system comps created by DeepClean
      if (item instanceof CompItem) {
        if (item.name === '__COLLECT__' || item.name === '**DC_ANCHOR**') continue;
      }

      // HARD SAFETY: never move a user-selected comp
      if (selectedCompIds[String(item.id)]) continue;

      if (item.usedIn && item.usedIn.length === 0) {
        if (item.parentFolder !== orphanFolder) {
          item.parentFolder = orphanFolder;
        }
        orphaned++;
      }
    } catch(e) {}
  }
  log.push('[STEP5] Final Sweep orphaned leftover items: ' + orphaned);
}
