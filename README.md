# DeepClean v2 — Adobe After Effects CEP Extension

> **Production-ready. Zero-configuration for end users.**  
> Deterministic dependency graph analysis and project cleanup for After Effects.

---

## What It Does

DeepClean analyses **only the compositions you select**, recursively resolves all dependencies, and prepares your project for maximum efficiency. It:

- Removes unused layers from selected compositions
- Moves orphaned project items to `_LIMBO_DeepClean` (nothing is ever deleted)
- Handles external comp references safely via `**DC_ANCHOR**`
- Detects and warns on dynamic/unresolvable expressions
- Respects `[KEEP]` name prefixes as force-whitelists

Every operation is wrapped in a **single undo group** — fully reversible with `Ctrl/Cmd+Z`.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  CEP Panel  (panel/index.html + panel/js/main.js)                      │
│  CSInterface.evalScript ──────────────────────────────────────────────► │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
          ┌────────────────────▼────────────────────┐
          │  NODE 1 — jsx/snapshot.jsx               │
          │  • Double-save: .aep → .aepx             │
          │  • Stale-check: poll until size stable   │
          │  • Deep item + layer collection          │
          │  • File.decode for correct path handling │
          │  • Writes snapshot_project.json          │
          │  • Returns only: "SUCCESS|<path>"        │
          └────────────────────┬────────────────────┘
                               │ (file on disk)
          ┌────────────────────▼────────────────────┐
          │  NODE 2 — node/analyze.bundle.js         │
          │  (self-contained — no npm install)       │
          │                                          │
          │  • SAX streaming of .aepx                │
          │  • <bdata> hex → UTF-8 path mining       │
          │  • acorn AST expression analysis         │
          │  • Dynamic expression detection          │
          │  • \\\\?\\ long-path prefix on Windows    │
          │  • BFS dependency graph from seeds only  │
          │  • External comp selective pruning       │
          │  • [KEEP] override support               │
          │  • Writes manifest_execution.json        │
          │  • Signals: "MANIFEST_READY|<path>"      │
          └────────────────────┬────────────────────┘
                               │ (file on disk)
          ┌────────────────────▼────────────────────┐
          │  NODE 3 — jsx/execute.jsx                │
          │  • BEGIN UNDO GROUP                      │
          │  • Timeline cleanup (descending order)   │
          │  • _LIMBO_DeepClean organisation         │
          │  • **DC_ANCHOR** comp creation           │
          │  • External comp pruning                 │
          │  • END UNDO GROUP                        │
          └─────────────────────────────────────────┘
```

---

## Zero-Config End User Experience

The `node/analyze.bundle.js` file is **pre-built and shipped with the extension**. It contains all Node.js dependencies (acorn, sax) bundled by esbuild. End users:

- Do not need Node.js installed
- Do not need to open a terminal
- Do not need to run `npm install`
- Do not need to configure anything

CEP panels in After Effects have Node.js built-in via `--enable-nodejs`. The panel spawns the bundled script using `process.execPath` (the built-in Node binary).

---

## Installation (End User)

### Option A: ZXP Installer (signed, recommended)

1. Download `DeepClean-2.0.0.zxp`
2. Open with **Adobe Extension Manager** or **Unified Plugin Installer Agent (UPIA)**
3. Restart After Effects
4. `Window → Extensions → DeepClean`

### Option B: Manual (unsigned / development)

Requires PlayerDebugMode enabled:

```bash
# macOS
defaults write com.adobe.CSXS.11 PlayerDebugMode 1

# Windows (Admin PowerShell)
reg add "HKCU\Software\Adobe\CSXS.11" /v PlayerDebugMode /t REG_SZ /d 1 /f
```

Copy or symlink the `DeepClean/` folder to:

| OS      | Path |
|---------|------|
| macOS   | `~/Library/Application Support/Adobe/CEP/extensions/com.deepclean.aep/` |
| Windows | `%APPDATA%\Adobe\CEP\extensions\com.deepclean.aep\` |

Restart After Effects.

---

## Developer Setup

### Prerequisites

- Node.js ≥ 14
- After Effects 2022 (v22) or later

### Steps

```bash
# 1. Clone / place the extension
cd DeepClean

# 2. Install devDependencies (esbuild only)
npm install

# 3. Bundle the analysis engine
node build.js

# 4. Symlink into AE + enable debug mode
node scripts/dev-install.js

# 5. Restart After Effects
# Window → Extensions → DeepClean
```

### Rebuild after editing `analyze.src.js`

```bash
node build.js
# or watch mode:
node build.js --watch
```

### Package for distribution

```bash
node scripts/package.js
# Output: dist/DeepClean-2.0.0.zip
```

---

## File Structure

```
DeepClean/
├── .debug                      # CEP remote debugger (port 8888)
├── CSXS/
│   └── manifest.xml            # Extension manifest (CSXS 7.0+)
├── jsx/
│   ├── host.jsx                # CEP ScriptPath bridge
│   ├── snapshot.jsx            # Node 1: snapshot collector
│   └── execute.jsx             # Node 3: execution engine
├── node/
│   ├── analyze.src.js          # Node 2: source (human-readable)
│   └── analyze.bundle.js       # Node 2: pre-built bundle (SHIP THIS)
├── panel/
│   ├── index.html              # CEP panel UI
│   ├── css/style.css
│   ├── js/main.js              # Pipeline controller
│   └── lib/CSInterface.js      # Adobe CEP bridge library
├── scripts/
│   ├── dev-install.js          # Developer install helper
│   └── package.js              # ZXP packager
├── build.js                    # esbuild bundler
└── package.json
```

---

## Usage

1. Open a project in After Effects
2. In the **Project panel**, select one or more **compositions** (Ctrl/Cmd+click multiple)
3. In the DeepClean panel, click **▶ Analyse Project**
4. Review the dry-run summary:
   - Layers to remove
   - Items moving to `_LIMBO_DeepClean`
   - External comps (added to `**DC_ANCHOR**`)
   - Warnings (dynamic expressions, missing files)
5. Click **⚡ Execute Deep Clean** to apply
6. Use `Ctrl/Cmd+Z` to undo if needed

---

## How Each Node Works

### Node 1 — Snapshot (ExtendScript)

**Double-Save Protocol:**
1. `proj.save(aepFile)` — binary `.aep` forces all plugin data flush
2. `proj.save(aepxFile)` — XML `.aepx` exposes plugin `<bdata>` blocks
3. Stale check: polls file size every 500ms until 2 identical consecutive readings (up to 25s)

**Deep Collection:**
- All project items: `id`, `name`, `type`, `parentId`, `filePath` (via `File.decode`), metadata
- Selected comp layers: source, parent chain, expressions (full property tree walk), effects
- All other comp layers (up to 150 comps): for external comp pruning

**Output:** Writes `snapshot_project.json` to `Folder.temp/DeepClean/`. Returns only `"SUCCESS|<path>"` — never passes large JSON via evalScript.

### Node 2 — Analysis Engine (Node.js bundle)

**AEPX Streaming:**
- `fs.createReadStream` → SAX parser — never loads entire XML into memory
- Tracks `<compitem>` / `<layer>` context stack
- Extracts `<bdata>` hex blobs per-layer per-comp

**Hex Mining:**
- Decodes `<bdata>` hex → UTF-8 via `Buffer.from(hex, 'hex').toString('utf8')`
- Extracts file paths via regex patterns (Windows absolute, UNC, POSIX)
- Extracts printable string runs for name matching
- Only whitelists if `fs.existsSync(path)` confirms file exists on disk

**Expression Analysis (acorn AST):**
- Attempts parse at ecmaVersion 5, 2015, 2019, 2020 (fallback sequence)
- Dynamic expression detection: `eval()`, `new Function()`, computed bracket access, dynamic `layer()` / `comp()` calls
- Dynamic expressions → UNUSED (aggressive mode) + warning logged
- Static expressions → AST walk extracts string literals → name/path matching

**Dependency Graph:**
- Nodes = item ids; Edges = dependency relationships
- Seeds = selected comp ids only
- BFS resolves all reachable ids
- `[KEEP]` prefix on item name → force-added to reachable set

**External Comp Handling:**
- When a selected comp uses an external comp as a whole-comp source, ALL layers of the external comp are seeded
- `expandExternalLayers()`: BFS within external comp, expands via parent chain + expression deps
- Empty `requiredLayers` = keep all (safe fallback when no layer data available)

**Windows Long Paths:**
- All `fs.*` calls use `normPath()` which prepends `\\?\` for paths > 200 chars

**Output:** `manifest_execution.json` in the same temp folder.

### Node 3 — Execution (ExtendScript)

All operations in one `app.beginUndoGroup('DeepClean v2')` block:

**Timeline Cleanup:**
- Layers sorted descending by index before removal (prevents index shifting)
- Double-checks whitelist before removing any layer (safety guard)

**LIMBO Organisation:**
- Creates `_LIMBO_DeepClean/` at project root
- Per-comp sub-folders + `ORPHANS/` folder
- Prefixes item names with `[DC]`
- Sets `item.parentFolder` — never calls any delete method

**DC_ANCHOR:**
- Finds or creates `**DC_ANCHOR**` composition
- Adds each external comp as an `AVLayer` with `enabled=false`, `guideLayer=true`, `shy=true`
- Checks for duplicates before adding

**Selective Pruning:**
- For each external comp with explicit `requiredLayers`: removes all other layers descending
- Empty `requiredLayers` → skip pruning (keep all)

---

## Dependency Rules

| Signal | Action |
|--------|--------|
| `AVLayer.source` → item | KEEP — strong evidence |
| Expression string literal matches item name | KEEP |
| Expression string literal matches file basename | KEEP |
| `<bdata>` hex contains item name | KEEP |
| `<bdata>` hex contains existing file path | KEEP |
| Effect match names present | KEEP layer |
| Non-null layer without source (text/shape/cam/light) | KEEP layer |
| Dynamic expression (`eval`, computed, etc.) | UNUSED + warning |
| No evidence of any kind | UNUSED → LIMBO |
| Item name starts with `[KEEP]` | Force KEEP regardless |

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Multiple selected comps share an external comp | `externalCompMap` accumulates all seed sets; union is kept |
| Comp is both selected and referenced externally | Circular guard: logged as warning, skipped from DC_ANCHOR |
| Layer indices shift after removal | Sorted descending — higher indices removed first |
| AE can't save `.aepx` (old version) | Graceful fallback — XML pass skipped, analysis continues from snapshot only |
| Very long file paths (Windows) | `\\?\` prefix applied in all `fs.*` calls |
| Expression parse fails (broken ES3) | Fallback: naive string literal regex extraction |
| `[KEEP]` item | Always reachable; never moved to LIMBO |

---

## Debugging

Open Chrome and navigate to:

```
http://localhost:8888
```

This connects to the CEP Chrome DevTools for the panel process.

---

## License

MIT
