// ==UserScript==
// @name         JavaScript Code Analyzer (webLLM) - Advanced Reload
// @namespace    http://tampermonkey.net/
// @version      0.3.1
// @description  Analyzes JavaScript code using WebLLM, with dev mode for trace injection (auto-reloads with instrumented code) and Mermaid flow visualization.
// @author       ZLudany (enhanced by AI)
// @match        https://home.google.com/*
// @connect      cdn.jsdelivr.net       // For WebLLM library, Mermaid, Acorn, Escodegen, ESTraverse
// @connect      huggingface.co        // Common CDN for WebLLM models
// @connect      *.mlc.ai              // Official MLC CDNs for models and wasm
// @connect      cdnjs.cloudflare.com  // For Acorn, Escodegen, ESTraverse
// @grant        GM_setClipboard       // Optional: For easily copying modified code
// @date         2023-10-28T12:30:00+00:00
// ==/UserScript==

(async function() {
    'use strict';
    const INSTRUMENTED_CODE_KEY = 'userscript_instrumented_code_v0_3_1';
    const RELOAD_FLAG_KEY = 'userscript_reload_with_instrumented_code_v0_3_1';

    if (localStorage.getItem(RELOAD_FLAG_KEY) === 'true') {
        const instrumentedCode = localStorage.getItem(INSTRUMENTED_CODE_KEY);
        localStorage.removeItem(RELOAD_FLAG_KEY);
        localStorage.removeItem(INSTRUMENTED_CODE_KEY);
        if (instrumentedCode) {
            console.log("JavaScript Code Analyzer: Loading instrumented code from localStorage...");
            try {
                new Function(instrumentedCode)();
                return;
            } catch (e) {
                console.error("JavaScript Code Analyzer: Error executing instrumented code:", e);
                alert("Error executing instrumented code. Check console. The original script will load on the next refresh. The instrumented code will be discarded.");
            }
        }
    }

    // --- Global Configuration ---
    const DEV_MODE = true;
    const WEB_LLM_LIBRARY_SRC = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@latest/dist/web-llm.js';
    const DEFAULT_MODEL_ID = "Llama-3-8B-Instruct-q4f16_1";

    const ACORN_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/acorn/8.11.0/acorn.min.js';
    const ESCODEGEN_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/escodegen/2.1.0/escodegen.min.js';
    const ESTRAVERSE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/estraverse/5.3.0/estraverse.min.js';
    const MERMAID_CDN = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';

    // --- ZLU Namespace & Execution Path Storage ---
    if (typeof window.ZLU === 'undefined') {
        window.ZLU = {};
    }
    window.ZLU.executionPaths = window.ZLU.executionPaths || new Set();
    window.ZLU.DEFAULT_JS_ANALYZER_MODEL_ID = DEFAULT_MODEL_ID;

    // --- Tracing Utilities ---
    function getFunc(f){
        if (typeof f !== 'function') {
            return null;
        }
        return f.name ? f.name : (f.toString().match(/(function)(\s+)(\w+)(\()/)?.[3] || 'anonymous');
    }window.ZLU.getFunc = getFunc;

    function trace(logBefore = false, all = true){
        try {
            const maxDepth = 20;
            let currentFunc = logBefore ? arguments.callee.caller.caller : arguments.callee.caller;
            if (!currentFunc) {
                return null;
            }

            const callChain = [];
            let depth = 0;

            while (currentFunc && depth < maxDepth) {
                const funcName = getFunc(currentFunc);
                if (funcName) {
                    callChain.push(funcName);
                }

                if (currentFunc.caller === currentFunc) {
                    callChain.push("recursive_self");
                    break;
                }
                if (!all && callChain.length > 1) {
                    const prevFuncs = callChain.slice(0, -1).join(' -->> ');
                    if (prevFuncs.includes(funcName)) {
                        break;
                    }
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
        } catch (e) {
            // console.warn("Error in trace function:", e);
        }
        return null;
    }window.ZLU.trace = trace;


    // --- Helper to load external scripts ---
    const loadedScripts = {};
    async function loadScript(url, id){
        if (loadedScripts[id || url]) {
            return loadedScripts[id || url];
        }
        const promise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            if (id) script.id = id;
            script.onload = () => {
                console.log(`Script ${id || url} loaded successfully from ${url}.`);
                resolve();
            };
            script.onerror = (err) => {
                console.error(`Failed to load script ${id || url} from ${url}:`, err);
                delete loadedScripts[id || url];
                reject(err);
            };
            document.head.appendChild(script);
        });
        loadedScripts[id || url] = promise;
        return promise;
    }async function loadWebLLMScript(url){
        if (typeof window.webLLM !== 'undefined') {
            console.log('WebLLM library already loaded.');
            return Promise.resolve();
        }
        return loadScript(url, 'webllm-library');
    }

    // --- Acorn Worker Script (as a string) ---
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
                                    firstStmt.expression.callee.type === 'Identifier' &&
                                    firstStmt.expression.callee.name === 'trace') {
                                    return node;
                                }
                            }

                            const traceCallStatement = {
                                type: 'ExpressionStatement',
                                expression: {
                                    type: 'CallExpression',
                                    callee: { type: 'Identifier', name: 'trace' },
                                    arguments: [
                                        { type: 'Literal', value: false, raw: 'false' },
                                        { type: 'Literal', value: true, raw: 'true' }
                                    ]
                                }
                            };

                            if (node.body.type === 'BlockStatement') {
                                node.body.body.unshift(traceCallStatement);
                            } else {
                                node.body = {
                                    type: 'BlockStatement',
                                    body: [
                                        traceCallStatement,
                                        { type: 'ReturnStatement', argument: node.body }
                                    ]
                                };
                            }
                        }
                        return node;
                    }
                });

                const modifiedCode = self.escodegen.generate(ast);
                self.postMessage({ success: true, modifiedCode });

            } catch (error) {
                console.error("Acorn Worker Error:", error);
                self.postMessage({ success: false, error: error.message + (error.stack ? '\\n' + error.stack : '') });
            }
        };
    `;
    let acornWorker = null;
    async function getAcornWorker(){
        if (!acornWorker) {
            await Promise.all([
                loadScript(ACORN_CDN, 'acorn'),
                loadScript(ESCODEGEN_CDN, 'escodegen'),
                loadScript(ESTRAVERSE_CDN, 'estraverse')
            ]);
            const blob = new Blob([ACORN_WORKER_SOURCE], { type: 'application/javascript' });
            const workerUrl = URL.createObjectURL(blob);
            acornWorker = new Worker(workerUrl);
        }
        return acornWorker;
    }

    // --- Main Userscript Class ---
    class JSCodeAnalyzer {
        constructor(modelId = DEFAULT_MODEL_ID, progressCallback = null){
            this.modelId = modelId;
            this.chatWorkerClient = null;
            this.initializationInProgress = false;
            this.initializationPromise = null;
            this.progressCallback = progressCallback || function(report){
                const progressPercentage = (report.progress * 100).toFixed(2);
                console.log(`[JSCodeAnalyzer Worker Progress]: ${report.text} (${progressPercentage}%)`);
            };
            this.initializationPromise = this._initialize();
        }
        async _initialize(){
            if (this.initializationInProgress || this.chatWorkerClient) {
                return this.initializationPromise;
            }
            this.initializationInProgress = true;
            try {
                await loadWebLLMScript(WEB_LLM_LIBRARY_SRC);
                if (!window.webLLM || !window.webLLM.ChatWorkerClient) {
                    throw new Error("WebLLM.ChatWorkerClient is not available. Ensure WebLLM library is loaded correctly.");
                }
                this.progressCallback({ progress: 0, text: 'Initializing JSCodeAnalyzer service...' });
                const webLLMWorkerScriptPath = WEB_LLM_LIBRARY_SRC.replace('web-llm.js', 'worker.js');
                const worker = new Worker(webLLMWorkerScriptPath, { type: "module" });
                this.chatWorkerClient = new window.webLLM.ChatWorkerClient(worker, {
                    initProgressCallback: report => this.progressCallback(report)
                });
                this.progressCallback({ progress: 0.05, text: `Loading model: ${this.modelId}` });
                await this.chatWorkerClient.reload(this.modelId);
                this.progressCallback({ progress: 1, text: 'Model loaded and JSCodeAnalyzer ready.' });
                console.log("JSCodeAnalyzer initialized with model:", this.modelId);
            } catch (error) {
                console.error("Error initializing JSCodeAnalyzer:", error);
                this.progressCallback({ progress: 1, text: `Initialization Error: ${error.message}` });
                this.chatWorkerClient = null;
                throw error;
            } finally {
                this.initializationInProgress = false;
            }
        }
        async _ensureInitialized(){
            if (!this.initializationPromise) {
                 console.warn("JSCodeAnalyzer initialization was not started. Attempting to initialize now.");
                 this.initializationPromise = this._initialize();
            }
            await this.initializationPromise;
            if (!this.chatWorkerClient) {
                throw new Error("JSCodeAnalyzer failed to initialize or model is not loaded.");
            }
        }
        async analyze(jsCode, analysisTaskPrompt, streamCallback = null){
            await this._ensureInitialized();
            const fullPrompt = `You are an expert JavaScript code analysis assistant. Your task is to analyze the provided JavaScript code.
Follow these instructions for the analysis: ${analysisTaskPrompt}

Provide a detailed and structured analysis. If you identify any critical security issues or major privacy concerns, please state them clearly and begin those specific points with phrases like "CRITICAL SECURITY ISSUE:" or "MAJOR PRIVACY CONCERN:".

JavaScript Code:
\`\`\`javascript
${jsCode}
\`\`\`

Analysis:`;
            try {
                let fullReply = "";
                if (streamCallback) {
                    let lastStreamedLength = 0;
                    const progressCbForGenerate = (_step, currentMessage) => {
                        const delta = currentMessage.substring(lastStreamedLength);
                        if (delta) {
                           streamCallback('delta', delta);
                        }
                        lastStreamedLength = currentMessage.length;
                    };
                    fullReply = await this.chatWorkerClient.generate(fullPrompt, progressCbForGenerate);
                    streamCallback('finish', fullReply);
                } else {
                    fullReply = await this.chatWorkerClient.generate(fullPrompt);
                }
                return fullReply;
            } catch (error) {
                console.error("Error during code analysis:", error);
                if (streamCallback) streamCallback('error', error.message);
                throw error;
            }
        }
        async resetChat(){
            await this._ensureInitialized();
            try {
                await this.chatWorkerClient.resetChat();
                console.log("JSCodeAnalyzer: Chat context reset.");
                this.progressCallback({ progress: this.chatWorkerClient ? 1 : 0, text: 'Chat context reset.' });
            } catch (error) {
                console.error("Error resetting chat:", error);
            }
        }
        async dispose(){
            if (this.chatWorkerClient) {
                try {
                    this.progressCallback({ progress: 0, text: 'Disposing JSCodeAnalyzer...' });
                    await this.chatWorkerClient.unload();
                    this.chatWorkerClient.worker.terminate();
                    console.log("JSCodeAnalyzer disposed: model unloaded and worker terminated.");
                    this.progressCallback({ progress: 1, text: 'JSCodeAnalyzer disposed.' });
                } catch (error) {
                    console.error("Error during JSCodeAnalyzer disposal:", error);
                    this.progressCallback({ progress: 1, text: `Error disposing: ${error.message}` });
                }
                this.chatWorkerClient = null;
            }
            this.initializationInProgress = false;
            this.initializationPromise = null;
        }
    }window.ZLU.JSCodeAnalyzer = JSCodeAnalyzer;


    console.log("JSCodeAnalyzer class (V0.3.1) loaded. Access with `new ZLU.JSCodeAnalyzer()`.");
    console.log(`Default model for analysis: ${DEFAULT_MODEL_ID}`);
    if (localStorage.getItem(RELOAD_FLAG_KEY + '_marker')) {
        console.log("JSCodeAnalyzer: Running instrumented version.");
        localStorage.removeItem(RELOAD_FLAG_KEY + '_marker');
    }


    // --- Example Usage (Demonstration) ---
    async function runAnalyzerDemo(){
        const demoUiContainer = document.createElement('div');
        demoUiContainer.id = 'js-analyzer-demo-ui';
        demoUiContainer.style.cssText = `
            position: fixed; bottom: 10px; right: 10px; z-index: 9999;
            background: #f0f0f0; border: 1px solid #ccc; border-radius: 8px;
            padding: 15px; box-shadow: 0 4px 8px rgba(0,0,0,0.2); width: 800px;
            font-family: Arial, sans-serif; font-size: 14px; display: flex; flex-direction: column;
        `;
        document.body.appendChild(demoUiContainer);

        const title = document.createElement('h3');
        title.textContent = 'JS Code Analyzer Demo';
        if (localStorage.getItem(RELOAD_FLAG_KEY + '_just_reloaded_for_instrumentation')) {
            title.textContent += ' (Instrumented)';
            title.style.color = 'purple';
            localStorage.removeItem(RELOAD_FLAG_KEY + '_just_reloaded_for_instrumentation');
        }
        title.style.marginTop = '0';
        demoUiContainer.appendChild(title);

        const progressDisplay = document.createElement('div');
        progressDisplay.id = 'analyzer-progress-display';
        progressDisplay.innerHTML = '<span>Initializing...</span><div style="width: 0%; background: lightblue; height: 10px; margin-top: 5px; border-radius: 5px;"></div>';
        demoUiContainer.appendChild(progressDisplay);

        const contentArea = document.createElement('div');
        contentArea.style.cssText = 'display: flex; flex-direction: row; margin-top: 10px; gap: 10px; flex-grow: 1; max-height: 400px;';
        demoUiContainer.appendChild(contentArea);

        const mermaidContainer = document.createElement('div');
        mermaidContainer.id = 'analyzer-mermaid-diagram';
        mermaidContainer.style.cssText = `
            flex: 1; border: 1px solid #ddd; background: #fff; padding: 10px;
            overflow: auto; min-width: 300px;
        `;
        mermaidContainer.textContent = 'Execution path diagram will appear here (after instrumentation and interaction).';
        contentArea.appendChild(mermaidContainer);

        const analysisResultPre = document.createElement('pre');
        analysisResultPre.id = 'analyzer-result-pre';
        analysisResultPre.style.cssText = `
            flex: 2; padding: 10px; border: 1px solid #ddd; background: #fff;
            max-height: 400px; overflow-y: auto; white-space: pre-wrap; word-break: break-all;
        `;
        contentArea.appendChild(analysisResultPre);


        function updateProgress(report){
            const span = progressDisplay.querySelector('span');
            const bar = progressDisplay.querySelector('div');
            if (span) span.textContent = `${report.text}`;
            if (bar) {
                bar.style.width = `${report.progress * 100}%`;
                if (report.text.toLowerCase().includes("error")) bar.style.backgroundColor = "red";
                else if (report.progress === 1 && !report.text.toLowerCase().includes("error")) bar.style.backgroundColor = "lightgreen";
                else bar.style.backgroundColor = "lightblue";
            }
        }

        function checkForCriticalIssues(llmOutput){
            const criticalKeywords = [
                "critical security issue:", "major privacy concern:", "security vulnerability",
                "privacy violation", "data leak", "exploit", "rce", "xss", "sql injection"
            ];
            for (const keyword of criticalKeywords) {
                if (llmOutput.toLowerCase().includes(keyword.toLowerCase())) {
                    return true;
                }
            }
            return false;
        }

        async function renderMermaidDiagram(){
            if (window.ZLU.executionPaths.size === 0) {
                mermaidContainer.innerHTML = 'No execution paths recorded for diagram. Interact with the page if instrumented.';
                return;
            }
            try {
                await loadScript(MERMAID_CDN, 'mermaid');
                if (!window.mermaid) {
                    mermaidContainer.innerHTML = 'Failed to load Mermaid library.';
                    return;
                }
                window.mermaid.initialize({ startOnLoad: false, theme: 'neutral' });

                let mermaidDefinition = 'graph TD;\n';
                const edges = new Set();
                for (const path of window.ZLU.executionPaths) {
                    const nodes = path.split(' -->> ');
                    for (let i = 0; i < nodes.length - 1; i++) {
                        const fromNodeId = nodes[i].replace(/[^a-zA-Z0-9_]/g, '_') + '_' + i;
                        const toNodeId = nodes[i+1].replace(/[^a-zA-Z0-9_]/g, '_') + '_' + (i+1);
                        const fromNodeLabel = JSON.stringify(nodes[i]);
                        const toNodeLabel = JSON.stringify(nodes[i+1]);
                        if (fromNodeId && toNodeId) {
                           edges.add(`    ${fromNodeId}[${fromNodeLabel}] --> ${toNodeId}[${toNodeLabel}];`);
                        }
                    }
                }
                mermaidDefinition += Array.from(edges).join('\n');

                if (edges.size === 0 && window.ZLU.executionPaths.size > 0) {
                     const singleNodePath = Array.from(window.ZLU.executionPaths)[0];
                     const singleNodeId = singleNodePath.replace(/[^a-zA-Z0-9_]/g, '_') + '_0';
                     const singleNodeLabel = JSON.stringify(singleNodePath);
                     mermaidDefinition += `    ${singleNodeId}[${singleNodeLabel}];`;
                }


                const { svg } = await window.mermaid.render('mermaid-graph-svg', mermaidDefinition);
                mermaidContainer.innerHTML = svg;
            } catch (error) {
                console.error("Error rendering Mermaid diagram:", error);
                mermaidContainer.innerHTML = `Error rendering diagram: ${error.message}`;
            }
        }


        let analyzerInstance;
        try {
            analyzerInstance = new window.ZLU.JSCodeAnalyzer(window.ZLU.DEFAULT_JS_ANALYZER_MODEL_ID, updateProgress);
            await analyzerInstance._ensureInitialized();
            updateProgress({ progress: 1, text: 'Analyzer ready.' });

            const sampleJsCode = `
function calculateSum(arr) {
    let sum = 0;
    for (let i = 0; i < arr.length; i++) {
        sum += arr[i];
    }
    return sum;
}

function processData(data) {
    if (!Array.isArray(data)) {
        return "Error: Data is not an array";
    }
    const result = calculateSum(data);
    if (typeof result === 'string' && result.includes('<script>')) {
        console.warn("Potential XSS if result is rendered as HTML.");
    }
    return result;
}

const data = [1, '2', 3, null, 5, "<script>alert('XSS')</script>"];
console.log(\`Processed: \${processData(data)}\`);
            `;
            const analysisTask = "Identify potential bugs, suggest type checking, explain the output if the provided 'data' array is used, and explicitly highlight any security or privacy concerns. Focus on security vulnerabilities and privacy leaks.";

            analysisResultPre.textContent = 'Starting analysis...\n';
            const fullAnalysis = await analyzerInstance.analyze(sampleJsCode, analysisTask, (type, message) => {
                if (type === 'delta') {
                    analysisResultPre.textContent += message;
                } else if (type === 'finish') {
                    analysisResultPre.textContent += "\n\n--- Analysis Complete ---";
                    console.log("Demo: Streaming Analysis Complete.");
                    if (checkForCriticalIssues(message)) {
                        demoUiContainer.style.backgroundColor = 'rgba(255, 100, 100, 0.3)';
                        const titleEl = demoUiContainer.querySelector('h3');
                        if (titleEl) {
                           titleEl.textContent += " (Critical Issues Found!)";
                           titleEl.style.color = 'red';
                        }
                    }
                } else if (type === 'error') {
                    analysisResultPre.textContent += `\n\n--- ERROR: ${message} ---`;
                    demoUiContainer.style.backgroundColor = 'rgba(255,0,0,0.1)';
                }
            });

            if (DEV_MODE) {
                await renderMermaidDiagram();
                const refreshDiagramButton = document.createElement('button');
                refreshDiagramButton.textContent = 'Refresh Diagram from Traces';
                refreshDiagramButton.style.cssText = 'margin-top: 5px; padding: 5px; font-size: 12px;';
                refreshDiagramButton.onclick = renderMermaidDiagram;
                const hr = document.createElement('hr');
                mermaidContainer.appendChild(hr);
                mermaidContainer.appendChild(refreshDiagramButton);
            }


        } catch (error) {
            console.error("Analyzer Demo Error:", error);
            updateProgress({ progress: 1, text: `Demo Error: ${error.message}` });
            analysisResultPre.textContent = `Error in demo: ${error.message}`;
            demoUiContainer.style.backgroundColor = 'rgba(255,0,0,0.1)';
        }
    }


    // --- DEV_MODE: Script Instrumentation UI ---
    function setupDevInstrumentationUI(){
        const devButton = document.createElement('button');
        devButton.textContent = 'Instrument & Reload Script';
        devButton.title = 'Modifies the current userscript with trace calls and reloads the page.';
        devButton.style.cssText = `
            position: fixed; top: 50px; right: 10px; z-index: 10001;
            padding: 8px 12px; background-color: #ffc107; color: black;
            border: none; border-radius: 5px; cursor: pointer; font-size: 12px;
        `;
        document.body.appendChild(devButton);

        devButton.onclick = async () => {
            devButton.disabled = true;
            devButton.textContent = 'Preparing...';

            const dialog = document.createElement('div');
            dialog.style.cssText = `
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                background: white; border: 1px solid #ccc; border-radius: 8px; padding: 20px;
                z-index: 10002; box-shadow: 0 0 15px rgba(0,0,0,0.3); width: 80vw; max-width: 800px;
                display: flex; flex-direction: column; gap: 10px;
            `;

            const h = document.createElement('h4');
            h.textContent = 'Script Instrumentation & Reload (Dev Mode)';
            h.style.margin = '0 0 10px 0';
            dialog.appendChild(h);

            const p = document.createElement('p');
            p.innerHTML = `Paste your <strong>current, original userscript source code</strong> below.
                           It will be processed to inject 'trace()' calls, stored, and then the page will reload to run the instrumented version.`;
            p.style.fontSize = '13px';
            dialog.appendChild(p);

            const inputLabel = document.createElement('label');
            inputLabel.textContent = 'Original Script Source (this entire script):';
            dialog.appendChild(inputLabel);
            const inputArea = document.createElement('textarea');
            inputArea.rows = 15;
            inputArea.placeholder = "// ==UserScript==\n// ... your script ...\n// ==/UserScript==\n\n(async function() {\n  'use strict';\n  // ... your code ...\n})();";
            inputArea.style.width = '100%';
            inputArea.value = `// ==UserScript==
${Array.from(document.head.querySelectorAll('script')).find(s => s.textContent.includes('@name         JavaScript Code Analyzer'))?.textContent.match(/\/\/ @name         JavaScript Code Analyzer[\s\S]*?\/\/ ==\/UserScript==/s)?.[0] || `// @name         JavaScript Code Analyzer (webLLM) - Advanced Reload
// @namespace    http://tampermonkey.net/
// @version      0.3.1
// @description  Analyzes JavaScript code using WebLLM, with dev mode for trace injection (auto-reloads with instrumented code) and Mermaid flow visualization.
// @author       ZLudany (enhanced by AI)
// @match        https://home.google.com/*
// @connect      cdn.jsdelivr.net
// @connect      huggingface.co
// @connect      *.mlc.ai
// @connect      cdnjs.cloudflare.com
// @grant        GM_setClipboard
// @date         2023-10-28T12:30:00+00:00
// ==/UserScript==`}

(async function() {
    'use strict';
    // --- PASTE THE REST OF YOUR SCRIPT'S IIFE CONTENT HERE ---
    // For example, from the line after "'use strict';" down to the final "})();"
    // This part is tricky to auto-fill perfectly without knowing the exact script structure if it changes.
    // The above attempts to grab the header. The IIFE body needs to be added.
    // A simpler approach for the user might be to just provide the full script manually.
    // For now, I'll just use the current function's string representation (which is this IIFE).
    // This is not perfect because it will include the instrumentation UI logic itself,
    // which is usually not what you want to instrument.
    // The BEST is to manually paste the *clean* original script source.
    const thisScriptContent = arguments.callee.toString();
    const startOfIIFEBody = thisScriptContent.indexOf("'use strict';") + "'use strict';".length;
    const endOfIIFEBody = thisScriptContent.lastIndexOf('})();');
    inputArea.value += '\n\n' + thisScriptContent.substring(startOfIIFEBody, endOfIIFEBody) + "\n})();";

            dialog.appendChild(inputArea);

            const processButton = document.createElement('button');
            processButton.textContent = 'Instrument & Reload Page';
            dialog.appendChild(processButton);

            const closeButton = document.createElement('button');
            closeButton.textContent = 'Cancel';
            closeButton.onclick = () => {
                dialog.remove();
                devButton.disabled = false;
                devButton.textContent = 'Instrument & Reload Script';
            };
            dialog.appendChild(closeButton);

            document.body.appendChild(dialog);

            try {
                const worker = await getAcornWorker();
                devButton.textContent = 'Instrument & Reload Script';
                processButton.disabled = false;

                processButton.onclick = async () => {
                    const sourceCode = inputArea.value;
                    if (!sourceCode.trim() || !sourceCode.includes("// ==UserScript==") || !sourceCode.includes("(async function()")) {
                        alert("Please paste the full, valid userscript source code, including the ==UserScript== header and the (async function(){...})(); wrapper.");
                        return;
                    }
                    processButton.textContent = 'Processing... Page will reload soon.';
                    processButton.disabled = true;
                    closeButton.disabled = true;

                    worker.onmessage = (e) => {
                        if (e.data.success) {
                            localStorage.setItem(INSTRUMENTED_CODE_KEY, e.data.modifiedCode);
                            localStorage.setItem(RELOAD_FLAG_KEY, 'true');
                            localStorage.setItem(RELOAD_FLAG_KEY + '_marker', 'true');
                            localStorage.setItem(RELOAD_FLAG_KEY + '_just_reloaded_for_instrumentation', 'true');
                            alert("Code instrumented. Page will now reload.");
                            location.reload();
                        } else {
                            alert(`Error during instrumentation:\n${e.data.error}\nPage will not reload.`);
                            processButton.textContent = 'Instrument & Reload Page';
                            processButton.disabled = false;
                            closeButton.disabled = false;
                        }
                    };
                    worker.onerror = (err) => {
                         alert(`Worker communication error:\n${err.message}\nPage will not reload.`);
                         processButton.textContent = 'Instrument & Reload Page';
                         processButton.disabled = false;
                         closeButton.disabled = false;
                    };

                    const functionsToIgnore = [
                        'trace', 'getFunc', 'loadScript', 'loadWebLLMScript',
                        '_initialize', '_ensureInitialized', 'analyze', 'resetChat', 'dispose', // JSCodeAnalyzer methods
                        'runAnalyzerDemo', 'updateProgress', 'checkForCriticalIssues', 'renderMermaidDiagram', // Demo functions
                        'setupDevInstrumentationUI', 'initializeApp', // Dev UI and init functions
                        'getAcornWorker' // Worker utility
                        // The IIFE itself (anonymous function wrapper) will also be instrumented if not careful,
                        // but the current Acorn worker logic focuses on named/arrow functions.
                    ];

                    worker.postMessage({
                        sourceCode,
                        acornPath: ACORN_CDN,
                        escodegenPath: ESCODEGEN_CDN,
                        estraversePath: ESTRAVERSE_CDN,
                        functionsToIgnore
                    });
                };

            } catch (err) {
                console.error("Failed to setup dev instrumentation UI:", err);
                alert("Error loading dev tools: " + err..message);
                dialog.remove();
                devButton.disabled = false;
                devButton.textContent = 'Instrument & Reload Script';
            }
        };
    }


    // --- Auto-run demo button & Dev Mode UI Setup ---
    const startDemoButton = document.createElement('button');
    startDemoButton.textContent = 'Start JS Analyzer Demo (loads ~4GB model)';
    startDemoButton.style.cssText = `
        position: fixed; top: 10px; right: 10px; z-index: 10000;
        padding: 10px 15px; background-color: #007bff; color: white;
        border: none; border-radius: 5px; cursor: pointer;
    `;
    startDemoButton.onclick = () => {
        runAnalyzerDemo();
        startDemoButton.disabled = true;
        startDemoButton.textContent = 'Demo Initializing...';
    };

    function initializeApp(){
        if (document.body) {
           document.body.appendChild(startDemoButton);
           if (DEV_MODE) {
               setupDevInstrumentationUI();
           }
        } else {
           window.addEventListener('DOMContentLoaded', () => {
               document.body.appendChild(startDemoButton);
               if (DEV_MODE) {
                   setupDevInstrumentationUI();
               }
           }, {once: true});
        }
    }

    initializeApp();

})();
