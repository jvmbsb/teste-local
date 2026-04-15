/**
 * DeepClean v2 — Expression Collector
 * Collects all active expressions from a layer using DC_walkProps.
 * Depends on: walkProperties.jsx (DC_walkProps)
 */

// ─── Collect expression list from a layer (recursive property walk) ───────────
function DC_layerExpressions(layer) {
  var exprs = [];
  DC_walkProps(layer, exprs);
  return exprs;
}
