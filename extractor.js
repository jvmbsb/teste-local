const fs = require('fs');

const bundleStr = fs.readFileSync('node/analyze.bundle.js', 'utf8');

function extractCoreRegex(name, modName) {
    const rx = new RegExp(`// node/analyze/${name}.js\\nvar require_${modName} = __commonJS\\(\\{\\n  "node/analyze/${name}.js"\\(exports2, module2\\) \\{\\n    "use strict";\\n([\\s\\S]*?)  \\}\\n\\}\\);`, 'm');
    const match = bundleStr.match(rx);
    return match ? match[1] : '';
}

let graph1 = extractCoreRegex('graph/buildGraph', 'buildGraph');
let graph2 = extractCoreRegex('graph/resolveGraph', 'resolveGraph');
let pruning = extractCoreRegex('pruning/selectivePruning', 'selectivePruning');
let solo = extractCoreRegex('solo/soloResolver', 'soloResolver');
let expr1 = extractCoreRegex('expressions/parseAST', 'parseAST');
let expr2 = extractCoreRegex('expressions/bruteForce', 'bruteForce');
let expr3 = extractCoreRegex('expressions/variableResolver', 'variableResolver');
let bdata1 = extractCoreRegex('bdata/extractBdata', 'extractBdata');
let bdata2 = extractCoreRegex('bdata/matchAssets', 'matchAssets');
let utils1 = extractCoreRegex('utils/maps', 'maps');
let utils2 = extractCoreRegex('utils/cache', 'cache');

// Clean exports
function cleanRequiresAndExports(str) {
    let s = str.replace(/var \{.*?\} = require_\w+\(\);\n/g, '');
    s = s.replace(/var [a-zA-Z0-9_]+ = require_\w+\(\);\n/g, '');
    s = s.replace(/var path2 = require\("path"\);\n/g, '');
    s = s.replace(/var fs2 = require\("fs"\);\n/g, '');
    s = s.replace(/var path = require\("path"\);\n/g, '');
    s = s.replace(/var fs = require\("fs"\);\n/g, '');
    s = s.replace(/var os = require\("os"\);\n/g, '');
    s = s.replace(/module2\.exports = \{[\s\S]*?\};\n/g, '');

    // Restore original names replacing the '2' suffixes
    s = s.replace(/\bpath2\b/g, 'path');
    s = s.replace(/\bfs2\b/g, 'fs');
    s = s.replace(/\bnormPath2\b/g, 'normPath');
    s = s.replace(/\bfileExists2\b/g, 'fileExists');
    s = s.replace(/\bbuildItemMaps2\b/g, 'buildItemMaps');
    s = s.replace(/\blog2\b/g, 'log');
    s = s.replace(/\bwarn2\b/g, 'warn');
    s = s.replace(/\bvalidatePaths2\b/g, 'validatePaths');
    s = s.replace(/\bindexExpressions2\b/g, 'indexExpressions');
    s = s.replace(/\bGraph2\b/g, 'Graph');
    s = s.replace(/\brunStandardCleanQueue2\b/g, 'runStandardCleanQueue');
    s = s.replace(/\banalyseExpression2\b/g, 'analyseExpression');
    s = s.replace(/\bapplyExtremePruning2\b/g, 'applyExtremePruning');
    s = s.replace(/\bhexToUtf82\b/g, 'hexToUtf8');
    s = s.replace(/\bextractStringsFromBdata2\b/g, 'extractStringsFromBdata');
    s = s.replace(/\bresolveBdataDeps2\b/g, 'resolveBdataDeps');

    return s.trim();
}

// Prepare helper
const utilsHelpers = `// node/analyze/utils/helpers.js
const fs = require('fs');
const path = require('path');
const os = require('os');

` + cleanRequiresAndExports(utils1) + '\n\n' + cleanRequiresAndExports(utils2) + `

module.exports = { normPath, fileExists, buildItemMaps, log, warn, validatePaths, indexExpressions };
`;
fs.writeFileSync('node/analyze/utils/helpers.js', utilsHelpers);

// Match assets
const bdataStr = `// node/analyze/bdata/matchAssets.js
const path = require('path');

` + cleanRequiresAndExports(bdata1) + '\n\n' + cleanRequiresAndExports(bdata2) + `

module.exports = { hexToUtf8, PATH_REGEXES, extractStringsFromBdata, resolveBdataDeps };
`;
fs.writeFileSync('node/analyze/bdata/matchAssets.js', bdataStr);


// Expr
const exprStr = `// node/analyze/expressions/resolveExpressions.js
const path = require('path');
const acorn = require('acorn');

` + cleanRequiresAndExports(expr1) + '\n\n' + cleanRequiresAndExports(expr2) + '\n\n' + cleanRequiresAndExports(expr3) + `

module.exports = { walkAst, parseWithAcorn, DYNAMIC_PATTERNS, isDynamicExpression, bruteForceExtract, analyseExpression, resolveExpressionDeps };
`;
fs.writeFileSync('node/analyze/expressions/resolveExpressions.js', exprStr);

// Solo
const soloStr = `// node/analyze/solo/soloResolver.js
const { resolveExpressionDeps } = require('../expressions/resolveExpressions.js');

` + cleanRequiresAndExports(solo) + '\n\n' + cleanRequiresAndExports(pruning) + `

module.exports = { expandExternalLayers, applyExtremePruning };
`;
fs.writeFileSync('node/analyze/solo/soloResolver.js', soloStr);

// Graph
const graphStr = `// node/analyze/graph/resolveGraph.js
const { resolveExpressionDeps } = require('../expressions/resolveExpressions.js');

` + cleanRequiresAndExports(graph1) + '\n\n' + cleanRequiresAndExports(graph2) + `

module.exports = { Graph, processCompAsStandard, runStandardCleanQueue };
`;
fs.writeFileSync('node/analyze/graph/resolveGraph.js', graphStr);

// Main orchestrator
const origMain = bundleStr.substring(bundleStr.indexOf('// node/analyze/index.js'));
const mainHeader = `// node/analyze/analyze.src.js
const fs = require("fs");
const path = require("path");
const sax = require("sax");

const { normPath, fileExists, buildItemMaps, log, warn, validatePaths, indexExpressions } = require("./utils/helpers.js");
const { Graph, processCompAsStandard, runStandardCleanQueue } = require("./graph/resolveGraph.js");
const { walkAst, parseWithAcorn, DYNAMIC_PATTERNS, isDynamicExpression, bruteForceExtract, analyseExpression, resolveExpressionDeps } = require("./expressions/resolveExpressions.js");
const { hexToUtf8, PATH_REGEXES, extractStringsFromBdata, resolveBdataDeps } = require("./bdata/matchAssets.js");
const { expandExternalLayers, applyExtremePruning } = require("./solo/soloResolver.js");

`;

const mainBodyStart = origMain.indexOf('function parseAepx(aepxPath) {');
const mainBodyEnd = origMain.indexOf('/*! Bundled license information:');
let mainBody = origMain.substring(mainBodyStart, mainBodyEnd);

// Restore original names in main
mainBody = mainBody.replace(/\blog2\b/g, 'log');
mainBody = mainBody.replace(/\bwarn2\b/g, 'warn');
mainBody = mainBody.replace(/\bnormPath2\b/g, 'normPath');
mainBody = mainBody.replace(/\bfileExists2\b/g, 'fileExists');
mainBody = mainBody.replace(/\bbuildItemMaps2\b/g, 'buildItemMaps');
mainBody = mainBody.replace(/\bvalidatePaths2\b/g, 'validatePaths');
mainBody = mainBody.replace(/\bindexExpressions2\b/g, 'indexExpressions');
mainBody = mainBody.replace(/\bGraph2\b/g, 'Graph');
mainBody = mainBody.replace(/\brunStandardCleanQueue2\b/g, 'runStandardCleanQueue');
mainBody = mainBody.replace(/\banalyseExpression2\b/g, 'analyseExpression');
mainBody = mainBody.replace(/\bapplyExtremePruning2\b/g, 'applyExtremePruning');
mainBody = mainBody.replace(/\bhexToUtf82\b/g, 'hexToUtf8');
mainBody = mainBody.replace(/\bextractStringsFromBdata2\b/g, 'extractStringsFromBdata');
mainBody = mainBody.replace(/\bresolveBdataDeps2\b/g, 'resolveBdataDeps');

fs.writeFileSync('node/analyze/analyze.src.js', mainHeader + mainBody);
