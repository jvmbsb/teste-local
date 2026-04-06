/**
 * DeepClean v2 — DC_ANCHOR Manager (STEP 3a)
 * Creates/finds the **DC_ANCHOR** composition and adds external comps
 * as disabled guide layers to prevent orphaning.
 *
 * Depends on: DC_findCompById (from executeMain.jsx)
 */

// ─── Find or create **DC_ANCHOR** comp ───────────────────────────────────────
function DC_findOrCreateAnchor(proj, log) {
  // Search for existing anchor
  for (var i = 1; i <= proj.items.length; i++) {
    try {
      var it = proj.items[i];
      if (it instanceof CompItem && it.name === '**DC_ANCHOR**') return it;
    } catch (e) {}
  }

  // Determine settings from first available comp
  var w = 1920, h = 1080, fr = 24;
  for (var j = 1; j <= proj.items.length; j++) {
    try {
      var c = proj.items[j];
      if (c instanceof CompItem && c.name !== '**DC_ANCHOR**') {
        w  = c.width;
        h  = c.height;
        fr = c.frameRate;
        break;
      }
    } catch (e) {}
  }

  var anchor = proj.items.addComp('**DC_ANCHOR**', w, h, 1, 1 / fr, fr);
  log.push('[STEP3] Created **DC_ANCHOR** ' + w + 'x' + h + ' @' + fr);
  return anchor;
}

// ─── Add external comp to anchor (if not already present) ────────────────────
function DC_addCompToAnchor(anchor, extComp, log) {
  // Check if already added
  for (var li = 1; li <= anchor.numLayers; li++) {
    try {
      var al = anchor.layer(li);
      if (al instanceof AVLayer && al.source && al.source.id === extComp.id) {
        return; // already present
      }
    } catch (e2) {}
  }

  try {
    var newLyr     = anchor.layers.add(extComp);
    newLyr.enabled    = false;
    newLyr.guideLayer = true;
    newLyr.shy        = true;
    log.push('[STEP3] Added "' + extComp.name + '" to DC_ANCHOR');
  } catch (ex) {
    log.push('[STEP3][WARN] Cannot add "' + extComp.name + '" to DC_ANCHOR: ' + ex.message);
  }
}
