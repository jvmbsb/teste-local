const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'node', 'analyze.src.js');
let src = fs.readFileSync(filePath, 'utf8');


// 1. Remove "manifest.compsToCollect = compsToCollect;" to clear Reference Error
src = src.replace(/\s*manifest\.compsToCollect = compsToCollect;/, '');

// 2. Extract BData block
const bdataStart = '  // ── Resolve bdata plugin refs (Conditional via Whitelist)';
const bdataEnd = "  log('Conditional bdata deps resolved: ' + bdataDeps.size);\n";
const bdataBlockIdx = src.indexOf(bdataStart);
const bdataEndIdx = src.indexOf(bdataEnd) + bdataEnd.length;

if (bdataBlockIdx !== -1 && bdataEndIdx !== -1) {
  const bdataBlock = src.substring(bdataBlockIdx, bdataEndIdx);
  // remove it from its current location
  src = src.substring(0, bdataBlockIdx) + src.substring(bdataEndIdx);
  
  // Insert it right after Extreme Pruning loop (before Items to move to LIMBO)
  const limboStart = '  // ── Items to move to LIMBO';
  const limboIdx = src.indexOf(limboStart);
  
  if (limboIdx !== -1) {
    // We also need to re-run reachability
    const finalReachableCode = `
  // ── Full BFS reachability (Post-Extreme and Post-BData) ───────────────────
  const reachable = graph.resolve([...selectedIds]);
  forceKeep.forEach(id => reachable.add(id));
  log('Final Reachable item ids: ' + reachable.size + ' / ' + allItems.length);
  
`;
    src = src.substring(0, limboIdx) + bdataBlock + '\n' + finalReachableCode + src.substring(limboIdx);
  }
}

// 3. Ensure the initial Reachability is pre-bdata for Extreme Pruning
const initialReach = '  // ── Full BFS reachability ─────────────────────────────────────────────────\n  const reachable = graph.resolve([...selectedIds]);\n  // Force-keep items are always reachable\n  forceKeep.forEach(id => reachable.add(id));\n  log(\'Reachable item ids: \' + reachable.size + \' / \' + allItems.length);';
const newInitialReach = '  // ── Pre-Bdata BFS reachability (For Extreme Pruning) ──────────────────────\n  const preReachable = graph.resolve([...selectedIds]);\n  forceKeep.forEach(id => preReachable.add(id));\n  log(\'Pre-Bdata Reachable item ids: \' + preReachable.size + \' / \' + allItems.length);';

src = src.replace(initialReach, newInitialReach);

// Replace reachable usages in Extreme Pruning setup with preReachable
const extTarget = "if (item.type === 'CompItem' && reachable.has(item.id) && !processedStandard.has(item.id)) {";
src = src.replace(extTarget, "if (item.type === 'CompItem' && preReachable.has(item.id) && !processedStandard.has(item.id)) {");


fs.writeFileSync(filePath, src);
console.log('Successfully patched analyze.src.js for BData and ReferenceError');
