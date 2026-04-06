/**
 * DeepClean v2 — Panel Controller (panel/js/main.js)
 *
 * Orchestrates all three nodes:
 *   Node 1  →  CSInterface.evalScript('DC_snapshot()')
 *   Node 2  →  child_process.spawn(process.execPath, ['analyze.bundle.js', snapshotPath])
 *   Node 3  →  CSInterface.evalScript('DC_execute("...")')
 *
 * ZERO-CONFIG: analyze.bundle.js is pre-built and shipped with the extension.
 * End-user never touches a terminal.
 *
 * Node.js is available inside CEP panels via --enable-nodejs.
 */

/* global CSInterface, SystemPath */
(function () {
  'use strict';

  // ─── Node.js modules (available via CEP --enable-nodejs) ─────────────────
  const nodeAvail  = typeof require === 'function';
  const _cp        = nodeAvail ? require('child_process') : null;
  const _fs        = nodeAvail ? require('fs')            : null;
  const _path      = nodeAvail ? require('path')          : null;
  const _os        = nodeAvail ? require('os')            : null;

  // ─── CEP interface ────────────────────────────────────────────────────────
  let cs = null;
  let extensionRoot = null;

  try {
    cs = new CSInterface();
    extensionRoot = cs.getSystemPath(SystemPath.EXTENSION);

    // Normalise path — CEP may return:
    //   "file:///C:/path/..."  (Windows, URI)
    //   "file:///path/..."     (macOS, URI)
    //   "/path/..."            (macOS, native)
    //   "C:\\path\\..."       (Windows, native)
    if (extensionRoot && extensionRoot.startsWith('file://')) {
      // Decode URI component (handles %20 etc.)
      try { extensionRoot = decodeURIComponent(extensionRoot); } catch (e) {}
      extensionRoot = extensionRoot.replace(/^file:\/\//, '');
      // On Windows: "file:///C:/..." → after replace → "/C:/..." → strip leading slash
      if (/^\/[A-Za-z]:/.test(extensionRoot)) {
        extensionRoot = extensionRoot.slice(1);
      }
    } else if (extensionRoot) {
      try { extensionRoot = decodeURIComponent(extensionRoot); } catch (e) {}
    }

    // Fallback: derive from panel/js/main.js location (__dirname = panel/js/)
    if (!extensionRoot || extensionRoot.length < 3) {
      extensionRoot = _path ? _path.resolve(__dirname, '../..') : '.';
    }
  } catch (e) {
    extensionRoot = _path ? _path.resolve(__dirname, '../..') : '.';
  }

  // ─── State ────────────────────────────────────────────────────────────────
  const S = { IDLE:0, SNAPSHOT:1, ANALYZING:2, DRY_RUN:3, EXECUTING:4, DONE:5, ERROR:6 };
  let state        = S.IDLE;
  let snapshotPath = null;
  let manifestPath = null;
  let manifest     = null;

  // ─── DOM ──────────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const D = {
    projName:    $('proj-name'),
    projItems:   $('proj-items'),
    selComps:    $('sel-comps'),
    sbDot:       $('sb-dot'),
    sbTxt:       $('sb-txt'),
    idle:        $('idle'),
    progCard:    $('prog-card'),
    progMsg:     $('prog-msg'),
    progPct:     $('prog-pct'),
    progFill:    $('prog-fill'),
    dryCard:     $('dry-card'),
    warnCard:    $('warn-card'),
    warnList:    $('warn-list'),
    logCard:     $('log-card'),
    logOut:      $('log-out'),
    alert:       $('alert'),
    pills:       document.querySelectorAll('.pill'),
    // stats
    stLayers:    $('st-layers'),
    stItems:     $('st-items'),
    stExt:       $('st-ext'),
    stMB:        $('st-mb'),
    stWarn:      $('st-warn'),
    // summary
    sumLayers:   $('sum-layers'),
    sumItems:    $('sum-items'),
    sumExt:      $('sum-ext'),
    sumMB:       $('sum-mb'),
    sumWarn:     $('sum-warn'),
    // buttons
    btnAnalyse:  $('btn-analyse'),
    btnExec:     $('btn-exec'),
    btnReset:    $('btn-reset')
  };

  // ─── Utilities ────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  function ts() {
    return new Date().toLocaleTimeString('en-GB', { hour12: false });
  }

  function appendLog(msg, type) {
    if (!D.logOut) return;
    type = type || 'info';
    const span = document.createElement('span');
    span.className = 'll ' + type;
    span.textContent = '[' + ts() + '] ' + msg;
    D.logOut.appendChild(span);
    D.logOut.appendChild(document.createTextNode('\n'));
    D.logOut.scrollTop = D.logOut.scrollHeight;
  }

  function showAlert(msg, type) {
    D.alert.className = 'alert vis ' + (type || 'inf');
    D.alert.textContent = msg;
  }

  function clearAlert() {
    D.alert.className = 'alert';
    D.alert.textContent = '';
  }

  function setStatus(txt, dotCls) {
    D.sbTxt.textContent = txt;
    D.sbDot.className = 'sb-dot ' + (dotCls || '');
  }

  function setProg(pct, msg) {
    D.progFill.style.width = pct + '%';
    if (msg) D.progMsg.textContent = msg;
    D.progPct.textContent = pct + '%';
  }

  function setStep(n) {
    D.pills.forEach((p, i) => {
      p.className = 'pill' + (i < n ? ' done' : i === n ? ' active' : '');
    });
  }

  // ─── Show / hide panels ───────────────────────────────────────────────────
  const PANELS = ['idle','progCard','dryCard','warnCard','logCard'];
  function showPanels(visible) {
    PANELS.forEach(k => {
      const el = D[k];
      if (!el) return;
      const show = visible.indexOf(k) !== -1;
      el.classList.toggle('hidden', !show);
    });
  }

  // ─── Button sync ─────────────────────────────────────────────────────────
  function syncButtons() {
    const busy = state === S.SNAPSHOT || state === S.ANALYZING || state === S.EXECUTING;
    D.btnAnalyse.disabled = busy;
    D.btnAnalyse.classList.toggle('loading', busy);

    D.btnExec.classList.toggle('hidden', state !== S.DRY_RUN);
    D.btnExec.disabled = state !== S.DRY_RUN;
    D.btnExec.classList.toggle('loading', state === S.EXECUTING);

    D.btnReset.classList.toggle('hidden', state === S.IDLE);
  }

  // ─── Transition ──────────────────────────────────────────────────────────
  function go(s) {
    state = s;
    syncButtons();
    switch (s) {
      case S.IDLE:
        showPanels(['idle']);
        setStatus('Ready', '');
        setStep(-1);
        break;
      case S.SNAPSHOT:
        showPanels(['progCard','logCard']);
        setStatus('Collecting snapshot…', 'pulse');
        setStep(0); setProg(5, 'Running Node 1…');
        break;
      case S.ANALYZING:
        showPanels(['progCard','logCard']);
        setStatus('Analysing…', 'pulse');
        setStep(1); setProg(35, 'Streaming AEPX + resolving graph…');
        break;
      case S.DRY_RUN:
        showPanels(['dryCard','warnCard','logCard']);
        setStatus('Review & execute', 'ok');
        setStep(2); setProg(75, 'Analysis complete');
        break;
      case S.EXECUTING:
        showPanels(['progCard','logCard']);
        setStatus('Executing…', 'pulse');
        setStep(3); setProg(80, 'Applying changes in AE…');
        break;
      case S.DONE:
        showPanels(['logCard']);
        setStatus('Complete ✓', 'ok');
        setStep(4); setProg(100, 'Done');
        showAlert('DeepClean complete. Press Ctrl/Cmd+Z to undo all changes.', 'ok');
        break;
      case S.ERROR:
        showPanels(['logCard']);
        setStatus('Error', 'err');
        break;
    }
  }

  // ─── Update project info bar ──────────────────────────────────────────────
  function updateProjInfo(info) {
    D.projName.textContent  = info.projectName || '—';
    D.projItems.textContent = info.totalItems  || '—';
    D.selComps.textContent  = info.selectedComps || '0';
    const ok = info.selectedComps > 0;
    D.sbDot.className = 'sb-dot ' + (ok ? 'ok' : 'warn');
    D.sbTxt.textContent = ok
      ? info.selectedComps + ' comp(s) selected'
      : 'Select comp(s) in Project panel';
  }

  // ─── Populate dry-run UI ──────────────────────────────────────────────────
  function populateDryRun(m) {
    const s = m.stats || {};
    const lr = s.layersToRemove  || 0;
    const il = s.itemsToLimbo    || 0;
    const ec = s.externalComps   || 0;
    const mb = s.estimatedSavedMB || '0';
    const wc = s.warningCount    || 0;

    D.stLayers.textContent = lr;  D.stLayers.className = 'stat-val ' + (lr > 0 ? 'red' : 'grn');
    D.stItems.textContent  = il;  D.stItems.className  = 'stat-val ' + (il > 0 ? 'org' : 'grn');
    D.stExt.textContent    = ec;  D.stExt.className    = 'stat-val';
    D.stMB.textContent     = mb + ' MB'; D.stMB.className  = 'stat-val acc';
    D.stWarn.textContent   = wc;  D.stWarn.className   = 'stat-val ' + (wc > 0 ? 'org' : 'grn');

    D.sumLayers.textContent = lr;
    D.sumItems.textContent  = il;
    D.sumExt.textContent    = ec;
    D.sumMB.textContent     = mb + ' MB freed';
    D.sumWarn.textContent   = wc + ' warning(s)';

    // Warning classes
    D.sumLayers.className = 'sum-val' + (lr > 0 ? ' red' : ' grn');
    D.sumItems.className  = 'sum-val' + (il > 0 ? ' org' : ' grn');
    D.sumExt.className    = 'sum-val';
    D.sumMB.className     = 'sum-val acc';
    D.sumWarn.className   = 'sum-val' + (wc > 0 ? ' org' : ' grn');

    // Warnings list
    D.warnList.innerHTML = '';
    const warns = m.warnings || [];
    if (warns.length === 0) {
      D.warnCard.classList.add('hidden');
    } else {
      D.warnCard.classList.remove('hidden');
      warns.forEach(w => {
        const d = document.createElement('div');
        d.className = 'warn-item';
        d.innerHTML = '<span class="warn-ico">⚠</span><span>' + esc(w) + '</span>';
        D.warnList.appendChild(d);
      });
    }
  }

  // ─── evalScript → Promise ─────────────────────────────────────────────────
  function evalScript(src) {
    return new Promise((resolve, reject) => {
      if (!cs) return reject(new Error('CSInterface not available'));
      cs.evalScript(src, result => {
        if (result === 'EvalScript error.') {
          reject(new Error('evalScript failed: ' + src.substring(0, 60)));
        } else {
          resolve(result || '');
        }
      });
    });
  }

  // ─── Resolve bundle path ──────────────────────────────────────────────────
  function getBundlePath() {
    if (!_path || !extensionRoot) throw new Error('path module not available');
    // Shipped location: <extension_root>/node/analyze.bundle.js
    const p = _path.join(extensionRoot, 'node', 'analyze.bundle.js');
    if (_fs && !_fs.existsSync(p)) {
      throw new Error('analyze.bundle.js not found at: ' + p +
        '\nRun: npm run build (developer mode)');
    }
    return p;
  }

  // ─── Spawn Node 2 ─────────────────────────────────────────────────────────
  function runAnalysis(snapPath) {
    return new Promise((resolve, reject) => {
      // NOTE: process.execPath in CEP is CEPHtmlEngine, not a Node binary!
      // To run Node code in "zero-config" CEP seamlessly, we require() it and 
      // intercept process.stdout + process.exit since the bundle is a CLI script.
      const bundlePath = getBundlePath();
      appendLog('Loading in-process: ' + _path.basename(bundlePath), 'info');

      const oldStdout = process.stdout.write;
      const oldStderr = process.stderr.write;
      const oldArgv   = process.argv;
      const oldExit   = process.exit;

      let mPath = null;
      let done = false;

      function finish(err, res) {
        if (done) return;
        done = true;
        process.stdout.write = oldStdout;
        process.stderr.write = oldStderr;
        process.argv = oldArgv;
        process.exit = oldExit;
        if (err) reject(err);
        else resolve(res);
      }

      process.argv = ['node', bundlePath, snapPath];
      
      process.exit = (code) => {
        if (code !== 0) return finish(new Error('Analysis failed (code ' + code + ')'));
        if (!mPath) return finish(new Error('No MANIFEST_READY signal from analysis'));
        finish(null, mPath);
      };

      process.stdout.write = (chunk) => {
        const text = chunk.toString();
        text.split('\n').forEach(line => {
          if (!line.trim()) return;
          if (line.startsWith('MANIFEST_READY|')) {
            mPath = line.split('|')[1].trim();
            appendLog('Manifest ready: ' + mPath, 'ok');
            setTimeout(() => finish(null, mPath), 10);
          } else {
            const type = line.startsWith('[WARN') ? 'warn' : 'info';
            appendLog(line, type);
            oldStdout.call(process.stdout, line + '\n');
          }
        });
        return true;
      };

      process.stderr.write = (chunk) => {
        const text = chunk.toString();
        text.split('\n').forEach(line => {
          if (line.trim()) appendLog(line, 'err');
          oldStderr.call(process.stderr, line + '\n');
        });
        return true;
      };

      try {
        delete require.cache[require.resolve(bundlePath)];
        require(bundlePath);
      } catch (err) {
        finish(new Error('Crash: ' + err.message));
      }
    });
  }

  // ─── Read JSON from disk ──────────────────────────────────────────────────
  function readJSON(filePath) {
    if (!_fs) throw new Error('fs not available');
    return JSON.parse(_fs.readFileSync(filePath, 'utf8'));
  }

  // ─── FLOW: Analyse ────────────────────────────────────────────────────────
  async function flowAnalyse() {
    clearAlert();
    D.logOut.innerHTML = '';
    manifest = null; snapshotPath = null; manifestPath = null;

    try {
      // ── Node 1 ──────────────────────────────────────────────────────────
      go(S.SNAPSHOT);
      appendLog('Node 1: snapshot starting…', 'info');
      const escapedExt = extensionRoot.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const snap = await evalScript('DC_snapshot("' + escapedExt + '")');
      appendLog('Node 1 result: ' + snap.substring(0, 120), 'info');
      if (!snap.startsWith('SUCCESS|')) throw new Error(snap.replace('ERROR|',''));
      snapshotPath = snap.split('|').slice(1).join('|').trim();
      appendLog('Snapshot: ' + snapshotPath, 'ok');
      setProg(30, 'Snapshot written, starting analysis…');

      // ── Node 2 ──────────────────────────────────────────────────────────
      go(S.ANALYZING);
      manifestPath = await runAnalysis(snapshotPath);
      setProg(72, 'Loading manifest…');
      manifest = readJSON(manifestPath);
      appendLog('Manifest loaded — layers:' + manifest.stats.layersToRemove +
        ' limbo:' + manifest.stats.itemsToLimbo, 'ok');

      populateDryRun(manifest);
      go(S.DRY_RUN);

    } catch (err) {
      appendLog('ERROR: ' + err.message, 'err');
      showAlert('Analysis failed: ' + err.message, 'err');
      go(S.ERROR);
    }
  }

  // ─── FLOW: Execute ────────────────────────────────────────────────────────
  async function flowExecute() {
    if (!manifestPath) { showAlert('No manifest — run analysis first.', 'err'); return; }
    clearAlert();

    try {
      go(S.EXECUTING);
      appendLog('Node 3: execution starting…', 'info');

      // Escape manifest path for evalScript injection
      const escaped = manifestPath.replace(/\\/g,'\\\\').replace(/"/g,'\\"');
      const escapedExt = extensionRoot.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const result  = await evalScript('DC_execute("' + escaped + '", "' + escapedExt + '")');

      if (result.startsWith('SUCCESS|')) {
        result.replace('SUCCESS|','').split('\n').forEach(line => {
          if (!line.trim()) return;
          const t = line.startsWith('[STEP') || line.startsWith('[DC]') ? 'ok'
                  : line.includes('[WARN') ? 'warn' : 'info';
          appendLog(line, t);
        });
        go(S.DONE);
      } else {
        throw new Error(result.replace('ERROR|',''));
      }
    } catch (err) {
      appendLog('EXEC ERROR: ' + err.message, 'err');
      showAlert('Execution failed: ' + err.message, 'err');
      go(S.ERROR);
    }
  }

  // ─── FLOW: Reset ─────────────────────────────────────────────────────────
  function flowReset() {
    manifest = null; snapshotPath = null; manifestPath = null;
    clearAlert();
    D.logOut.innerHTML = '';
    go(S.IDLE);
    pollStatus();
  }

  // ─── Poll project status ──────────────────────────────────────────────────
  async function pollStatus() {
    if (state !== S.IDLE && state !== S.DRY_RUN && state !== S.DONE && state !== S.ERROR) return;
    try {
      const r = await evalScript('DC_getStatus()');
      if (r && r.startsWith('SUCCESS|')) {
        const info = JSON.parse(r.split('|').slice(1).join('|'));
        updateProjInfo(info);
      }
    } catch (e) {}
  }

  // ─── Init ─────────────────────────────────────────────────────────────────
  function init() {
    D.btnAnalyse.addEventListener('click', () => {
      if (state === S.IDLE || state === S.ERROR || state === S.DONE) flowAnalyse();
    });
    D.btnExec.addEventListener('click', () => {
      if (state === S.DRY_RUN) flowExecute();
    });
    D.btnReset.addEventListener('click', flowReset);

    go(S.IDLE);
    pollStatus();
    setInterval(pollStatus, 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
