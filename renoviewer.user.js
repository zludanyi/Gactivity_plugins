// ==UserScript==
// @name         Adaptive Renovision (ZLudany - kNN & Adaptive)
// @version      0.7
// @description  Uses k-NN and adaptive scoring based on user feedback.
// @author       ZLudany
// @match        *://*.ingatlan.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

// --- Logger Class (Assume full class from previous version is here) ---
const LogLevel = { /* ... */ };
class Logger { /* ... (Full Logger class definition) ... */
    constructor(componentName = 'UserScript', config = {}) {
        this.componentName = componentName;
        const defaultConfig = {
            level: LogLevel.INFO,
            logToConsole: true,
            logToUiElement: true,
            logToAlert: false, // << KEEP ALERTS OFF for this complex version during dev
            alertLogLevel: LogLevel.ERROR,
            enableWorkerLoggingRelay: true
        };
        this.config = { ...defaultConfig, ...config };
        this.logHistory = [];
        this.uiLogElement = null;
    }
    // ... (rest of Logger methods)
    setConfig(newConfig) { this.config = { ...this.config, ...newConfig }; this.info(`Logger configuration updated for [${this.componentName}]`);}
    setUiLogElement(element) { if (element instanceof HTMLElement) { this.uiLogElement = element;} else { this.warn("Invalid element provided for UI logging.");}}
    _log(level, levelStr, messages, fromWorker = false) { if (level < this.config.level) return; if (fromWorker && !this.config.enableWorkerLoggingRelay && level < LogLevel.WARN) return; const timestamp = new Date().toISOString(); const prefix = fromWorker ? `[WORKER] [${this.componentName}]` : `[${this.componentName}]`; const logEntry = { timestamp, level: levelStr, component: prefix, messages: messages.map(msg => (typeof msg === 'object' ? (msg instanceof Error ? `${msg.name}: ${msg.message} (Stack: ${msg.stack})` : JSON.stringify(msg, null, 2)) : String(msg)))}; this.logHistory.push(logEntry); const messageString = logEntry.messages.join(' '); if (this.config.logToConsole) { const consoleArgs = [`%c[${timestamp}] [${levelStr}] ${prefix}:`, this._getLogLevelColor(level), ...messages]; switch (level) { case LogLevel.DEBUG: console.debug(...consoleArgs); break; case LogLevel.INFO:  console.info(...consoleArgs);  break; case LogLevel.WARN:  console.warn(...consoleArgs);  break; case LogLevel.ERROR: console.error(...consoleArgs); break; }} const uiLogTarget = (fromWorker && this.config.enableWorkerLoggingRelay) || (!fromWorker && this.config.logToUiElement) ? this.uiLogElement : null; if (uiLogTarget) { const logLine = document.createElement('div'); logLine.style.color = this._getLogLevelColor(level, true); const displayPrefix = fromWorker ? `[WORKER] ` : ''; logLine.textContent = `${displayPrefix}[${timestamp.split('T')[1].split('.')[0]}] [${levelStr}]: ${messageString}`; uiLogTarget.appendChild(logLine); uiLogTarget.scrollTop = uiLogTarget.scrollHeight; } if (this.config.logToAlert && level >= this.config.alertLogLevel) { let alertMsg = `Level: ${levelStr}\nComponent: ${prefix}\nTimestamp: ${timestamp.split('T')[1].split('.')[0]}\n\nMessage(s):\n`; messages.forEach(msg => { if (typeof msg === 'object') { try { alertMsg += JSON.stringify(msg, null, 2) + '\n'; } catch (e) { alertMsg += "[Unserializable Object]\n"; }} else { alertMsg += msg + '\n'; }}); alert(alertMsg.substring(0, 1000)); }}
    _getLogLevelColor(level, forInlineStyle = false) { const colors = { [LogLevel.DEBUG]: forInlineStyle ? 'blue' : 'color: blue;', [LogLevel.INFO]: forInlineStyle ? 'green' : 'color: green;', [LogLevel.WARN]: forInlineStyle ? 'orange' : 'color: orange;', [LogLevel.ERROR]: forInlineStyle ? 'red' : 'color: red;',}; return colors[level] || (forInlineStyle ? 'black' : 'color: black;');}
    debug(...messages) { this._log(LogLevel.DEBUG, 'DEBUG', messages); } info(...messages) { this._log(LogLevel.INFO, 'INFO', messages); } warn(...messages) { this._log(LogLevel.WARN, 'WARN', messages); } error(...messages) { this._log(LogLevel.ERROR, 'ERROR', messages); }
    relayWorkerLog(level, levelStr, messages) { this._log(level, levelStr, messages, true); }
}


(async function() {
    'use strict';

    const MAIN_THREAD_LOG_CONFIG = {
        level: LogLevel.DEBUG, // Enable DEBUG for development of these new features
        logToConsole: true,
        logToUiElement: true,
        logToAlert: false, // << Defaulting to NO ALERTS for usability
        alertLogLevel: LogLevel.ERROR,
        enableWorkerLoggingRelay: true
    };
    const WORKER_LOG_CONFIG = {
        level: LogLevel.DEBUG,
        logToMainThread: true
    };
    const logger = new Logger('AdaptiveRenovision', MAIN_THREAD_LOG_CONFIG);

    // --- CONFIGURATION (Script specific) ---
    let API_KEY = 'YOUR_GOOGLE_MAPS_API_KEY_PLACEHOLDER';
    // ... (STREET_VIEW_IMAGE_REQUEST_SIZE, TF_MODEL_INPUT_WIDTH, etc. from previous)
    const K_NEAREST_NEIGHBORS = 5; // For k-NN
    const MAX_EMBEDDINGS_FOR_KNN_QUERY = 100; // Max recent verified embeddings to compare against
    const DB_NAME = 'BuildingRenovisionDB_v3_AdaptiveKNN'; // New DB name for schema potentially changing
    // ... (Rest of your config: BASE_PAIR_ADDRESSES, TARGET_STREET_*, etc.)
    const STREET_VIEW_IMAGE_REQUEST_SIZE = '320x240';
    const TF_MODEL_INPUT_WIDTH = 96;
    const TF_MODEL_INPUT_HEIGHT = 72;
    const TF_MODEL_INPUT_CHANNELS = 1;
    const STREET_VIEW_FOV = 80;
    const STREET_VIEW_PITCH = 5;
    const SAMPLING_INTERVAL_METERS = 20;
    const PROJECTION_DISTANCE_METERS = 15;
    const USER_FEEDBACK_VALIDITY_DAYS = 90;
    const BASE_PAIR_ADDRESSES = [ "Budapest, 1068, Benczúr utca 8.", "Budapest, 1077, Jósika utca 29." ];
    let basePairData = [null, null]; // Will store full data including embedding array
    let actualBasePairSimilarity = null;
    const TARGET_STREET_START_ADDRESS = "Benczúr utca 1, Budapest, Hungary";
    const TARGET_STREET_END_ADDRESS = "Benczúr utca & Bajza utca, Budapest, Hungary";
    const DB_VERSION = 1; // Increment if schema *really* changes non-additively
    const BUILDING_STORE_NAME = 'buildings';
    let db;
    const MODEL_SIGNATURE = `simpleCNN_v1.2_knn_${TF_MODEL_INPUT_WIDTH}x${TF_MODEL_INPUT_HEIGHT}`; // Updated signature


    // --- Global GMaps / UI vars / Data Store ---
    // ... (map, directionsService, etc.)
    let map, directionsService, streetViewService, geocoder;
    let controlPanel, mapDiv, resultsTableUnrenovatedCell, resultsTableRenovatedCell, summaryDiv, logDivUiElement, startButton;
    let similarityWorker;
    let currentAnalysisResults = []; // Holds {..., embedding: number[], modelUnrenovatedScore, kNNScore, finalUnrenovatedScore, statusSource }
    const svgIconUnrenovated = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style="color:red; vertical-align:middle; margin-right:5px;"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0M5.354 4.646a.5.5 0 1 0-.708.708L7.293 8l-2.647 2.646a.5.5 0 1 0 .708.708L8 8.707l2.646 2.647a.5.5 0 0 0 .708-.708L8.707 8l2.647-2.646a.5.5 0 0 0-.708-.708L8 7.293z"/></svg>`;
    const svgIconRenovated = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style="color:green; vertical-align:middle; margin-right:5px;"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0m-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/></svg>`;


    // --- UI & Basic Setup (Assume createUI, getApiKey from previous) ---
    function createUI() { /* ... (Full createUI from previous) ... */
        controlPanel = document.createElement('div'); controlPanel.id = 'tm-renovision-panel-zl-ak'; // Unique ID
        document.body.appendChild(controlPanel);
        GM_addStyle(`
            #tm-renovision-panel-zl-ak { position: fixed; top: 10px; left: 10px; width: 600px; max-width: 95vw; max-height: 95vh; background: #fff; border: 2px solid #007bff; border-radius: 8px; padding: 15px; z-index: 10001; overflow-y: auto; font-family: Arial, sans-serif; font-size: 13px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
            /* ... (rest of your CSS from previous full script, ensure IDs match) ... */
             #tm-renovision-panel-zl-ak h2 { margin-top: 0; color: #007bff; font-size: 18px; }
            #tm-renovision-panel-zl-ak button { background-color: #007bff; color: white; border: none; padding: 8px 12px; margin-right:5px; border-radius: 4px; cursor: pointer; font-size: 13px; }
            #tm-renovision-panel-zl-ak button:hover { background-color: #0056b3; }
            #tm-renovision-panel-zl-ak button:disabled { background-color: #ccc; cursor: not-allowed; }
            #tm-gmaps-map-renovision-zl-ak { width: 100%; height: 200px; margin: 10px 0; border: 1px solid #ccc; }
            .results-table-zl-ak { width: 100%; margin-top: 10px; border-collapse: collapse; table-layout: fixed; }
            .results-table-zl-ak th, .results-table-zl-ak td { border: 1px solid #ddd; padding: 6px; text-align: left; font-size: 12px; vertical-align: top; word-break: break-word; }
            .results-table-zl-ak th { background-color: #f2f2f2; }
            .results-table-zl-ak img { width: 100px; height: auto; max-height:75px; object-fit: contain; display:block; margin-bottom:3px;}
            .result-row-zl-ak { cursor: pointer; } /* Renamed class */
            .result-row-zl-ak:hover { background-color: #f0f8ff; }
            #tm-log-renovision-zl-ak { margin-top: 10px; padding: 8px; border: 1px solid #eee; background-color: #f9f9f9; max-height: 150px; overflow-y: auto; font-family: monospace; white-space: pre-wrap; font-size: 0.8em; }
            #tm-summary-renovision-zl-ak { margin-top:10px; padding:8px; background-color: #e9ecef; border-radius:4px; }
            .dialog-overlay-zl-ak { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 10002; }
            .dialog-box-zl-ak { background-color: white; padding: 20px; border-radius: 8px; box-shadow: 0 0 15px rgba(0,0,0,0.3); text-align: center; min-width: 300px; max-width: 90vw; }
            .dialog-box-zl-ak p { margin-bottom: 15px; white-space: pre-wrap; text-align: left;}
            .dialog-box-zl-ak button { margin: 0 5px; }
        `);
        controlPanel.innerHTML = `
            <h2>Adaptive Renovision (ZLudany)</h2>
            <button id="tm-renovision-start-zl-ak">Start Analysis</button>
            <button id="tm-renovision-clear-key-zl-ak">Clear API Key</button>
            <button id="tm-renovision-clear-db-zl-ak">Clear IndexedDB Cache</button>
            <div id="tm-gmaps-map-renovision-zl-ak"></div>
            <h3>Results:</h3>
            <table class="results-table-zl-ak">
                <thead><tr>
                    <th>${svgIconUnrenovated} Most Unrenovated (Top 4)</th>
                    <th>${svgIconRenovated} Most Renovated (Top 4)</th>
                </tr></thead>
                <tbody> <tr> <td id="tm-results-unrenovated-cell-zl-ak"></td> <td id="tm-results-renovated-cell-zl-ak"></td> </tr> </tbody>
            </table>
            <p style="font-size:11px; text-align:center; margin-top:5px;">Double-click a building row to provide feedback.</p>
            <div id="tm-summary-renovision-zl-ak">Summary will appear here.</div>
            <div id="tm-log-renovision-zl-ak">Logs will appear here...</div>
        `;
        startButton = document.getElementById('tm-renovision-start-zl-ak');
        mapDiv = document.getElementById('tm-gmaps-map-renovision-zl-ak');
        resultsTableUnrenovatedCell = document.getElementById('tm-results-unrenovated-cell-zl-ak');
        resultsTableRenovatedCell = document.getElementById('tm-results-renovated-cell-zl-ak');
        summaryDiv = document.getElementById('tm-summary-renovision-zl-ak');
        logDivUiElement = document.getElementById('tm-log-renovision-zl-ak');

        logger.setUiLogElement(logDivUiElement);

        startButton.onclick = mainAnalysisWorkflow;
        document.getElementById('tm-renovision-clear-key-zl-ak').onclick = () => { GM_setValue('googleMapsApiKey_RenovisionZL_AK', ''); API_KEY = ''; logger.info('API Key cleared.'); alert('API Key cleared.'); };
        document.getElementById('tm-renovision-clear-db-zl-ak').onclick = clearIndexedDB;
        logger.info("UI Created for Adaptive/kNN Mode.");
    }


    // --- IndexedDB Utilities (schema might need embedding field) ---
    function setupDB() {
        logger.debug("New Promise: Setup IndexedDB", DB_NAME, "v" + DB_VERSION);
        return new Promise((resolve, reject) => {
            logger.debug("Setting up IndexedDB:", DB_NAME, "v" + DB_VERSION);
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = (event) => { logger.error("IndexedDB error:", event.target.errorCode, event); reject("IndexedDB error: " + event.target.errorCode);};
            request.onsuccess = (event) => { db = event.target.result; logger.info("IndexedDB setup successful."); resolve(db); };
            request.onupgradeneeded = (event) => {
                logger.info("IndexedDB upgrade needed for", DB_NAME);
                db = event.target.result;
                const transaction = event.target.transaction;
                let store;
                if (!db.objectStoreNames.contains(BUILDING_STORE_NAME)) {
                    logger.info("Creating object store:", BUILDING_STORE_NAME);
                    store = db.createObjectStore(BUILDING_STORE_NAME, { keyPath: 'addressQueryString' });
                } else {
                    logger.debug("Object store", BUILDING_STORE_NAME, "already exists. Accessing for potential index creation.");
                    store = transaction.objectStore(BUILDING_STORE_NAME);
                }
                // Example: Add index for userVerifiedStatus if needed for efficient querying
                if (store && !store.indexNames.contains('userVerifiedStatus')) {
                    logger.info("Creating index 'userVerifiedStatus' on store", BUILDING_STORE_NAME);
                    store.createIndex('userVerifiedStatus', 'userVerifiedStatus', { unique: false });
                }
                 if (store && !store.indexNames.contains('lastUpdated')) { // For querying recent embeddings
                    logger.info("Creating index 'lastUpdated' on store", BUILDING_STORE_NAME);
                    store.createIndex('lastUpdated', 'lastUpdated', { unique: false });
                }
            };
        });
    }
    async function getBuildingData(addressQueryString) { /* ... (Full function from previous) ... */
        logger.debug("New Promise: Get Building Data", addressQueryString);
        return new Promise((resolve, reject) => {
            if (!db) { logger.warn("DB not initialized for getBuildingData"); reject("DB not initialized"); return; }
            try {
                const transaction = db.transaction([BUILDING_STORE_NAME], 'readonly');
                const store = transaction.objectStore(BUILDING_STORE_NAME);
                const request = store.get(addressQueryString);
                request.onsuccess = (event) => { logger.debug("Retrieved building data for:", addressQueryString, event.target.result ? "(Found)" : "(Not Found)"); resolve(event.target.result); };
                request.onerror = (event) => { logger.error("Error getting building data from DB:", event.target.errorCode, event); reject(event.target.errorCode);};
            } catch (e) { logger.error("Exception in getBuildingData:", e); reject(e); }
        });
    }
    async function saveBuildingData(buildingData) { /* ... (Full function from previous, ensure lastUpdated is set) ... */
        logger.debug("New Promise: Save Building Data", buildingData.addressQueryString);
        buildingData.lastUpdated = new Date().toISOString(); // Add/update timestamp
        return new Promise((resolve, reject) => {
            if (!db) { logger.warn("DB not initialized for saveBuildingData"); reject("DB not initialized"); return; }
            try {
                const transaction = db.transaction([BUILDING_STORE_NAME], 'readwrite');
                const store = transaction.objectStore(BUILDING_STORE_NAME);
                const request = store.put(buildingData);
                request.onsuccess = () => { logger.debug("Saved building data for:", buildingData.addressQueryString); resolve(); };
                request.onerror = (event) => { logger.error("Error saving building data to DB:", event.target.errorCode, event); reject(event.target.errorCode);};
            } catch (e) { logger.error("Exception in saveBuildingData:", e); reject(e); }
        });
    }
    async function clearIndexedDB() { /* ... (Full function from previous) ... */
        logger.info("Attempting to clear IndexedDB:", DB_NAME);
        if (db) { logger.debug("Closing existing DB connection before deletion."); try { db.close(); } catch(e) { logger.warn("Error closing DB, might already be closed or invalid:", e); } db = null; }
        logger.debug("New Promise: Delete IndexedDB", DB_NAME);
        return new Promise((resolve, reject) => {
            const req = indexedDB.deleteDatabase(DB_NAME);
            req.onsuccess = () => { logger.info("IndexedDB cache cleared successfully."); alert("IndexedDB cache cleared."); resolve(); };
            req.onerror = (e) => { logger.error("Error clearing IndexedDB:", e.target.errorCode, e); alert("Error clearing IndexedDB."); reject(e);};
            req.onblocked = (e) => { logger.warn("Clearing IndexedDB blocked (close other tabs using this DB).", e); alert("Clearing IndexedDB blocked. Please close other tabs that might be using it and try again."); reject(e);};
        });
    }
    async function getVerifiedEmbeddings(limit = MAX_EMBEDDINGS_FOR_KNN_QUERY) {
        logger.debug("New Promise: Get Verified Embeddings from DB, limit:", limit);
        return new Promise((resolve, reject) => {
            if (!db) { logger.warn("DB not initialized for getVerifiedEmbeddings"); reject([]); return; }
            const embeddings = [];
            const transaction = db.transaction([BUILDING_STORE_NAME], "readonly");
            const store = transaction.objectStore(BUILDING_STORE_NAME);
            // To get most recent, we'd ideally use an index on lastUpdated and iterate with a cursor in reverse
            // For simplicity here, we get all and sort/slice, which is less efficient for large DBs
            const request = store.getAll();

            request.onsuccess = () => {
                const allRecords = request.result || [];
                const verifiedRecords = allRecords
                    .filter(record => record.userVerifiedStatus && record.embedding && record.lastUpdated)
                    .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()) // Sort by most recent
                    .slice(0, limit); // Take the most recent N

                logger.info(`Retrieved ${verifiedRecords.length} (up to ${limit}) verified embeddings for k-NN.`);
                resolve(verifiedRecords.map(r => ({
                    embedding: r.embedding, // This should be an array of numbers
                    status: r.userVerifiedStatus, // 'renovated' or 'unrenovated'
                    addressQueryString: r.addressQueryString
                })));
            };
            request.onerror = (event) => {
                logger.error("Error fetching embeddings from DB:", event.target.errorCode);
                reject([]);
            };
        });
    }


    // --- Web Worker Setup (Worker code string is same, it just produces embeddings) ---
    function createSimilarityWorker() { /* ... (Full function from previous "entire" script, ensure _W.d etc. are used for Promise logs too) ... */
        logger.debug("Creating Similarity Web Worker.");
        const workerTFJSUrl = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@latest/dist/tf.min.js';
        const workerCode = `
            // ... (Worker's LogLevel, workerLog, _W alias, tf, model vars from previous full script) ...
            const LogLevel = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, NONE: 4 };
            let workerConfig = { level: LogLevel.INFO, logToMainThread: true };
            function workerLog(level, levelStr, messages) { if (level < workerConfig.level) return; if (workerConfig.logToMainThread) { self.postMessage({ type: 'WORKER_LOG', payload: { level, levelStr, messages } }); } else { /* ... */ } }
            const _W = { d: (...m) => workerLog(LogLevel.DEBUG, 'DEBUG', m), i: (...m) => workerLog(LogLevel.INFO,  'INFO',  m), w: (...m) => workerLog(LogLevel.WARN,  'WARN',  m), e: (...m) => workerLog(LogLevel.ERROR, 'ERROR', m) };
            let tf; let model;
            const TF_MODEL_INPUT_WIDTH_W = ${TF_MODEL_INPUT_WIDTH};
            const TF_MODEL_INPUT_HEIGHT_W = ${TF_MODEL_INPUT_HEIGHT};
            const TF_MODEL_INPUT_CHANNELS_W = ${TF_MODEL_INPUT_CHANNELS};

            self.onmessage = async (e) => {
                _W.d("Worker: Message received", e.data.type);
                const { type, payload } = e.data;
                if (type === 'INIT_TF_AND_CONFIG') { /* ... (from previous, using _W.debug for promises if any internally) ... */
                    workerConfig = payload.logConfig;
                     _W.debug('Worker: Received INIT_TF_AND_CONFIG. TFJS URL:', payload.tfjsUrl, 'Log Cfg:', workerConfig);
                    try {
                        importScripts(payload.tfjsUrl);
                        tf = self.tf;
                        if (tf) { initModel(); _W.info('Worker: TF.js initialized. Model setup.'); self.postMessage({ type: 'TF_READY' }); }
                        else { _W.e('Worker: TF.js script loaded but tf object not found.'); self.postMessage({ type: 'TF_LOAD_ERROR', message: 'tf object not found' }); }
                    } catch (err) { _W.e('Worker: Error importing/init TF.js:', err.message, err.stack); self.postMessage({ type: 'TF_LOAD_ERROR', message: err.message }); }
                    return;
                }
                if (type === 'PROCESS_IMAGES') { // This now primarily generates embeddings and base pair similarity
                    _W.info('Worker: Received PROCESS_IMAGES with', payload.imagesToProcess.length, 'target images.');
                    if (!model) { _W.e('Worker: Model not initialized.'); self.postMessage({ type: 'ERROR', message: 'Model not initialized.' }); return; }

                    const { imagesToProcess, basePairImageData } = payload;
                    try {
                        _W.debug("Worker: PROCESS_IMAGES - Base pair count:", basePairImageData.length, "Target count:", imagesToProcess.length);
                        const allImageDataObjects = [...basePairImageData.map(img => img.imageData), ...imagesToProcess.map(img => img.imageData)];
                        _W.debug('Worker: Total images for embedding:', allImageDataObjects.length);

                        const allEmbeddingsTensor = await getEmbeddingsForImages(allImageDataObjects); // Returns array of Tensors
                        _W.debug('Worker: Embeddings (tensor) generated count:', allEmbeddingsTensor.length);

                        // Convert tensors to arrays for sending back and IndexedDB storage
                        const allEmbeddingsArray = [];
                        for (const embTensor of allEmbeddingsTensor) {
                            if (embTensor) {
                                allEmbeddingsArray.push(Array.from(await embTensor.data())); // Convert tensor to JS array
                                tf.dispose(embTensor); // Dispose tensor after getting data
                            } else { allEmbeddingsArray.push(null); }
                        }
                        _W.debug('Worker: Embeddings (array) count:', allEmbeddingsArray.length);


                        let actualBasePairSimilarityCalc = 0;
                        const baseEmbedding1Arr = allEmbeddingsArray[0];
                        const baseEmbedding2Arr = allEmbeddingsArray[1];

                        if (baseEmbedding1Arr && baseEmbedding2Arr) {
                            _W.debug("Worker: Calculating actual base pair similarity from arrays.");
                            actualBasePairSimilarityCalc = cosineSimilarity(baseEmbedding1Arr, baseEmbedding2Arr);
                        } else { _W.warn("Worker: One or both base embeddings (array) are null/undefined for base pair similarity calc."); }
                        _W.info('Worker: Actual Base Pair Similarity (from arrays):', actualBasePairSimilarityCalc);


                        const imageResultsWithEmbeddings = imagesToProcess.map((imgInfo, index) => {
                            const embeddingArr = allEmbeddingsArray[index + basePairImageData.length]; // Adjust index
                            return {
                                id: imgInfo.id,
                                addressQueryString: imgInfo.addressQueryString,
                                embedding: embeddingArr, // Send the array
                                // Similarities to base pair will be calculated in main thread using these embeddings if needed, or can be done here too
                                similarityToBase1: embeddingArr && baseEmbedding1Arr ? cosineSimilarity(embeddingArr, baseEmbedding1Arr) : 0,
                                similarityToBase2: embeddingArr && baseEmbedding2Arr ? cosineSimilarity(embeddingArr, baseEmbedding2Arr) : 0,
                            };
                        });

                        _W.info('Worker: Finished processing images. Sending embeddings and base pair sim.');
                        self.postMessage({
                            type: 'EMBEDDINGS_RESULTS', // New message type
                            results: imageResultsWithEmbeddings,
                            basePairEmbeddings: [baseEmbedding1Arr, baseEmbedding2Arr].filter(e => e), // Send base embeddings too
                            actualBasePairSimilarity: actualBasePairSimilarityCalc
                        });

                    } catch (error) { _W.e('[Worker] Error processing images:', error.message, error.stack); self.postMessage({ type: 'ERROR', message: 'Error in worker processing: ' + error.message });}
                } else { _W.w("Worker: Unknown message type received:", type); }
            };
            function initModel() { /* ... (Same TFJS model definition from previous full script) ... */ _W.debug("Worker: initModel called"); model = tf.sequential(); model.add(tf.layers.conv2d({ inputShape: [TF_MODEL_INPUT_HEIGHT_W, TF_MODEL_INPUT_WIDTH_W, TF_MODEL_INPUT_CHANNELS_W], filters: 8, kernelSize: 3, activation: 'relu', padding: 'same' })); model.add(tf.layers.maxPooling2d({ poolSize: 2, strides: 2 })); model.add(tf.layers.conv2d({ filters: 16, kernelSize: 3, activation: 'relu', padding: 'same' })); model.add(tf.layers.maxPooling2d({ poolSize: 2, strides: 2 })); model.add(tf.layers.flatten()); model.add(tf.layers.dense({ units: 64, activation: 'relu' })); _W.info("Worker: TFJS Model Initialized."); }
            async function imageToSensor(imageDataObject) { /* ... (Same image preprocessing to tensor from previous full script, using _W.debug ) ... */ _W.debug("Worker: imageToSensor called"); if (!imageDataObject || !imageDataObject.data) { _W.warn("Worker: imageToSensor received invalid imageDataObject"); return null; } return tf.tidy(() => { const { data, width, height } = imageDataObject; if (width === 0 || height === 0) { _W.warn("Worker: imageToSensor received zero dim image"); return null; } const numPixels = width * height; const expectedLength = numPixels * 4; if (data.length !== expectedLength) { _W.warn("Worker: imageToSensor data length mismatch. Expected", expectedLength, "got", data.length); return null; } let tensor = tf.tensor3d(data, [height, width, 4], 'int32'); tensor = tensor.slice([0, 0, 0], [height, width, 3]); let resized = tf.image.resizeBilinear(tensor, [TF_MODEL_INPUT_HEIGHT_W, TF_MODEL_INPUT_WIDTH_W]); let grayscaled = resized.mean(2).toFloat().expandDims(-1); const normalized = grayscaled.div(255.0); tf.dispose([tensor, resized, grayscaled]); return normalized; }); }
            async function getEmbeddingsForImages(imageDataArray) { /* ... (Same getEmbeddings from previous, returns array of Tensors, using _W.debug) ... */ _W.debug("Worker: getEmbeddingsForImages called for", imageDataArray.length, "images"); const embeddings = []; for (const imageData of imageDataArray) { const tensor = await imageToSensor(imageData); if (!tensor) { embeddings.push(null); _W.warn("Worker: null tensor from imageToSensor, pushing null embedding."); continue; } try { const embedding = model.predict(tensor.expandDims(0)); embeddings.push(embedding); } catch (e) { _W.error("Worker: Error during model.predict:", e.message); embeddings.push(null); } finally { tf.dispose(tensor);}} return embeddings;}
            function cosineSimilarity(vecA, vecB) { // Helper for array based cosine similarity
                if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
                let dotProduct = 0; let normA = 0; let normB = 0;
                for (let i = 0; i < vecA.length; i++) {
                    dotProduct += vecA[i] * vecB[i];
                    normA += vecA[i] * vecA[i];
                    normB += vecB[i] * vecB[i];
                }
                normA = Math.sqrt(normA); normB = Math.sqrt(normB);
                if (normA === 0 || normB === 0) return 0;
                return dotProduct / (normA * normB);
            }
        `;
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const worker = new Worker(URL.createObjectURL(blob));
        worker.addEventListener('message', (e) => { if (e.data.type === 'WORKER_LOG') { logger.relayWorkerLog(e.data.payload.level, e.data.payload.levelStr, e.data.payload.messages); }});
        logger.info("Similarity Web Worker created (Adaptive/kNN version).");
        return worker;
    }


    // --- Main Analysis Workflow (MODIFIED to handle new worker results and k-NN) ---
    async function mainAnalysisWorkflow() {
        // ... (Initial setup: disable button, clear UI, get API_KEY, setupDB, init worker from previous)
        if (startButton.disabled) { logger.warn("Analysis already in progress."); return; }
        startButton.disabled = true; startButton.textContent = 'Processing...';
        logger.info('Starting analysis workflow (Adaptive/kNN)...');
        resultsTableUnrenovatedCell.innerHTML = 'Processing...'; resultsTableRenovatedCell.innerHTML = 'Processing...';
        summaryDiv.textContent = 'Processing...'; currentAnalysisResults = [];

        if (!API_KEY || API_KEY === 'YOUR_GOOGLE_MAPS_API_KEY_PLACEHOLDER') { /* ... API Key check ... */ logger.error("API Key is not set or is placeholder."); alert("A valid Google Maps API Key is required."); startButton.disabled = false; startButton.textContent = 'Start Analysis'; return; }
        if (!db) { try { await setupDB(); } catch (e) { logger.error("DB Setup failed:", e); startButton.disabled = false; startButton.textContent = 'Start Analysis'; return; } }

        if (!similarityWorker) {
             try { similarityWorker = createSimilarityWorker(); } catch(e) { logger.error("Failed to create similarity worker:", e); startButton.disabled = false; startButton.textContent = 'Start Analysis'; return; }
        }
        logger.debug("Posting INIT_TF_AND_CONFIG to worker.");
        similarityWorker.postMessage({ type: 'INIT_TF_AND_CONFIG', payload: { tfjsUrl: 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@latest/dist/tf.min.js', logConfig: WORKER_LOG_CONFIG } });

        logger.debug("New Promise: Waiting for TF_READY from worker");
        const tfReady = await new Promise((resolve) => { /* ... (from previous, with specific listener removal) ... */
            const tempTfReadyListener = (e) => {
                if (e.data.type === 'TF_READY') { logger.info("TF_READY received from worker."); similarityWorker.removeEventListener('message', tempTfReadyListener); resolve(true); }
                else if (e.data.type === 'TF_LOAD_ERROR') { logger.error("TF_LOAD_ERROR from worker:", e.data.message); similarityWorker.removeEventListener('message', tempTfReadyListener); resolve(false); }
                // WORKER_LOG is handled by the persistent listener
            };
            similarityWorker.addEventListener('message', tempTfReadyListener);
        });


        if (!tfReady) { logger.error("TF.js worker setup failed. Aborting analysis."); startButton.disabled = false; startButton.textContent = 'Start Analysis'; return; }
        logger.info("TF.js ready in Web Worker.");

        logger.info("Processing base pair images for main thread...");
        basePairData = [null, null];
        for (let i = 0; i < BASE_PAIR_ADDRESSES.length; i++) {
            const address = BASE_PAIR_ADDRESSES[i];
            const imageDataResult = await getImageDataForAddress(address, `base_${i}`);
            if (!imageDataResult || !imageDataResult.imageData) { logger.error(`Failed to get image data for base building: ${address}`); startButton.disabled = false; startButton.textContent = 'Start Analysis'; return; }
            basePairData[i] = { ...imageDataResult, id: `base_${i}` }; // Will get embedding later
        }
        if (!basePairData[0] || !basePairData[1]) { logger.error("Failed to load one or both base pair images."); startButton.disabled = false; startButton.textContent = 'Start Analysis'; return;}
        logger.info("Base pair image data (metadata) prepared.");

        logger.info("Fetching target street section images...");
        const targetStreetImageData = await fetchImagesForStreetSection(TARGET_STREET_START_ADDRESS, TARGET_STREET_END_ADDRESS);
        if (!targetStreetImageData || targetStreetImageData.length === 0) { logger.warn("No images found for target street."); startButton.disabled = false; startButton.textContent = 'Start Analysis'; return; }
        logger.info(`Fetched ${targetStreetImageData.length} images for target street.`);

        const imagesToProcessForWorker = targetStreetImageData.map((imgData, index) => ({
            id: imgData.addressQueryString || `target_${index}_${Date.now()}`,
            addressQueryString: imgData.addressQueryString,
            imageData: imgData.imageData, // This is {data, width, height}
        }));
        const basePairImageDataForWorker = basePairData.map(bp => ({
            id: bp.id, addressQueryString: bp.addressQueryString, imageData: bp.imageData
        }));


        logger.info(`Sending ${imagesToProcessForWorker.length} target images and ${basePairImageDataForWorker.length} base images to Web Worker for embeddings...`);
        similarityWorker.postMessage({ type: 'PROCESS_IMAGES', payload: { imagesToProcess: imagesToProcessForWorker, basePairImageData: basePairImageDataForWorker } });

        logger.debug("New Promise: Waiting for EMBEDDINGS_RESULTS from worker");
        const workerEmbeddingsPayload = await new Promise((resolve, reject) => {
             const embeddingsResultListener = (e) => {
                if (e.data.type === 'EMBEDDINGS_RESULTS') {
                    logger.info("EMBEDDINGS_RESULTS received from worker.");
                    similarityWorker.removeEventListener('message', embeddingsResultListener);
                    resolve(e.data);
                } else if (e.data.type === 'ERROR' && (e.data.message?.includes("worker processing") || e.data.message?.includes("Model not initialized"))) {
                    logger.error("ERROR (worker processing embeddings) from worker:", e.data.message);
                    similarityWorker.removeEventListener('message', embeddingsResultListener);
                    reject(new Error(e.data.message));
                }
            };
            similarityWorker.addEventListener('message', embeddingsResultListener);
        }).catch(err => { logger.error("Promise for worker EMBEDDINGS_RESULTS was rejected:", err); return null; });

        if (!workerEmbeddingsPayload || !workerEmbeddingsPayload.results) {
            logger.error("No embeddings results or error from worker.");
            startButton.disabled = false; startButton.textContent = 'Start Analysis'; return;
        }

        logger.info("Received embeddings results from worker. Processing...");
        actualBasePairSimilarity = workerEmbeddingsPayload.actualBasePairSimilarity; // This is now calculated in worker
        logger.info(`Actual similarity between base pair images (calc in worker): ${actualBasePairSimilarity != null ? actualBasePairSimilarity.toFixed(4) : 'N/A'}`);

        // Store base pair embeddings
        if (workerEmbeddingsPayload.basePairEmbeddings && workerEmbeddingsPayload.basePairEmbeddings.length === 2) {
            basePairData[0].embedding = workerEmbeddingsPayload.basePairEmbeddings[0]; // Store as array
            basePairData[1].embedding = workerEmbeddingsPayload.basePairEmbeddings[1];
            await saveBuildingData(basePairData[0]); // Save with embedding
            await saveBuildingData(basePairData[1]);
            logger.debug("Base pair embeddings stored in basePairData and DB.");
        } else {
            logger.warn("Worker did not return complete base pair embeddings.");
        }

        // Now workerResultsList contains { id, addressQueryString, embedding (array), similarityToBase1, similarityToBase2 }
        await processAndDisplayResultsWithKNN(workerEmbeddingsPayload.results, targetStreetImageData);

        startButton.disabled = false; startButton.textContent = 'Start Analysis';
    }


    // --- Result Processing with k-NN and Adaptive Logic ---
    async function processAndDisplayResultsWithKNN(workerImageResults, originalTargetStreetMeta) {
        logger.info(`Processing ${workerImageResults.length} image results with k-NN and adaptive logic.`);
        currentAnalysisResults = [];
        const today = new Date();
        const todayISO = today.toISOString().slice(0, 10).replace(/-/g, '/');

        const verifiedEmbeddingsForKNN = await getVerifiedEmbeddings(); // Fetch user-verified embeddings for k-NN

        for (const imgResultFromWorker of workerImageResults) {
            if (!imgResultFromWorker.embedding) {
                logger.warn("Skipping image due to missing embedding from worker:", imgResultFromWorker.addressQueryString || imgResultFromWorker.id);
                continue;
            }
            const currentEmbedding = imgResultFromWorker.embedding; // This is an array

            // Find original metadata
            const originalImgMeta = originalTargetStreetMeta.find(meta =>
                meta.addressQueryString === imgResultFromWorker.addressQueryString || meta.id === imgResultFromWorker.id
            );

            let buildingRecord = await getBuildingData(imgResultFromWorker.addressQueryString);
            if (!buildingRecord) {
                buildingRecord = {
                    addressQueryString: imgResultFromWorker.addressQueryString,
                    loc: originalImgMeta ? originalImgMeta.loc : null,
                    comparisons: [], userVerifiedStatus: null, userFeedbackDate: null
                };
            }
            buildingRecord.embedding = currentEmbedding; // Store/update embedding
            buildingRecord.modelSignature = MODEL_SIGNATURE; // Associate embedding with model version

            // 1. Calculate Model Score (based on similarity to base pair)
            const avgSimilarityToBase = (imgResultFromWorker.similarityToBase1 + imgResultFromWorker.similarityToBase2) / 2.0;
            let modelUnrenovatedScore = (actualBasePairSimilarity != null && !isNaN(actualBasePairSimilarity))
                                      ? (1.0 - Math.abs(actualBasePairSimilarity - avgSimilarityToBase))
                                      : 0.5; // Default to neutral if base sim is off
            modelUnrenovatedScore = Math.max(0, Math.min(1, modelUnrenovatedScore));
            logger.debug("Model Score for", imgResultFromWorker.addressQueryString, ":", modelUnrenovatedScore.toFixed(3));

            // 2. Perform k-NN Classification
            let kNNVerdict = null; // 'renovated', 'unrenovated', or null if not enough neighbors
            let kNNConfidence = 0;
            if (verifiedEmbeddingsForKNN.length >= K_NEAREST_NEIGHBORS) {
                const neighbors = findKNearestNeighbors(currentEmbedding, verifiedEmbeddingsForKNN, K_NEAREST_NEIGHBORS);
                if (neighbors.length > 0) {
                    let renovatedVotes = 0; let unrenovatedVotes = 0;
                    neighbors.forEach(n => {
                        if (n.status === 'renovated') renovatedVotes++;
                        else if (n.status === 'unrenovated') unrenovatedVotes++;
                    });
                    if (renovatedVotes > unrenovatedVotes) kNNVerdict = 'renovated';
                    else if (unrenovatedVotes > renovatedVotes) kNNVerdict = 'unrenovated';
                    kNNConfidence = Math.max(renovatedVotes, unrenovatedVotes) / K_NEAREST_NEIGHBORS;
                    logger.debug("k-NN for", imgResultFromWorker.addressQueryString, ":", kNNVerdict, "Conf:", kNNConfidence.toFixed(2), "Neighbors:", neighbors.map(n=>n.status));
                } else { logger.debug("k-NN: No neighbors found for", imgResultFromWorker.addressQueryString); }
            } else { logger.debug("k-NN: Not enough verified embeddings in DB for k-NN (need", K_NEAREST_NEIGHBORS, "have", verifiedEmbeddingsForKNN.length, ")"); }


            // 3. Combine Scores & Apply User Override
            let finalUnrenovatedScore = modelUnrenovatedScore;
            let statusSource = `Model (SimToBase: ${avgSimilarityToBase.toFixed(2)})`;

            if (kNNVerdict) {
                const kNNScore = kNNVerdict === 'unrenovated' ? (0.5 + 0.5 * kNNConfidence) : (0.5 - 0.5 * kNNConfidence);
                // Weighted average: e.g., 30% model, 70% kNN if kNN is confident
                if (kNNConfidence > 0.6) { // Only use kNN if somewhat confident
                    finalUnrenovatedScore = (0.3 * modelUnrenovatedScore) + (0.7 * kNNScore);
                    statusSource = `k-NN (Conf: ${kNNConfidence.toFixed(2)})`;
                }
                 logger.debug("k-NN influenced score for", imgResultFromWorker.addressQueryString, "to", finalUnrenovatedScore.toFixed(3));
            }

            // User override has highest precedence
            if (buildingRecord.userVerifiedStatus && buildingRecord.userFeedbackDate) {
                const feedbackDate = new Date(buildingRecord.userFeedbackDate);
                const diffDays = (today.getTime() - feedbackDate.getTime()) / (1000 * 3600 * 24);
                if (diffDays <= USER_FEEDBACK_VALIDITY_DAYS) {
                    finalUnrenovatedScore = buildingRecord.userVerifiedStatus === 'unrenovated' ? 0.95 : 0.05;
                    statusSource = "User";
                    logger.debug("User feedback applied for", imgResultFromWorker.addressQueryString, "Final score:", finalUnrenovatedScore);
                } else { logger.debug("User feedback expired for", imgResultFromWorker.addressQueryString); }
            }
            finalUnrenovatedScore = Math.max(0, Math.min(1, finalUnrenovatedScore)); // Clamp

            // Save building record with embedding and potentially updated user feedback fields
            try { await saveBuildingData(buildingRecord); }
            catch(e) { logger.error("Failed to save building record for", imgResultFromWorker.addressQueryString, "during kNN processing:", e); }

            currentAnalysisResults.push({
                id: imgResultFromWorker.id,
                addressQueryString: imgResultFromWorker.addressQueryString,
                embedding: currentEmbedding, // Store for potential future k-NN use
                modelUnrenovatedScore,
                kNNVerdict, kNNConfidence,
                unrenovatedScore: finalUnrenovatedScore,
                statusSource,
                originalImageUrl: originalImgMeta ? originalImgMeta.streetViewImageUrl : 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
                houseNumber: originalImgMeta ? originalImgMeta.houseNumber : (imgResultFromWorker.addressQueryString && imgResultFromWorker.addressQueryString.startsWith("Approx_") ? "Approx." : null)
            });
        }
        redrawResultTables();
        updateSummary();
        logger.info("Display updated with k-NN and adaptive results.");
    }

    function cosineSimilarity(vecA, vecB) { // Expects arrays
        if (!vecA || !vecB || vecA.length !== vecB.length) { logger.warn("cosineSimilarity: Invalid vectors provided.", vecA, vecB); return 0; }
        let dotProduct = 0; let normA = 0; let normB = 0;
        for (let i = 0; i < vecA.length; i++) {
            dotProduct += (vecA[i] || 0) * (vecB[i] || 0); // Handle potential NaN/undefined in embedding
            normA += (vecA[i] || 0) * (vecA[i] || 0);
            normB += (vecB[i] || 0) * (vecB[i] || 0);
        }
        normA = Math.sqrt(normA); normB = Math.sqrt(normB);
        if (normA === 0 || normB === 0) return 0;
        const similarity = dotProduct / (normA * normB);
        return isNaN(similarity) ? 0 : similarity;
    }

    function findKNearestNeighbors(targetEmbedding, candidateEmbeddings, k) {
        logger.debug("New Promise: findKNearestNeighbors. Target emb length:", targetEmbedding?.length, "Candidates:", candidateEmbeddings.length, "k:", k);
        if (!targetEmbedding || candidateEmbeddings.length === 0) return [];

        const distances = candidateEmbeddings.map(candidate => {
            // Cosine distance = 1 - cosine similarity
            const similarity = cosineSimilarity(targetEmbedding, candidate.embedding);
            return {
                ...candidate, // addressQueryString, status
                distance: 1 - similarity // Lower distance is more similar
            };
        });

        distances.sort((a, b) => a.distance - b.distance); // Sort by distance (ascending)
        return distances.slice(0, k);
    }


    // --- User Feedback Handling (MODIFIED to update embedding in DB if needed) ---
    async function handleResultRowDoubleClick(event) {
        // ... (Same dialog logic as before)
        // When user confirms:
        // ...
        logger.debug("New Promise: Handle Result Row Double Click");
        const rowElement = event.currentTarget;
        const addressQueryString = rowElement.dataset.addressQueryString;
        logger.debug("Handling double click for address:", addressQueryString);
        const item = currentAnalysisResults.find(r => r.addressQueryString === addressQueryString);
        if (!item) { logger.warn("Could not find item for feedback based on dblclick:", addressQueryString); return; }

        const currentStatus = item.unrenovatedScore >= 0.5 ? 'unrenovated' : 'renovated';
        const oppositeStatus = currentStatus === 'unrenovated' ? 'renovated' : 'unrenovated';
        const displayText = item.houseNumber || item.addressQueryString;

        const userConfirmed = await showConfirmationDialog(
            `Building: "${displayText}"\nCurrent status: ${currentStatus} (Score: ${item.unrenovatedScore.toFixed(3)}, Source: ${item.statusSource})\n\nChange status to ${oppositeStatus}?`
        );

        if (userConfirmed) {
            logger.info(`User feedback: Marking "${addressQueryString}" as ${oppositeStatus}.`);
            item.unrenovatedScore = oppositeStatus === 'unrenovated' ? 0.95 : 0.05;
            item.statusSource = "User";

            let buildingRecord = await getBuildingData(addressQueryString);
            if (!buildingRecord) { // Should usually exist by now
                logger.warn("Building record not found in DB for user feedback, creating new for:", addressQueryString);
                buildingRecord = { addressQueryString: addressQueryString, comparisons: [] };
            }
            buildingRecord.userVerifiedStatus = oppositeStatus;
            buildingRecord.userFeedbackDate = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
            if (item.embedding && !buildingRecord.embedding) { // If item has embedding but DB record doesn't
                buildingRecord.embedding = item.embedding;
                buildingRecord.modelSignature = MODEL_SIGNATURE; // Store which model generated this embedding
                logger.debug("Saving embedding to DB with user feedback for", addressQueryString);
            }
            try { await saveBuildingData(buildingRecord); } catch(e) { logger.error("Failed to save user feedback to DB from dblclick:", e); }

            redrawResultTables();
            updateSummary();
        } else { logger.debug("User cancelled status change for:", addressQueryString); }
    }
    // ... (redrawResultTables, displayImageResults, updateSummary, showConfirmationDialog - full versions from previous)
    function redrawResultTables() { logger.debug("Redrawing result tables with", currentAnalysisResults.length, "items."); currentAnalysisResults.sort((a, b) => b.unrenovatedScore - a.unrenovatedScore); const topUnrenovated = currentAnalysisResults.filter(r => r.unrenovatedScore >= 0.5).slice(0, 4); const topRenovated = [...currentAnalysisResults].filter(r => r.unrenovatedScore < 0.5).sort((a, b) => a.unrenovatedScore - b.unrenovatedScore).slice(0, 4); displayImageResults(topUnrenovated, resultsTableUnrenovatedCell, "Unren. Score"); displayImageResults(topRenovated, resultsTableRenovatedCell, "Unren. Score");}
    function displayImageResults(resultsList, tableCellElement, scoreLabel) { logger.debug("Displaying image results for", scoreLabel, resultsList.length, "items."); tableCellElement.innerHTML = ''; if (resultsList.length === 0) { tableCellElement.textContent = "No buildings in this category."; return; } const listElement = document.createElement('ul'); listElement.style.listStyleType = 'none'; listElement.style.paddingLeft = '0'; resultsList.forEach(item => { const listItem = document.createElement('li'); listItem.className = 'result-row-zl-ak'; listItem.dataset.addressQueryString = item.addressQueryString; listItem.style.marginBottom = '5px'; listItem.style.padding = '3px'; listItem.style.border = '1px solid #eee'; const img = document.createElement('img'); img.src = item.originalImageUrl; listItem.appendChild(img); const textNode = document.createElement('span'); const displayText = item.houseNumber ? `HN: ${item.houseNumber}` : (item.addressQueryString ? item.addressQueryString.substring(0,20)+'...' : 'Unknown Address'); textNode.textContent = ` ${displayText} (${scoreLabel}: ${item.unrenovatedScore.toFixed(3)}) [${item.statusSource}]`; listItem.appendChild(textNode); listItem.addEventListener('dblclick', handleResultRowDoubleClick); listElement.appendChild(listItem); }); tableCellElement.appendChild(listElement);}
    function updateSummary() { logger.debug("Updating summary. Total items:", currentAnalysisResults.length); const totalBuildings = currentAnalysisResults.length; const unrenovatedCount = currentAnalysisResults.filter(r => r.unrenovatedScore >= 0.5).length; const renovatedCount = totalBuildings - unrenovatedCount; const unrenovatedPercent = totalBuildings > 0 ? (unrenovatedCount / totalBuildings * 100).toFixed(1) : 0; const renovatedPercent = totalBuildings > 0 ? (renovatedCount / totalBuildings * 100).toFixed(1) : 0; summaryDiv.innerHTML = `Total distinct views analyzed: ${totalBuildings}<br>Reference Base Pair Similarity: ${actualBasePairSimilarity != null ? actualBasePairSimilarity.toFixed(4) : 'N/A'}<br>Unrenovated (final score >= 0.5): ${unrenovatedCount} (${unrenovatedPercent}%)<br>Renovated (final score < 0.5): ${renovatedCount} (${renovatedPercent}%)`;}
    function showConfirmationDialog(message) { logger.debug("New Promise: Show Confirmation Dialog", message.substring(0,50) + "..."); return new Promise(resolve => { const overlayId = 'tm-dialog-overlay-zl-ak'; let existingOverlay = document.getElementById(overlayId); if(existingOverlay) existingOverlay.remove(); const overlay = document.createElement('div'); overlay.id = overlayId; overlay.className = 'dialog-overlay-zl-ak'; const dialog = document.createElement('div'); dialog.className = 'dialog-box-zl-ak'; dialog.innerHTML = `<p>${message}</p><button id="dialog-yes-zl-ak" style="background-color: #28a745;">Yes</button><button id="dialog-no-zl-ak" style="background-color: #dc3545;">No</button>`; overlay.appendChild(dialog); document.body.appendChild(overlay); const closeDialog = (val) => { logger.debug("Dialog choice:", val ? "Yes" : "No"); try { document.body.removeChild(overlay); } catch(e) { logger.warn("Error removing dialog overlay, may have already been removed:", e); } resolve(val); }; document.getElementById('dialog-yes-zl-ak').onclick = () => closeDialog(true); document.getElementById('dialog-no-zl-ak').onclick = () => closeDialog(false); });}


    // --- Script Initialization ---
    async function initScript() { /* ... (Full function from previous, ensure logger calls, unique Gmaps callback name) ... */
        logger.info("Initializing Renovision Script (ZLudany - Adaptive/kNN)...");
        createUI();
        await getApiKey();
        if (!API_KEY || API_KEY === 'YOUR_GOOGLE_MAPS_API_KEY_PLACEHOLDER') { logger.error("API Key required or placeholder not replaced. Script halted."); if(startButton) startButton.disabled = true; alert("Valid Google Maps API Key is required."); return; }

        logger.debug("New Promise: Initialize Google Maps API Script Load");
        return new Promise((resolve, reject) => {
            if (typeof window.google === 'object' && typeof window.google.maps === 'object') {
                logger.info("Google Maps API already loaded."); initializeGoogleMapsServices(); resolve();
            } else {
                window.tmRenovisionAdaptiveKNNInitMapZL = () => { initializeGoogleMapsServices(); resolve(); }; // Unique callback
                const script = document.createElement('script');
                script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=geometry,directions&callback=tmRenovisionAdaptiveKNNInitMapZL`;
                script.async = true; script.onerror = (e) => { logger.error("Failed to load Google Maps API script:", e); reject(new Error("Google Maps API script load failed.")); };
                document.head.appendChild(script); logger.info("Google Maps API script tag injected, awaiting callback.");
            }
        }).then(async () => { try { await setupDB(); } catch(e) { logger.error("Failed to setup IndexedDB on init:", e); }
        }).catch(err => { logger.error("Unhandled error during script initialization or Maps API load:", err); if(startButton) startButton.disabled = true; alert("A critical error occurred during script startup or Maps API load."); });
    }

    function initializeGoogleMapsServices() { /* ... (Full function from previous, with logger calls) ... */
        logger.info("Google Maps API loaded callback triggered. Initializing services...");
        try {
            map = new google.maps.Map(mapDiv, { center: { lat: 47.5086, lng: 19.0740 }, zoom: 16 });
            directionsService = new google.maps.DirectionsService(); streetViewService = new google.maps.StreetViewService(); geocoder = new google.maps.Geocoder();
            logger.info("Google Maps services successfully initialized.");
            if (startButton) { startButton.disabled = false; } else { logger.warn("Start button not found during Gmaps init."); }
        } catch (e) { logger.error("Error initializing Google Maps Services:", e); if(startButton) startButton.disabled = true; alert("Error initializing Google Maps. Check console and API key."); }
    }

    // --- Start the script ---
    initScript();

})();
