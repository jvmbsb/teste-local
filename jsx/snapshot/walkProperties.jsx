/**
 * DeepClean v2 — Recursive Property Walker
 * Generic traversal of ExtendScript property trees.
 * Used by extractExpressions.jsx and extractLayerRefs.jsx.
 */

// ─── Walk property tree collecting expression-enabled properties ──────────────
function DC_walkProps(prop, out) {
  try {
    if (prop.numProperties !== undefined && prop.numProperties > 0) {
      for (var i = 1; i <= prop.numProperties; i++) {
        try { DC_walkProps(prop.property(i), out); } catch (e) {}
      }
    } else {
      if (prop.expressionEnabled && prop.expression && prop.expression.length > 2) {
        out.push({
          matchName: prop.matchName || '',
          propName:  prop.name     || '',
          expression: prop.expression
        });
      }
    }
  } catch (e) {}
}
