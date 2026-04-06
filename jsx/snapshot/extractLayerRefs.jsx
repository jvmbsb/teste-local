/**
 * DeepClean v2 — Layer Reference Detector
 * Walks effect parameters to detect layer index references via:
 *   - Native Layer Reference property type (6418)
 *   - Heuristic: sliders/integers with layer-related names
 */

// ─── Collect effects recursively for Layer Parameters (Heuristic API) ──────────
function DC_walkEffects(prop, outIds, comp) {
  try {
    if (prop.numProperties !== undefined && prop.numProperties > 0) {
      for (var i = 1; i <= prop.numProperties; i++) {
        DC_walkEffects(prop.property(i), outIds, comp);
      }
    } else {
      var isLayerRef = false;
      var propType   = prop.propertyValueType;

      // Native Layer Reference check
      if (propType === 6418) isLayerRef = true;
      // Heuristic fallback for sliders/1d integers acting as layers
      else if ((propType === 4118 || propType === 4115 || propType === 4122 || typeof prop.value === 'number') && prop.name) {
        var n = prop.name.toLowerCase();
        if (n.indexOf('layer') !== -1 || n.indexOf('source') !== -1 || n.indexOf('target') !== -1 || n.indexOf('matte') !== -1) {
          isLayerRef = true;
        }
      }

      if (isLayerRef) {
        var idx = Math.round(prop.value);
        if (idx > 0 && idx <= comp.numLayers) {
          try {
            var targetLayer = comp.layer(idx);
            if (targetLayer && targetLayer.id) {
              outIds.push(targetLayer.id);
            }
          } catch(e) {}
        }
      }
    }
  } catch (e) {}
}
