// ==UserScript==
// @name         JavaScript Code Analyzer (webLLM) - Advanced Reload
// @namespace    http://tampermonkey.net/
// @version      0.3.4
// @description  Analyzes JavaScript code using WebLLM, with dev mode for trace injection (auto-reloads with instrumented code), revert option, and Mermaid flow visualization.
// @author       ZLudany (enhanced by AI)
// @match        https://home.google.com/*
// @connect      cdn.jsdelivr.net       // For WebLLM library, Mermaid, Acorn, Escodegen, ESTraverse
// @connect      huggingface.co        // Common CDN for WebLLM models
// @connect      *.mlc.ai              // Official MLC CDNs for models and wasm
// @connect      cdnjs.cloudflare.com  // For Acorn, Escodegen, ESTraverse
// @grant        GM_setClipboard       // Optional: For easily copying modified code
// @date         2023-10-28T14:00:00+00:00
// ==/UserScript==

// Top-level scope of the userscript
const INSTRUMENTED_CODE_KEY = 'userscript_instrumented_code_v0_3_4';
const RELOAD_FLAG_KEY = 'userscript_reload_with_instrumented_code_v0_3_4';
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

        // Content of ACORN_WORKER_SOURCE is preserved with its original line breaks
        // to avoid mangling its internal JavaScript syntax, especially array literals.
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
                    const traceCallStatement = {
                        type: 'ExpressionStatement',
                        expression: {
                            type: 'CallExpression',
                            callee: { type: 'MemberExpression', object: {type: 'Identifier', name: 'ZLU'}, property: {type: 'Identifier', name: 'trace'}, computed: false },
                            arguments: [ { type: 'Literal', value: false, raw: 'false' }, { type: 'Literal', value: true, raw: 'true' } ]
                        }
                    };
                    if (node.body.type === 'BlockStatement') {
                        node.body.body.unshift(traceCallStatement);
                    } else {
                        node.body = {
                            type: 'BlockStatement',
                            body: [ traceCallStatement, { type: 'ReturnStatement', argument: node.body } ]
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
                this.progressCallback = progressCallback || function(report){ const p = (report.progress * 100).toFixed(2); console.log(`[JSCodeAnalyzer Progress]: ${report.text} (${p}%)`); };
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
                    this.progressCallback({ progress: 0.05, text: `Loading model: ${this.modelId}` });
                    await this.chatWorkerClient.reload(this.modelId);
                    this.progressCallback({ progress: 1, text: 'Model loaded and JSCodeAnalyzer ready.' });
                    console.log("JSCodeAnalyzer initialized with model:", this.modelId);
                } catch (error) {
                    console.error("Error initializing JSCodeAnalyzer:", error);
                    this.progressCallback({ progress: 1, text: `Initialization Error: ${error.message}` });
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
                const fullPrompt = `You are an expert JavaScript code analysis assistant. Your task is to analyze the provided JavaScript code.\nFollow these instructions for the analysis: ${analysisTaskPrompt}\nProvide a detailed and structured analysis. If you identify any critical security issues or major privacy concerns, please state them clearly and begin those specific points with phrases like "CRITICAL SECURITY ISSUE:" or "MAJOR PRIVACY CONCERN:".\nJavaScript Code:\n\`\`\`javascript\n${jsCode}\n\`\`\`\nAnalysis:`;
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
                    } catch (error) { console.error("Error during JSCodeAnalyzer disposal:", error); this.progressCallback({ progress: 1, text: `Error disposing: ${error.message}` }); }
                    this.chatWorkerClient = null;
                }
                this.initializationInProgress = false; this.initializationPromise = null;
            }
        }window.ZLU.JSCodeAnalyzer = JSCodeAnalyzer;

        if (window.ZLU_INSTRUMENTED_ACTIVE === true) { console.log("JSCodeAnalyzer (V0.3.4): Running INSTRUMENTED version."); }
        else { console.log("JSCodeAnalyzer (V0.3.4): Running ORIGINAL version."); }
        console.log(`Default model for analysis: ${DEFAULT_MODEL_ID}`);

        async function runAnalyzerDemo(){
            const demoUiContainer = document.createElement('div'); demoUiContainer.id = 'js-analyzer-demo-ui'; demoUiContainer.style.cssText = `position: fixed; bottom: 10px; right: 10px; z-index: 9999; background: #f0f0f0; border: 1px solid #ccc; border-radius: 8px; padding: 15px; box-shadow: 0 4px 8px rgba(0,0,0,0.2); width: 800px; font-family: Arial, sans-serif; font-size: 14px; display: flex; flex-direction: column;`; document.body.appendChild(demoUiContainer);
            const title = document.createElement('h3'); title.textContent = 'JS Code Analyzer Demo'; if (window.ZLU_INSTRUMENTED_ACTIVE === true) { title.textContent += ' (Instrumented)'; title.style.color = 'purple'; } title.style.marginTop = '0'; demoUiContainer.appendChild(title);
            const progressDisplay = document.createElement('div'); progressDisplay.id = 'analyzer-progress-display'; progressDisplay.innerHTML = '<span>Initializing...</span><div style="width: 0%; background: lightblue; height: 10px; margin-top: 5px; border-radius: 5px;"></div>'; demoUiContainer.appendChild(progressDisplay);
            const contentArea = document.createElement('div'); contentArea.style.cssText = 'display: flex; flex-direction: row; margin-top: 10px; gap: 10px; flex-grow: 1; max-height: 400px;'; demoUiContainer.appendChild(contentArea);
            const mermaidContainer = document.createElement('div'); mermaidContainer.id = 'analyzer-mermaid-diagram'; mermaidContainer.style.cssText = `flex: 1; border: 1px solid #ddd; background: #fff; padding: 10px; overflow: auto; min-width: 300px;`; contentArea.appendChild(mermaidContainer);
            const analysisResultPre = document.createElement('pre'); analysisResultPre.id = 'analyzer-result-pre'; analysisResultPre.style.cssText = `flex: 2; padding: 10px; border: 1px solid #ddd; background: #fff; max-height: 400px; overflow-y: auto; white-space: pre-wrap; word-break: break-all;`; contentArea.appendChild(analysisResultPre);
            function updateProgress(report){ const span = progressDisplay.querySelector('span'); const bar = progressDisplay.querySelector('div'); if (span) span.textContent = `${report.text}`; if (bar) { bar.style.width = `${report.progress * 100}%`; if (report.text.toLowerCase().includes("error")) bar.style.backgroundColor = "red"; else if (report.progress === 1 && !report.text.toLowerCase().includes("error")) bar.style.backgroundColor = "lightgreen"; else bar.style.backgroundColor = "lightblue"; } }
            function checkForCriticalIssues(llmOutput){ const k=["critical security issue:", "major privacy concern:", "security vulnerability", "privacy violation", "data leak", "exploit", "rce", "xss", "sql injection"]; for (const kw of k) { if (llmOutput.toLowerCase().includes(kw.toLowerCase())) return true; } return false; }
            async function renderMermaidDiagram(){
                if (window.ZLU.executionPaths.size === 0) { mermaidContainer.innerHTML = 'No execution paths recorded. Interact with page if instrumented.'; return; }
                try {
                    await loadScript(MERMAID_CDN, 'mermaid'); if (!window.mermaid) { mermaidContainer.innerHTML = 'Failed to load Mermaid.'; return; }
                    window.mermaid.initialize({ startOnLoad: false, theme: 'neutral' }); let md = 'graph TD;\n'; const e = new Set();
                    for (const p of window.ZLU.executionPaths) { const n = p.split(' -->> '); for (let i = 0; i < n.length - 1; i++) { const fId = n[i].replace(/[^a-zA-Z0-9_]/g, '_') + '_' + i; const tId = n[i+1].replace(/[^a-zA-Z0-9_]/g, '_') + '_' + (i+1); if (fId && tId) e.add(`    ${fId}[${JSON.stringify(n[i])}] --> ${tId}[${JSON.stringify(n[i+1])}];`); } }
                    md += Array.from(e).join('\n'); if (e.size === 0 && window.ZLU.executionPaths.size > 0) { const sP = Array.from(window.ZLU.executionPaths)[0]; const sId = sP.replace(/[^a-zA-Z0-9_]/g, '_') + '_0'; md += `    ${sId}[${JSON.stringify(sP)}];`; }
                    const { svg } = await window.mermaid.render('mermaid-graph-svg', md); mermaidContainer.innerHTML = svg;
                } catch (err) { console.error("Error rendering Mermaid:", err); mermaidContainer.innerHTML = `Error rendering diagram: ${err.message}`; }
            }
            let analyzerInstance;
            try {
                analyzerInstance = new window.ZLU.JSCodeAnalyzer(window.ZLU.DEFAULT_JS_ANALYZER_MODEL_ID, updateProgress); await analyzerInstance._ensureInitialized(); updateProgress({ progress: 1, text: 'Analyzer ready.' });
                const sampleJsCode = `function calculateSum(arr) {\n    let sum = 0;\n    for (let i = 0; i < arr.length; i++) {\n        sum += arr[i];\n    }\n    return sum;\n}\n\nfunction processData(data) {\n    if (!Array.isArray(data)) return "Error: Data is not an array";\n    const result = calculateSum(data);\n    if (typeof result === 'string' && result.includes('<script>')) console.warn("Potential XSS");\n    return result;\n}\nconst data = [1, '2', 3, null, 5, "<script>alert('XSS')</script>"];\nconsole.log(\`Processed: \${processData(data)}\`);`;
                const analysisTask = "Identify potential bugs, type checking, explain output for 'data' array, highlight security/privacy concerns (vulnerabilities, leaks)."; analysisResultPre.textContent = 'Starting analysis...\n';
                await analyzerInstance.analyze(sampleJsCode, analysisTask, (type, message) => { if (type === 'delta') analysisResultPre.textContent += message; else if (type === 'finish') { analysisResultPre.textContent += "\n\n--- Analysis Complete ---"; if (checkForCriticalIssues(message)) { demoUiContainer.style.backgroundColor = 'rgba(255,100,100,0.3)'; const tEl = demoUiContainer.querySelector('h3'); if (tEl) { tEl.textContent += " (Critical Issues Found!)"; tEl.style.color = 'red'; } } } else if (type === 'error') analysisResultPre.textContent += `\n\n--- ERROR: ${message} ---`; });
                if (DEV_MODE && window.ZLU_INSTRUMENTED_ACTIVE === true) { await renderMermaidDiagram(); const btn = document.createElement('button'); btn.textContent = 'Refresh Diagram'; btn.style.cssText='margin-top:5px;padding:5px;font-size:12px;'; btn.onclick = renderMermaidDiagram; const hr=document.createElement('hr'); mermaidContainer.appendChild(hr); mermaidContainer.appendChild(btn); }
                else { mermaidContainer.textContent = 'Mermaid diagram active when script is instrumented.'; }
            } catch (error) { console.error("Analyzer Demo Error:", error); updateProgress({ progress: 1, text: `Demo Error: ${error.message}` }); analysisResultPre.textContent = `Error in demo: ${error.message}`; }
        }

        function setupDevInstrumentationUI(){
            const p = document.createElement('div'); p.style.cssText = `position:fixed;top:50px;right:10px;z-index:10001;background:#e9ecef;padding:10px;border-radius:5px;border:1px solid #ced4da;display:flex;flex-direction:column;gap:8px;`;
            const s = document.createElement('div'); s.style.fontSize='12px'; s.style.fontWeight='bold'; p.appendChild(s);
            if (window.ZLU_INSTRUMENTED_ACTIVE === true) {
                s.textContent = 'Status: Running instrumented version.'; s.style.color = 'purple';
                const rBtn = document.createElement('button'); rBtn.textContent = 'Revert to Original & Reload'; rBtn.title='Removes instrumentation and reloads original script.'; rBtn.style.cssText=`padding:8px 12px;background-color:#28a745;color:white;border:none;border-radius:5px;cursor:pointer;font-size:12px;`;
                rBtn.onclick = () => { rBtn.disabled=true; rBtn.textContent='Reverting...'; delete window.ZLU_INSTRUMENTED_ACTIVE; localStorage.removeItem(INSTRUMENTED_CODE_KEY); localStorage.removeItem(RELOAD_FLAG_KEY); localStorage.removeItem(RELOAD_FLAG_KEY+'_marker'); localStorage.removeItem(RELOAD_FLAG_KEY+'_just_reloaded_for_instrumentation'); alert("Reverting to original. Page will reload."); location.reload(); };
                p.appendChild(rBtn);
            } else { s.textContent = 'Status: Running original version.'; s.style.color = 'green'; }
            const iBtn = document.createElement('button'); iBtn.textContent = window.ZLU_INSTRUMENTED_ACTIVE === true ? 'Re-Instrument & Reload Script' : 'Instrument & Reload Script'; iBtn.title='Modifies userscript with trace calls, reloads page.'; iBtn.style.cssText=`padding:8px 12px;background-color:#ffc107;color:black;border:none;border-radius:5px;cursor:pointer;font-size:12px;`; p.appendChild(iBtn); document.body.appendChild(p);
            iBtn.onclick = async () => {
                iBtn.disabled=true; iBtn.textContent='Preparing...';
                const d = document.createElement('div'); d.style.cssText=`position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;border:1px solid #ccc;border-radius:8px;padding:20px;z-index:10002;box-shadow:0 0 15px rgba(0,0,0,0.3);width:80vw;max-width:800px;display:flex;flex-direction:column;gap:10px;`;
                const h=document.createElement('h4'); h.textContent='Script Instrumentation & Reload'; h.style.margin='0 0 10px 0'; d.appendChild(h);
                const pEl=document.createElement('p'); pEl.innerHTML=`Paste <strong>original userscript source</strong>. It's processed, stored, then page reloads.`; pEl.style.fontSize='13px'; d.appendChild(pEl);
                const lbl=document.createElement('label'); lbl.textContent='Original Script Source:'; d.appendChild(lbl);
                const area=document.createElement('textarea'); area.rows=15; area.placeholder="// ==UserScript==..."; area.style.width='100%';
                area.value = `// ==UserScript==\n// @name         JavaScript Code Analyzer (webLLM) - Advanced Reload\n// @version      0.3.4\n// ... (full header of THIS script) ...\n// ==/UserScript==\n\n${document.currentScript.textContent.substring(document.currentScript.textContent.indexOf('(async function() {'), document.currentScript.textContent.lastIndexOf('})') + 2) || '(async function() { /* Paste IIFE here */ })();'}`;
                d.appendChild(area);
                const btnProcess=document.createElement('button'); btnProcess.textContent='Process, Store & Reload'; d.appendChild(btnProcess);
                const btnClose=document.createElement('button'); btnClose.textContent='Cancel'; btnClose.onclick=()=>{d.remove();iBtn.disabled=false;iBtn.textContent=window.ZLU_INSTRUMENTED_ACTIVE===true?'Re-Instrument & Reload':'Instrument & Reload';}; d.appendChild(btnClose); document.body.appendChild(d);
                try {
                    const worker=await getAcornWorker(); iBtn.textContent=window.ZLU_INSTRUMENTED_ACTIVE===true?'Re-Instrument & Reload':'Instrument & Reload'; btnProcess.disabled=false;
                    btnProcess.onclick = async () => {
                        const src=area.value; if(!src.trim()||!src.includes("// ==UserScript==")||!src.includes("async function()")){alert("Paste full valid userscript.");return;}
                        btnProcess.textContent='Processing...';btnProcess.disabled=true;btnClose.disabled=true;
                        worker.onmessage = (e) => {
                            if(e.data.success){localStorage.setItem(INSTRUMENTED_CODE_KEY,e.data.modifiedCode);localStorage.setItem(RELOAD_FLAG_KEY,'true');localStorage.setItem(RELOAD_FLAG_KEY+'_marker','true');localStorage.setItem(RELOAD_FLAG_KEY+'_just_reloaded_for_instrumentation','true');alert("Code instrumented. Page will reload.");location.reload();}
                            else{alert(`Instrumentation Error:\n${e.data.error}\nPage won't reload.`);btnProcess.textContent='Process, Store & Reload';btnProcess.disabled=false;btnClose.disabled=false;}
                        };
                        worker.onerror=(err)=>{alert(`Worker Error:\n${err.message}\nPage won't reload.`);btnProcess.textContent='Process, Store & Reload';btnProcess.disabled=false;btnClose.disabled=false;};
                        const ignore=['trace','getFunc','loadScript','loadWebLLMScript','_initialize','_ensureInitialized','analyze','resetChat','dispose','runAnalyzerDemo','updateProgress','checkForCriticalIssues','renderMermaidDiagram','setupDevInstrumentationUI','initializeApp','getAcornWorker'];
                        worker.postMessage({sourceCode:src,acornPath:ACORN_CDN,escodegenPath:ESCODEGEN_CDN,estraversePath:ESTRAVERSE_CDN,functionsToIgnore:ignore});
                    };
                } catch(err){console.error("Dev UI setup error:",err);alert("Error loading dev tools: "+err.message);d.remove();iBtn.disabled=false;iBtn.textContent=window.ZLU_INSTRUMENTED_ACTIVE===true?'Re-Instrument & Reload':'Instrument & Reload';}
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
