/**
 * DeepClean v2 — CEP Host Bridge (jsx/host.jsx)
 * Loaded as ScriptPath by the CEP manifest.
 * Exposes DC_* functions callable from the panel via CSInterface.evalScript().
 */

// ── No more unreliable $.fileName parsing. The path is passed from JS. ───
//
// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns a small status JSON about the open project.
 * Called on a 3-second poll from the panel.
 */
function DC_getStatus() {
  try {
    var proj = app.project;
    if (!proj) return 'ERROR|No project open';

    var selComps = 0;
    var selTotal = proj.selection.length;
    for (var i = 0; i < selTotal; i++) {
      if (proj.selection[i] instanceof CompItem) selComps++;
    }

    var info = {
      projectName:    proj.file ? proj.file.name : 'Untitled',
      projectPath:    proj.file ? File.decode(proj.file.absoluteURI) : '',
      totalItems:     proj.items.length,
      selectedCount:  selTotal,
      selectedComps:  selComps
    };

    // Minimal JSON build (host.jsx may be loaded before snapshot.jsx polyfills)
    var parts = [];
    for (var k in info) {
      if (info.hasOwnProperty(k)) {
        var v = info[k];
        var vs = (typeof v === 'string')
          ? '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
          : String(v);
        parts.push('"' + k + '":' + vs);
      }
    }
    return 'SUCCESS|{' + parts.join(',') + '}';
  } catch (e) {
    return 'ERROR|' + e.message;
  }
}

/**
 * Runs Node 1 (snapshot) — loads snapshotMain.jsx dynamically.
 * Returns "SUCCESS|<path>" or "ERROR|<msg>".
 */
function DC_snapshot(extPath) {
  try {
    var dir = extPath + '/jsx/snapshot';
    var file = new File(dir + '/snapshotMain.jsx');
    if (!file.exists) file = new File(dir + '\\snapshotMain.jsx');
    if (!file.exists) throw new Error('Script not found: ' + file.fsName);
    $.evalFile(file);
    return DC_runSnapshot();
  } catch (e) {
    return 'ERROR|' + e.message;
  }
}

/**
 * Runs Node 3 (execution) — loads executeMain.jsx with manifest path injected.
 * @param {string} manifestPath  — native OS path to manifest_execution.json
 * @param {string} extPath       — native OS path to extension root
 * Returns "SUCCESS|<log>" or "ERROR|<msg>".
 */
function DC_execute(manifestPath, extPath) {
  try {
    var dir    = extPath + '/jsx/execute';
    var exFile = new File(dir + '/executeMain.jsx');
    if (!exFile.exists) return 'ERROR|executeMain.jsx not found at: ' + exFile.fsName;
    
    $.evalFile(exFile);
    return DC_runExecution(manifestPath);
  } catch (e) {
    return 'ERROR|' + e.message;
  }
}
