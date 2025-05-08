// ==UserScript==
// @name         JavaScript Code Analyzer (webLLM) - Advanced Reload
// @namespace    http://tampermonkey.net/
// @version      0.3
// @description  Analyzes JavaScript code using WebLLM, with dev mode for trace injection (auto-reload) and Mermaid flow visualization.
// @author       ZLudany (enhanced by AI)
// @match        https://home.google.com/*
// @connect      cdn.jsdelivr.net       // For WebLLM library, Mermaid, Acorn, Escodegen, ESTraverse
// @connect      huggingface.co        // Common CDN for WebLLM models
// @connect      *.mlc.ai              // Official MLC CDNs for models and wasm
// @connect      cdnjs.cloudflare.com  // For Acorn, Escodegen, ESTraverse
// @grant        GM_setClipboard       // Optional: For easily copying modified code
// @grant        GM_getValue           // Potentially for more robust storage if needed
// @grant        GM_setValue           // Potentially for more robust storage if needed
// @date         2023-10-28T12:00:00+00:00
// ==/UserScript==

const SCRIPT_CONTENT_STORAGE_KEY = 'jsAnalyzerInstrumentedContent_v1';
const SCRIPT_IS_INSTRUMENTED_FLAG = 'jsAnalyzerIsInstrumented_v1';

(async function UserscriptWrapper() {
    'use strict';
    if (localStorage.getItem(SCRIPT_IS_INSTRUMENTED_FLAG) === 'true') {
        const instrumentedScriptContent = localStorage.getItem(SCRIPT_CONTENT_STORAGE_KEY);
        if (instrumentedScriptContent) {
            console.log('[JS Analyzer] Executing instrumented version from localStorage.');
            try {
                await (new Function("'use strict';" + instrumentedScriptContent))();
            } catch (e) {
                console.error('[JS Analyzer] Error executing instrumented code. Clearing and reloading.', e);
                localStorage.removeItem(SCRIPT_CONTENT_STORAGE_KEY);
                localStorage.removeItem(SCRIPT_IS_INSTRUMENTED_FLAG);
                location.reload();
            }
            return;
        } else {
            console.warn('[JS Analyzer] Instrumentation flag set but no code found. Clearing and reloading.');
            localStorage.removeItem(SCRIPT_IS_INSTRUMENTED_FLAG);
            localStorage.removeItem(SCRIPT_CONTENT_STORAGE_KEY); // Clear both if inconsistent
            location.reload();
            return;
        }
    }
    const coreLogicSource = runCoreLogic.toString();
    const coreLogicBody = coreLogicSource.substring(coreLogicSource.indexOf('{') + 1, coreLogicSource.lastIndexOf('}')).trim();
    await runCoreLogic(coreLogicBody);
})();

async function runCoreLogic(sourceBodyForInstrumentation = '') {
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
    if (!window.ZLU.executionPaths) {
        window.ZLU.executionPaths = new Set();
    }
    // --- Tracing Utilities ---
    function getFunc(f) {
        if (typeof f !== 'function') {
            return null;
        }
        return f.name ? f.name : (f.toString().match(/(function)(\s+)(\w+)(\()/)?.[3] || 'anonymous');
    }
    window.ZLU.getFunc = getFunc;
    function trace(logBefore = false, all = true) {
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
            if (depth === maxDepth) {
                callChain.push("max_depth_reached");
            }
            if (callChain.length > 0) {
                const pathString = callChain.reverse().join(' -->> ');
                window.ZLU.executionPaths.add(pathString);
                return pathString;
            }
        } catch (e) {
            // console.warn("Error in trace function:", e);
        }
        return null;
    }
    window.ZLU.trace = trace;

    // --- Helper to load external scripts ---
    const loadedScripts = {};
    async function loadScript(url, id) {
        if (loadedScripts[id || url]) {
            return loadedScripts[id || url];
        }
        const promise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            if (id) {
                script.id = id;
            }
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
    }
    async function loadWebLLMScript(url) {
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
                const ast = self.acorn.parse(sourceCode, { ecmaVersion: 'latest', sourceType: 'module', locations: false }); // Use module for broader compatibility
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
                                node.expression = false; // Mark arrow function as no longer concise expression body
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
    };`;
    let acornWorker = null;
    async function getAcornWorker() {
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
        constructor(modelId = DEFAULT_MODEL_ID, progressCallback = null) {
            this.modelId = modelId;
            this.chatWorkerClient = null;
            this.initializationInProgress = false;
            this.initializationPromise = null;
            this.progressCallback = progressCallback || function(report) {
                const progressPercentage = (report.progress * 100).toFixed(2);
                console.log(`[JSCodeAnalyzer Worker Progress]: ${report.text} (${progressPercentage}%)`);
            };
            this.initializationPromise = this._initialize();
        }
        async _initialize() {
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
        async _ensureInitialized() {
            if (!this.initializationPromise) {
                 console.warn("JSCodeAnalyzer initialization was not started. Attempting to initialize now.");
                 this.initializationPromise = this._initialize();
            }
            await this.initializationPromise;
            if (!this.chatWorkerClient) {
                throw new Error("JSCodeAnalyzer failed to initialize or model is not loaded.");
            }
        }
        async analyze(jsCode, analysisTaskPrompt, streamCallback = null) {
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
                if (streamCallback) {
                    streamCallback('error', error.message);
                }
                throw error;
            }
        }
        async resetChat() {
            await this._ensureInitialized();
            try {
                await this.chatWorkerClient.resetChat();
                console.log("JSCodeAnalyzer: Chat context reset.");
                this.progressCallback({ progress: this.chatWorkerClient ? 1 : 0, text: 'Chat context reset.' });
            } catch (error) {
                console.error("Error resetting chat:", error);
            }
        }
        async dispose() {
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
    }
    window.ZLU.JSCodeAnalyzer = JSCodeAnalyzer;
    window.ZLU.DEFAULT_JS_ANALYZER_MODEL_ID = DEFAULT_MODEL_ID;
    console.log("JSCodeAnalyzer class (V0.3) loaded. Access with `new ZLU.JSCodeAnalyzer()`.");
    console.log(`Default model for analysis: ${DEFAULT_MODEL_ID}`);
    if (localStorage.getItem(SCRIPT_IS_INSTRUMENTED_FLAG) === 'true') {
      console.log('[JS Analyzer] Running INSTRUMENTED version.');
    } else {
      console.log('[JS Analyzer] Running ORIGINAL version.');
    }
    // --- Example Usage (Demonstration) ---
    async function runAnalyzerDemo() {
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
        mermaidContainer.textContent = 'Execution path diagram will appear here (if tracing is active).';
        contentArea.appendChild(mermaidContainer);
        const analysisResultPre = document.createElement('pre');
        analysisResultPre.id = 'analyzer-result-pre';
        analysisResultPre.style.cssText = `
            flex: 2; padding: 10px; border: 1px solid #ddd; background: #fff;
            max-height: 400px; overflow-y: auto; white-space: pre-wrap; word-break: break-all;
        `;
        contentArea.appendChild(analysisResultPre);
        function updateProgress(report) {
            const span = progressDisplay.querySelector('span');
            const bar = progressDisplay.querySelector('div');
            if (span) {
                span.textContent = `${report.text}`;
            }
            if (bar) {
                bar.style.width = `${report.progress * 100}%`;
                if (report.text.toLowerCase().includes("error")) {
                    bar.style.backgroundColor = "red";
                } else if (report.progress === 1 && !report.text.toLowerCase().includes("error")) {
                    bar.style.backgroundColor = "lightgreen";
                } else {
                    bar.style.backgroundColor = "lightblue";
                }
            }
        }
        function checkForCriticalIssues(llmOutput) {
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
        async function renderMermaidDiagram() {
            if (window.ZLU.executionPaths.size === 0) {
                mermaidContainer.innerHTML = 'No execution paths recorded for diagram.';
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
                        const fromNode = nodes[i].replace(/[^a-zA-Z0-9_]/g, '_');
                        const toNode = nodes[i+1].replace(/[^a-zA-Z0-9_]/g, '_');
                        if (fromNode && toNode) {
                           edges.add(`    ${fromNode}[${JSON.stringify(nodes[i])}] --> ${toNode}[${JSON.stringify(nodes[i+1])}];`);
                        }
                    }
                }
                mermaidDefinition += Array.from(edges).join('\n');
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
console.log(\`Processed: \${processData(data)}\`);`;
            const analysisTask = "Identify potential bugs, suggest type checking, explain the output if the provided 'data' array is used, and explicitly highlight any security or privacy concerns. Focus on security vulnerabilities and privacy leaks.";
            analysisResultPre.textContent = 'Starting analysis...\n';
            await analyzerInstance.analyze(sampleJsCode, analysisTask, (type, message) => {
                if (type === 'delta') {
                    analysisResultPre.textContent += message;
                } else if (type === 'finish') {
                    analysisResultPre.textContent += "\n\n--- Analysis Complete ---";
                    console.log("Demo: Streaming Analysis Complete.");
                    if (checkForCriticalIssues(message)) {
                        demoUiContainer.style.backgroundColor = 'rgba(255, 100, 100, 0.3)';
                        title.textContent += " (Critical Issues Found!)";
                        title.style.color = 'red';
                    }
                } else if (type === 'error') {
                    analysisResultPre.textContent += `\n\n--- ERROR: ${message} ---`;
                    demoUiContainer.style.backgroundColor = 'rgba(255,0,0,0.1)';
                }
            });
            if (localStorage.getItem(SCRIPT_IS_INSTRUMENTED_FLAG) === 'true') {
                await renderMermaidDiagram();
            }
        } catch (error) {
            console.error("Analyzer Demo Error:", error);
            updateProgress({ progress: 1, text: `Demo Error: ${error.message}` });
            analysisResultPre.textContent = `Error in demo: ${error.message}`;
            demoUiContainer.style.backgroundColor = 'rgba(255,0,0,0.1)';
        }
    }
    // --- DEV_MODE: Script Instrumentation UI ---
    function setupDevInstrumentationUI() {
        const devButton = document.createElement('button');
        devButton.textContent = 'Instrument Script for Tracing';
        devButton.style.cssText = `
            position: fixed; top: 50px; right: 10px; z-index: 10001;
            padding: 8px 12px; background-color: #ffc107; color: black;
            border: none; border-radius: 5px; cursor: pointer; font-size: 12px;
        `;
        document.body.appendChild(devButton);
        devButton.onclick = async () => {
            devButton.disabled = true;
            devButton.textContent = 'Loading Dev Tools...';
            const dialog = document.createElement('div');
            dialog.style.cssText = `
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                background: white; border: 1px solid #ccc; border-radius: 8px; padding: 20px;
                z-index: 10002; box-shadow: 0 0 15px rgba(0,0,0,0.3); width: 80vw; max-width: 800px;
                display: flex; flex-direction: column; gap: 10px;
            `;
            const h = document.createElement('h4');
            h.textContent = 'Script Instrumentation (Dev Mode)';
            h.style.margin = '0 0 10px 0';
            dialog.appendChild(h);
            const p = document.createElement('p');
            p.innerHTML = `The core logic of the script is shown below. It will be processed to inject 'trace()' calls.
                           The modified code will appear in the second textarea and then automatically saved & reloaded.`;
            p.style.fontSize = '13px';
            dialog.appendChild(p);
            const inputLabel = document.createElement('label');
            inputLabel.textContent = 'Original Script Core Logic (for reference):';
            dialog.appendChild(inputLabel);
            const inputArea = document.createElement('textarea');
            inputArea.id = 'instrumentationInputArea';
            inputArea.rows = 8;
            inputArea.readOnly = true; // Readonly, as we use the passed sourceBodyForInstrumentation
            inputArea.style.width = '100%';
            inputArea.style.backgroundColor = '#eee';
            inputArea.value = sourceBodyForInstrumentation;
            dialog.appendChild(inputArea);
            const outputLabel = document.createElement('label');
            outputLabel.textContent = 'Modified Script Core Logic (will be saved):';
            dialog.appendChild(outputLabel);
            const outputArea = document.createElement('textarea');
            outputArea.rows = 8;
            outputArea.readOnly = true;
            outputArea.style.width = '100%';
            outputArea.style.backgroundColor = '#f0f0f0';
            dialog.appendChild(outputArea);
            const processButton = document.createElement('button');
            processButton.textContent = 'Process, Instrument, Save & Reload';
            dialog.appendChild(processButton);
            const closeButton = document.createElement('button');
            closeButton.textContent = 'Cancel';
            closeButton.onclick = () => {
                dialog.remove();
                devButton.disabled = false;
                devButton.textContent = 'Instrument Script for Tracing';
            };
            dialog.appendChild(closeButton);
            document.body.appendChild(dialog);
            try {
                const worker = await getAcornWorker();
                devButton.textContent = 'Instrument Script for Tracing';
                processButton.disabled = false;
                processButton.onclick = async () => {
                    processButton.textContent = 'Processing...';
                    processButton.disabled = true;
                    closeButton.disabled = true;
                    outputArea.value = 'Processing, please wait...';
                    worker.onmessage = (e) => {
                        if (e.data.success) {
                            outputArea.value = e.data.modifiedCode;
                            localStorage.setItem(SCRIPT_CONTENT_STORAGE_KEY, e.data.modifiedCode);
                            localStorage.setItem(SCRIPT_IS_INSTRUMENTED_FLAG, 'true');
                            outputArea.value += "\n\n--- Saved to localStorage. Reloading page in 3 seconds... ---";
                            if (typeof GM_setClipboard === 'function') {
                                GM_setClipboard(e.data.modifiedCode, 'text');
                                outputArea.value += "\n// --- (Also copied to clipboard) ---";
                            }
                            setTimeout(() => location.reload(), 3000);
                        } else {
                            outputArea.value = `Error during instrumentation:\n${e.data.error}`;
                            processButton.textContent = 'Process, Instrument, Save & Reload';
                            processButton.disabled = false;
                            closeButton.disabled = false;
                        }
                    };
                    worker.onerror = (err) => {
                         outputArea.value = `Worker communication error:\n${err.message}`;
                         processButton.textContent = 'Process, Instrument, Save & Reload';
                         processButton.disabled = false;
                         closeButton.disabled = false;
                    };
                    const functionsToIgnore = ['getFunc', 'trace', 'loadScript', 'loadWebLLMScript',
                                             '_initialize', '_ensureInitialized', // JSCodeAnalyzer methods
                                             'updateProgress', 'checkForCriticalIssues', 'renderMermaidDiagram', // Demo UI functions
                                             'setupDevInstrumentationUI', 'setupClearInstrumentationButton', 'initializeApp' // Setup functions
                                            ];
                    worker.postMessage({
                        sourceCode: sourceBodyForInstrumentation,
                        acornPath: ACORN_CDN,
                        escodegenPath: ESCODEGEN_CDN,
                        estraversePath: ESTRAVERSE_CDN,
                        functionsToIgnore: functionsToIgnore
                    });
                };
            } catch (err) {
                console.error("Failed to setup dev instrumentation UI:", err);
                alert("Error loading dev tools: " + err.message);
                dialog.remove();
                devButton.disabled = false;
                devButton.textContent = 'Instrument Script for Tracing';
            }
        };
    }
    // --- Clear Instrumentation Button ---
    function setupClearInstrumentationButton() {
        const clearButton = document.createElement('button');
        clearButton.textContent = 'Revert to Original Script & Reload';
        clearButton.style.cssText = `
            position: fixed; top: 90px; right: 10px; z-index: 10001;
            padding: 8px 12px; background-color: #dc3545; color: white;
            border: none; border-radius: 5px; cursor: pointer; font-size: 12px;
        `;
        clearButton.onclick = () => {
            localStorage.removeItem(SCRIPT_CONTENT_STORAGE_KEY);
            localStorage.removeItem(SCRIPT_IS_INSTRUMENTED_FLAG);
            alert('Instrumented version cleared. Reloading to original script.');
            location.reload();
        };
        if (document.body) {
            document.body.appendChild(clearButton);
        } else {
            window.addEventListener('DOMContentLoaded', () => document.body.appendChild(clearButton), {once: true});
        }
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
    function initializeApp() {
        if (document.body) {
           document.body.appendChild(startDemoButton);
           if (DEV_MODE) {
               setupDevInstrumentationUI();
               setupClearInstrumentationButton();
           }
        } else {
           window.addEventListener('DOMContentLoaded', () => {
               document.body.appendChild(startDemoButton);
               if (DEV_MODE) {
                   setupDevInstrumentationUI();
                   setupClearInstrumentationButton();
               }
           }, {once: true});
        }
    }
    initializeApp();
};