/**
 * DeepClean v2 — LIMBO Manager (STEP 2)
 * Moves unused items into _LIMBO_DeepClean folder structure.
 * Creates per-comp sub-folders for traceability.
 *
 * Depends on: DC_findItemById, DC_findOrCreateFolder (from executeMain.jsx)
 */

function DC_organiseLimbo(proj, manifest, log) {
  log.push('[STEP2] LIMBO organisation begin');

  var itemsToMove = manifest.itemsToMoveToLimbo || [];
  if (itemsToMove.length === 0) {
    log.push('[STEP2] No items to move.');
    return;
  }

  // Create root LIMBO folder
  var limboRoot    = DC_findOrCreateFolder(proj, '_LIMBO_DeepClean', proj.rootFolder);
  var orphanFolder = DC_findOrCreateFolder(proj, 'ORPHANS', limboRoot);

  // Per-comp folders (created on demand)
  var compFolderCache = {};

  var moved    = 0;
  var notFound = 0;

  for (var i = 0; i < itemsToMove.length; i++) {
    var entry = itemsToMove[i];
    var item  = DC_findItemById(proj, entry.id);

    if (!item) { notFound++; continue; }

    // Never move the LIMBO folder itself
    if (item instanceof FolderItem && item.name === '_LIMBO_DeepClean') continue;

    // Determine target sub-folder
    var dest;
    if (entry.ownerCompId) {
      var ck2 = String(entry.ownerCompId);
      if (!compFolderCache[ck2]) {
        var folderName = (entry.ownerCompName || ('Comp_' + ck2)).substring(0, 60);
        compFolderCache[ck2] = DC_findOrCreateFolder(proj, folderName, limboRoot);
      }
      dest = compFolderCache[ck2];
    } else {
      dest = orphanFolder;
    }

    // Prefix name with [DC] if not already
    if (item.name.indexOf('[DC]') !== 0) {
      try { item.name = '[DC] ' + item.name; } catch (e) {}
    }

    // Move
    try {
      item.parentFolder = dest;
      moved++;
    } catch (e) {
      log.push('[STEP2][WARN] Could not move "' + item.name + '": ' + e.message);
    }
  }

  log.push('[STEP2] moved=' + moved + ' notFound=' + notFound);
}
