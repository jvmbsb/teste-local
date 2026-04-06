/**
 * DeepClean v2 — Snapshot Utilities
 * JSON serializer, file I/O, temp directory, stability check, item type.
 */

// ─── JSON serializer (ES3 safe) ───────────────────────────────────────────────
var DC_JSON = (function () {
  function str(val) {
    if (val === null || val === undefined) return 'null';
    var t = typeof val;
    if (t === 'boolean') return val ? 'true' : 'false';
    if (t === 'number')  return isFinite(val) ? String(val) : 'null';
    if (t === 'string')  return strEsc(val);
    if (val instanceof Array) {
      var a = [];
      for (var i = 0; i < val.length; i++) a.push(str(val[i]));
      return '[' + a.join(',') + ']';
    }
    if (t === 'object') {
      var p = [];
      for (var k in val) {
        if (val.hasOwnProperty(k)) p.push(strEsc(k) + ':' + str(val[k]));
      }
      return '{' + p.join(',') + '}';
    }
    return 'null';
  }
  function strEsc(s) {
    s = String(s);
    s = s.replace(/\\/g, '\\\\');
    s = s.replace(/"/g, '\\"');
    s = s.replace(/\n/g, '\\n');
    s = s.replace(/\r/g, '\\r');
    s = s.replace(/\t/g, '\\t');
    s = s.replace(/[\x00-\x1f]/g, function (c) {
      return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
    });
    return '"' + s + '"';
  }
  return { stringify: str };
})();

// ─── File utilities ───────────────────────────────────────────────────────────
function DC_writeFile(fsPath, content) {
  var f = new File(fsPath);
  f.encoding = 'UTF-8';
  f.lineFeed = 'Unix';
  f.open('w');
  f.write(content);
  f.close();
}

function DC_fileSize(fsPath) {
  var f = new File(fsPath);
  if (!f.exists) return -1;
  f.open('r');
  var sz = f.length;
  f.close();
  return sz;
}

// ─── Safe path decode via File.decode ────────────────────────────────────────
function DC_decodePath(item) {
  try {
    if (item && item.file) {
      return File.decode(item.file.absoluteURI);
    }
  } catch (e) {}
  return '';
}

// ─── Temp directory ───────────────────────────────────────────────────────────
function DC_getTempDir() {
  var tmp = Folder.temp;
  var dc = new Folder(tmp.fsName + '/DeepClean');
  if (!dc.exists) dc.create();
  return dc.fsName;
}

// ─── Stability check: poll file size until 2 identical consecutive readings ───
function DC_waitStable(fsPath, maxMs, intervalMs) {
  maxMs      = maxMs      || 20000;
  intervalMs = intervalMs || 500;
  var prev    = -1;
  var same    = 0;
  var elapsed = 0;
  while (elapsed < maxMs) {
    $.sleep(intervalMs);
    elapsed += intervalMs;
    var sz = DC_fileSize(fsPath);
    if (sz > 0 && sz === prev) {
      same++;
      if (same >= 2) return true;
    } else {
      same = 0;
    }
    prev = sz;
  }
  return false;
}

// ─── Item type string ──────────────────────────────────────────────────────────
function DC_itemType(item) {
  if (item instanceof CompItem)    return 'CompItem';
  if (item instanceof FootageItem) return 'FootageItem';
  if (item instanceof FolderItem)  return 'FolderItem';
  return 'Unknown';
}
