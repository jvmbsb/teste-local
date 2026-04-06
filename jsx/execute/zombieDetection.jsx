/**
 * DeepClean v2 — Zombie Detection / COLLECT Protocol (STEP 4)
 * Creates a __COLLECT__ composition containing surviving external comps
 * as disabled guide layers to prevent them from becoming orphans.
 *
 * Depends on: DC_findCompById (from executeMain.jsx)
 */

function DC_protocolCollect(proj, manifest, log) {
  var ids = manifest.compsToCollect || [];
  if (ids.length === 0) return;

  var collectComp = null;
  for (var i = 1; i <= proj.numItems; i++) {
    var it = proj.item(i);
    if (it instanceof CompItem && it.name === '__COLLECT__') {
       collectComp = it; break;
    }
  }
  if (!collectComp) {
     try { collectComp = proj.items.addComp('__COLLECT__', 1920, 1080, 1, 10, 30); } catch(e) {}
  }
  if (!collectComp) return;

  var collected = 0;
  for (var j = 0; j < ids.length; j++) {
    var sourceComp = DC_findCompById(proj, ids[j]);
    if (sourceComp) {
       try {
         var added = collectComp.layers.add(sourceComp);
         added.enabled = false;
         added.guideLayer = true;
         collected++;
       } catch(e) {}
    }
  }
  log.push('[STEP4] Collected ' + collected + ' external surviving comps into __COLLECT__');
}
