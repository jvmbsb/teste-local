# DeepClean Extension Fix: "Script not found: /snapshot.jsx"

## Current Status
- ✅ Diagnosed: ExtendScript File() constructor bug with CEP paths
- ✅ User approved fix plan for jsx/host.jsx

## Steps Remaining
- [x] Create this TODO.md ✅
- [x] Edit `jsx/host.jsx`: Fix `DC_loadScript()` → **Windows-native paths + better debug** ✅
- [ ] Test: Click ANALYSE PROJECT → expect "SUCCESS|<temp/snapshot_project.json>"
- [ ] Verify Node 2: "MANIFEST_READY|<temp/manifest.json>"
- [ ] Complete: attempt_completion

## Debug Instructions
1. **Reload extension**: Window → Extensions → DeepClean  
2. Click **ANALYSE PROJECT**
3. **Copy-paste FULL new panel log** — now shows **exact paths tried + $.fileName**!

Expected success:
```
Node 1 result: SUCCESS|C:\Users\...\snapshot_project.json
```

Still failing? New error shows **exact path ExtendScript sees** — instant diagnosis!



**Estimated time**: 2 minutes

