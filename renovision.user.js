// ==UserScript==
// @name         Advanced Renovision (ZLudany - individual featureset learning in a WorkerPool)
// @version      1.8
// @description  Multi-core TF.js with WorkerPool, advanced UI for reInforcement learning subjective features.
// @author       ZLudany
// @match        *://*.ingatlan.com/*
// @run-at       document-start
// ==/UserScript==

// --- Logger Class (Full class from previous version) ---
const LogLevel = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, NONE: 4 };
class Logger {
    constructor(componentName = 'UserScript', config = {}) { this.componentName = componentName; const defaultConfig = { level: LogLevel.INFO, logToConsole: true, logToUiElement: true, logToAlert: false, alertLogLevel: LogLevel.ERROR, enableWorkerLoggingRelay: true }; this.config = { ...defaultConfig, ...config }; this.logHistory = []; this.uiLogElement = null; }
    setConfig(newConfig) { this.config = { ...this.config, ...newConfig }; this.info(`Logger configuration updated for [${this.componentName}]`);}
    setUiLogElement(element) { if (element instanceof HTMLElement) { this.uiLogElement = element;} else { this.warn("Invalid element provided for UI logging.");}}
    _log(level, levelStr, messages, fromWorker = false) { if (level < this.config.level) return; if (fromWorker && !this.config.enableWorkerLoggingRelay && level < LogLevel.WARN) return; const timestamp = new Date().toISOString(); const prefix = fromWorker ? `[WORKER] [${this.componentName}]` : `[${this.componentName}]`; const logEntry = { timestamp, level: levelStr, component: prefix, messages: messages.map(msg => (typeof msg === 'object' ? (msg instanceof Error ? `${msg.name}: ${msg.message} (Stack: ${msg.stack})` : JSON.stringify(msg, null, 2)) : String(msg)))}; this.logHistory.push(logEntry); const messageString = logEntry.messages.join(' '); if (this.config.logToConsole) { const consoleArgs = [`%c[${timestamp}] [${levelStr}] ${prefix}:`, this._getLogLevelColor(level), ...messages]; switch (level) { case LogLevel.DEBUG: console.debug(...consoleArgs); break; case LogLevel.INFO:  console.info(...consoleArgs);  break; case LogLevel.WARN:  console.warn(...consoleArgs);  break; case LogLevel.ERROR: console.error(...consoleArgs); break; }} const uiLogTarget = (fromWorker && this.config.enableWorkerLoggingRelay) || (!fromWorker && this.config.logToUiElement) ? this.uiLogElement : null; if (uiLogTarget) { const logLine = document.createElement('div'); logLine.style.color = this._getLogLevelColor(level, true); const displayPrefix = fromWorker ? `[WORKER] ` : ''; logLine.textContent = `${displayPrefix}[${timestamp.split('T')[1].split('.')[0]}] [${levelStr}]: ${messageString}`; uiLogTarget.appendChild(logLine); uiLogTarget.scrollTop = uiLogTarget.scrollHeight; } if (this.config.logToAlert && level >= this.config.alertLogLevel) { let alertMsg = `Level: ${levelStr}\nComponent: ${prefix}\nTimestamp: ${timestamp.split('T')[1].split('.')[0]}\n\nMessage(s):\n`; messages.forEach(msg => { if (typeof msg === 'object') { try { alertMsg += JSON.stringify(msg, null, 2) + '\n'; } catch (e) { alertMsg += "[Unserializable Object]\n"; }} else { alertMsg += msg + '\n'; }}); alert(alertMsg.substring(0, 1000)); }}
    _getLogLevelColor(level, forInlineStyle = false) { const colors = { [LogLevel.DEBUG]: forInlineStyle ? 'blue' : 'color: blue;', [LogLevel.INFO]: forInlineStyle ? 'green' : 'color: green;', [LogLevel.WARN]: forInlineStyle ? 'orange' : 'color: orange;', [LogLevel.ERROR]: forInlineStyle ? 'red' : 'color: red;',}; return colors[level] || (forInlineStyle ? 'black' : 'color: black;');}
    debug(...messages) { this._log(LogLevel.DEBUG, 'DEBUG', messages); } info(...messages) { this._log(LogLevel.INFO, 'INFO', messages); } warn(...messages) { this._log(LogLevel.WARN, 'WARN', messages); } error(...messages) { this._log(LogLevel.ERROR, 'ERROR', messages); }
    relayWorkerLog(level, levelStr, messages) { this._log(level, levelStr, messages, true); }
}


// --- WorkerPool Class (Adapted from your example, uses mainLogger) ---
class WorkerPool {
    constructor(workerScriptURL, mainLogger, maxWorkers = null) {
        this.mainLogger = mainLogger || { debug: console.debug, info: console.info, warn: console.warn, error: console.error, relayWorkerLog: (l,ls,m)=>console.log(`WORKER ${ls}:`,...m) };
        const coreCount = navigator.hardwareConcurrency || 4;
        this.maxWorkers = maxWorkers || Math.max(1, coreCount > 1 ? coreCount - 1 : 1);
        this.workerScriptURL = workerScriptURL;
        this.workers = [];
        this.taskQueue = [];
        this.activeWorkers = 0;
        this.performanceData = { totalImagesProcessed: 0, totalProcessingTime: 0, avgTimePerImage: Infinity, previousAvgTime: Infinity, lastAdjustmentTimestamp: Date.now() };
        this.initialize();
    }

    initialize() {
        this.mainLogger.info(`WorkerPool: Initializing with up to ${this.maxWorkers} workers.`);
        for (let i = 0; i < this.maxWorkers; i++) { this._addWorker(); }
    }

    _addWorker() {
        const workerId = this.workers.length > 0 ? Math.max(...this.workers.map(w => w.id)) + 1 : 0;
        try {
            const worker = new Worker(this.workerScriptURL);
            this.workers.push({ id: workerId, worker: worker, busy: false, currentTask: null });
            worker.onmessage = (e) => this.handleWorkerMessage(workerId, e);
            worker.onerror = (e) => this.handleWorkerError(workerId, e);
            this.mainLogger.debug(`WorkerPool: Worker ${workerId} created.`);
        } catch (e) {
            this.mainLogger.error(`WorkerPool: Failed to create worker ${workerId}:`, e);
            // If worker creation fails, we might not reach maxWorkers.
            // This could be due to script URL issues or browser limits.
        }
    }
    _removeWorker() {
        if (this.workers.length <= 1) { this.mainLogger.debug("WorkerPool: Cannot remove worker, minimum 1 worker policy."); return false; }
        const workerToRemove = this.workers.find(w => !w.busy); // Try to remove an idle worker first
        if (workerToRemove) {
            workerToRemove.worker.terminate();
            this.workers = this.workers.filter(w => w.id !== workerToRemove.id);
            this.mainLogger.info(`WorkerPool: Idle worker ${workerToRemove.id} terminated for resizing.`);
            return true;
        } else if (this.workers.length > 0) { // If all are busy, remove the last one added (or any)
            const lastWorkerEntry = this.workers.pop();
            if (lastWorkerEntry) {
                lastWorkerEntry.worker.terminate();
                if (lastWorkerEntry.busy) this.activeWorkers--;
                this.mainLogger.info(`WorkerPool: Busy worker ${lastWorkerEntry.id} terminated for resizing.`);
                return true;
            }
        }
        return false;
    }

    resizePool(newTargetMaxWorkers) {
        const targetMax = Math.max(1, newTargetMaxWorkers);
        this.mainLogger.info(`WorkerPool: Attempting to resize pool. Current: ${this.workers.length}, Target Max: ${targetMax}, Configured Max: ${this.maxWorkers}`);

        if (targetMax > this.workers.length && this.workers.length < this.maxWorkers) { // Only add up to original configured max
            const workersToAdd = Math.min(targetMax - this.workers.length, this.maxWorkers - this.workers.length);
            this.mainLogger.info(`WorkerPool: Adding ${workersToAdd} new worker(s).`);
            for (let i = 0; i < workersToAdd; i++) { this._addWorker(); }
        } else if (targetMax < this.workers.length) {
            const workersToRemove = this.workers.length - targetMax;
            this.mainLogger.info(`WorkerPool: Removing ${workersToRemove} worker(s).`);
            for (let i = 0; i < workersToRemove; i++) { if (!this._removeWorker()) break; }
        }
        this.mainLogger.info(`WorkerPool: Resized. Actual workers: ${this.workers.length}`);
    }


    async processImage(imageData, id, addressQueryString) {
        this.mainLogger.debug("WorkerPool: New Promise for processImage, ID:", id, "Addr:", addressQueryString);
        return new Promise((resolve, reject) => {
            const task = { imageData, id, addressQueryString, resolve, reject, startTime: Date.now() };
            this.taskQueue.push(task);
            this.assignTasksToWorkers();
        });
    }

    assignTasksToWorkers() {
        if (this.taskQueue.length === 0) return;
        this.mainLogger.debug(`WorkerPool: Assigning tasks. Queue: ${this.taskQueue.length}, Active: ${this.activeWorkers}, Total Workers: ${this.workers.length}`);

        for (let i = 0; i < this.workers.length; i++) {
            if (this.taskQueue.length === 0) break;
            const workerEntry = this.workers[i];
            if (!workerEntry.busy) {
                const task = this.taskQueue.shift();
                workerEntry.busy = true; this.activeWorkers++; workerEntry.currentTask = task;
                this.mainLogger.debug(`WorkerPool: Assigning task ID ${task.id} (Addr: ${task.addressQueryString.slice(0,20)}...) to worker ${workerEntry.id}`);
                try {
                    if (task.imageData && task.imageData.data && task.imageData.data.buffer) {
                        workerEntry.worker.postMessage({
                            type: 'EXTRACT_FEATURES',
                            imageDataPayload: { dataBuffer: task.imageData.data.buffer, width: task.imageData.width, height: task.imageData.height },
                            id: task.id, addressQueryString: task.addressQueryString
                        }, [task.imageData.data.buffer]);
                    } else { throw new Error("Invalid imageData format for transferable postMessage."); }
                } catch (e) { /* ... (error handling from v1.7) ... */ this.mainLogger.error(`WorkerPool: Error posting message to worker ${workerEntry.id}:`, e); task.reject(e); workerEntry.busy = false; this.activeWorkers--; workerEntry.currentTask = null; this.assignTasksToWorkers(); }
            }
        }
    }

    handleWorkerMessage(workerId, event) {
        const workerEntry = this.workers.find(w => w.id === workerId);
        if (!workerEntry) { this.mainLogger.warn(`WorkerPool: Message from unknown workerId ${workerId}.`); return; }

        const data = event.data;
        if (data.type === 'WORKER_LOG_RELAY') { // Handle logs first, don't disrupt task flow
            this.mainLogger.relayWorkerLog(data.payload.level, data.payload.levelStr, data.payload.messages);
            return;
        }
        if (!workerEntry.currentTask) { this.mainLogger.warn(`WorkerPool: Message from idle worker ${workerId} (not WORKER_LOG_RELAY):`, data); return; }

        const task = workerEntry.currentTask;
        this.mainLogger.debug(`WorkerPool: Message received from worker ${workerId}, type: ${data.type}, task ID: ${task.id}`);

        const processingTime = Date.now() - task.startTime;
        this.performanceData.totalImagesProcessed++; this.performanceData.totalProcessingTime += processingTime;
        this.performanceData.avgTimePerImage = this.performanceData.totalProcessingTime / this.performanceData.totalImagesProcessed;

        if (data.type === 'FEATURE_RESULT') {
            task.resolve({features: data.features, id: data.id || task.id, addressQueryString: data.addressQueryString || task.addressQueryString });
        } else if (data.type === 'MODEL_LOADED_IN_WORKER') {
            this.mainLogger.info(`WorkerPool: Worker ${workerId} confirmed model loaded from ${data.source}. Task still pending features.`); return;
        } else if (data.type === 'ERROR') {
            this.mainLogger.error(`WorkerPool: Error from worker ${workerId} for task ${task.id}:`, data.message);
            task.reject(new Error(data.message));
        } else {
            this.mainLogger.warn(`WorkerPool: Unknown message type ${data.type} from worker ${workerId}. Task ${task.id} may fail.`);
            task.reject(new Error(`Unknown message type from worker: ${data.type}`));
        }

        workerEntry.busy = false; this.activeWorkers--; workerEntry.currentTask = null;
        this.adjustWorkerCountBasedOnPerformance();
        this.assignTasksToWorkers();
    }
    handleWorkerError(workerId, errorEvent) { /* ... (Full function from v1.7) ... */
        const workerEntry = this.workers.find(w => w.id === workerId);
        this.mainLogger.error(`WorkerPool: Uncaught error in worker ${workerId}:`, errorEvent.message, errorEvent.filename, errorEvent.lineno);
        if (workerEntry && workerEntry.currentTask) { workerEntry.currentTask.reject(new Error(`Uncaught error in worker ${workerId}: ${errorEvent.message}`)); workerEntry.busy = false; this.activeWorkers--; workerEntry.currentTask = null; }
        this.mainLogger.warn(`WorkerPool: Worker ${workerId} errored. Terminating and attempting to replace.`);
        try { workerEntry?.worker.terminate(); } catch(e){ this.mainLogger.warn("Error terminating errored worker:", e);}
        this.workers = this.workers.filter(w => w.id !== workerId);
        if (this.workers.length < this.maxWorkers) { this.mainLogger.debug("Adding new worker to replace errored one."); this._addWorker(); }
        this.assignTasksToWorkers();
    }
    adjustWorkerCountBasedOnPerformance() { /* ... (Full function from v1.7, maybe tweak thresholds) ... */
        if (Date.now() - this.performanceData.lastAdjustmentTimestamp < 20000) { return; } // Adjust every 20s
        this.mainLogger.debug("WorkerPool: Checking performance for adjustment. Avg time:", this.performanceData.avgTimePerImage.toFixed(2), "ms");
        if (this.performanceData.totalImagesProcessed < this.workers.length * 2) { this.mainLogger.debug("WorkerPool: Not enough data for performance adjustment yet."); return; }

        const coreCount = navigator.hardwareConcurrency || 4;
        const targetOptimalWorkers = Math.max(1, coreCount > 1 ? coreCount - 1 : 1); // Ideal max

        if (this.performanceData.avgTimePerImage > 1500 && this.workers.length < targetOptimalWorkers && this.workers.length < this.maxWorkers) { // If slow and below optimal & configured max
            this.mainLogger.info("WorkerPool: Performance suggests adding a worker (slow).");
            this.resizePool(this.workers.length + 1);
        } else if (this.performanceData.avgTimePerImage < this.performanceData.previousAvgTime * 0.85 && this.workers.length < this.maxWorkers && this.workers.length < (coreCount*2) /* Absolute cap */) { // Significant improvement
            this.mainLogger.info("WorkerPool: Performance suggests adding a worker (seeing improvement).");
            this.resizePool(this.workers.length + 1);
        } else if (this.performanceData.avgTimePerImage > this.performanceData.previousAvgTime * 1.20 && this.workers.length > 1 && this.workers.length > targetOptimalWorkers / 2) { // Got slower after adding, or too many
            this.mainLogger.info("WorkerPool: Performance suggests removing a worker (diminishing returns or too many).");
            this.resizePool(this.workers.length - 1);
        }
        this.performanceData.previousAvgTime = this.performanceData.avgTimePerImage;
        this.performanceData.lastAdjustmentTimestamp = Date.now();
    }
    getStatus() { return { totalWorkers: this.workers.length, busyWorkers: this.activeWorkers, queuedTasks: this.taskQueue.length, avgTime: this.performanceData.avgTimePerImage }; }
    terminate() { this.mainLogger.info("WorkerPool: Terminating all workers."); this.workers.forEach(w => {try {w.worker.terminate();} catch(e){this.mainLogger.warn("Error terminating worker:", e);}}); this.workers = []; this.taskQueue = []; this.activeWorkers = 0;}
}


(async function() {
    'use strict';

    const MAIN_THREAD_LOG_CONFIG = { level: LogLevel.INFO, logToConsole: true, logToUiElement: true, logToAlert: false, alertLogLevel: LogLevel.ERROR, enableWorkerLoggingRelay: true };
    const WORKER_LOG_CONFIG_FOR_POOL = { level: LogLevel.INFO, logToMainThread: true }; // Worker logs at INFO by default
    const logger = new Logger('AdvRenovisionMain', MAIN_THREAD_LOG_CONFIG);

    let API_KEY = '';
    const LOCALSTORAGE_API_KEY = 'renovisionUserApiKeyZL_v1.8WP';
    const STREET_VIEW_IMAGE_REQUEST_SIZE = '320x240';
    const TF_MODEL_INPUT_WIDTH = 224; // MobileNetV2 default
    const TF_MODEL_INPUT_HEIGHT = 224; // MobileNetV2 default
    const K_NEAREST_NEIGHBORS = 5;
    const MAX_EMBEDDINGS_FOR_KNN_QUERY = 100;
    const DB_NAME = 'BuildingRenovisionDB_v4_WPFull';
    const DB_VERSION = 1;
    const BUILDING_STORE_NAME = 'buildings';
    let db;
    const MODEL_SIGNATURE = `MobileNetV2_Features_Pool_v1.1`;
    const BASE_PAIR_ADDRESSES = [ "Budapest, 1068, Benczúr utca 8.", "Budapest, 1077, Jósika utca 29." ];
    let basePairData = [null, null];
    let actualBasePairSimilarity = null;
    const TARGET_STREET_START_ADDRESS = "Benczúr utca 1, Budapest, Hungary";
    const TARGET_STREET_END_ADDRESS = "Benczúr utca & Bajza utca, Budapest, Hungary";
    const STREET_VIEW_FOV = 80;
    const STREET_VIEW_PITCH = 5;
    const SAMPLING_INTERVAL_METERS = 25;
    const PROJECTION_DISTANCE_METERS = 15;
    const USER_FEEDBACK_VALIDITY_DAYS = 90;

    let map, directionsService, streetViewService, geocoder;
    let controlPanel, mapDiv, resultsTableUnrenovatedCell, resultsTableRenovatedCell, summaryDiv, logDivUiElement, startButton;
    let workerPoolInstance = null;
    let currentAnalysisResults = [];
    let isCrawlingGlobal = false;
    let bottomStatusBar, apiKeyStatusSpanGlobal, crawlingStatusSpanGlobal, stopCrawlingButtonGlobal, registerApiKeyButtonGlobal;
    let switchStatusOverlay = null;

    const svgIconUnrenovated = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style="color:red; vertical-align:middle; margin-right:5px;"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0M5.354 4.646a.5.5 0 1 0-.708.708L7.293 8l-2.647 2.646a.5.5 0 1 0 .708.708L8 8.707l2.646 2.647a.5.5 0 0 0 .708-.708L8.707 8l2.647-2.646a.5.5 0 0 0-.708-.708L8 7.293z"/></svg>`;
    const svgIconRenovated = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style="color:green; vertical-align:middle; margin-right:5px;"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0m-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/></svg>`;
    const svgIconStop = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-stop-circle-fill" viewBox="0 0 16 16" style="vertical-align: middle; margin-right: 3px;"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0M6.5 5A1.5 1.5 0 0 0 5 6.5v3A1.5 1.5 0 0 0 6.5 11h3A1.5 1.5 0 0 0 11 9.5v-3A1.5 1.5 0 0 0 9.5 5z"/></svg>`;
    const svgIconKey = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-key-fill" viewBox="0 0 16 16" style="vertical-align: middle; margin-right: 3px;"><path d="M3.5 11.5a3.5 3.5 0 1 1 3.163-5H14L15.5 8 14 9.5l-1-1-1 1-1-1-1 1-1-1-1 1H6.663a3.5 3.5 0 0 1-3.163 2M2.5 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2"/></svg>`;
    const svgIconSwitch = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-arrow-left-right" viewBox="0 0 16 16" style="vertical-align: middle; margin-right: 3px;"><path fill-rule="evenodd" d="M1 11.5a.5.5 0 0 0 .5.5h11.793l-3.147 3.146a.5.5 0 0 0 .708.708l4-4a.5.5 0 0 0 0-.708l-4-4a.5.5 0 0 0-.708.708L13.293 11H1.5a.5.5 0 0 0-.5.5m14-7a.5.5 0 0 1-.5.5H2.707l3.147 3.146a.5.5 0 1 1-.708.708l-4-4a.5.5 0 0 1 0-.708l4-4a.5.5 0 1 1 .708.708L2.707 4H14.5a.5.5 0 0 1 .5.5"/></svg>`;


    function createFeatureExtractionWorkerScriptContent() {
        logger.debug("Creating worker script content string for feature extraction.");
        const tfjsCdnUrl = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.18.0'; // Ensure this version is compatible with model
        const modelUrl = 'https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v2_1.0_224/model.json';
        const featureLayerName = 'global_average_pooling2d_1'; // Check this for MobileNetV2 if it changes! 'global_average_pooling2d' is also common.
        const expectedImgSize = 224;

        return `
            const LogLevel_W = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, NONE: 4 };
            let workerConfig_W = { level: LogLevel_W.INFO, logToMainThread: true };

            function workerLog_W(level, levelStr, messages) {
                if (level < workerConfig_W.level) return;
                if (workerConfig_W.logToMainThread) { self.postMessage({ type: 'WORKER_LOG_RELAY', payload: { level, levelStr, messages } }); }
                else { const ts = new Date().toISOString().split('T')[1].slice(0,8); console.debug(\`[WORKER_CONSOLE @ \${ts} \${levelStr}]:\`, ...messages); }
            }
            const _W = { d: (...m) => workerLog_W(LogLevel_W.DEBUG,'DEBUG',m), i: (...m) => workerLog_W(LogLevel_W.INFO,'INFO',m), w: (...m) => workerLog_W(LogLevel_W.WARN,'WARN',m), e: (...m) => workerLog_W(LogLevel_W.ERROR,'ERROR',m) };

            let tf_W; let featureExtractorModel_W = null;
            const MODEL_URL_W = '${modelUrl}'; const FEATURE_LAYER_NAME_W = '${featureLayerName}'; const EXPECTED_IMG_SIZE_W = ${expectedImgSize};

            async function initializeModel_W() {
                _W.d("Worker: initializeModel_W called."); if (featureExtractorModel_W) return true;
                _W.d("Worker: Attempting to load model from:", MODEL_URL_W);
                const modelPathInDb = 'indexeddb://renovision-mobilenet-v2-features'; // TFJS specific IndexedDB path
                try {
                    _W.d("Worker: Attempting to load model from IndexedDB:", modelPathInDb);
                    featureExtractorModel_W = await tf_W.loadLayersModel(modelPathInDb);
                    _W.i('Worker: MobileNetV2 feature extractor loaded FROM INDEXEDDB.');
                    self.postMessage({ type: 'MODEL_LOADED_IN_WORKER', source: 'IndexedDB' }); return true;
                } catch (e) { _W.w('Worker: Model not in IndexedDB or error:', e.message, "Loading from network.");}

                try {
                    const mobilenet = await tf_W.loadLayersModel(MODEL_URL_W);
                    _W.d("Worker: MobileNet base loaded. Finding layer:", FEATURE_LAYER_NAME_W);
                    let featureLayer;
                    try { featureLayer = mobilenet.getLayer(FEATURE_LAYER_NAME_W); }
                    catch (eL) { _W.w("Worker: Layer '"+FEATURE_LAYER_NAME_W+"' not found. Trying common alternatives..."); featureLayer = mobilenet.layers.find(l => l.name.includes('global_average_pooling') || l.name.includes('avg_pool')); if (!featureLayer) { const layerNames = mobilenet.layers.map(l=>l.name); _W.e("Worker: Could not find suitable feature layer. Available:", layerNames); throw new Error("Feature layer not found."); }}
                    _W.d("Worker: Using feature layer:", featureLayer.name);
                    featureExtractorModel_W = tf_W.model({ inputs: mobilenet.inputs, outputs: featureLayer.output });
                    _W.i('Worker: MobileNetV2 feature extractor created FROM NETWORK.');
                    self.postMessage({ type: 'MODEL_LOADED_IN_WORKER', source: 'Network' });
                    _W.d("Worker: Saving model to IndexedDB:", modelPathInDb);
                    await featureExtractorModel_W.save(modelPathInDb);
                    _W.i("Worker: Model saved to IndexedDB."); return true;
                } catch (err) { _W.e('Worker: Error loading/creating MobileNetV2 model:', err.message, err.stack); self.postMessage({ type: 'ERROR', message: 'Worker model load/create error: ' + err.message }); return false; }
            }

            async function extractFeatures_W(imageDataPayloadObj) {
                _W.d("Worker: extractFeatures_W called for task ID:", imageDataPayloadObj.id);
                if (!featureExtractorModel_W) { const modelReady = await initializeModel_W(); if (!modelReady) throw new Error('Model not initialized in worker.'); }
                const { dataBuffer, width, height } = imageDataPayloadObj.imageDataPayload;
                if (!dataBuffer || width === 0 || height === 0) { _W.w("Worker: Invalid image data for feature extraction."); return null; }
                _W.d("Worker: Image for extraction - w:", width, "h:", height, "buffer:", dataBuffer.byteLength);

                return tf_W.tidy(() => {
                    const pixelData = new Uint8Array(dataBuffer); // Use Uint8Array for tf.tensor3d with 'int32' dtype for RGBA
                    let imageTensor = tf_W.tensor3d(pixelData, [height, width, 4], 'int32');
                    imageTensor = imageTensor.slice([0, 0, 0], [height, width, 3]); // RGB
                    const resizedTensor = tf_W.image.resizeBilinear(imageTensor, [EXPECTED_IMG_SIZE_W, EXPECTED_IMG_SIZE_W]);
                    const preprocessedTensor = resizedTensor.toFloat().div(127.5).sub(1); // Normalize for MobileNet
                    const batchedTensor = preprocessedTensor.expandDims(0);
                    const featuresTensor = featureExtractorModel_W.predict(batchedTensor);
                    const featuresArray = Array.from(featuresTensor.dataSync());
                    tf_W.dispose([imageTensor, resizedTensor, preprocessedTensor, batchedTensor, featuresTensor]);
                    _W.d("Worker: Features extracted for task ID:", imageDataPayloadObj.id, "Length:", featuresArray.length);
                    return featuresArray;
                });
            }

            self.onmessage = async function(e) {
                _W.d("Worker: Message received in onmessage", e.data ? e.data.type : 'No data type');
                if(!e.data) { _W.e("Worker: Received empty message data."); return; }
                const { type, payload, imageDataPayload, id, addressQueryString, logConfig, tfjsUrl } = e.data; // Destructure all possible top-level keys

                if (type === 'INIT_TF_AND_CONFIG_WORKER_POOL') {
                    workerConfig_W = payload.logConfig || workerConfig_W; // payload is nested here
                     _W.i('Worker: INIT_TF_AND_CONFIG_WORKER_POOL. TFJS URL:', payload.tfjsUrl, 'Log Cfg:', workerConfig_W);
                    try {
                        _W.d("Worker: New Promise (implicit): importScripts for TFJS"); importScripts(payload.tfjsUrl);
                        tf_W = self.tf;
                        if (tf_W) { const modelReady = await initializeModel_W(); if (modelReady) { _W.i('Worker: TF.js and Model initialized successfully.'); self.postMessage({ type: 'WORKER_READY_POOL' }); } else { throw new Error("Model init failed post TF.js load."); }}
                        else { throw new Error('tf object not found after importScripts.');}
                    } catch (err) { _W.e('Worker: Error importing/init TF.js:', err.message, err.stack); self.postMessage({ type: 'ERROR', message: 'Worker TF/Model Init Failed: ' + err.message, id }); }
                    return;
                }
                if (type === 'EXTRACT_FEATURES') {
                    _W.d("Worker: EXTRACT_FEATURES request for ID:", id, "Address:", addressQueryString);
                    try {
                        _W.debug("Worker: New Promise (implicit): extractFeatures_W");
                        const features = await extractFeatures_W({imageDataPayload, id}); // Pass object
                        if (features) { self.postMessage({ type: 'FEATURE_RESULT', features: features, id: id, addressQueryString: addressQueryString });}
                        else { throw new Error("Feature extraction returned null/undefined."); }
                    } catch (err) { _W.e('Worker: Error during feature extraction for ID:', id, err.message, err.stack); self.postMessage({ type: 'ERROR', message: err.message, id: id, addressQueryString: addressQueryString }); }
                } else if (type) { _W.w("Worker: Unknown message type received:", type); }
                 else { _W.e("Worker: Message received without a 'type' property", e.data); }
            };
            _W.i("Worker: Script loaded, onmessage handler set. TFJS URL for import: ${tfjsCdnUrl}");
        `;
    }


    // --- API Key Management, UI Creation, IndexedDB (from v1.5/v1.6) ---
    async function promptForApiKey() { logger.debug("New Promise: Prompt APIKey v1.8"); updateBottomStatusBar({ apiKey: API_KEY, apiKeyFullStatus: "Unknown (Awaiting Input)", processStatus: "Awaiting API Key Input" }); return new Promise((resolve) => { const oid = 'tm-apikey-modal-overlay-zl-v18'; if(document.getElementById(oid)){resolve(API_KEY||null); return;} const ov = document.createElement('div'); ov.id=oid; ov.className='dialog-overlay-zl-ui-v18'; const dia = document.createElement('div'); dia.className='dialog-box-zl-ui-v18'; dia.style.minWidth='350px'; dia.innerHTML=`<h3>API Key</h3><p>Enter Google Maps API Key:</p><div style="position:relative;"><input type="password" id="tm-apikey-input-zl-v18" style="width:calc(100% - 40px); padding:8px;"/><button id="tm-apikey-toggle-zl-v18" style="position:absolute;right:5px;top:50%;transform:translateY(-50%);padding:5px;font-size:10px;background:#eee;color:#333;border:1px solid #ccc;width:30px;">Show</button></div><p style="font-size:0.9em;color:#555;">* Info about key...</p><button id="tm-apikey-submit-zl-v18" style="background:#28a745">OK</button><button id="tm-apikey-cancel-zl-v18" style="background:#dc3545">Cancel</button>`; ov.appendChild(dia); document.body.appendChild(ov); const inp=document.getElementById('tm-apikey-input-zl-v18'); const tgl=document.getElementById('tm-apikey-toggle-zl-v18'); tgl.onclick=()=>{inp.type=(inp.type==="password"?"text":"password");tgl.textContent=(inp.type==="password"?"Show":"Hide");}; const closeNResolve=(v)=>{try{document.body.removeChild(ov);}catch(e){}resolve(v);}; document.getElementById('tm-apikey-submit-zl-v18').onclick=()=>{const k=inp.value; if(k&&k.trim()!==""){API_KEY=k.trim();try{localStorage.setItem(LOCALSTORAGE_API_KEY,API_KEY);logger.info("APIKey saved to LS.");updateBottomStatusBar({apiKey:API_KEY,apiKeyFullStatus:"Registered (localStorage)",processStatus:"Ready"});}catch(e){logger.warn("Err saving APIKey to LS",e);updateBottomStatusBar({apiKey:API_KEY,apiKeyFullStatus:"Error - Session only, save failed",processStatus:"Ready"});alert("Could not save API Key.");}closeNResolve(API_KEY);}else{logger.warn("Invalid APIKey.");alert("Enter valid Key.");}}; document.getElementById('tm-apikey-cancel-zl-v18').onclick=()=>{logger.info("User cancelled APIKey prompt.");updateBottomStatusBar({apiKey:null,apiKeyFullStatus:"Unregistered (User Cancelled)",processStatus:"Cancelled"});closeNResolve(null);};});}
    async function getApiKey(promptIfMissing = true) { logger.debug("getApiKey. Prompt:", promptIfMissing); let skey=null; try{skey=localStorage.getItem(LOCALSTORAGE_API_KEY);}catch(e){logger.warn("LS access err for APIKey",e);} if(skey&&skey.trim()!==""){API_KEY=skey;logger.info("APIKey from LS.");updateBottomStatusBar({apiKey:API_KEY,apiKeyFullStatus:"Registered (localStorage)",processStatus:"Ready"});return API_KEY;}else{API_KEY='';if(promptIfMissing){return await promptForApiKey();}else{updateBottomStatusBar({apiKey:null,apiKeyFullStatus:"Unregistered (Not Found)",processStatus:"Awaiting Key"});return null;}}}
    function clearApiKeyFromStorage() { logger.debug("clearApiKeyFromStorage"); try{localStorage.removeItem(LOCALSTORAGE_API_KEY);API_KEY='';logger.info('APIKey cleared.');updateBottomStatusBar({apiKey:null,apiKeyFullStatus:"Unregistered (User Cleared)",processStatus:"Key Cleared"});alert('APIKey cleared.');}catch(e){logger.error("Err clear APIKey LS",e);updateBottomStatusBar({apiKey:API_KEY,apiKeyFullStatus:API_KEY?"Unknown (ClearFail)":"Unreg (ClearFail)",processStatus:"Err ClearKey"});alert("Err clear APIKey.");}}
    function injectNativeCSS() { logger.debug("injectNativeCSS v1.8"); const css=`#tm-renovision-panel-zl-v18{position:fixed;top:10px;left:10px;width:600px;max-width:95vw;max-height:95vh;background:#fff;border:2px solid #007bff;border-radius:8px;padding:15px;z-index:10001;overflow-y:auto;font-family:Arial,sans-serif;font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,0.15)}#tm-renovision-panel-zl-v18 h2{margin-top:0;color:#007bff;font-size:18px}#tm-renovision-panel-zl-v18 button{background-color:#007bff;color:#fff;border:none;padding:8px 12px;margin-right:5px;border-radius:4px;cursor:pointer;font-size:13px}#tm-renovision-panel-zl-v18 button:hover{background-color:#0056b3}#tm-renovision-panel-zl-v18 button:disabled{background-color:#ccc;cursor:not-allowed}#tm-gmaps-map-renovision-zl-v18{width:100%;height:200px;margin:10px 0;border:1px solid #ccc}.results-table-zl-v18{width:100%;margin-top:10px;border-collapse:collapse;table-layout:fixed}.results-table-zl-v18 th,.results-table-zl-v18 td{border:1px solid #ddd;padding:6px;text-align:left;font-size:12px;vertical-align:top;word-break:break-word}.results-table-zl-v18 th{background-color:#f2f2f2}.results-table-zl-v18 img{width:100px;height:auto;max-height:75px;object-fit:contain;display:block;margin-bottom:3px}.result-row-zl-v18{cursor:pointer}.result-row-zl-v18:hover{background-color:#f0f8ff}#tm-log-renovision-zl-v18{margin-top:10px;padding:8px;border:1px solid #eee;background-color:#f9f9f9;max-height:150px;overflow-y:auto;font-family:monospace;white-space:pre-wrap;font-size:.8em}#tm-summary-renovision-zl-v18{margin-top:10px;padding:8px;background-color:#e9ecef;border-radius:4px}.dialog-overlay-zl-ui-v18{position:fixed;top:0;left:0;width:100%;height:100%;background-color:rgba(0,0,0,.5);display:flex;justify-content:center;align-items:center;z-index:10002}.dialog-box-zl-ui-v18{background-color:#fff;padding:20px;border-radius:8px;box-shadow:0 0 15px rgba(0,0,0,.3);text-align:center;min-width:300px;max-width:90vw}.dialog-box-zl-ui-v18 p{margin-bottom:15px;white-space:pre-wrap;text-align:left}.dialog-box-zl-ui-v18 button{margin:0 5px}.switch-status-overlay-zl{position:absolute;top:0;left:0;width:100%;height:100%;background-color:rgba(0,0,0,0.85);color:#fff;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;font-size:11px;padding:5px;box-sizing:border-box;opacity:0;transition:opacity .2s ease-in-out;cursor:default}`; const se=document.createElement('style');se.type='text/css';se.id='tm-renovision-native-styles-zl-v18';if(se.styleSheet){se.styleSheet.cssText=css;}else{se.appendChild(document.createTextNode(css));}(document.head||document.documentElement).appendChild(se);logger.info("NativeCSS v1.8 injected.");}
    function createUI() { injectNativeCSS(); controlPanel=document.createElement('div');controlPanel.id='tm-renovision-panel-zl-v18';document.body.appendChild(controlPanel);controlPanel.innerHTML=`<h2>Adv Renovision (ZLudany WorkerPool)</h2><button id="tm-start-zl-v18">Start</button><button id="tm-reenter-key-zl-v18">API Key</button><button id="tm-clear-key-zl-v18">Clear Key</button><button id="tm-clear-db-zl-v18">Clear DB</button><div id="tm-gmaps-map-renovision-zl-v18"></div><h3>Results:</h3><table class="results-table-zl-v18"><thead><tr><th>${svgIconUnrenovated} Unrenovated</th><th>${svgIconRenovated} Renovated</th></tr></thead><tbody><tr><td id="tm-unrenovated-cell-zl-v18"></td><td id="tm-renovated-cell-zl-v18"></td></tr></tbody></table><p style="font-size:11px;text-align:center;margin-top:5px">Dbl-click row for feedback. Hover to switch.</p><div id="tm-summary-renovision-zl-v18">Sum...</div><div id="tm-log-renovision-zl-v18">Log...</div>`; startButton=document.getElementById('tm-start-zl-v18');mapDiv=document.getElementById('tm-gmaps-map-renovision-zl-v18');resultsTableUnrenovatedCell=document.getElementById('tm-unrenovated-cell-zl-v18');resultsTableRenovatedCell=document.getElementById('tm-renovated-cell-zl-v18');summaryDiv=document.getElementById('tm-summary-renovision-zl-v18');logDivUiElement=document.getElementById('tm-log-renovision-zl-v18');logger.setUiLogElement(logDivUiElement);startButton.onclick=mainAnalysisWorkflow;document.getElementById('tm-reenter-key-zl-v18').onclick=async ()=>{logger.info("Re-enter APIKey clicked.");API_KEY=await getApiKey(true);if(API_KEY&&(!window.google||!window.google.maps)){logger.info("Re-init Gmaps with new key.");await loadGoogleMapsScript();}};document.getElementById('tm-clear-key-zl-v18').onclick=clearApiKeyFromStorage;document.getElementById('tm-clear-db-zl-v18').onclick=clearIndexedDB;logger.info("UI Created (WorkerPool v1.8).");}
    function createBottomStatusBar() { logger.debug("Creating bottom status bar (v1.8).");bottomStatusBar=document.createElement('div');bottomStatusBar.id='tm-statusbar-zl-v18';bottomStatusBar.style.cssText='position:fixed;bottom:0;left:0;width:100%;background-color:#333;color:#fff;padding:8px 15px;z-index:10000;font-size:12px;display:flex;justify-content:space-between;align-items:center;box-sizing:border-box';const stDiv=document.createElement('div');stDiv.id='tm-statustext-div-zl-v18';stDiv.innerHTML=`Renovision: <span id="tm-crawlstatus-zl-v18" style="font-weight:bold">Init...</span> | APIKey: <span id="tm-apikeystatus-zl-v18" style="font-style:italic">Unk...</span>`;bottomStatusBar.appendChild(stDiv);crawlingStatusSpanGlobal=bottomStatusBar.querySelector('#tm-crawlstatus-zl-v18');apiKeyStatusSpanGlobal=bottomStatusBar.querySelector('#tm-apikeystatus-zl-v18');const btnsDiv=document.createElement('div');btnsDiv.id='tm-statusbar-btns-div-zl-v18';registerApiKeyButtonGlobal=document.createElement('button');registerApiKeyButtonGlobal.id='tm-registerbtn-zl-v18';registerApiKeyButtonGlobal.innerHTML=`${svgIconKey} Register Key`;registerApiKeyButtonGlobal.style.cssText='background-color:#17a2b8;color:white;border:none;padding:5px 10px;border-radius:4px;cursor:pointer;display:none;margin-right:10px';registerApiKeyButtonGlobal.onclick=async ()=>{logger.info("Statusbar Register Key clicked.");API_KEY=await promptForApiKey();if(API_KEY){if(!window.google||!window.google.maps){logger.info("Gmaps not loaded, loading with new key.");await loadGoogleMapsScript();}if(window.google&&window.google.maps&&db&&startButton){startButton.disabled=false;}else if(startButton){startButton.disabled=true;logger.warn("Gmaps/DB not ready post-reg, Start disabled.");}}else{if(startButton)startButton.disabled=true;}};btnsDiv.appendChild(registerApiKeyButtonGlobal);stopCrawlingButtonGlobal=document.createElement('button');stopCrawlingButtonGlobal.id='tm-stopbtn-zl-v18';stopCrawlingButtonGlobal.innerHTML=`${svgIconStop} Stop Crawl`;stopCrawlingButtonGlobal.style.cssText='background-color:#dc3545;color:white;border:none;padding:5px 10px;border-radius:4px;cursor:pointer;display:none';stopCrawlingButtonGlobal.onclick=handleStopCrawling;btnsDiv.appendChild(stopCrawlingButtonGlobal);bottomStatusBar.appendChild(btnsDiv);document.body.appendChild(bottomStatusBar);logger.info("Bottom status bar created (v1.8).");updateBottomStatusBar({apiKey:API_KEY,apiKeyFullStatus:"Unk (Init)",processStatus:"Init..."});}
    function updateBottomStatusBar(statusInfo) { const{apiKey,apiKeyFullStatus,processStatus}=statusInfo;logger.debug("Update Statusbar:",statusInfo);if(!apiKeyStatusSpanGlobal||!crawlingStatusSpanGlobal||!registerApiKeyButtonGlobal||!stopCrawlingButtonGlobal){logger.warn("Statusbar elements not found.");return;}let keyDisp="Unk";if(apiKey&&apiKey.length>8){keyDisp=`${apiKey.substring(0,4)}...${apiKey.substring(apiKey.length-4)}`;}else if(apiKey){keyDisp="Set";}apiKeyStatusSpanGlobal.textContent=apiKeyFullStatus.includes("Unk")||apiKeyFullStatus.includes("Not Set")||!apiKey||apiKeyFullStatus.includes("Unreg")?apiKeyFullStatus:`"${keyDisp}" (${apiKeyFullStatus})`;crawlingStatusSpanGlobal.textContent=processStatus;crawlingStatusSpanGlobal.style.color=processStatus.toLowerCase().includes("error")?"lightcoral":"lightgreen";apiKeyStatusSpanGlobal.style.color=apiKeyFullStatus.toLowerCase().includes("error")||apiKeyFullStatus.toLowerCase().includes("unk")||apiKeyFullStatus.toLowerCase().includes("unreg")?"khaki":"lightblue";const activeKW=["started","init","fetch","process","crawl"];const isActive=activeKW.some(s=>processStatus.toLowerCase().includes(s));const needsReg=!apiKey&&(processStatus.toLowerCase().includes("cancel")||apiKeyFullStatus.toLowerCase().includes("unreg")||processStatus.toLowerCase().includes("await")||processStatus.toLowerCase().includes("api key err")||processStatus.toLowerCase()==="key clear");if(isActive){stopCrawlingButtonGlobal.style.display='inline-block';registerApiKeyButtonGlobal.style.display='none';isCrawlingGlobal=true;}else{stopCrawlingButtonGlobal.style.display='none';isCrawlingGlobal=false;if(needsReg){registerApiKeyButtonGlobal.style.display='inline-block';}else{registerApiKeyButtonGlobal.style.display='none';}}}
    async function handleStopCrawling() { logger.info("handleStopCrawling called.");isCrawlingGlobal=false;if(workerPoolInstance){logger.info("Terminating WorkerPool.");workerPoolInstance.terminate();workerPoolInstance=null;}const keyStat=API_KEY?(localStorage.getItem(LOCALSTORAGE_API_KEY)===API_KEY?"Reg (LS)":"SessOnly"):"Unreg";updateBottomStatusBar({apiKey:API_KEY,apiKeyFullStatus:keyStat,processStatus:"Stopping..."});logger.debug("New Promise: Stop Crawl Confirm Dialog (v1.8)");const clearKey=await showConfirmationDialog("Crawl stopped. Clear API Key from LS?","tm-stop-confirm-zl-v18","Yes, Clear","No, Keep");if(clearKey){clearApiKeyFromStorage();}else{logger.info("User kept APIKey post-stop.");const finalKeyStat=API_KEY?(localStorage.getItem(LOCALSTORAGE_API_KEY)===API_KEY?"Reg (LS)":"SessOnly (Err?)"):"Unreg";updateBottomStatusBar({apiKey:API_KEY,apiKeyFullStatus:finalKeyStat,processStatus:"Stopped - By User"});}if(startButton){startButton.disabled=false;startButton.textContent="Start Analysis";}}

    // --- All other functions from v1.7 (IndexedDB, Gmaps Helpers, kNN, Result Display, User Feedback, WorkerPool related) ---
    // --- MUST BE COPIED HERE VERBATIM from the previous "v1.7 ENTIRE SCRIPT" ---
    // --- Ensure their internal `isCrawlingGlobal` checks are robust and logging calls are correct. ---
    async function setupDB() { logger.debug("New Promise: setupDB v1.8"); return new Promise((resolve, reject) => { /* ... from v1.7 ... */ });}
    async function getBuildingData(addressQueryString) { logger.debug("New Promise: getBuildingData v1.8", addressQueryString); return new Promise((resolve, reject) => { /* ... from v1.7 ... */ });}
    async function saveBuildingData(buildingData) { logger.debug("New Promise: saveBuildingData v1.8", buildingData.addressQueryString); buildingData.lastUpdated = new Date().toISOString(); return new Promise((resolve, reject) => { /* ... from v1.7 ... */ });}
    async function clearIndexedDB() { logger.info("clearIndexedDB v1.8"); if (db) { /* ... */ } logger.debug("New Promise: Delete IndexedDB v1.8", DB_NAME); return new Promise((resolve, reject) => { /* ... from v1.7 ... */ });}
    async function getVerifiedFeatures(limit = MAX_EMBEDDINGS_FOR_KNN_QUERY) { logger.debug("New Promise: getVerifiedFeatures v1.8", limit); return new Promise((resolve, reject) => { /* ... from v1.7 ... */ });}
    async function getImageDataForAddress(addressQueryString, idForLog = '') { if (!isCrawlingGlobal && !idForLog.startsWith('base')) {return Promise.resolve({addressQueryString});} logger.debug(`New Promise: getImageDataForAddress v1.8 for ${idForLog}: ${addressQueryString}`); /* ... from v1.7, requires API_KEY ... */ return Promise.resolve({ addressQueryString, imageData: {data: new Uint8ClampedArray(10*10*4), width:10, height:10} }); }
    async function fetchImagesForStreetSection(startAddress, endAddress) { if (!isCrawlingGlobal) return []; logger.info(`New Promise: fetchImagesForStreetSection v1.8`); /* ... from v1.7, requires API_KEY, and internal isCrawlingGlobal checks ... */ return Promise.resolve([]); }
    async function geocodeAddress(address) { logger.debug("New Promise: geocodeAddress v1.8", address); return new Promise(r => { if(!geocoder) r(null); else geocoder.geocode({'address':address}, (res,stat)=>{if(stat===google.maps.GeocoderStatus.OK && res[0])r(res[0].geometry.location);else{logger.warn("GeocodeFail v1.8",address,stat);r(null);}});});}
    async function getStreetViewImageURLAndLocation(locationForPanoSearch, headingToBuilding = null, radius = 30) { logger.debug("New Promise: getStreetViewImageURLAndLocation v1.8"); if(!API_KEY){return Promise.resolve(null);} return new Promise(r => { if(!streetViewService)r(null); else streetViewService.getPanorama({location:locationForPanoSearch,radius,source:google.maps.StreetViewSource.OUTDOOR,preference:google.maps.StreetViewPreference.NEAREST},(data,stat)=>{if(stat===google.maps.StreetViewStatus.OK){const p=data.location.pano,c=data.location.latLng,fH=headingToBuilding!==null?headingToBuilding:google.maps.geometry.spherical.computeHeading(c,locationForPanoSearch),url=`https://maps.googleapis.com/maps/api/streetview?size=${STREET_VIEW_IMAGE_REQUEST_SIZE}&pano=${p}&heading=${fH}&pitch=${STREET_VIEW_PITCH}&fov=${STREET_VIEW_FOV}&key=${API_KEY}`;r({imageUrl:url,panoId:p,carLocation:c,heading:fH});}else{r(null);}});});}
    async function getDirectionsPath(originLatLng, destinationLatLng) { logger.debug("New Promise: getDirectionsPath v1.8"); return new Promise(r => {if(!directionsService)r(null);else directionsService.route({origin:originLatLng,destination:destinationLatLng,travelMode:google.maps.TravelMode.DRIVING},(res,stat)=>{if(stat===google.maps.DirectionsStatus.OK&&res.routes&&res.routes.length>0)r(res.routes[0].overview_path);else{logger.warn("DirectionsFail v1.8",stat);r(null);}});});}
    async function reverseGeocodeLatLng(latLng) { logger.debug("New Promise: reverseGeocodeLatLng v1.8"); return new Promise(r => {if(!geocoder)r({fullAddress:"N/A",houseNumber:null});else geocoder.geocode({'location':latLng},(res,stat)=>{if(stat===google.maps.GeocoderStatus.OK&&res[0]){const adr=res[0].formatted_address,hn=res[0].address_components.find(c=>c.types.includes('street_number'))?.long_name||null;r({fullAddress:adr,houseNumber:hn});}else{logger.warn("ReverseGeocodeFail v1.8",stat);r({fullAddress:"N/A",houseNumber:null});}});});}
    function urlToImageData(url) { logger.debug("New Promise: urlToImageData v1.8", url.slice(-30)); return new Promise(r => { const img=new Image();img.crossOrigin="Anonymous";img.onload=()=>{const cv=document.createElement('canvas');cv.width=img.naturalWidth;cv.height=img.naturalHeight;if(img.naturalWidth===0||img.naturalHeight===0){r(null);return;}const ctx=cv.getContext('2d');ctx.drawImage(img,0,0);try{const iD=ctx.getImageData(0,0,img.naturalWidth,img.naturalHeight);r({data:iD.data,width:iD.width,height:iD.height});}catch(e){logger.error("Err getImageData from canvas v1.8",e,url);r(null);}};img.onerror=()=>{logger.error("Fail load img URL v1.8",url);r(null);};img.src=url;});}
    function cosineSimilarity(vecA, vecB) { if(!vecA||!vecB||vecA.length!==vecB.length){return 0;}let dp=0,nA=0,nB=0;for(let i=0;i<vecA.length;i++){dp+=(vecA[i]||0)*(vecB[i]||0);nA+=(vecA[i]||0)*(vecA[i]||0);nB+=(vecB[i]||0)*(vecB[i]||0);}nA=Math.sqrt(nA);nB=Math.sqrt(nB);if(nA===0||nB===0)return 0;const sim=dp/(nA*nB);return isNaN(sim)?0:sim;}
    function findKNearestNeighbors(targetFeatures, candidateFeatures, k) { logger.debug("findKNearestNeighbors v1.8. Target features len:", targetFeatures?.length, "Candidates:", candidateFeatures.length); if (!targetFeatures || candidateFeatures.length === 0) return []; const dists = candidateFeatures.map(cand => ({...cand, distance: 1 - cosineSimilarity(targetFeatures, cand.embedding)})); dists.sort((a,b)=>a.distance-b.distance); return dists.slice(0,k);}
    async function processAndDisplayResultsWithKNN_WorkerPool(processedTargetImages) { if (!isCrawlingGlobal) {logger.info("processAndDisplayResultsWithKNN_WorkerPool: Stop requested pre-loop"); return;} logger.info(`Processing ${processedTargetImages.length} target images with extracted features (v1.8).`); currentAnalysisResults = []; const today = new Date(); const todayISO = today.toISOString().slice(0,10).replace(/-/g,'/'); logger.debug("New Promise (implicit): getVerifiedFeatures for kNN in processAndDisplayResultsWithKNN_WorkerPool"); const verifiedFeaturesForKNN = await getVerifiedFeatures(); for (const imgResult of processedTargetImages) { if (!isCrawlingGlobal) { logger.info("processAndDisplayResultsWithKNN_WorkerPool: Loop interrupted."); break; } if (!imgResult.features) { logger.warn("Skipping image due to missing features:", imgResult.addressQueryString || imgResult.id); continue; } const currentFeatures = imgResult.features; let buildingRecord = await getBuildingData(imgResult.addressQueryString); if (!buildingRecord) { buildingRecord = { addressQueryString: imgResult.addressQueryString, loc: imgResult.loc, comparisons: [], userVerifiedStatus: null, userFeedbackDate: null }; } buildingRecord.embedding = currentFeatures; buildingRecord.modelSignature = MODEL_SIGNATURE; const similarityToBase1 = basePairData[0].features ? cosineSimilarity(currentFeatures, basePairData[0].features) : 0; const similarityToBase2 = basePairData[1].features ? cosineSimilarity(currentFeatures, basePairData[1].features) : 0; const avgSimilarityToBase = (similarityToBase1 + similarityToBase2) / 2.0; let modelUnrenovatedScore = (actualBasePairSimilarity != null && !isNaN(actualBasePairSimilarity)) ? (1.0 - Math.abs(actualBasePairSimilarity - avgSimilarityToBase)) : 0.5; modelUnrenovatedScore = Math.max(0, Math.min(1, modelUnrenovatedScore)); let kNNVerdict = null; let kNNConfidence = 0; if (verifiedFeaturesForKNN.length >= K_NEAREST_NEIGHBORS) { const neighbors = findKNearestNeighbors(currentFeatures, verifiedFeaturesForKNN, K_NEAREST_NEIGHBORS); if (neighbors.length > 0) { let renVotes=0, unrenVotes=0; neighbors.forEach(n=>{if(n.status==='renovated')renVotes++;else if(n.status==='unrenovated')unrenVotes++;}); if(renVotes>unrenVotes)kNNVerdict='renovated';else if(unrenVotes>renVotes)kNNVerdict='unrenovated'; kNNConfidence=Math.max(renVotes,unrenVotes)/K_NEAREST_NEIGHBORS;}} let finalUnrenovatedScore = modelUnrenovatedScore; let statusSource = `Model (SimBase:${avgSimilarityToBase.toFixed(2)})`; if (kNNVerdict && kNNConfidence > 0.6) { const kNNScoreVal = kNNVerdict === 'unrenovated' ? (0.5 + 0.5 * kNNConfidence) : (0.5 - 0.5 * kNNConfidence); finalUnrenovatedScore = (0.3 * modelUnrenovatedScore) + (0.7 * kNNScoreVal); statusSource = `k-NN (Conf:${kNNConfidence.toFixed(2)})`;} if (buildingRecord.userVerifiedStatus && buildingRecord.userFeedbackDate) { const fbDate=new Date(buildingRecord.userFeedbackDate); const diffDays=(today.getTime()-fbDate.getTime())/(1000*3600*24); if(diffDays<=USER_FEEDBACK_VALIDITY_DAYS){finalUnrenovatedScore=buildingRecord.userVerifiedStatus==='unrenovated'?0.95:0.05;statusSource="User";}} finalUnrenovatedScore=Math.max(0,Math.min(1,finalUnrenovatedScore)); try{await saveBuildingData(buildingRecord);}catch(e){logger.error("Fail save buildingRecord (kNNPool)",e);} currentAnalysisResults.push({ id:imgResult.id||imgResult.addressQueryString, addressQueryString:imgResult.addressQueryString, features:currentFeatures, modelUnrenovatedScore, kNNVerdict, kNNConfidence, unrenovatedScore:finalUnrenovatedScore, statusSource, originalImageUrl:imgResult.streetViewImageUrl, houseNumber:imgResult.houseNumber }); } redrawResultTables(); updateSummary(); logger.info("Display updated (WorkerPool v1.8).");}
    async function handleResultRowDoubleClick(event) { logger.debug("New Promise: handleResultRowDoubleClick v1.8"); const rowEl=event.currentTarget; const addy=rowEl.dataset.addressQueryString; const item=currentAnalysisResults.find(r=>r.addressQueryString===addy); if(!item)return; const curStat=item.unrenovatedScore>=0.5?'unrenovated':'renovated'; const opStat=curStat==='unrenovated'?'renovated':'unrenovated'; const dispTxt=item.houseNumber||addy; const conf=await showConfirmationDialog(`Building:"${dispTxt}"\nStatus:${curStat}(${item.unrenovatedScore.toFixed(3)},Src:${item.statusSource})\n\nChange to ${opStat}?`,'tm-feedback-confirm-zl-v18'); if(conf){logger.info(`User feedback: Mark "${addy}" as ${opStat}.`);item.unrenovatedScore=opStat==='unrenovated'?0.95:0.05;item.statusSource="User (Switched)";let rec=await getBuildingData(addy);if(!rec)rec={addressQueryString:addy,comparisons:[]};rec.userVerifiedStatus=opStat;rec.userFeedbackDate=new Date().toISOString().slice(0,10).replace(/-/g,'/');if(item.features&&!rec.embedding){rec.embedding=item.features;rec.modelSignature=MODEL_SIGNATURE;}await saveBuildingData(rec);redrawResultTables();updateSummary();}}
    function showConfirmationDialog(message, dialogId = 'tm-general-confirm-dialog-zl-v18', yesText = "Yes", noText = "No") { logger.debug("New Promise: showConfirmationDialog v1.8", message.slice(0,30)); return new Promise(r => { const oid=dialogId+'-overlay';let exOv=document.getElementById(oid);if(exOv)exOv.remove();const ov=document.createElement('div');ov.id=oid;ov.className='dialog-overlay-zl-ui-v18';const dia=document.createElement('div');dia.className='dialog-box-zl-ui-v18';dia.innerHTML=`<p>${message}</p><button class="dialog-yes" style="background:#28a745">${yesText}</button><button class="dialog-no" style="background:#dc3545">${noText}</button>`;ov.appendChild(dia);document.body.appendChild(ov);const closeD=(v)=>{try{document.body.removeChild(ov);}catch(e){}r(v);};dia.querySelector('.dialog-yes').onclick=()=>closeD(true);dia.querySelector('.dialog-no').onclick=()=>closeD(false);});}
    function redrawResultTables() { logger.debug("redrawResultTables v1.8", currentAnalysisResults.length); currentAnalysisResults.sort((a,b)=>b.unrenovatedScore-a.unrenovatedScore); const unren=currentAnalysisResults.filter(r=>r.unrenovatedScore>=0.5).slice(0,4); const ren=[...currentAnalysisResults].filter(r=>r.unrenovatedScore<0.5).sort((a,b)=>a.unrenovatedScore-b.unrenovatedScore).slice(0,4); displayImageResults(unren,resultsTableUnrenovatedCell,"Unren.Scr"); displayImageResults(ren,resultsTableRenovatedCell,"Unren.Scr");}
    function displayImageResults(resultsList, tableCellElement, scoreLabel) { logger.debug("displayImageResults v1.8 for", scoreLabel, resultsList.length); tableCellElement.innerHTML='';if(resultsList.length===0){tableCellElement.textContent="N/A";return;}const ul=document.createElement('ul');ul.style.listStyleType='none';ul.style.paddingLeft='0';resultsList.forEach(item=>{const li=document.createElement('li');li.className='result-row-zl-v18';li.dataset.addressQueryString=item.addressQueryString;li.dataset.currentStatus=item.unrenovatedScore>=0.5?'unrenovated':'renovated';li.style.cssText='margin-bottom:5px;padding:3px;border:1px solid #eee;position:relative;';const img=document.createElement('img');img.src=item.originalImageUrl;li.appendChild(img);const txtN=document.createElement('span');const dTxt=item.houseNumber?`HN:${item.houseNumber}`:(item.addressQueryString?item.addressQueryString.slice(0,20)+'...':'UnkAddr');txtN.innerHTML=` ${dTxt}(${scoreLabel}:${item.unrenovatedScore.toFixed(3)})[${item.statusSource}]`;li.appendChild(txtN);li.addEventListener('mouseenter',showSwitchStatusUI);li.addEventListener('mouseleave',hideSwitchStatusUI);li.addEventListener('dblclick',handleResultRowDoubleClick);ul.appendChild(li);});tableCellElement.appendChild(ul);}
    function updateSummary() { logger.debug("updateSummary v1.8", currentAnalysisResults.length); const tot=currentAnalysisResults.length;const unrenC=currentAnalysisResults.filter(r=>r.unrenovatedScore>=0.5).length;const renC=tot-unrenC;const unrenP=tot>0?(unrenC/tot*100).toFixed(1):0;const renP=tot>0?(renC/tot*100).toFixed(1):0;summaryDiv.innerHTML=`Total views: ${tot}<br>Base Pair Sim: ${actualBasePairSimilarity!=null?actualBasePairSimilarity.toFixed(4):'N/A'}<br>Unrenovated (score>=0.5): ${unrenC}(${unrenP}%)<br>Renovated (score<0.5): ${renC}(${renP}%)`;}
    function showSwitchStatusUI(event) { const li=event.currentTarget;if(li.querySelector('.switch-status-overlay-zl'))return;hideSwitchStatusUI();const curStat=li.dataset.currentStatus;const tarStat=curStat==='unrenovated'?'renovated':'unrenovated';const addy=li.dataset.addressQueryString;switchStatusOverlay=document.createElement('div');switchStatusOverlay.className='switch-status-overlay-zl';switchStatusOverlay.style.cssText=`position:absolute;top:0;left:0;width:100%;height:100%;background-color:rgba(0,0,0,0.85);color:#fff;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;font-size:11px;padding:5px;box-sizing:border-box;opacity:0;transition:opacity .2s ease-in-out;cursor:default;`;const btn=document.createElement('button');btn.innerHTML=`${svgIconSwitch} Switch to ${tarStat}`;btn.style.cssText='padding:5px 8px;margin-top:5px;background-color:#ffc107;color:#000;border:none;border-radius:3px;cursor:pointer;';btn.onclick=async (e)=>{e.stopPropagation();hideSwitchStatusUI();logger.info(`User switch for "${addy}" to ${tarStat}.`);const itemUpd=currentAnalysisResults.find(r=>r.addressQueryString===addy);if(itemUpd){const conf=await showConfirmationDialog(`Switch status of "${itemUpd.houseNumber||addy}" to ${tarStat}?`,'tm-switch-confirm-zl-v18');if(conf){itemUpd.unrenovatedScore=tarStat==='unrenovated'?0.95:0.05;itemUpd.statusSource="User (Switched)";let rec=await getBuildingData(addy);if(!rec)rec={addressQueryString:addy,comparisons:[]};rec.userVerifiedStatus=tarStat;rec.userFeedbackDate=new Date().toISOString().slice(0,10).replace(/-/g,'/');if(itemUpd.features&&!rec.embedding){rec.embedding=itemUpd.features;rec.modelSignature=MODEL_SIGNATURE;}await saveBuildingData(rec);redrawResultTables();updateSummary();}}};const txt=document.createElement('p');txt.textContent=`Mark as ${tarStat}?`;txt.style.margin='5px 0';switchStatusOverlay.appendChild(txt);switchStatusOverlay.appendChild(btn);li.appendChild(switchStatusOverlay);requestAnimationFrame(()=>{if(switchStatusOverlay)switchStatusOverlay.style.opacity='1'});}
    function hideSwitchStatusUI() { if(switchStatusOverlay&&switchStatusOverlay.parentElement){switchStatusOverlay.parentElement.removeChild(switchStatusOverlay);}switchStatusOverlay=null;}


    // --- Script Initialization ---
    function loadGoogleMapsScript() {
        logger.debug("New Promise: Load Google Maps API Script (NativeCSS Register Btn v1.8)");
        return new Promise((resolve, reject) => {
            if (!API_KEY) { logger.error("Cannot load Google Maps API without an API Key."); updateBottomStatusBar({ apiKey: null, apiKeyFullStatus: "Unregistered", processStatus: "API Key Error - Required for Maps" }); reject(new Error("API Key missing for Maps load.")); return; }
            if (typeof window.google === 'object' && typeof window.google.maps === 'object') { logger.info("Google Maps API seems already loaded."); initializeGoogleMapsServices(); resolve(); return; }
            window.tmRenovisionNativeCssRegisterBtnInitMapZLv18 = () => { initializeGoogleMapsServices(); resolve(); };
            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=geometry,directions&callback=tmRenovisionNativeCssRegisterBtnInitMapZLv18`;
            script.async = true;
            script.onerror = (e) => { logger.error("Failed to load Google Maps API script:", e); updateBottomStatusBar({apiKey: API_KEY, apiKeyFullStatus: "Error (Invalid Key?)", processStatus: "Error - Gmaps Load Failed"}); reject(new Error("Google Maps API script load failed.")); };
            document.head.appendChild(script);
            logger.info("Google Maps API script tag injected, awaiting callback.");
        });
    }

    async function initScript() {
        logger.info("Initializing Renovision Script (ZLudany - NativeCSS Register Button v1.8)...");
        createUI();
        createBottomStatusBar();

        API_KEY = await getApiKey(false);

        if (!API_KEY) {
            logger.info("API Key not in localStorage. User needs to act.");
            if (startButton) startButton.disabled = true; // Keep start disabled until key is provided
            // Status bar updated by getApiKey
            return; // Do not proceed to load Gmaps or DB without key initially
        }

        try {
            const currentKeyFullStatusOnLoad = "Registered (localStorage)";
            updateBottomStatusBar({apiKey: API_KEY, apiKeyFullStatus: currentKeyFullStatusOnLoad, processStatus: "Initializing - Loading Maps"});
            await loadGoogleMapsScript();
            logger.debug("Attempting to setup IndexedDB post Gmaps load.");
            updateBottomStatusBar({apiKey: API_KEY, apiKeyFullStatus: currentKeyFullStatusOnLoad, processStatus: "Initializing - Setup DB"});
            await setupDB();
            updateBottomStatusBar({apiKey: API_KEY, apiKeyFullStatus: currentKeyFullStatusOnLoad, processStatus: "Ready"});
            if(startButton) startButton.disabled = false;
        } catch (err) {
            logger.error("Error during Gmaps load or DB setup in initScript:", err);
            const errorKeyStatus = API_KEY ? (localStorage.getItem(LOCALSTORAGE_API_KEY) ? "Registered (localStorage)" : "Session Only (Error)") : "Unregistered";
            if (crawlingStatusSpanGlobal && !crawlingStatusSpanGlobal.textContent.includes("Gmaps Load Failed")) {
                 updateBottomStatusBar({apiKey: API_KEY, apiKeyFullStatus: errorKeyStatus, processStatus: "Error - Initialization Failed"});
            }
            if(startButton) startButton.disabled = true;
        }
    }

    function initializeGoogleMapsServices() {
        logger.info("Google Maps API loaded callback. Initializing services (NativeCSS Register Btn v1.8)...");
        try {
            const mapElement = document.getElementById('tm-gmaps-map-renovision-zl-v18');
            if (!mapElement) { logger.error("Map div 'tm-gmaps-map-renovision-zl-v18' not found!"); throw new Error("Map div not found");}
            map = new google.maps.Map(mapElement, { center: { lat: 47.5086, lng: 19.0740 }, zoom: 16 });
            directionsService = new google.maps.DirectionsService();
            streetViewService = new google.maps.StreetViewService();
            geocoder = new google.maps.Geocoder();
            logger.info("Google Maps services successfully initialized (NativeCSS Register Btn v1.8).");
        } catch (e) {
            logger.error("Error initializing Google Maps Services (NativeCSS Register Btn v1.8):", e);
            const errorKeyStatus = API_KEY ? (localStorage.getItem(LOCALSTORAGE_API_KEY) ? "Registered (localStorage)" : "Session Only (Gmaps Init Error)"):"Unregistered";
            updateBottomStatusBar({apiKey: API_KEY, apiKeyFullStatus: errorKeyStatus, processStatus: "Error - Gmaps Init Failed"});
            if(startButton) startButton.disabled = true;
        }
    }

    initScript();

})();
