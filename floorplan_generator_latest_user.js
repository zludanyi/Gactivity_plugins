// ==UserScript==
// @name         Floorplan Manager (Generic Worker + Global Deps - Formatted)
// @version      1.2.4
// @description  Loads D3 globally, uses generic worker importer for OpenCV, formatted.
// @author       ZLudany
// @match        https://home.google.com/*
// @connect      docs.opencv.org
// @connect      d3js.org
// @sandbox      DOM
// @grant        none
// ==/UserScript==

(async function() {
    'use strict';

    // --- Configuration ---
    const PARENT_DEV_MODE = false; // Log level for the main userscript (true=alert, false=console)
    const WORKER_DEV_MODE = true;  // Log level for the Web Worker script (true=alert request, false=console request)
    // --- End Configuration ---

    // --- Parent Logging Helpers (Origin-aware) ---
    function logDebug(message, ...optionalParams /*, origin = 'PARENT' - implicit last arg */ ) {
        const origin = (optionalParams.length > 0 && ['PARENT', 'WORKER'].includes(optionalParams[optionalParams.length - 1]))
                       ? optionalParams.pop()
                       : 'PARENT';
        const useAlert = (origin === 'PARENT' && PARENT_DEV_MODE) || (origin === 'WORKER' && WORKER_DEV_MODE);
        const prefix = `[${origin} DEBUG]`;
        if (useAlert) {
            let alertMsg = prefix + " " + message;
            if (optionalParams.length > 0) {
                try {
                    alertMsg += " :: " + optionalParams.map(p => JSON.stringify(p)).join('; ');
                } catch (e) {
                    alertMsg += " :: [Error stringifying params]";
                }
            }
            alert(alertMsg);
        } else {
            console.log(prefix, message, ...optionalParams);
        }
    } // End logDebug

    function logWarn(message, ...optionalParams /*, origin = 'PARENT' */ ) {
        const origin = (optionalParams.length > 0 && ['PARENT', 'WORKER'].includes(optionalParams[optionalParams.length - 1]))
                       ? optionalParams.pop()
                       : 'PARENT';
        const useAlert = (origin === 'PARENT' && PARENT_DEV_MODE) || (origin === 'WORKER' && WORKER_DEV_MODE);
        const prefix = `[${origin} WARN]`;
        const fullMessage = prefix + " " + message;
        if (useAlert) {
            let alertMsg = fullMessage;
            if (optionalParams.length > 0) {
                try {
                    alertMsg += " :: " + optionalParams.map(p => JSON.stringify(p)).join('; ');
                } catch (e) {
                    alertMsg += " :: [Error stringifying params]";
                }
            }
            alert(alertMsg);
        } else {
            console.warn(fullMessage, ...optionalParams);
        }
    } // End logWarn

    function logError(message, ...optionalParams /*, origin = 'PARENT' */ ) {
        const origin = (optionalParams.length > 0 && ['PARENT', 'WORKER'].includes(optionalParams[optionalParams.length - 1]))
                       ? optionalParams.pop()
                       : 'PARENT';
        const useAlert = (origin === 'PARENT' && PARENT_DEV_MODE) || (origin === 'WORKER' && WORKER_DEV_MODE);
        const prefix = `[${origin} ERROR]`;
        const fullMessage = prefix + " " + message;
        if (useAlert) {
            let alertMsg = fullMessage;
            if (optionalParams.length > 0) {
                try {
                    alertMsg += " :: " + optionalParams.map(p => JSON.stringify(p)).join('; ');
                } catch (e) {
                    alertMsg += " :: [Error stringifying params]";
                }
            }
            alert(alertMsg);
        } else {
            console.error(fullMessage, ...optionalParams);
        }
    } // End logError
    // --- End Parent Logging Helpers ---

    logDebug(`--- Floorplan Manager (Generic Worker + Global Deps) Execution Starting ---`);

    // --- Constants ---
    const OPENCV_URL = 'https://docs.opencv.org/4.5.4/opencv.js';

    // --- Helper Function to Add Styles ---
    function addGlobalStyle(css) {
        try {
            const head = document.head || document.getElementsByTagName('head')[0];
            if (!head) {
                 logError("Cannot add styles: No <head> element found!");
                 return;
            }
            const style = document.createElement('style');
            style.type = 'text/css';
            style.id = 'floorplan-manager-styles';
            style.appendChild(document.createTextNode(css));
            head.appendChild(style);
            logDebug("Global styles added to <head>.");
        } catch (e) {
            logError("Error adding global styles:", e);
        }
    } // End addGlobalStyle
    // --- End Style Helper ---

    // --- CSS Styles ---
    const cssStyles = `
        #floorplan-container {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.85);
            z-index: 2147483647 !important;
            display: none; /* Initially hidden, shown by manager */
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 20px;
            box-sizing: border-box;
            font-family: sans-serif;
            color: white;
            overflow: hidden;
        }
        /* No loading indicator style needed - using logs */
        #floorplan-controls {
            background: #333;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 10px;
            display: flex;
            gap: 15px;
            align-items: center;
            flex-shrink: 0;
            z-index: 1;
        }
        #floorplan-canvas { /* For parent preview */
            background: #444;
            border: 1px solid #777;
            max-width: 90%;
            max-height: 65vh;
            object-fit: contain;
            display: block;
            margin-bottom: 5px;
            flex-shrink: 1;
        }
        #floorplan-canvas-label {
            color: #ccc;
            font-size: 0.9em;
            font-style: italic;
            text-align: center;
            margin-bottom: 10px;
            display: block;
            flex-shrink: 0;
        }
        #floorplan-close-btn {
            position: absolute;
            top: 15px;
            right: 20px;
            background: #ff4444;
            color: white;
            border: none;
            padding: 8px 12px;
            cursor: pointer;
            font-size: 1.2em;
            border-radius: 3px;
            z-index: 2;
        }
        #floorplan-status { /* Status label in the main UI */
            margin-top: auto;
            font-style: italic;
            background: #333;
            padding: 5px 10px;
            border-radius: 3px;
            flex-shrink: 0;
            z-index: 1;
        }
        #floorplan-controls label {
            margin-right: 5px;
        }
        #floorplan-controls input[type=file] {
            border: 1px solid #666;
            padding: 5px;
            border-radius: 3px;
            background: #555;
            color: white;
        }
        #floorplan-svg-container {
            width: 90%;
            height: 75vh;
            border: 1px solid #66aaff;
            display: none;
            flex-grow: 1;
            flex-shrink: 1;
            overflow: hidden;
            box-sizing: border-box;
            background-color: #282c34;
        }
        #floorplan-svg-container svg {
            display: block;
            width: 100%;
            height: 100%;
        }
        .floorplan-polygon {
            fill: rgba(100, 150, 255, 0.7);
            stroke: #d0d0ff;
            stroke-width: 1;
            cursor: grab;
        }
        .floorplan-polygon:active {
            cursor: grabbing;
        }
        .floorplan-polygon.dragging {
            stroke: yellow;
            stroke-width: 1.5;
        }
    `;
    addGlobalStyle(cssStyles);

    // --- Helper: Load Script Tag ---
    function loadScriptTag(url) {
        return new Promise((resolve, reject) => {
            logDebug(`Loading global script: ${url}`);
            const script = document.createElement('script');
            script.src = url;
            script.async = false; // Load sequentially
            script.onload = () => {
                logDebug(`Global script loaded: ${url}`);
                resolve();
            };
            script.onerror = (err) => {
                logError(`Failed to load global script: ${url}`, err);
                reject(new Error(`Failed to load script: ${url}`));
            };
            (document.head || document.documentElement).appendChild(script);
        });
    } // End loadScriptTag
    // --- End Helper ---


    // --- Worker Script Content ---
    const workerScriptContent = `
        // --- Worker Configuration ---
        const WORKER_DEV_MODE = ${WORKER_DEV_MODE};
        // const OPENCV_URL = '${OPENCV_URL}'; // URL passed via config now
        // --- End Worker Configuration ---

        // --- Worker Function Call Helper ---
        function callParentFunction(functionName, ...args) {
            const targetFunctionName = WORKER_DEV_MODE && functionName.startsWith('log') ? 'alert' : functionName;
            const finalArgs = WORKER_DEV_MODE && functionName.startsWith('log') ? [\`[\${SCRIPT_NAME} \${functionName.toUpperCase()}] \${args[0]}\`].concat(args.slice(1)) : args;
            self.postMessage({ type: "functionCall", payload: { functionName: targetFunctionName, args: finalArgs } });
        }
        // --- End Worker Function Call Helper ---

        // --- Injected Config Placeholder ---
        const SCRIPT_NAME = '%%SCRIPT_NAME%%';
        const SCRIPT_URL = '%%SCRIPT_URL%%';
        const NAMESPACE = '%%NAMESPACE%%';
        const REGISTER_NAMESPACE = %%REGISTER_NAMESPACE%%;
        const INIT_RUNTIME_STRING = \`%%INIT_RUNTIME_STRING%%\`;
        // --- End Injected Config Placeholder ---

        callParentFunction('logDebug', \`Worker '\${SCRIPT_NAME}' script started.\`);

        let internalNamespace = null;
        let isReady = false;

        // --- Pre-definitions ---
        if (REGISTER_NAMESPACE && NAMESPACE) {
            self[NAMESPACE] = {};
            callParentFunction('logDebug', \`Namespace '\${NAMESPACE}' registered.\`);
        }
        %%EXPECTED_VARIABLES%%
        callParentFunction('logDebug', "Expected variables defined (if any).");

        // --- Execute Pre-Runtime Code (e.g., Module definition) ---
        %%EXPECTED_RUNTIME%%
        callParentFunction('logDebug', "Expected runtime executed (if any).");


        // --- Load Script ---
        callParentFunction('logDebug', \`Worker '\${SCRIPT_NAME}': Importing script: \${SCRIPT_URL}\`);
        callParentFunction('updateStatus', \`Worker '\${SCRIPT_NAME}': Loading script...\`);
        try {
            importScripts(SCRIPT_URL);
            callParentFunction('logDebug', \`Worker '\${SCRIPT_NAME}': importScripts call completed. Waiting for initialization logic (if any)...\`);
            if (!self.Module || !self.Module.onRuntimeInitialized) {
                 callParentFunction('logWarn', \`Worker '\${SCRIPT_NAME}': No Module.onRuntimeInitialized detected. Readiness depends on script behavior.\`);
                 if (NAMESPACE) { if (typeof self[NAMESPACE] !== 'undefined' && self[NAMESPACE]) { internalNamespace = self[NAMESPACE]; isReady = true; callParentFunction('logDebug', \`Script '\${SCRIPT_NAME}' ready immediately after import (namespace found).\`); self.postMessage({ type: 'script_ready', payload: { scriptName: SCRIPT_NAME } }); } else { callParentFunction('logWarn', \`Script '\${SCRIPT_NAME}' imported, but namespace '\${NAMESPACE}' not found immediately.\`); } }
                 else { callParentFunction('logWarn', \`Script '\${SCRIPT_NAME}' imported, no runtime/namespace check. Assuming ready.\`); isReady = true; self.postMessage({ type: 'script_ready', payload: { scriptName: SCRIPT_NAME } }); }
            } else { callParentFunction('logDebug', \`Worker '\${SCRIPT_NAME}': Waiting for Module.onRuntimeInitialized...\`); callParentFunction('updateStatus', \`Worker '\${SCRIPT_NAME}': Waiting for WASM/runtime initialization...\`); }
        } catch (error) { callParentFunction('logError', \`Worker '\${SCRIPT_NAME}': importScripts FAILED:\`, error.message, error.stack); callParentFunction('updateStatus', \`Worker '\${SCRIPT_NAME}': Failed to load script.\`); isReady = false; self.postMessage({ type: 'worker_error', payload: { scriptName: SCRIPT_NAME, message: 'importScripts failed: ' + error.message } }); }

        // --- Function to Evaluate Initialization Runtime ---
        function evaluateInitializationRuntime() {
            if (INIT_RUNTIME_STRING && INIT_RUNTIME_STRING !== '%%INIT_RUNTIME_STRING%%') {
                callParentFunction('logDebug', \`Worker '\${SCRIPT_NAME}': Evaluating initializationRuntime...\`);
                try { new Function(INIT_RUNTIME_STRING)(); callParentFunction('logDebug', \`Worker '\${SCRIPT_NAME}': initializationRuntime evaluated successfully.\`); }
                catch (e) { callParentFunction('logError', \`Worker '\${SCRIPT_NAME}': Error evaluating initializationRuntime:\`, e.message, e.stack); self.postMessage({ type: 'worker_error', payload: { scriptName: SCRIPT_NAME, message: 'Error evaluating init functions: ' + e.message } }); }
            } else { callParentFunction('logDebug', \`Worker '\${SCRIPT_NAME}': No initializationRuntime provided.\`); }
        }


        // --- Message Handling for Execution Requests ---
        self.onmessage = async (event) => {
            console.log(\`[\${SCRIPT_NAME} WORKER INTERNAL] Received message:\`, event.data);
            const message = event.data;
            if (!message || !message.type) { callParentFunction('logWarn', "Worker: Received message with no type."); return; }

            if (message.type === 'executeFunction') {
                const { functionName, args, callId } = message.payload;
                callParentFunction('logDebug', \`Worker '\${SCRIPT_NAME}' received request to execute: \${functionName}\`);
                if (!isReady) { callParentFunction('logError', \`Worker '\${SCRIPT_NAME}' cannot execute '\${functionName}', not ready.\`); self.postMessage({ type: 'execution_error', payload: { callId: callId, message: \`Worker '\${SCRIPT_NAME}' not ready.\` } }); return; }
                if (!internalNamespace && NAMESPACE) { if (typeof self[NAMESPACE] !== 'undefined' && self[NAMESPACE]) { internalNamespace = self[NAMESPACE]; } else { callParentFunction('logError', \`Worker '\${SCRIPT_NAME}' cannot execute '\${functionName}', namespace '\${NAMESPACE}' not found.\`); self.postMessage({ type: 'execution_error', payload: { callId: callId, message: \`Namespace '\${NAMESPACE}' not found in worker.\` } }); return; } }
                const func = internalNamespace ? internalNamespace[functionName] : self[functionName];
                if (typeof func !== 'function') { callParentFunction('logError', \`Worker '\${SCRIPT_NAME}': Function '\${functionName}' not found.\`); self.postMessage({ type: 'execution_error', payload: { callId: callId, message: \`Function '\${functionName}' not found in worker '\${SCRIPT_NAME}'.\` } }); return; }
                try { const context = internalNamespace || self; const result = await func.apply(context, args); callParentFunction('logDebug', \`Worker '\${SCRIPT_NAME}': Function '\${functionName}' executed successfully.\`); if (functionName !== 'processImageBuffer') { self.postMessage({ type: 'execution_result', payload: { callId: callId, result: result } }); } }
                catch (error) { callParentFunction('logError', \`Worker '\${SCRIPT_NAME}': Error executing function '\${functionName}':\`, error.message, error.stack); self.postMessage({ type: 'execution_error', payload: { callId: callId, message: \`Error executing \${functionName}: \${error.message}\` } }); }
            } else { callParentFunction('logWarn', "Worker: Received unknown message type:", message.type); }
        };

        // --- Modify Module.onRuntimeInitialized to also evaluate runtime ---
        const originalOnRuntimeInitialized = self.Module ? self.Module.onRuntimeInitialized : null;
        if (self.Module) {
            self.Module.onRuntimeInitialized = () => {
                if (originalOnRuntimeInitialized) { originalOnRuntimeInitialized(); }
                if (isReady) { evaluateInitializationRuntime(); } // Evaluate if already marked ready
                else { callParentFunction('logWarn', "onRuntimeInitialized called, but worker not marked ready yet."); if (typeof self.cv !== 'undefined' && self.cv && typeof self.cv.imread === 'function') { cv = self.cv; isReady = true; callParentFunction('logDebug', "OpenCV readiness confirmed late by onRuntimeInitialized re-check."); self.postMessage({ type: 'script_ready', payload: { scriptName: SCRIPT_NAME } }); evaluateInitializationRuntime(); } }
            };
        } else { callParentFunction('logWarn', "Worker: self.Module was not defined before importScripts."); }

        callParentFunction('logDebug', "Worker: Event listener set up. Waiting for messages or OpenCV init.");

    `; // End workerScriptContent


    // --- CORS Script Importer Class ---
    logDebug("Defining CORSscriptImporter class...");
    class CORSscriptImporter {
        scriptsConfig = { globalDependencies: [], workerScripts: [] };
        workers = {};
        parentManager = null;
        globalScriptsLoaded = false;
        globalLoadPromise = null;

        constructor(configObject, parentManagerInstance) {
            logDebug("CORSscriptImporter constructor called.");
            if (typeof configObject !== 'object' || configObject === null) {
                throw new Error("CORSscriptImporter requires a configuration object.");
            }
            if (!parentManagerInstance) {
                throw new Error("CORSscriptImporter requires a parent manager instance.");
            }
            this.scriptsConfig.globalDependencies = Array.isArray(configObject.globalDependencies) ? configObject.globalDependencies : [];
            this.scriptsConfig.workerScripts = Array.isArray(configObject.workerScripts) ? configObject.workerScripts : [];
            this.parentManager = parentManagerInstance;
            this.workers = {};
            this.globalScriptsLoaded = false;
            this.globalLoadPromise = null;
        } // End constructor

        async loadGlobalDependencies() {
            if (this.globalLoadPromise) {
                logDebug("Global dependencies already loading or loaded.");
                return this.globalLoadPromise;
            }
            logDebug(`Loading ${this.scriptsConfig.globalDependencies.length} global dependency group(s)...`);
            this.parentManager.updateStatus("Loading core libraries...");

            let promiseChain = Promise.resolve();
            this.scriptsConfig.globalDependencies.forEach(depGroup => {
                if (depGroup.name && Array.isArray(depGroup.URLS)) {
                    logDebug(`Loading global dependency group: ${depGroup.name}`);
                    depGroup.URLS.forEach(url => {
                        promiseChain = promiseChain.then(() => loadScriptTag(url));
                    });
                } else {
                    logWarn("Skipping invalid global dependency group:", depGroup);
                }
            });

            this.globalLoadPromise = promiseChain
                .then(() => {
                    this.globalScriptsLoaded = true;
                    logDebug("All global dependencies loaded successfully.");
                    this.parentManager.updateStatus("Core libraries loaded.");
                })
                .catch(error => {
                    logError("Failed to load one or more global dependencies.", error);
                    this.parentManager.updateStatus("Error loading core libraries!");
                    this.globalScriptsLoaded = false;
                    throw error;
                });

            return this.globalLoadPromise;
        } // End loadGlobalDependencies

        initializeWorkers() {
            if (!this.globalScriptsLoaded) {
                 logError("Cannot initialize workers before global dependencies are loaded.");
                 return Promise.reject(new Error("Global dependencies failed to load."));
            }
            logDebug(`Initializing ${this.scriptsConfig.workerScripts.length} worker(s)...`);
            const workerPromises = [];
            this.scriptsConfig.workerScripts.forEach(scriptConfig => {
                if (!scriptConfig.name || !scriptConfig.url) {
                    logError("Invalid worker script config entry:", scriptConfig);
                    return;
                }
                if (this.workers[scriptConfig.name]) {
                    logWarn(`Worker '${scriptConfig.name}' already exists.`);
                    return;
                }

                logDebug(`Creating worker for: ${scriptConfig.name}`);
                this.workers[scriptConfig.name] = {
                    worker: null,
                    status: 'initializing',
                    readyPromise: null,
                    resolveReady: null,
                    rejectReady: null
                };
                const readyPromise = new Promise((resolve, reject) => {
                    this.workers[scriptConfig.name].resolveReady = resolve;
                    this.workers[scriptConfig.name].rejectReady = reject;
                });
                this.workers[scriptConfig.name].readyPromise = readyPromise;
                workerPromises.push(readyPromise);

                this.createWorker(scriptConfig);
            });
            return Promise.allSettled(workerPromises);
        } // End initializeWorkers

        async initializeAll() {
            logDebug("CORSscriptImporter: Starting initialization...");
            try {
                await this.loadGlobalDependencies();
                await this.initializeWorkers();
                logDebug("CORSscriptImporter: Initialization sequence completed (workers started).");
            } catch (error) {
                 logError("CORSscriptImporter: Initialization failed.", error);
                 throw error;
            }
        } // End initializeAll

        createWorker(scriptConfig) {
            const scriptName = scriptConfig.name;
            try {
                const workerCode = this.generateWorkerScript(scriptConfig);
                const blob = new Blob([workerCode], { type: 'application/javascript' });
                const workerUrl = URL.createObjectURL(blob);
                const worker = new Worker(workerUrl);
                URL.revokeObjectURL(workerUrl);

                this.workers[scriptName].worker = worker;
                this.workers[scriptName].status = 'loading';

                worker.onmessage = (event) => this.handleWorkerMessage(scriptName, event);
                worker.onerror = (error) => {
                    logError(`Worker error for '${scriptName}':`, error.message, error, 'WORKER');
                    this.workers[scriptName].status = 'error';
                    this.workers[scriptName].rejectReady(new Error(`Worker for ${scriptName} failed: ${error.message}`));
                    if (this.parentManager.onWorkerError) {
                        this.parentManager.onWorkerError(scriptName, `Worker script error: ${error.message}`);
                    }
                };
                logDebug(`Worker for '${scriptName}' created successfully.`);
            } catch (error) {
                logError(`Failed to create worker for '${scriptName}':`, error);
                this.workers[scriptName].status = 'error';
                this.workers[scriptName].rejectReady(new Error(`Failed to create worker for ${scriptName}: ${error.message}`));
                 if (this.parentManager.onWorkerError) {
                     this.parentManager.onWorkerError(scriptName, `Failed to create worker: ${error.message}`);
                 }
            }
        } // End createWorker

        generateWorkerScript(config) {
            let code = workerScriptContent;
            code = code.replace('%%SCRIPT_NAME%%', config.name || 'unknown');
            code = code.replace('%%SCRIPT_URL%%', config.url || '');
            code = code.replace('%%NAMESPACE%%', config.nameSpace || '');
            code = code.replace('%%REGISTER_NAMESPACE%%', config.registerNamespace ? 'true' : 'false');
            code = code.replace('%%EXPECTED_VARIABLES%%', config.expectedVariables ? Object.entries(config.expectedVariables).map(([key, value]) => `let ${key} = ${JSON.stringify(value)};`).join('\\n') : '');
            const escapedExpectedRuntime = (config.expectedRuntime || '').replace(/`/g, '\\`').replace(/\$/g, '\\$');
            code = code.replace('%%EXPECTED_RUNTIME%%', `try { new Function(\`${escapedExpectedRuntime}\`)(); } catch(e) { callParentFunction('logError', "Error executing expectedRuntime:", e.message, e.stack); self.postMessage({ type: 'worker_error', payload: { scriptName: SCRIPT_NAME, message: 'Error in expectedRuntime: ' + e.message } }); }`);
            const escapedInitRuntime = (config.initializationRuntime || '').replace(/`/g, '\\`').replace(/\$/g, '\\$');
            code = code.replace('%%INIT_RUNTIME_STRING%%', escapedInitRuntime);
            return code;
        } // End generateWorkerScript

        handleWorkerMessage(scriptName, event) {
            logDebug(`Parent received message from worker '${scriptName}':`, event.data);
            const message = event.data;
            if (!message || !message.type) {
                return;
            }

            const workerInfo = this.workers[scriptName];
            if (!workerInfo) {
                logError(`Received message for unknown worker: ${scriptName}`);
                return;
            }

            switch (message.type) {
                case 'script_ready':
                case 'opencv_ready':
                    logDebug(`Worker '${scriptName}' reported ready.`);
                    workerInfo.status = 'ready';
                    workerInfo.resolveReady();
                    if (this.parentManager.onWorkerReady) {
                        this.parentManager.onWorkerReady(scriptName);
                    }
                    break;
                case 'worker_error':
                    logError(`Worker '${scriptName}' reported an error:`, message.payload.message);
                    workerInfo.status = 'error';
                    workerInfo.rejectReady(new Error(message.payload.message));
                     if (this.parentManager.onWorkerError) {
                         this.parentManager.onWorkerError(scriptName, message.payload.message);
                     }
                    break;
                case 'processing_complete':
                     if (this.parentManager.onProcessingComplete) {
                         this.parentManager.onProcessingComplete(scriptName, message.payload);
                     }
                    break;
                case 'status_update':
                     if (this.parentManager.updateStatus) {
                         this.parentManager.updateStatus(`[${scriptName}] ${message.payload.message}`);
                     }
                    break;
                case 'functionCall':
                    const { functionName, args } = message.payload;
                    if (typeof functionName === 'string' && Array.isArray(args)) {
                        const targetFunction = this.parentManager[functionName] || window[functionName];
                        if (typeof targetFunction === 'function') {
                            try {
                                if (this.parentManager[functionName]) {
                                    targetFunction.apply(this.parentManager, args);
                                } else if (functionName === 'alert') {
                                    if (PARENT_DEV_MODE || WORKER_DEV_MODE) {
                                        alert("[WORKER] " + args.join(' '));
                                    } else {
                                        console.log("[WORKER ALERT REQUEST]", ...args);
                                    }
                                } else if (functionName.startsWith('log')) {
                                    targetFunction(...args, 'WORKER');
                                }
                            } catch (e) {
                                logError(`Parent: Error executing requested worker function '${functionName}':`, e);
                            }
                        } else {
                            logWarn(`Parent received request to call unknown/disallowed function from worker '${scriptName}': ${functionName}`);
                        }
                    } else {
                        logWarn(`Parent received invalid functionCall message format from worker '${scriptName}'.`);
                    }
                    break;
                case 'execution_result':
                    logDebug(`Worker '${scriptName}' execution result:`, message.payload);
                    // Resolve promise associated with callId (requires storing promises)
                    break;
                case 'execution_error':
                    logError(`Worker '${scriptName}' execution error:`, message.payload.message);
                    // Reject promise associated with callId (requires storing promises)
                    break;
                default:
                    logWarn(`Parent: Received unknown message type from worker '${scriptName}':`, message.type);
            }
        } // End handleWorkerMessage

        isReady(scriptName) {
            return this.workers[scriptName]?.status === 'ready';
        } // End isReady

        waitReady(scriptName) {
            if (!this.workers[scriptName]) {
                return Promise.reject(new Error(`No worker configured: ${scriptName}`));
            }
            return this.workers[scriptName].readyPromise;
        } // End waitReady

        executeFunctionInWorker(scriptName, functionName, args = []) {
            return new Promise((resolve, reject) => {
                const workerInfo = this.workers[scriptName];
                if (!workerInfo || !workerInfo.worker) {
                    return reject(new Error(`Worker '${scriptName}' not found.`));
                }
                if (workerInfo.status !== 'ready') {
                    return reject(new Error(`Worker '${scriptName}' not ready.`));
                }

                const callId = `${scriptName}-${functionName}-${Date.now()}-${Math.random()}`;

                const messageHandler = (event) => {
                    const response = event.data;
                    if (response && response.payload && response.payload.callId === callId) {
                        workerInfo.worker.removeEventListener('message', messageHandler);
                        if (response.type === 'execution_result') {
                            logDebug(`Received result for callId ${callId}`);
                            resolve(response.payload.result);
                        } else if (response.type === 'execution_error') {
                            logError(`Received error for callId ${callId}: ${response.payload.message}`);
                            reject(new Error(response.payload.message));
                        }
                    }
                };
                workerInfo.worker.addEventListener('message', messageHandler);

                logDebug(`Requesting worker '${scriptName}' to execute '${functionName}' with callId ${callId}`);
                const success = this.postMessageToWorker(scriptName, {
                    type: 'executeFunction',
                    payload: { functionName, args, callId }
                });

                if (!success) {
                    workerInfo.worker.removeEventListener('message', messageHandler);
                    reject(new Error(`Failed to post execution request to worker '${scriptName}'.`));
                }
            });
        } // End executeFunctionInWorker

        postMessageToWorker(scriptName, message, transferList = []) {
             const workerInfo = this.workers[scriptName];
             if (!workerInfo || !workerInfo.worker) {
                 logError(`Cannot post message: Worker '${scriptName}' not found.`);
                 return false;
             }
              if (workerInfo.status !== 'ready') {
                 logWarn(`Posting message to worker '${scriptName}' which is not ready (status: ${workerInfo.status}).`);
             }
             try {
                 workerInfo.worker.postMessage(message, transferList);
                 return true;
             } catch (error) {
                  logError(`Error posting message to worker '${scriptName}':`, error);
                  return false;
             }
        } // End postMessageToWorker

        terminateAll() {
            logDebug("Terminating all workers...");
            Object.entries(this.workers).forEach(([name, info]) => {
                if (info.worker) {
                    try {
                        info.worker.terminate();
                        logDebug(`Worker '${name}' terminated.`);
                    } catch (e) {
                        logError(`Error terminating worker '${name}':`, e);
                    }
                }
                info.status = 'terminated';
            });
            this.workers = {};
        } // End terminateAll

    } // End CORSscriptImporter Class
    logDebug("CORSscriptImporter class defined.");


    // --- Floorplan SVG Creator Class (Parent Scope) ---
    logDebug("Defining FloorplanCreator class...");
    class FloorplanCreator {
        svgContainer = null;
        svg = null;
        svgGroup = null;
        contourData = [];
        d3 = null;
        zoom = null;
        POLYGON_FILL = 'rgba(100, 150, 255, 0.7)';
        POLYGON_STROKE = '#d0d0ff';
        POLYGON_STROKE_WIDTH = 1;
        DRAGGING_STROKE = 'yellow';
        DRAGGING_STROKE_WIDTH = 1.5;
        CONTAINER_ID = 'floorplan-svg-container';
        parentContainer = null;
        targetWidth = 800;
        targetHeight = 600;

        constructor(parentContainerRef, d3Instance, targetWidth = 800, targetHeight = 600) {
            if (!parentContainerRef) {
                throw new Error("FloorplanCreator requires parent container reference.");
            }
            if (!d3Instance) {
                throw new Error("FloorplanCreator requires D3 instance.");
            }
            this.parentContainer = parentContainerRef;
            this.d3 = d3Instance;
            this.targetWidth = targetWidth;
            this.targetHeight = targetHeight;
            logDebug("FloorplanCreator initialized in parent.");
        } // End constructor

        renderContourData(contourData, originalWidth, originalHeight) {
             if (!contourData) {
                 logWarn("FloorplanCreator: No contour data provided to render.");
                 this.destroy();
                 return Promise.resolve();
             }
             logDebug(`FloorplanCreator: Received ${contourData.length} contours. Original size: ${originalWidth}x${originalHeight}`);
             this.contourData = this.scaleContours(contourData, originalWidth, originalHeight);
             return this.render();
        } // End renderContourData

        scaleContours(rawContours, originalWidth, originalHeight) {
            if (!originalWidth || !originalHeight) {
                 logWarn("Cannot scale contours: Original dimensions missing.");
                 return rawContours;
            }
             const scaleX = this.targetWidth / originalWidth;
             const scaleY = this.targetHeight / originalHeight;
             const scale = Math.min(scaleX, scaleY);
             logDebug(`Scaling contours by factor: ${scale.toFixed(3)} (Target: ${this.targetWidth}x${this.targetHeight})`);
             return rawContours.map(contour => ({
                 ...contour,
                 points: contour.points.map(p => ({
                     x: Math.round(p.x * scale),
                     y: Math.round(p.y * scale)
                 }))
             }));
        } // End scaleContours

        render() {
            const self = this;
            return new Promise((resolve, reject) => {
                setTimeout(() => {
                    try {
                        if (!self.d3) {
                            throw new Error("D3 missing in render.");
                        }
                        if (!self.parentContainer || !document.contains(self.parentContainer)) {
                            throw new Error("Parent container missing/detached in render.");
                        }
                        if (!self.contourData || self.contourData.length === 0) {
                             logDebug("FloorplanCreator: No scaled contours to render.");
                             self.destroy();
                             return resolve();
                        }
                        self.destroy();
                        self.svgContainer = document.createElement('div');
                        self.svgContainer.id = self.CONTAINER_ID;
                        const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                        self.svg = self.d3.select(svgElement);
                        self.svgGroup = self.svg.append('g')
                            .attr('id', 'floorplan-shapes');
                        self.svgGroup.selectAll('.floorplan-polygon')
                            .data(self.contourData, d => d.id)
                            .enter()
                            .append('polygon')
                            .attr('class', 'floorplan-polygon')
                            .attr('points', d => d.points.map(p => `${p.x},${p.y}`).join(' '))
                            .style('fill', self.POLYGON_FILL)
                            .style('stroke', self.POLYGON_STROKE)
                            .style('stroke-width', self.POLYGON_STROKE_WIDTH)
                            .attr('transform', d => d.transform || null)
                            .call(self.setupDrag());
                        const statusLabelElement = self.parentContainer.querySelector('#floorplan-status');
                        if (statusLabelElement) {
                            self.parentContainer.insertBefore(self.svgContainer, statusLabelElement);
                        } else {
                            self.parentContainer.appendChild(self.svgContainer);
                        }
                        self.svgContainer.appendChild(svgElement);
                        self.setupZoom();
                        if (self.zoom) {
                            self.svg.call(self.zoom);
                        }
                        self.svgContainer.style.display = 'block';
                        logDebug("FloorplanCreator: SVG rendered successfully.");
                        resolve();
                    } catch (error) {
                        logError("FloorplanCreator: Error during SVG render.", error);
                        reject(error);
                    }
                }, 0);
            });
        } // End render

        setupZoom() {
            if (!this.d3) {
                logError("D3 missing in setupZoom");
                return;
            }
            const zoomed = (event) => {
                if (this.svgGroup) {
                    this.svgGroup.attr('transform', event.transform);
                }
            };
            this.zoom = this.d3.zoom()
                .scaleExtent([0.1, 10])
                .on('zoom', zoomed);
        } // End setupZoom

        setupDrag() {
            if (!this.d3) {
                logError("D3 missing in setupDrag");
                return () => {};
            }
            const creatorInstance = this;
            return this.d3.drag()
                .on('start', function(event, d) {
                    creatorInstance.d3.select(this)
                        .raise()
                        .classed('dragging', true)
                        .style('stroke', creatorInstance.DRAGGING_STROKE)
                        .style('stroke-width', creatorInstance.DRAGGING_STROKE_WIDTH);
                })
                .on('drag', function(event, d) {
                    const currentTransform = creatorInstance.d3.select(this).attr('transform') || "";
                    let currentX = 0;
                    let currentY = 0;
                    const match = currentTransform.match(/translate\(([^,]+),([^)]+)\)/);
                    if (match) {
                        currentX = parseFloat(match[1]);
                        currentY = parseFloat(match[2]);
                    }
                    const newX = currentX + event.dx;
                    const newY = currentY + event.dy;
                    creatorInstance.d3.select(this).attr('transform', `translate(${newX}, ${newY})`);
                })
                .on('end', function(event, d) {
                    creatorInstance.d3.select(this)
                        .classed('dragging', false)
                        .style('stroke', creatorInstance.POLYGON_STROKE)
                        .style('stroke-width', creatorInstance.POLYGON_STROKE_WIDTH);
                });
        } // End setupDrag

        destroy() {
            if (this.svgContainer) {
                if (this.svg) {
                    this.svg.on('.zoom', null);
                }
                if (this.svgGroup) {
                    this.svgGroup.selectAll('.floorplan-polygon').on('.drag', null);
                }
                this.svgContainer.remove();
                this.svgContainer = null;
                this.svg = null;
                this.svgGroup = null;
                this.zoom = null;
                logDebug("FloorplanCreator: SVG destroyed.");
            }
        } // End destroy
    } // End FloorplanCreator Class
    logDebug("FloorplanCreator class defined.");


    // --- Floorplan Manager Class (Parent Scope) ---
    logDebug("Defining FloorplanManager class...");
    class FloorplanManager extends FloorplanCreator {
        corsImporter = null;
        isWorkerReady = false;
        uiCreated = false;
        container = null;
        controlsDiv = null;
        fileInput = null;
        statusLabel = null;
        canvas = null;
        canvasCtx = null;
        canvasLabel = null;
        closeButton = null;
        d3 = null; // Hold D3 instance

        // --- Configuration for the CORS Importer ---
        CORSscriptURLs = {
            // Global dependencies loaded into the main thread first
            globalDependencies: [
                 { name: "d3js", URLS: [ // Load D3 and plugins globally
                     'https://d3js.org/d3.v7.min.js',
                     'https://d3js.org/d3-drag.v3.min.js',
                     'https://d3js.org/d3-zoom.v3.min.js'
                 ]}
            ],
            // Scripts to load into dedicated workers
            workerScripts: [{
                name: "openCV",
                url: OPENCV_URL,
                nameSpace: "cv",
                registerNamespace: false,
                expectedVariables: { // Define variables needed in worker scope
                    cv: null,
                    isReady: false
                },
                // Code executed before importScripts (defines Module)
                expectedRuntime: `
                    self.Module = {
                        onRuntimeInitialized: () => {
                            callParentFunction('logDebug', ">>> \${SCRIPT_NAME} Module.onRuntimeInitialized fired.");
                            if (typeof self.cv !== 'undefined' && self.cv && typeof self.cv.imread === 'function') {
                                cv = self.cv; // Assign to worker's 'cv' variable
                                isReady = true; // Set worker's internal flag
                                callParentFunction('logDebug', "OpenCV is ready in Worker (onRuntimeInitialized confirmed).");
                                self.postMessage({ type: 'script_ready', payload: { scriptName: SCRIPT_NAME } }); // Use generic ready signal

                                // Evaluate post-load functions AFTER ready
                                evaluateInitializationRuntime();

                            } else {
                                callParentFunction('logError', "Worker '\${SCRIPT_NAME}': onRuntimeInitialized fired, but cv or cv.imread is invalid!");
                                self.postMessage({ type: 'worker_error', payload: { scriptName: SCRIPT_NAME, message: 'OpenCV loaded but invalid.' } });
                            }
                        },
                        onAbort: (reason) => {
                             callParentFunction('logError', "Worker '\${SCRIPT_NAME}' OpenCV WASM Aborted:", reason);
                             isReady = false; // Reset internal flag
                             self.postMessage({ type: 'worker_error', payload: { scriptName: SCRIPT_NAME, message: 'OpenCV WASM Aborted: ' + reason } });
                        }
                    };
                `,
                // Function(s) defined in worker *after* OpenCV is ready
                initializationRuntime: `
                    async function processImageBuffer(arrayBuffer, imageType) {
                        callParentFunction('logDebug', "Worker: Starting image buffer processing.");
                        callParentFunction('updateStatus', "Worker: Processing image...");

                        let src = null;
                        let gray = null;
                        let edges = null;
                        let contours = null;
                        let hierarchy = null;
                        const formattedContours = [];
                        let imageBitmap = null;
                        let offscreenCanvas = null;
                        let ctx = null;
                        let mat = null;

                        try {
                            const data = new Uint8Array(arrayBuffer);
                            mat = cv.imdecode(data, cv.IMREAD_UNCHANGED);
                            if (!mat || mat.empty()) {
                                 callParentFunction('logWarn', "Worker: cv.imdecode failed, attempting OffscreenCanvas fallback...");
                                 try {
                                     const blob = new Blob([arrayBuffer], {type: imageType || 'image/png'});
                                     imageBitmap = await createImageBitmap(blob);
                                     offscreenCanvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
                                     ctx = offscreenCanvas.getContext('2d');
                                     if (!ctx) throw new Error("Could not get OffscreenCanvas 2D context for fallback.");
                                     ctx.drawImage(imageBitmap, 0, 0);
                                     src = cv.imread(offscreenCanvas);
                                     imageBitmap.close();
                                 } catch (canvasError) {
                                      callParentFunction('logError', "Worker: OffscreenCanvas fallback also failed:", canvasError);
                                      throw new Error("Failed to decode image using both imdecode and OffscreenCanvas.");
                                 }
                            } else {
                                src = mat;
                                mat = null;
                            }

                            if (!src || src.empty()) {
                                throw new Error("Failed to create valid image Mat from buffer");
                            }
                            callParentFunction('logDebug', \`Worker: Image decoded: \${src.cols}x\${src.rows}\`);

                            gray = new cv.Mat();
                            if (src.channels() === 4) {
                                cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
                            } else if (src.channels() === 3) {
                                cv.cvtColor(src, gray, cv.COLOR_RGB2GRAY);
                            } else if (src.channels() === 1) {
                                gray = src.clone();
                            } else {
                                throw new Error(\`Unsupported number of channels: \${src.channels()}\`);
                            }

                            cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
                            edges = new cv.Mat();
                            cv.Canny(gray, edges, 50, 100);
                            contours = new cv.MatVector();
                            hierarchy = new cv.Mat();
                            cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
                            callParentFunction('logDebug', \`Worker: Found \${contours.size()} raw contours.\`);

                            const minArea = 50;
                            for (let i = 0; i < contours.size(); ++i) {
                                const contour = contours.get(i);
                                try {
                                     const area = cv.contourArea(contour);
                                     if (area < minArea || contour.rows < 3) {
                                         continue;
                                     }
                                     const pointsArray = [];
                                     const pointData = contour.data32S;
                                     for (let j = 0; j < contour.rows; ++j) {
                                         pointsArray.push({ x: pointData[j * 2], y: pointData[j * 2 + 1] });
                                     }
                                     formattedContours.push({ id: \`worker-contour-\${Date.now()}-\${i}\`, points: pointsArray });
                                } finally {
                                    if(contour) {
                                        contour.delete();
                                    }
                                }
                            }
                            callParentFunction('logDebug', \`Worker: Processed \${formattedContours.length} valid contours.\`);

                            self.postMessage({
                                type: 'processing_complete',
                                payload: {
                                    contours: formattedContours,
                                    originalWidth: src.cols,
                                    originalHeight: src.rows
                                }
                            });

                        } catch (error) {
                            callParentFunction('logError', "Worker processing error:", error);
                        } finally {
                            [src, gray, edges, contours, hierarchy, mat].forEach(m => {
                                if (m && !m.isDeleted()) {
                                    try {
                                        m.delete();
                                    } catch(e){}
                                }
                            });
                            if (imageBitmap && !imageBitmap.closed) {
                                try {
                                    imageBitmap.close();
                                } catch(e){}
                            }
                            callParentFunction('logDebug', "Worker: OpenCV Mats cleaned up.");
                        }
                    }
                ` // End initializationRuntime string
            }]
        };
        // --- End CORS Config ---


        constructor() {
            logDebug("FloorplanManager constructor started.");
            // Initialize non-DOM properties first.
            this.corsImporter = null;
            this.isWorkerReady = false;
            this.uiCreated = false;
            this.container = null;
            this.controlsDiv = null;
            this.fileInput = null;
            this.statusLabel = null;
            this.canvas = null;
            this.canvasCtx = null;
            this.canvasLabel = null;
            this.closeButton = null;
            this.d3 = null;

            // Start the asynchronous initialization process
            this.asyncInitialize();
            logDebug("FloorplanManager constructor finished (async init started).");
        } // End constructor

        async asyncInitialize() {
             logDebug("FloorplanManager asyncInitialize started.");
             try {
                // 1. Initialize Importer and Load Global Dependencies
                this.updateStatus("Initializing Core Libraries...");
                this.corsImporter = new CORSscriptImporter(this.CORSscriptURLs, this);
                await this.corsImporter.loadGlobalDependencies();
                logDebug("Global dependencies loaded.");

                // 2. Check if D3 loaded correctly
                if (typeof window.d3 === 'undefined' || !window.d3) {
                    throw new Error("D3 library failed to load globally.");
                }
                this.d3 = window.d3;
                logDebug("D3 confirmed available globally.");

                // 3. Create UI Container (needed for super call)
                const baseContainerElement = document.createElement('div');
                baseContainerElement.id = 'floorplan-container';

                // 4. Call super() constructor (FloorplanCreator)
                logDebug("FloorplanManager: Calling super(FloorplanCreator constructor)...");
                super(baseContainerElement, this.d3, 800, 600);
                logDebug("FloorplanManager: super(FloorplanCreator constructor) finished.");
                this.container = baseContainerElement;
                logDebug("FloorplanManager: 'this.container' assigned.");

                // 5. Populate and Append UI
                logDebug("FloorplanManager: Populating UI container...");
                this.populateUIContainer();
                this.uiCreated = true;
                logDebug("FloorplanManager: UI container populated.");
                logDebug("FloorplanManager: Appending main container to DOM...");
                const rootEl = document.documentElement || document.body;
                if (rootEl) {
                    rootEl.appendChild(this.container);
                } else {
                    throw new Error("Could not find documentElement or body to append UI.");
                }
                logDebug("FloorplanManager: Main container appended.");

                // 6. Initialize Workers (now that UI is ready for status updates)
                this.updateStatus("Initializing OpenCV Processor (Worker)...");
                this.corsImporter.initializeWorkers();
                await this.corsImporter.waitReady('openCV');

                logDebug("Manager: OpenCV worker is ready.");
                this.isWorkerReady = true;
                if (this.container) {
                    this.container.style.display = 'flex'; // Show UI
                }
                this.updateStatus("Ready. Select floorplan image.");

            } catch (error) {
                 logError("FloorplanManager asyncInitialize failed:", error);
                 this.updateStatus(`Initialization Error: ${error.message}`);
                 if (this.container && this.container.parentElement) {
                     this.container.remove();
                 }
                 this.uiCreated = false;
            }
        } // End asyncInitialize


        populateUIContainer() {
            if (!this.container) {
                throw new Error("populateUIContainer called but this.container is null.");
            }
            this.controlsDiv = document.createElement('div');
            this.controlsDiv.id = 'floorplan-controls';
            const fileInputLabel = document.createElement('label');
            fileInputLabel.textContent = 'Upload Floorplan Image:';
            fileInputLabel.htmlFor = 'floorplan-file-input';
            this.fileInput = document.createElement('input');
            this.fileInput.type = 'file';
            this.fileInput.accept = 'image/*';
            this.fileInput.id = 'floorplan-file-input';
            this.controlsDiv.appendChild(fileInputLabel);
            this.controlsDiv.appendChild(this.fileInput);
            this.container.appendChild(this.controlsDiv);
            this.closeButton = document.createElement('button');
            this.closeButton.id = 'floorplan-close-btn';
            this.closeButton.textContent = '✕';
            this.closeButton.title = 'Close';
            this.container.appendChild(this.closeButton);
            this.canvas = document.createElement('canvas');
            this.canvas.id = 'floorplan-canvas';
            this.canvas.width = 800;
            this.canvas.height = 600;
            this.canvasCtx = this.canvas.getContext('2d');
            this.container.appendChild(this.canvas);
            this.canvasLabel = document.createElement('div');
            this.canvasLabel.id = 'floorplan-canvas-label';
            this.canvasLabel.textContent = "Upload image for preview & processing.";
            this.container.appendChild(this.canvasLabel);
            this.statusLabel = document.createElement('span');
            this.statusLabel.id = 'floorplan-status';
            this.statusLabel.textContent = 'Initializing...';
            this.container.appendChild(this.statusLabel);
            if (this.fileInput) {
                this.fileInput.addEventListener('change', (e) => this.handleFileChange(e));
            } else {
                logError("Manager populateUI: File input missing.");
            }
            if (this.closeButton) {
                this.closeButton.addEventListener('click', () => this.closeUI());
            } else {
                logError("Manager populateUI: Close button missing.");
            }
            logDebug("Manager: UI elements populated in container.");
        } // End populateUIContainer

        // --- Manager-specific Worker Callbacks ---
        onWorkerReady(scriptName) {
            logDebug(`Manager notified that worker '${scriptName}' is ready.`);
        } // End onWorkerReady

        onWorkerError(scriptName, errorMessage) {
            logError(`Manager notified of error in worker '${scriptName}': ${errorMessage}`);
            this.updateStatus(`Error in ${scriptName} worker: ${errorMessage}`);
            if (scriptName === 'openCV') {
                this.isWorkerReady = false;
            }
        } // End onWorkerError

        onProcessingComplete(scriptName, payload) {
            logDebug(`Manager received processing complete from '${scriptName}'`);
            this.updateStatus("Processing complete. Rendering SVG...");
            if (payload && payload.contours) {
                this.renderContourData(payload.contours, payload.originalWidth, payload.originalHeight)
                    .then(() => {
                         this.updateStatus(`SVG rendered with ${payload.contours.length} shapes.`);
                         this.hideCanvas();
                    })
                    .catch(error => {
                         logError("Parent: Error rendering SVG:", error);
                         this.updateStatus(`Error rendering SVG: ${error.message}`);
                         this.showCanvas();
                    });
            } else {
                 logWarn("Parent: processing_complete message missing contour data.");
                 this.updateStatus("Processing finished, but no contour data received.");
                 this.showCanvas();
            }
        } // End onProcessingComplete

        onProcessingError(scriptName, errorMessage) {
            logError(`Manager received processing error from '${scriptName}': ${errorMessage}`);
            this.updateStatus(`Processing Error: ${errorMessage}`);
            this.showCanvas();
            this.destroy();
        } // End onProcessingError
        // --- End Worker Callbacks ---

        updateStatus(message) {
            if (this.uiCreated && this.statusLabel) {
                 if (this.container && this.container.style.display !== 'flex' && this.isWorkerReady) {
                      this.container.style.display = 'flex';
                 }
                this.statusLabel.textContent = message;
            }
            logDebug("Manager Status Update:", message);
        } // End updateStatus

        handleFileChange(e) {
            logDebug("Manager: handleFileChange triggered.");
            if (!this.corsImporter) {
                this.updateStatus("Error: Importer not initialized.");
                e.target.value = null;
                return;
            }
            if (!this.corsImporter.isReady('openCV')) {
                this.updateStatus("Error: OpenCV processor is not ready.");
                e.target.value = null;
                return;
            }

            const file = e.target.files[0];
            if (!file || !file.type.startsWith('image/')) {
                this.updateStatus('Error: Please select a valid image file.');
                this.showCanvas();
                this.destroy();
                return;
            }

            this.updateStatus('Reading file for preview...');
            this.displayPreview(file);

            const reader = new FileReader();
            reader.onload = () => {
                const arrayBuffer = reader.result;
                if (!arrayBuffer) {
                    logError("Error reading file into ArrayBuffer.");
                    this.updateStatus('Error reading image file.');
                    return;
                }
                logDebug(`Manager: Sending image ArrayBuffer (\`${file.name}\`, ${file.size} bytes) to worker 'openCV'.`);
                this.updateStatus('Sending image to processor...');

                const success = this.corsImporter.postMessageToWorker(
                    'openCV',
                    {
                        type: 'executeFunction',
                        payload: {
                            functionName: 'processImageBuffer',
                            args: [arrayBuffer, file.type],
                            callId: `process-${Date.now()}`
                        }
                    },
                    [arrayBuffer]
                );

                if (success) {
                    this.updateStatus('Image sent. Waiting for processing results...');
                } else {
                    this.updateStatus('Error sending image to processor.');
                }
            };
            reader.onerror = (error) => {
                logError("Error reading file:", error);
                this.updateStatus('Error reading image file.');
            };
            reader.readAsArrayBuffer(file);
        } // End handleFileChange

        displayPreview(file) {
             const reader = new FileReader();
             reader.onload = (event) => {
                 const img = new Image();
                 img.onload = () => {
                      if (this.canvas && this.canvasCtx) {
                          const scale = Math.min(this.canvas.width / img.naturalWidth, this.canvas.height / img.naturalHeight);
                          const drawWidth = img.naturalWidth * scale;
                          const drawHeight = img.naturalHeight * scale;
                          const dx = (this.canvas.width - drawWidth) / 2;
                          const dy = (this.canvas.height - drawHeight) / 2;
                          this.canvasCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                          this.canvasCtx.drawImage(img, dx, dy, drawWidth, drawHeight);
                          this.updateCanvasLabel("Preview shown below. Processing in background...");
                          this.showCanvas();
                           logDebug("Parent: Preview displayed.");
                      }
                 };
                 img.onerror = () => {
                     logError("Parent: Error loading preview image.");
                     this.updateCanvasLabel("Could not display preview.");
                 };
                 img.src = event.target.result;
             };
             reader.onerror = () => {
                 logError("Parent: Error reading file for preview.");
                 this.updateCanvasLabel("Could not read file for preview.");
             };
             reader.readAsDataURL(file);
        } // End displayPreview

        showCanvas() {
             if (this.canvas) {
                 this.canvas.style.display = 'block';
             }
             if (this.canvasLabel) {
                 this.canvasLabel.style.display = 'block';
             }
             this.destroy();
             logDebug("Manager: Canvas shown.");
         } // End showCanvas

         hideCanvas() {
             if (this.canvas) {
                 this.canvas.style.display = 'none';
             }
             if (this.canvasLabel) {
                 this.canvasLabel.style.display = 'none';
             }
             logDebug("Manager: Canvas hidden.");
         } // End hideCanvas

         updateCanvasLabel(text) {
            if (this.canvasLabel) {
                this.canvasLabel.textContent = text;
            }
         } // End updateCanvasLabel

        closeUI() {
            logDebug("Manager: Closing UI and Workers...");
            super.destroy(); // Calls FloorplanCreator destroy

            if (this.corsImporter) {
                this.corsImporter.terminateAll();
                this.corsImporter = null;
            }
            if (this.container) {
                 try {
                     this.container.remove();
                 } catch (e) {}
                 this.container = null;
            }

            this.isWorkerReady = false;
            this.uiCreated = false;
            logDebug("Manager: UI closed completely.");
        } // End closeUI

    } // End FloorplanManager Class
    logDebug("FloorplanManager class defined.");


    // --- Instantiate the Manager ---
    logDebug("Instantiating FloorplanManager (Generic Worker + Globals Version)...");
    try {
        // D3 check happens inside asyncInitialize now
        new FloorplanManager(); // Constructor starts async initialization
        logDebug("FloorplanManager instance created, async initialization running.");
    } catch (error) {
         logError("Critical error during script startup (Instantiation):", error);
         alert(`Critical Error: ${error.message}. Floorplan Manager cannot start.`);
    }
    logDebug(`--- Floorplan Manager (Generic Worker + Globals) Execution Finished ---`);

})(); // End IIFE