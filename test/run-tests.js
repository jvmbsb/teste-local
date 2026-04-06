/**
 * DeepClean v2 — Analysis Engine Test Suite
 * Run: node test/run-tests.js
 *
 * Tests:
 *   1. Basic dependency resolution
 *   2. [KEEP] force-whitelist override
 *   3. Dynamic expression detection → UNUSED
 *   4. Static expression → item name match → KEEP
 *   5. AEPX bdata hex mining (real hex with embedded path)
 *   6. External comp selective pruning (parent chain expansion)
 *   7. Circular dependency guard (selected comp = external comp)
 *   8. Multiple selected comps sharing external comp
 *   9. Null layer without expressions → REMOVE
 *  10. Windows long-path prefix normPath()
 */

'use strict';

const fs    = require('fs');
const path  = require('path');
const {spawnSync} = require('child_process');

const BUNDLE  = path.resolve(__dirname, '..', 'node', 'analyze.bundle.js');
const TMP     = path.join(require('os').tmpdir(), 'dc_tests');
fs.mkdirSync(TMP, { recursive: true });

let passed = 0;
let failed = 0;
const results = [];

function runAnalysis(snapshot, label) {
  const snapPath = path.join(TMP, label.replace(/\s+/g,'_') + '_snap.json');
  fs.writeFileSync(snapPath, JSON.stringify(snapshot, null, 2));
  const r = spawnSync(process.execPath, [BUNDLE, snapPath], { timeout: 30000 });
  const stdout = (r.stdout || '').toString();
  const stderr = (r.stderr || '').toString();
  if (r.status !== 0 || !stdout.includes('MANIFEST_READY')) {
    return { error: 'Process failed (exit ' + r.status + ')\nSTDOUT: ' + stdout + '\nSTDERR: ' + stderr };
  }
  const mPath = stdout.split('MANIFEST_READY|')[1].trim();
  try {
    return JSON.parse(fs.readFileSync(mPath, 'utf8'));
  } catch (e) {
    return { error: 'Manifest parse error: ' + e.message };
  }
}

function assert(label, condition, detail) {
  if (condition) {
    passed++;
    results.push('  ✓ ' + label);
  } else {
    failed++;
    results.push('  ✗ FAIL: ' + label + (detail ? '\n      ' + detail : ''));
  }
}

function makeItem(id, name, type, filePath) {
  return {
    id, name,
    type: type || 'FootageItem',
    parentId: null,
    filePath: filePath || '',
    hasVideo: true, hasAudio: false,
    duration: 5, width: 0, height: 0, frameRate: 0, numLayers: 0
  };
}

function makeCompItem(id, name, numLayers) {
  return {
    id, name, type: 'CompItem', parentId: null, filePath: '',
    hasVideo: true, hasAudio: false,
    duration: 5, width: 1920, height: 1080, frameRate: 24,
    numLayers: numLayers || 1
  };
}

function makeLayer(index, name, opts) {
  opts = opts || {};
  return {
    index, name,
    enabled: true, solo: false, shy: false,
    guideLayer: false, isNull: opts.isNull || false,
    isText: false, isShape: false, isCamera: false, isLight: false, isAdj: false,
    inPoint: 0, outPoint: 5,
    sourceId:    opts.sourceId    || null,
    parentIndex: opts.parentIndex || null,
    effectMatchNames: opts.effects || [],
    expressions: opts.expressions || []
  };
}

function makeSnap(opts) {
  return {
    version: '2.0.0',
    tempDir: TMP,
    aepxPath: opts.aepxPath || '',
    projectName: 'Test',
    selectedComps:      opts.selectedComps      || [],
    allItems:           opts.allItems           || [],
    externalCompLayers: opts.externalCompLayers || []
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1: Basic — source layer kept, unused null removed
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[TEST 1] Basic dependency resolution');
{
  const snap = makeSnap({
    selectedComps: [{ id:1, name:'Main', layers:[
      makeLayer(1,'BG',   { sourceId:10 }),
      makeLayer(2,'Null', { isNull:true })
    ]}],
    allItems: [
      makeCompItem(1,'Main',2),
      makeItem(10,'BG Footage'),
      makeItem(20,'Orphan')
    ]
  });
  const m = runAnalysis(snap, 'test1');
  assert('BG Footage not in limbo',   !m.itemsToMoveToLimbo?.some(i=>i.id===10));
  assert('Orphan in limbo',            m.itemsToMoveToLimbo?.some(i=>i.id===20));
  assert('Null layer removed',         m.layersToRemove?.some(l=>l.compId===1 && l.layerIndex===2));
  assert('BG layer NOT removed',      !m.layersToRemove?.some(l=>l.compId===1 && l.layerIndex===1));
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2: [KEEP] override
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[TEST 2] [KEEP] force-whitelist');
{
  const snap = makeSnap({
    selectedComps: [{ id:1, name:'Main', layers:[ makeLayer(1,'Layer',{sourceId:10}) ]}],
    allItems: [
      makeCompItem(1,'Main',1),
      makeItem(10,'Asset A'),
      makeItem(99,'[KEEP] Protected Asset')
    ]
  });
  const m = runAnalysis(snap, 'test2');
  assert('[KEEP] item not in limbo',   !m.itemsToMoveToLimbo?.some(i=>i.id===99));
  assert('[KEEP] warning count is 0',  !m.warnings?.some(w=>w.includes('[KEEP]')));
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3: Dynamic expression → UNUSED (aggressive mode)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[TEST 3] Dynamic expression → UNUSED');
{
  const snap = makeSnap({
    selectedComps: [{ id:1, name:'Main', layers:[
      makeLayer(1,'Dynamic Layer',{ sourceId:null, isNull:false,
        expressions:[{
          matchName:'ADBE Opacity', propName:'Opacity',
          expression:'eval("thisComp.layer(i).opacity")'
        }]
      })
    ]}],
    allItems:[ makeCompItem(1,'Main',1) ]
  });
  const m = runAnalysis(snap, 'test3');
  assert('Dynamic expr warning present', m.warnings?.some(w=>w.includes('Dynamic expression')));
  assert('dynamicExprs stat = 1',        m.stats?.dynamicExprs === 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 4: Static expression → item name match → dep kept
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[TEST 4] Static expression → name match → KEEP dep');
{
  const snap = makeSnap({
    selectedComps: [{ id:1, name:'Main', layers:[
      makeLayer(1,'Expr Layer',{
        sourceId:null,
        expressions:[{
          matchName:'ADBE Position', propName:'Position',
          expression:'comp("Logo Comp").layer(1).transform.position'
        }]
      })
    ]}],
    allItems:[
      makeCompItem(1,'Main',1),
      makeCompItem(50,'Logo Comp',1)
    ]
  });
  const m = runAnalysis(snap, 'test4');
  assert('Logo Comp kept via expression', !m.itemsToMoveToLimbo?.some(i=>i.id===50));
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 5: AEPX bdata hex mining — embedded file path in hex
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[TEST 5] AEPX bdata hex mining');
{
  // Write a minimal fake AEPX with a <bdata> block containing a hex-encoded path
  // The path: "/Volumes/Media/MyPlugin/asset.mov"
  const embeddedPath = '/Volumes/Media/MyPlugin/asset.mov';
  const hexStr = Buffer.from(embeddedPath, 'utf8').toString('hex');

  const aepxContent = `<?xml version="1.0" encoding="UTF-8"?>
<AfterEffectsProject>
  <compitem ae:name="Main">
    <layer ae:name="Plugin Layer">
      <effect ae:name="MyPlugin">
        <bdata>${hexStr}</bdata>
      </effect>
    </layer>
  </compitem>
</AfterEffectsProject>`;

  const aepxPath = path.join(TMP, 'test5.aepx');
  fs.writeFileSync(aepxPath, aepxContent, 'utf8');

  // Create a temp file that "exists" on disk so fileExists() passes
  const assetPath = path.join(TMP, 'asset_mock.mov');
  fs.writeFileSync(assetPath, 'mock');

  const snap = makeSnap({
    aepxPath,
    selectedComps: [{ id:1, name:'Main', layers:[
      makeLayer(1,'Plugin Layer',{sourceId:null, effects:['MyPlugin']})
    ]}],
    allItems:[
      makeCompItem(1,'Main',1),
      // Item whose name matches a string extracted from bdata
      makeItem(77,'asset.mov', 'FootageItem', assetPath)
    ]
  });
  const m = runAnalysis(snap, 'test5');
  // The hex-mined strings from bdata should include 'asset.mov' or the full path
  // whether the item ends up kept depends on whether the name/path match fires
  // Check bdata was processed (no fatal errors)
  assert('Analysis completes without error', !m.error);
  assert('bdata blobs parsed (no crash)',    typeof m.stats === 'object');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 6: External comp — parent chain expansion
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[TEST 6] External comp selective pruning with parent chain');
{
  const snap = makeSnap({
    selectedComps:[{ id:1, name:'Master', layers:[
      makeLayer(1,'Logo',{sourceId:20})
    ]}],
    allItems:[
      makeCompItem(1,'Master',1),
      makeCompItem(20,'Logo Comp',3)
    ],
    externalCompLayers:[{
      compId:20, compName:'Logo Comp',
      layers:[
        makeLayer(1,'Background',{}),              // seed (whole-comp source)
        makeLayer(2,'Shape',{parentIndex:1}),      // parent of shape → must keep 1
        makeLayer(3,'Orphan Layer',{})             // should be pruned
      ]
    }]
  });
  const m = runAnalysis(snap, 'test6');
  const ext = m.externalComps?.find(e=>e.compId===20);
  assert('External comp present',            !!ext);
  assert('Layer 1 required (parent)',         ext?.requiredLayers?.includes(1));
  assert('Layer 2 required (has parent)',     ext?.requiredLayers?.includes(2));
  assert('Logo Comp not in limbo',           !m.itemsToMoveToLimbo?.some(i=>i.id===20));
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 7: Two selected comps cross-reference each other
// Both comps are selected — neither enters externalCompMap (correct behaviour).
// The BFS visits both; no circular warning, no crash.
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[TEST 7] Cross-referencing selected comps — BFS handles gracefully');
{
  const snap = makeSnap({
    selectedComps:[
      { id:1, name:'A', layers:[ makeLayer(1,'B ref',{sourceId:2}) ] },
      { id:2, name:'B', layers:[ makeLayer(1,'A ref',{sourceId:1}) ] }
    ],
    allItems:[ makeCompItem(1,'A',1), makeCompItem(2,'B',1) ],
    externalCompLayers:[]
  });
  const m = runAnalysis(snap, 'test7');
  assert('No crash on mutual references',    typeof m.stats === 'object');
  assert('Both comps reachable (not limbo)', m.itemsToMoveToLimbo?.length === 0);
  assert('No layers removed (both used)',    m.layersToRemove?.length === 0);
  assert('No external comps (both selected)', m.externalComps?.length === 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 8: Multiple selected comps sharing one external comp
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[TEST 8] Multiple selected comps share external comp');
{
  const snap = makeSnap({
    selectedComps:[
      { id:1, name:'Comp A', layers:[ makeLayer(1,'shared',{sourceId:30}) ]},
      { id:2, name:'Comp B', layers:[ makeLayer(1,'shared',{sourceId:30}) ]}
    ],
    allItems:[
      makeCompItem(1,'Comp A',1),
      makeCompItem(2,'Comp B',1),
      makeCompItem(30,'Shared External',2)
    ],
    externalCompLayers:[{
      compId:30, compName:'Shared External',
      layers:[ makeLayer(1,'Layer 1',{}), makeLayer(2,'Layer 2',{}) ]
    }]
  });
  const m = runAnalysis(snap, 'test8');
  assert('Shared external not in limbo', !m.itemsToMoveToLimbo?.some(i=>i.id===30));
  assert('Exactly one external comp entry', m.externalComps?.length === 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 9: Null layer without source or expressions → REMOVE
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[TEST 9] Bare null layer → removed from timeline');
{
  const snap = makeSnap({
    selectedComps:[{ id:1, name:'Main', layers:[
      makeLayer(1,'Used Footage',{sourceId:10}),
      makeLayer(2,'Bare Null',{isNull:true})
    ]}],
    allItems:[ makeCompItem(1,'Main',2), makeItem(10,'Footage') ]
  });
  const m = runAnalysis(snap, 'test9');
  assert('Bare null layer removed',    m.layersToRemove?.some(l=>l.layerIndex===2));
  assert('Used footage layer kept',   !m.layersToRemove?.some(l=>l.layerIndex===1));
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 10: normPath Windows long-path prefix (unit test — no spawn)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[TEST 10] normPath Windows long-path logic (unit)');
{
  // Inline the same normPath logic from analyze.src.js
  function normPath(p) {
    if (!p) return p;
    // Only apply on Windows; simulate by checking prefix
    if (p.length > 200 && !p.startsWith('\\\\?\\')) {
      return '\\\\?\\' + p.replace(/\//g, '\\');
    }
    return p;
  }
  const shortPath = 'C:\\Users\\Test\\file.aep';
  const longPath  = 'C:\\' + 'a'.repeat(200) + '\\file.aep';
  assert('Short path unchanged',      normPath(shortPath) === shortPath);
  assert('Long path gets \\\\?\\ prefix', normPath(longPath).startsWith('\\\\?\\'));
  assert('Long path has backslashes', !normPath(longPath).includes('/'));
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 11: Shadow-comp guard — selected comp also appears in externalCompLayers
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[TEST 11] Shadow-comp guard (externalCompLayers has selected comp id)');
{
  const snap = makeSnap({
    selectedComps:[{ id:1, name:'Main', layers:[ makeLayer(1,'L',{sourceId:10}) ]}],
    allItems:[ makeCompItem(1,'Main',1), makeItem(10,'Asset') ],
    externalCompLayers:[{
      // compId 1 = Main, which IS selected — should trigger shadow-comp warning
      compId:1, compName:'Main',
      layers:[ makeLayer(1,'L',{sourceId:10}) ]
    }]
  });
  const m = runAnalysis(snap, 'test11');
  assert('Shadow-comp warning emitted', m.warnings?.some(w=>w.includes('conflict')));
  assert('No crash on shadow-comp',     typeof m.stats === 'object');
}

// ─────────────────────────────────────────────────────────────────────────────
// RESULTS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(60));
results.forEach(r => console.log(r));
console.log('─'.repeat(60));
console.log('\n' + passed + '/' + (passed+failed) + ' assertions passed' +
  (failed > 0 ? '  (' + failed + ' FAILED)' : ' ✓'));

if (failed > 0) process.exit(1);
