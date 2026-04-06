/**
 * DeepClean v2 — NODE 3: Execution Engine (Entry Point)
 * ExtendScript ES3-compatible
 *
 * Called from host.jsx via $.evalFile().
 * All operations wrapped in ONE Undo Group.
 *
 * Steps:
 *   1. TIMELINE: remove layers not in whitelist (descending index order)
 *   2. LIMBO: move unused items to _LIMBO_DeepClean (never delete)
 *   3. DC_ANCHOR: create anchor comp, add external comps as disabled guide layers
 *      + PRUNING: selectively remove unrequired layers from external comps
 *   4. COLLECT: create __COLLECT__ comp with surviving external comps
 *   5. FINAL SWEEP: move orphaned footage to _ORPHANS
 *
 * Loaded via $.evalFile() from host.jsx.
 * Sub-modules loaded via #include in dependency order.
 */

// ─── Module Includes ──────────────────────────────────────────────────────────
#include "../shared/polyfills.jsx"
#include "cleanTimeline.jsx"
#include "limboManager.jsx"
#include "anchorManager.jsx"
#include "pruning.jsx"
#include "zombieDetection.jsx"
#include "finalSweep.jsx"

// ─── Safe JSON parse (uses built-in where available, eval fallback) ───────────
function DC_parseJSON(str) {
  if (typeof JSON !== 'undefined' && JSON.parse) {
    return JSON.parse(str);
  }
  // ES3 fallback — safe because we control the source
  return eval('(' + str + ')');
}

// ─── Read entire file as UTF-8 string ─────────────────────────────────────────
function DC_readFile(fsPath) {
  var f = new File(fsPath);
  if (!f.exists) throw new Error('File not found: ' + fsPath);
  f.encoding = 'UTF-8';
  f.open('r');
  var s = f.read();
  f.close();
  return s;
}

// ─── Find project item by numeric id ─────────────────────────────────────────
function DC_findItemById(proj, id) {
  var n = proj.items.length;
  for (var i = 1; i <= n; i++) {
    try { if (proj.items[i].id === id) return proj.items[i]; } catch (e) {}
  }
  return null;
}

// ─── Find CompItem by numeric id ─────────────────────────────────────────────
function DC_findCompById(proj, id) {
  var n = proj.items.length;
  for (var i = 1; i <= n; i++) {
    try {
      var item = proj.items[i];
      if (item instanceof CompItem && item.id === id) return item;
    } catch (e) {}
  }
  return null;
}

// ─── Find or create FolderItem ────────────────────────────────────────────────
function DC_findOrCreateFolder(proj, name, parent) {
  parent = parent || proj.rootFolder;
  var n = proj.items.length;
  for (var i = 1; i <= n; i++) {
    try {
      var item = proj.items[i];
      if (item instanceof FolderItem &&
          item.name === name &&
          item.parentFolder === parent) {
        return item;
      }
    } catch (e) {}
  }
  var folder = proj.items.addFolder(name);
  folder.parentFolder = parent;
  return folder;
}

// ─── Sort descending (ES3 safe) ───────────────────────────────────────────────
function DC_sortDesc(arr) {
  return arr.slice().sort(function (a, b) { return b - a; });
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
function DC_runExecution(manifestPath) {
  var log = [];
  log.push('[DC] Execution start: ' + manifestPath);

  // Validate manifest path
  var mFile = new File(manifestPath);
  if (!mFile.exists) return 'ERROR|Manifest not found: ' + manifestPath;

  // Read and parse manifest
  var manifest;
  try {
    manifest = DC_parseJSON(DC_readFile(manifestPath));
  } catch (e) {
    return 'ERROR|Could not parse manifest: ' + e.message;
  }

  // ── Single Undo Group ─────────────────────────────────────────────────────
  app.beginUndoGroup('DeepClean v2');
  try {
    var proj = app.project;

    // STEP 1: Timeline cleanup
    DC_cleanTimelines(proj, manifest, log);

    // STEP 2: LIMBO organisation
    DC_organiseLimbo(proj, manifest, log);

    // STEP 3: DC_ANCHOR + external comp pruning
    var externalComps = manifest.externalComps || [];
    if (externalComps.length > 0) {
      log.push('[STEP3] DC_ANCHOR / external comp handling begin');
      var anchor = DC_findOrCreateAnchor(proj, log);

      for (var e = 0; e < externalComps.length; e++) {
        var extEntry = externalComps[e];
        var extComp  = DC_findCompById(proj, extEntry.compId);
        if (!extComp) {
          log.push('[STEP3][WARN] External comp id ' + extEntry.compId + ' not found');
          continue;
        }

        // Add to DC_ANCHOR
        DC_addCompToAnchor(anchor, extComp, log);

        // Selective pruning
        DC_pruneExternalComp(extComp, extEntry.requiredLayers || [], log);
      }
    } else {
      log.push('[STEP3] No external comps.');
    }

    // STEP 4: COLLECT protocol
    DC_protocolCollect(proj, manifest, log);

    // STEP 5: Final sweep
    DC_finalSweep(proj, log);

  } catch (err) {
    app.endUndoGroup();
    return 'ERROR|' + err.message + '\n--- LOG ---\n' + log.join('\n');
  }
  app.endUndoGroup();

  log.push('[DC] Execution complete.');
  return 'SUCCESS|' + log.join('\n');
}
