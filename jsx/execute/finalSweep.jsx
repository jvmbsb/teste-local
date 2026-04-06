/**
 * DeepClean v2 — Final Sweep (STEP 5)
 * Finds orphaned footage items (usedIn.length === 0) and moves them
 * to the _ORPHANS folder inside _LIMBO_DeepClean.
 */

function DC_finalSweep(proj, log) {
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
      if (item instanceof CompItem) continue;

      if (item.usedIn && item.usedIn.length === 0) {
        if (item.parentFolder !== orphanFolder) {
          item.parentFolder = orphanFolder;
        }
        if (item.name.indexOf('[DC]') !== 0) {
          item.name = '[DC] ' + item.name;
        }
        orphaned++;
      }
    } catch(e) {}
  }
  log.push('[STEP5] Final Sweep orphaned leftover footages: ' + orphaned);
}
