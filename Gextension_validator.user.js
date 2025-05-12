// ==UserScript==
// @name         JavaScript Code Analyzer (webLLM) - Advanced Reload
// @namespace    http://tampermonkey.net/
// @version      0.3.5
// @description  Analyzes JavaScript code using WebLLM, with dev mode for trace injection (auto-reloads with instrumented code), revert option, and Mermaid flow visualization.
// @author       ZLudany (enhanced by AI)
// @match        https://home.google.com/*
// @connect      cdn.jsdelivr.net       // For WebLLM library, Mermaid, Acorn, Escodegen, ESTraverse
// @connect      huggingface.co        // Common CDN for WebLLM models
// @connect      *.mlc.ai              // Official MLC CDNs for models and wasm
// @connect      cdnjs.cloudflare.com  // For Acorn, Escodegen, ESTraverse
// @grant        GM_setClipboard       // Optional: For easily copying modified code
// @date         2023-10-28T14:30:00+00:00
// ==/UserScript==

// Top-level scope of the userscript
const INSTRUMENTED_CODE_KEY = 'userscript_instrumented_code_v0_3_5';
const RELOAD_FLAG_KEY = 'userscript_reload_with_instrumented_code_v0_3_5';
let runOriginalScriptMainIIFE = true;

if (localStorage.getItem(RELOAD_FLAG_KEY) === 'true') {
    const instrumentedCode = localStorage.getItem(INSTRUMENTED_CODE_KEY);
    localStorage.removeItem(RELOAD_FLAG_KEY);
    if (instrumentedCode) {
        console.log("JavaScript Code Analyzer: Attempting to load instrumented code from localStorage...");
        try {
            new Function(instrumentedCode)();
            if (window.ZLU_INSTRUMENTED_ACTIVE === true) {
                console.log("JavaScript Code Analyzer: Instrumented code has set its flag. Halting original script's main IIFE execution.");
                runOriginalScriptMainIIFE = false;
            } else {
                console.warn("JavaScript Code Analyzer: Instrumented code executed, but ZLU_INSTRUMENTED_ACTIVE flag not set. Original script will proceed.");
                localStorage.removeItem(INSTRUMENTED_CODE_KEY);
                delete window.ZLU_INSTRUMENTED_ACTIVE;
            }
        } catch (e) {
            console.error("JavaScript Code Analyzer: Error executing instrumented code:", e);
            alert("Error executing instrumented code. Check console. Original script will load. Instrumented code and related flags will be cleared.");
            delete window.ZLU_INSTRUMENTED_ACTIVE;
            localStorage.removeItem(INSTRUMENTED_CODE_KEY);
        }
    } else {
        console.log("JavaScript Code Analyzer: Reload flag was set, but no instrumented code found. Original script will run.");
        delete window.ZLU_INSTRUMENTED_ACTIVE;
    }
    localStorage.removeItem(RELOAD_FLAG_KEY + '_marker');
    localStorage.removeItem(RELOAD_FLAG_KEY + '_just_reloaded_for_instrumentation');
}

if (runOriginalScriptMainIIFE) {
    (async function() { // Main Userscript IIFE
        'use strict';

        const DEV_MODE = true;
        const WEB_LLM_LIBRARY_SRC = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@latest/dist/web-llm.js';
        const DEFAULT_MODEL_ID = "Llama-3-8B-Instruct-q4f16_1";
        const ACORN_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/acorn/8.11.0/acorn.min.js';
        const ESCODEGEN_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/escodegen/2.1.0/escodegen.min.js';
        const ESTRAVERSE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/estraverse/5.3.0/estraverse.min.js';
        const MERMAID_CDN = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';

        if (typeof window.ZLU === 'undefined') {
            window.ZLU = {};
        }
        window.ZLU.executionPaths = window.ZLU.executionPaths || new Set();
        window.ZLU.DEFAULT_JS_ANALYZER_MODEL_ID = DEFAULT_MODEL_ID;

        function getFunc(f){
            if (typeof f !== 'function') { return null; }
            return f.name ? f.name : (f.toString().match(/(function)(\s+)(\w+)(\()/)?.[3] || 'anonymous');
        }window.ZLU.getFunc = getFunc;

        function trace(logBefore = false, all = true){
            try {
                const maxDepth = 20;
                let currentFunc = logBefore ? arguments.callee.caller.caller : arguments.callee.caller;
                if (!currentFunc) { return null; }
                const callChain = [];
                let depth = 0;
                while (currentFunc && depth < maxDepth) {
                    const funcName = getFunc(currentFunc);
                    if (funcName) { callChain.push(funcName); }
                    if (currentFunc.caller === currentFunc) { callChain.push("recursive_self"); break; }
                    if (!all && callChain.length > 1) {
                        const prevFuncs = callChain.slice(0, -1).join(' -->> ');
                        if (prevFuncs.includes(funcName)) { break; }
                    }
                    currentFunc = currentFunc.caller;
                    depth++;
                }
                if (depth === maxDepth) callChain.push("max_depth_reached");
                if (callChain.length > 0) {
                    const pathString = callChain.reverse().join(' -->> ');
                    window.ZLU.executionPaths.add(pathString);
                    return pathString;
                }
            } catch (e) { /* console.warn("Error in trace function:", e); */ }
            return null;
        }window.ZLU.trace = trace;

        const loadedScripts = {};
        async function loadScript(url, id){
            if (loadedScripts[id || url]) { return loadedScripts[id || url]; }
            const promise = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = url;
                if (id) script.id = id;
                script.onload = () => { console.log(`Script ${id || url} loaded successfully from ${url}.`); resolve(); };
                script.onerror = (err) => { console.error(`Failed to load script ${id || url} from ${url}:`, err); delete loadedScripts[id || url]; reject(err); };
                document.head.appendChild(script);
            });
            loadedScripts[id || url] = promise;
            return promise;
        }async function loadWebLLMScript(url){
            if (typeof window.webLLM !== 'undefined') { console.log('WebLLM library already loaded.'); return Promise.resolve(); }
            return loadScript(url, 'webllm-library');
        }

        const ACORN_WORKER_SOURCE = `
self.onmessage = async (event) => {
    const { sourceCode, acornPath, escodegenPath, estraversePath, functionsToIgnore } = event.data;
    try {
        if (!self.acorn) await importScripts(acornPath);
        if (!self.escodegen) await importScripts(escodegenPath);
        if (!self.estraverse) await importScripts(estraversePath);

        const ast = self.acorn.parse(sourceCode, { ecmaVersion: 'latest', sourceType: 'script', locations: false });

        self.estraverse.replace(ast, {
            enter: function (node) {
                if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
                    let functionName = '';
                    if (node.id && node.id.name) {
                        functionName = node.id.name;
                    } else if (node.parent && node.parent.type === 'VariableDeclarator' && node.parent.id.name) {
                        functionName = node.parent.id.name;
                    } else if (node.parent && node.parent.type === 'MethodDefinition' && node.parent.key.name) {
                        functionName = node.parent.key.name;
                    } else if (node.parent && node.parent.type === 'Property' && node.parent.key.name) {
                        functionName = node.parent.key.name;
                    }

                    if (functionsToIgnore && functionsToIgnore.includes(functionName)) {
                        return node;
                    }
                    if (node.body && node.body.type === 'BlockStatement' && node.body.body && node.body.body.length > 0) {
                        const firstStmt = node.body.body[0];
                        if (firstStmt.type === 'ExpressionStatement' &&
                            firstStmt.expression.type === 'CallExpression' &&
                            firstStmt.expression.callee.object && firstStmt.expression.callee.object.name === 'ZLU' &&
                            firstStmt.expression.callee.property && firstStmt.expression.callee.property.name === 'trace'
                        ) {
                            return node; // Already instrumented with ZLU.trace()
                        }
                    }
                    // This is an array literal: [{type:'Literal', ...}, {type:'Literal', ...}]
                    const traceCallArguments = [
                        { type: 'Literal', value: false, raw: 'false' },
                        { type: 'Literal', value: true, raw: 'true' }
                    ];
                    const traceCallStatement = {
                        type: 'ExpressionStatement',
                        expression: {
                            type: 'CallExpression',
                            callee: { type: 'MemberExpression', object: {type: 'Identifier', name: 'ZLU'}, property: {type: 'Identifier', name: 'trace'}, computed: false },
                            arguments: traceCallArguments // Use the well-defined array here
                        }
                    };
                    // This is an array literal: [traceCallStatement, {type:'ReturnStatement', ...}]
                    const newBodyContent = [
                        traceCallStatement,
                        { type: 'ReturnStatement', argument: node.body }
                    ];
                    if (node.body.type === 'BlockStatement') {
                        node.body.body.unshift(traceCallStatement);
                    } else {
                        node.body = {
                            type: 'BlockStatement',
                            body: newBodyContent // Use the well-defined array here
                        };
                    }
                }
                return node;
            }
        });
        let modifiedCode = self.escodegen.generate(ast);
        const iifeStartRegex = /(\\(\\s*async\\s+function\\s*\\(\\s*\\)\\s*\\{\\s*['"]use strict['"];)/m;
        if (iifeStartRegex.test(modifiedCode)) {
            modifiedCode = modifiedCode.replace(iifeStartRegex, "$1\\\\n    window.ZLU_INSTRUMENTED_ACTIVE = true;\\\\n    console.log('Instrumented version: ZLU_INSTRUMENTED_ACTIVE set from within instrumented code.');");
        } else {
            modifiedCode = "window.ZLU_INSTRUMENTED_ACTIVE = true;\\\\nconsole.log('Instrumented version: ZLU_INSTRUMENTED_ACTIVE set globally as IIFE not detected.');\\\\n" + modifiedCode;
        }
        self.postMessage({ success: true, modifiedCode: modifiedCode });
    } catch (error) {
        console.error("Acorn Worker Error:", error);
        self.postMessage({ success: false, error: error.message + (error.stack ? '\\\\n' + error.stack : '') });
    }
};
`;
        let acornWorker = null;
        async function getAcornWorker(){
            if (!acornWorker) {
                await Promise.all([ loadScript(ACORN_CDN, 'acorn'), loadScript(ESCODEGEN_CDN, 'escodegen'), loadScript(ESTRAVERSE_CDN, 'estraverse') ]);
                const blob = new Blob([ACORN_WORKER_SOURCE], { type: 'application/javascript' });
                const workerUrl = URL.createObjectURL(blob);
                acornWorker = new Worker(workerUrl);
            }
            return acornWorker;
        }

        class JSCodeAnalyzer {
            constructor(modelId = DEFAULT_MODEL_ID, progressCallback = null){
                this.modelId = modelId;
                this.chatWorkerClient = null;
                this.initializationInProgress = false;
                this.initializationPromise = null;
                this.progressCallback = progressCallback || function(report){ const p = (report.progress * 100).toFixed(2); console.log(`[JSCodeAnalyzer Progress]: ${report.text} (\${p}%)`); };
                this.initializationPromise = this._initialize();
            }
            async _initialize(){
                if (this.initializationInProgress || this.chatWorkerClient) { return this.initializationPromise; }
                this.initializationInProgress = true;
                try {
                    await loadWebLLMScript(WEB_LLM_LIBRARY_SRC);
                    if (!window.webLLM || !window.webLLM.ChatWorkerClient) { throw new Error("WebLLM.ChatWorkerClient is not available."); }
                    this.progressCallback({ progress: 0, text: 'Initializing JSCodeAnalyzer service...' });
                    const webLLMWorkerScriptPath = WEB_LLM_LIBRARY_SRC.replace('web-llm.js', 'worker.js');
                    const worker = new Worker(webLLMWorkerScriptPath, { type: "module" });
                    this.chatWorkerClient = new window.webLLM.ChatWorkerClient(worker, { initProgressCallback: report => this.progressCallback(report) });
                    this.progressCallback({ progress: 0.05, text: `Loading model: \${this.modelId}` });
                    await this.chatWorkerClient.reload(this.modelId);
                    this.progressCallback({ progress: 1, text: 'Model loaded and JSCodeAnalyzer ready.' });
                    console.log("JSCodeAnalyzer initialized with model:", this.modelId);
                } catch (error) {
                    console.error("Error initializing JSCodeAnalyzer:", error);
                    this.progressCallback({ progress: 1, text: `Initialization Error: \${error.message}` });
                    this.chatWorkerClient = null; throw error;
                } finally { this.initializationInProgress = false; }
            }
            async _ensureInitialized(){
                if (!this.initializationPromise) { console.warn("JSCodeAnalyzer init not started. Attempting now."); this.initializationPromise = this._initialize(); }
                await this.initializationPromise;
                if (!this.chatWorkerClient) { throw new Error("JSCodeAnalyzer failed to initialize or model not loaded."); }
            }
            async analyze(jsCode, analysisTaskPrompt, streamCallback = null){
                await this._ensureInitialized();
                const fullPrompt = `You are an expert JavaScript code analysis assistant. Your task is to analyze the provided JavaScript code.\nFollow these instructions for the analysis: \${analysisTaskPrompt}\nProvide a detailed and structured analysis. If you identify any critical security issues or major privacy concerns, please state them clearly and begin those specific points with phrases like "CRITICAL SECURITY ISSUE:" or "MAJOR PRIVACY CONCERN:".\nJavaScript Code:\n\`\`\`javascript\n\${jsCode}\n\`\`\`\nAnalysis:`;
                try {
                    let fullReply = "";
                    if (streamCallback) {
                        let lastStreamedLength = 0;
                        const progressCbForGenerate = (_step, currentMessage) => { const delta = currentMessage.substring(lastStreamedLength); if (delta) { streamCallback('delta', delta); } lastStreamedLength = currentMessage.length; };
                        fullReply = await this.chatWorkerClient.generate(fullPrompt, progressCbForGenerate);
                        streamCallback('finish', fullReply);
                    } else { fullReply = await this.chatWorkerClient.generate(fullPrompt); }
                    return fullReply;
                } catch (error) { console.error("Error during code analysis:", error); if (streamCallback) streamCallback('error', error.message); throw error; }
            }
            async resetChat(){
                await this._ensureInitialized();
                try { await this.chatWorkerClient.resetChat(); console.log("JSCodeAnalyzer: Chat context reset."); this.progressCallback({ progress: this.chatWorkerClient ? 1 : 0, text: 'Chat context reset.' }); }
                catch (error) { console.error("Error resetting chat:", error); }
            }
            async dispose(){
                if (this.chatWorkerClient) {
                    try {
                        this.progressCallback({ progress: 0, text: 'Disposing JSCodeAnalyzer...' });
                        await this.chatWorkerClient.unload(); this.chatWorkerClient.worker.terminate();
                        console.log("JSCodeAnalyzer disposed."); this.progressCallback({ progress: 1, text: 'JSCodeAnalyzer disposed.' });
                    } catch (error) { console.error("Error during JSCodeAnalyzer disposal:", error); this.progressCallback({ progress: 1, text: `Error disposing: \${error.message}` }); }
                    this.chatWorkerClient = null;
                }
                this.initializationInProgress = false; this.initializationPromise = null;
            }
        }window.ZLU.JSCodeAnalyzer = JSCodeAnalyzer;

        if (window.ZLU_INSTRUMENTED_ACTIVE === true) { console.log("JSCodeAnalyzer (V0.3.5): Running INSTRUMENTED version."); }
        else { console.log("JSCodeAnalyzer (V0.3.5): Running ORIGINAL version."); }
        console.log(`Default model for analysis: \${DEFAULT_MODEL_ID}`);

        async function runAnalyzerDemo(){
            const demoUiContainer = document.createElement('div'); demoUiContainer.id = 'js-analyzer-demo-ui'; demoUiContainer.style.cssText = `position: fixed; bottom: 10px; right: 10px; z-index: 9999; background: #f0f0f0; border: 1px solid #ccc; border-radius: 8px; padding: 15px; box-shadow: 0 4px 8px rgba(0,0,0,0.2); width: 800px; font-family: Arial, sans-serif; font-size: 14px; display: flex; flex-direction: column;`; document.body.appendChild(demoUiContainer);
            const title = document.createElement('h3'); title.textContent = 'JS Code Analyzer Demo'; if (window.ZLU_INSTRUMENTED_ACTIVE === true) { title.textContent += ' (Instrumented)'; title.style.color = 'purple'; } title.style.marginTop = '0'; demoUiContainer.appendChild(title);
            const progressDisplay = document.createElement('div'); progressDisplay.id = 'analyzer-progress-display'; progressDisplay.innerHTML = '<span>Initializing...</span><div style="width: 0%; background: lightblue; height: 10px; margin-top: 5px; border-radius: 5px;"></div>'; demoUiContainer.appendChild(progressDisplay);
            const contentArea = document.createElement('div'); contentArea.style.cssText = 'display: flex; flex-direction: row; margin-top: 10px; gap: 10px; flex-grow: 1; max-height: 400px;'; demoUiContainer.appendChild(contentArea);
            const mermaidContainer = document.createElement('div'); mermaidContainer.id = 'analyzer-mermaid-diagram'; mermaidContainer.style.cssText = `flex: 1; border: 1px solid #ddd; background: #fff; padding: 10px; overflow: auto; min-width: 300px;`; contentArea.appendChild(mermaidContainer);
            const analysisResultPre = document.createElement('pre'); analysisResultPre.id = 'analyzer-result-pre'; analysisResultPre.style.cssText = `flex: 2; padding: 10px; border: 1px solid #ddd; background: #fff; max-height: 400px; overflow-y: auto; white-space: pre-wrap; word-break: break-all;`; contentArea.appendChild(analysisResultPre);
            function updateProgress(report){ const span = progressDisplay.querySelector('span'); const bar = progressDisplay.querySelector('div'); if (span) span.textContent = `\${report.text}`; if (bar) { bar.style.width = `\${report.progress * 100}%`; if (report.text.toLowerCase().includes("error")) bar.style.backgroundColor = "red"; else if (report.progress === 1 && !report.text.toLowerCase().includes("error")) bar.style.backgroundColor = "lightgreen"; else bar.style.backgroundColor = "lightblue"; } }
            function checkForCriticalIssues(llmOutput){ const criticalKeywords=["critical security issue:", "major privacy concern:", "security vulnerability", "privacy violation", "data leak", "exploit", "rce", "xss", "sql injection"]; for (const keyword of criticalKeywords) { if (llmOutput.toLowerCase().includes(keyword.toLowerCase())) return true; } return false; }
            async function renderMermaidDiagram(){
                if (window.ZLU.executionPaths.size === 0) { mermaidContainer.innerHTML = 'No execution paths recorded. Interact with page if instrumented.'; return; }
                try {
                    await loadScript(MERMAID_CDN, 'mermaid'); if (!window.mermaid) { mermaidContainer.innerHTML = 'Failed to load Mermaid.'; return; }
                    window.mermaid.initialize({ startOnLoad: false, theme: 'neutral' }); let mermaidDefinition = 'graph TD;\n'; const edges = new Set();
                    for (const path of window.ZLU.executionPaths) { const nodes = path.split(' -->> '); for (let i = 0; i < nodes.length - 1; i++) { const fromNodeId = nodes[i].replace(/[^a-zA-Z0-9_]/g, '_') + '_' + i; const toNodeId = nodes[i+1].replace(/[^a-zA-Z0-9_]/g, '_') + '_' + (i+1); if (fromNodeId && toNodeId) edges.add(`    \${fromNodeId}[\${JSON.stringify(nodes[i])}] --> \${toNodeId}[\${JSON.stringify(nodes[i+1])}];`); } }
                    mermaidDefinition += Array.from(edges).join('\n'); if (edges.size === 0 && window.ZLU.executionPaths.size > 0) { const singlePath = Array.from(window.ZLU.executionPaths)[0]; const singleId = singlePath.replace(/[^a-zA-Z0-9_]/g, '_') + '_0'; mermaidDefinition += `    \${singleId}[\${JSON.stringify(singlePath)}];`; }
                    const { svg } = await window.mermaid.render('mermaid-graph-svg', mermaidDefinition); mermaidContainer.innerHTML = svg;
                } catch (err) { console.error("Error rendering Mermaid:", err); mermaidContainer.innerHTML = `Error rendering diagram: \${err.message}`; }
            }
            let analyzerInstance;
            try {
                analyzerInstance = new window.ZLU.JSCodeAnalyzer(window.ZLU.DEFAULT_JS_ANALYZER_MODEL_ID, updateProgress); await analyzerInstance._ensureInitialized(); updateProgress({ progress: 1, text: 'Analyzer ready.' });
                const sampleJsCode = `function calculateSum(arr) {\n    let sum = 0;\n    for (let i = 0; i < arr.length; i++) {\n        sum += arr[i];\n    }\n    return sum;\n}\n\nfunction processData(data) {\n    if (!Array.isArray(data)) return "Error: Data is not an array";\n    const result = calculateSum(data);\n    if (typeof result === 'string' && result.includes('<script>')) console.warn("Potential XSS");\n    return result;\n}\nconst data = [1, '2', 3, null, 5, "<script>alert('XSS')</script>"];\nconsole.log(\`Processed: \${processData(data)}\`);`;
                const analysisTask = "Identify potential bugs, type checking, explain output for 'data' array, highlight security/privacy concerns (vulnerabilities, leaks)."; analysisResultPre.textContent = 'Starting analysis...\n';
                await analyzerInstance.analyze(sampleJsCode, analysisTask, (type, message) => { if (type === 'delta') analysisResultPre.textContent += message; else if (type === 'finish') { analysisResultPre.textContent += "\n\n--- Analysis Complete ---"; if (checkForCriticalIssues(message)) { demoUiContainer.style.backgroundColor = 'rgba(255,100,100,0.3)'; const titleElement = demoUiContainer.querySelector('h3'); if (titleElement) { titleElement.textContent += " (Critical Issues Found!)"; titleElement.style.color = 'red'; } } } else if (type === 'error') analysisResultPre.textContent += `\n\n--- ERROR: \${message} ---`; });
                if (DEV_MODE && window.ZLU_INSTRUMENTED_ACTIVE === true) { await renderMermaidDiagram(); const refreshButton = document.createElement('button'); refreshButton.textContent = 'Refresh Diagram'; refreshButton.style.cssText='margin-top:5px;padding:5px;font-size:12px;'; refreshButton.onclick = renderMermaidDiagram; const hrElement=document.createElement('hr'); mermaidContainer.appendChild(hrElement); mermaidContainer.appendChild(refreshButton); }
                else { mermaidContainer.textContent = 'Mermaid diagram active when script is instrumented.'; }
            } catch (error) { console.error("Analyzer Demo Error:", error); updateProgress({ progress: 1, text: `Demo Error: \${error.message}` }); analysisResultPre.textContent = `Error in demo: \${error.message}`; }
        }

        function setupDevInstrumentationUI(){
            const devPanel = document.createElement('div'); devPanel.style.cssText = `position:fixed;top:50px;right:10px;z-index:10001;background:#e9ecef;padding:10px;border-radius:5px;border:1px solid #ced4da;display:flex;flex-direction:column;gap:8px;`;
            const statusDiv = document.createElement('div'); statusDiv.style.fontSize='12px'; statusDiv.style.fontWeight='bold'; devPanel.appendChild(statusDiv);
            if (window.ZLU_INSTRUMENTED_ACTIVE === true) {
                statusDiv.textContent = 'Status: Running instrumented version.'; statusDiv.style.color = 'purple';
                const revertBtn = document.createElement('button'); revertBtn.textContent = 'Revert to Original & Reload'; revertBtn.title='Removes instrumentation and reloads original script.'; revertBtn.style.cssText=`padding:8px 12px;background-color:#28a745;color:white;border:none;border-radius:5px;cursor:pointer;font-size:12px;`;
                revertBtn.onclick = () => { revertBtn.disabled=true; revertBtn.textContent='Reverting...'; delete window.ZLU_INSTRUMENTED_ACTIVE; localStorage.removeItem(INSTRUMENTED_CODE_KEY); localStorage.removeItem(RELOAD_FLAG_KEY); localStorage.removeItem(RELOAD_FLAG_KEY+'_marker'); localStorage.removeItem(RELOAD_FLAG_KEY+'_just_reloaded_for_instrumentation'); alert("Reverting to original. Page will reload."); location.reload(); };
                devPanel.appendChild(revertBtn);
            } else { statusDiv.textContent = 'Status: Running original version.'; statusDiv.style.color = 'green'; }
            const instrumentBtn = document.createElement('button'); instrumentBtn.textContent = window.ZLU_INSTRUMENTED_ACTIVE === true ? 'Re-Instrument & Reload Script' : 'Instrument & Reload Script'; instrumentBtn.title='Modifies userscript with trace calls, reloads page.'; instrumentBtn.style.cssText=`padding:8px 12px;background-color:#ffc107;color:black;border:none;border-radius:5px;cursor:pointer;font-size:12px;`; devPanel.appendChild(instrumentBtn); document.body.appendChild(devPanel);
            instrumentBtn.onclick = async () => {
                instrumentBtn.disabled=true; instrumentBtn.textContent='Preparing...';
                const dialogDiv = document.createElement('div'); dialogDiv.style.cssText=`position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;border:1px solid #ccc;border-radius:8px;padding:20px;z-index:10002;box-shadow:0 0 15px rgba(0,0,0,0.3);width:80vw;max-width:800px;display:flex;flex-direction:column;gap:10px;`;
                const heading=document.createElement('h4'); heading.textContent='Script Instrumentation & Reload'; heading.style.margin='0 0 10px 0'; dialogDiv.appendChild(heading);
                const paragraph=document.createElement('p'); paragraph.innerHTML=`Paste <strong>original userscript source</strong>. It's processed, stored, then page reloads.`; paragraph.style.fontSize='13px'; dialogDiv.appendChild(paragraph);
                const label=document.createElement('label'); label.textContent='Original Script Source:'; dialogDiv.appendChild(label);
                const textarea=document.createElement('textarea'); textarea.rows=15; textarea.placeholder="// ==UserScript==..."; textarea.style.width='100%';
                let prefillHeader = `// ==UserScript==
// @name         JavaScript Code Analyzer (webLLM) - Advanced Reload
// @version      0.3.5
// @description  Analyzes JavaScript code using WebLLM, with dev mode for trace injection (auto-reloads with instrumented code), revert option, and Mermaid flow visualization.
// @author       ZLudany (enhanced by AI)
// @match        https://home.google.com/*
// @connect      cdn.jsdelivr.net
// @connect      huggingface.co
// @connect      *.mlc.ai
// @connect      cdnjs.cloudflare.com
// @grant        GM_setClipboard
// @date         2023-10-28T14:30:00+00:00
// ==/UserScript==`;
                let prefillIIFE = '(async function() { /* Paste IIFE body here */ })();';
                if (document.currentScript && document.currentScript.textContent) {
                    const currentScriptText = document.currentScript.textContent;
                    const iifeStartIndex = currentScriptText.indexOf('(async function() {');
                    const iifeEndIndex = currentScriptText.lastIndexOf('})();');
                    if (iifeStartIndex !== -1 && iifeEndIndex > iifeStartIndex) {
                        prefillIIFE = currentScriptText.substring(iifeStartIndex, iifeEndIndex + '})();'.length);
                    }
                    const headerMatch = currentScriptText.match(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/s);
                    if (headerMatch) prefillHeader = headerMatch[0];
                }
                textarea.value = prefillHeader + "\n\n" + prefillIIFE;
                dialogDiv.appendChild(textarea);
                const processBtn=document.createElement('button'); processBtn.textContent='Process, Store & Reload'; dialogDiv.appendChild(processBtn);
                const closeBtn=document.createElement('button'); closeBtn.textContent='Cancel'; closeBtn.onclick=()=>{dialogDiv.remove();instrumentBtn.disabled=false;instrumentBtn.textContent=window.ZLU_INSTRUMENTED_ACTIVE===true?'Re-Instrument & Reload':'Instrument & Reload';}; dialogDiv.appendChild(closeBtn); document.body.appendChild(dialogDiv);
                try {
                    const worker=await getAcornWorker(); instrumentBtn.textContent=window.ZLU_INSTRUMENTED_ACTIVE===true?'Re-Instrument & Reload':'Instrument & Reload'; processBtn.disabled=false;
                    processBtn.onclick = async () => {
                        const sourceCodeToInstrument=textarea.value; if(!sourceCodeToInstrument.trim()||!sourceCodeToInstrument.includes("// ==UserScript==")||!sourceCodeToInstrument.includes("async function()")){alert("Paste full valid userscript.");return;}
                        processBtn.textContent='Processing...';processBtn.disabled=true;closeBtn.disabled=true;
                        worker.onmessage = (e) => {
                            if(e.data.success){localStorage.setItem(INSTRUMENTED_CODE_KEY,e.data.modifiedCode);localStorage.setItem(RELOAD_FLAG_KEY,'true');localStorage.setItem(RELOAD_FLAG_KEY+'_marker','true');localStorage.setItem(RELOAD_FLAG_KEY+'_just_reloaded_for_instrumentation','true');alert("Code instrumented. Page will reload.");location.reload();}
                            else{alert(`Instrumentation Error:\n\${e.data.error}\nPage won't reload.`);processBtn.textContent='Process, Store & Reload';processBtn.disabled=false;closeBtn.disabled=false;}
                        };
                        worker.onerror=(err)=>{alert(`Worker Error:\n\${err.message}\nPage won't reload.`);processBtn.textContent='Process, Store & Reload';processBtn.disabled=false;closeBtn.disabled=false;};
                        const functionsToIgnoreArray=['trace','getFunc','loadScript','loadWebLLMScript','_initialize','_ensureInitialized','analyze','resetChat','dispose','runAnalyzerDemo','updateProgress','checkForCriticalIssues','renderMermaidDiagram','setupDevInstrumentationUI','initializeApp','getAcornWorker'];
                        worker.postMessage({sourceCode:sourceCodeToInstrument,acornPath:ACORN_CDN,escodegenPath:ESCODEGEN_CDN,estraversePath:ESTRAVERSE_CDN,functionsToIgnore:functionsToIgnoreArray});
                    };
                } catch(err){console.error("Dev UI setup error:",err);alert("Error loading dev tools: "+err.message);dialogDiv.remove();instrumentBtn.disabled=false;instrumentBtn.textContent=window.ZLU_INSTRUMENTED_ACTIVE===true?'Re-Instrument & Reload':'Instrument & Reload';}
            };
        }

        const startDemoButton = document.createElement('button');
        startDemoButton.textContent = 'Start JS Analyzer Demo (loads ~4GB model)';
        startDemoButton.style.cssText = `position: fixed; top: 10px; right: 10px; z-index: 10000; padding: 10px 15px; background-color: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer;`;
        startDemoButton.onclick = () => { runAnalyzerDemo(); startDemoButton.disabled = true; startDemoButton.textContent = 'Demo Initializing...'; };

        function initializeApp(){
            if (document.body) { document.body.appendChild(startDemoButton); if (DEV_MODE) setupDevInstrumentationUI(); }
            else { window.addEventListener('DOMContentLoaded', () => { document.body.appendChild(startDemoButton); if (DEV_MODE) setupDevInstrumentationUI(); }, {once: true}); }
        }

        initializeApp();

    })(); // End of Main Userscript IIFE
} // End of if(runOriginalScriptMainIIFE)
