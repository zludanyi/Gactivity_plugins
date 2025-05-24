// ==UserScript==
// @name         Advanced Renovision
// @version      1.9.1
// @description  All features: NativeCSS, WorkerPool, Image Cache, Progress, ETR, Batch/Swipe Feedback, Adv. Scoring, Uncertainty.
// @author       ZLudany
// @match        *://*.ingatlan.com/*
// @run-at       document-end
// ==/UserScript==

// --- Logger Class ---
const LogLevel = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, NONE: 4 };
class Logger {
    constructor(componentName = 'UserScript', config = {}) {
        this.componentName = componentName;
        const defaultConfig = {
            level: LogLevel.DEBUG,
            logToConsole: true,
            logToUiElement: true,
            logToAlert: true,
            alertLogLevel: LogLevel.DEBUG,
            enableWorkerLoggingRelay: true
        };
        this.config = { ...defaultConfig, ...config };
        this.logHistory = [];
        this.uiLogElement = null;
    }

    setConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.info(`Logger configuration updated for [${this.componentName}]`);
    }

    setUiLogElement(element) {
        if (element instanceof HTMLElement) {
            this.uiLogElement = element;
        } else {
            this.warn("Invalid element provided for UI logging.");
        }
    }

    _log(level, levelStr, messages, fromWorker = false) {
        if (level < this.config.level) return;
        if (fromWorker && !this.config.enableWorkerLoggingRelay && level < LogLevel.WARN) return;

        const timestamp = new Date().toISOString();
        const prefix = fromWorker ? `[WORKER] [${this.componentName}]` : `[${this.componentName}]`;
        const logEntry = {
            timestamp,
            level: levelStr,
            component: prefix,
            messages: messages.map(msg => (typeof msg === 'object' ? (msg instanceof Error ? `${msg.name}: ${msg.message} (Stack: ${msg.stack})` : JSON.stringify(msg, null, 2)) : String(msg)))
        };
        this.logHistory.push(logEntry);
        const messageString = logEntry.messages.join(' ');

        if (this.config.logToConsole) {
            const consoleArgs = [`%c[${timestamp}] [${levelStr}] ${prefix}:`, this._getLogLevelColor(level), ...messages];
            switch (level) {
                case LogLevel.DEBUG: console.debug(...consoleArgs); break;
                case LogLevel.INFO:  console.info(...consoleArgs);  break;
                case LogLevel.WARN:  console.warn(...consoleArgs);  break;
                case LogLevel.ERROR: console.error(...consoleArgs); break;
            }
        }

        const uiLogTarget = (fromWorker && this.config.enableWorkerLoggingRelay) || (!fromWorker && this.config.logToUiElement) ? this.uiLogElement : null;
        if (uiLogTarget) {
            const logLine = document.createElement('div');
            logLine.style.color = this._getLogLevelColor(level, true);
            const displayPrefix = fromWorker ? `[WORKER] ` : '';
            logLine.textContent = `${displayPrefix}[${timestamp.split('T')[1].split('.')[0]}] [${levelStr}]: ${messageString}`;
            uiLogTarget.appendChild(logLine);
            uiLogTarget.scrollTop = uiLogTarget.scrollHeight;
        }

        if (this.config.logToAlert && level >= this.config.alertLogLevel) {
            let alertMsg = `Level: ${levelStr}\nComponent: ${prefix}\nTimestamp: ${timestamp.split('T')[1].split('.')[0]}\n\nMessage(s):\n`;
            messages.forEach(msg => {
                if (typeof msg === 'object') {
                    try { alertMsg += JSON.stringify(msg, null, 2) + '\n'; } catch (e) { alertMsg += "[Unserializable Object]\n"; }
                } else { alertMsg += msg + '\n'; }
            });
            alert(alertMsg.substring(0, 1000));
        }
    }

    _getLogLevelColor(level, forInlineStyle = false) {
        const colors = {
            [LogLevel.DEBUG]: forInlineStyle ? 'blue' : 'color: blue;',
            [LogLevel.INFO]: forInlineStyle ? 'green' : 'color: green;',
            [LogLevel.WARN]: forInlineStyle ? 'orange' : 'color: orange;',
            [LogLevel.ERROR]: forInlineStyle ? 'red' : 'color: red;',
        };
        return colors[level] || (forInlineStyle ? 'black' : 'color: black;');
    }

    debug(...messages) { this._log(LogLevel.DEBUG, 'DEBUG', messages); }
    info(...messages) { this._log(LogLevel.INFO, 'INFO', messages); }
    warn(...messages) { this._log(LogLevel.WARN, 'WARN', messages); }
    error(...messages) { this._log(LogLevel.ERROR, 'ERROR', messages); }
    relayWorkerLog(level, levelStr, messages) { this._log(level, levelStr, messages, true); }
}

// --- WorkerPool Class ---
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
        for (let i = 0; i < this.maxWorkers; i++) {
            this._addWorker();
        }
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
        }
    }

    _removeWorker() {
        if (this.workers.length <= 1) {
            this.mainLogger.debug("WorkerPool: Cannot remove worker, minimum 1 worker policy.");
            return false;
        }
        const workerToRemove = this.workers.find(w => !w.busy);
        if (workerToRemove) {
            workerToRemove.worker.terminate();
            this.workers = this.workers.filter(w => w.id !== workerToRemove.id);
            this.mainLogger.info(`WorkerPool: Idle worker ${workerToRemove.id} terminated for resizing.`);
            return true;
        } else if (this.workers.length > 0) {
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

        if (targetMax > this.workers.length && this.workers.length < this.maxWorkers) {
            const workersToAdd = Math.min(targetMax - this.workers.length, this.maxWorkers - this.workers.length);
            this.mainLogger.info(`WorkerPool: Adding ${workersToAdd} new worker(s).`);
            for (let i = 0; i < workersToAdd; i++) {
                this._addWorker();
            }
        } else if (targetMax < this.workers.length) {
            const workersToRemove = this.workers.length - targetMax;
            this.mainLogger.info(`WorkerPool: Removing ${workersToRemove} worker(s).`);
            for (let i = 0; i < workersToRemove; i++) {
                if (!this._removeWorker()) break;
            }
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
                workerEntry.busy = true;
                this.activeWorkers++;
                workerEntry.currentTask = task;
                this.mainLogger.debug(`WorkerPool: Assigning task ID ${task.id} (Addr: ${task.addressQueryString ? task.addressQueryString.slice(0,20) : 'N/A'}...) to worker ${workerEntry.id}`);
                try {
                    if (task.imageData && task.imageData.data && task.imageData.data.buffer) {
                        workerEntry.worker.postMessage({
                            type: 'EXTRACT_FEATURES',
                            imageDataPayload: { dataBuffer: task.imageData.data.buffer, width: task.imageData.width, height: task.imageData.height },
                            id: task.id, addressQueryString: task.addressQueryString
                        }, [task.imageData.data.buffer]);
                    } else {
                        throw new Error("Invalid imageData format for transferable postMessage.");
                    }
                } catch (e) {
                    this.mainLogger.error(`WorkerPool: Error posting message to worker ${workerEntry.id}:`, e);
                    task.reject(e);
                    workerEntry.busy = false;
                    this.activeWorkers--;
                    workerEntry.currentTask = null;
                    this.assignTasksToWorkers();
                }
            }
        }
    }

    handleWorkerMessage(workerId, event) {
        const workerEntry = this.workers.find(w => w.id === workerId);
        if (!workerEntry) {
            this.mainLogger.warn(`WorkerPool: Message from unknown workerId ${workerId}.`);
            return;
        }

        const data = event.data;
        if (data.type === 'WORKER_LOG_RELAY') {
            this.mainLogger.relayWorkerLog(data.payload.level, data.payload.levelStr, data.payload.messages);
            return;
        }
        if (!workerEntry.currentTask) {
            this.mainLogger.warn(`WorkerPool: Message from idle worker ${workerId} (not WORKER_LOG_RELAY):`, data);
            return;
        }

        const task = workerEntry.currentTask;
        this.mainLogger.debug(`WorkerPool: Message received from worker ${workerId}, type: ${data.type}, task ID: ${task.id}`);

        const processingTime = Date.now() - task.startTime;
        this.performanceData.totalImagesProcessed++;
        this.performanceData.totalProcessingTime += processingTime;
        if (this.performanceData.totalImagesProcessed > 0) {
            this.performanceData.avgTimePerImage = this.performanceData.totalProcessingTime / this.performanceData.totalImagesProcessed;
        }

        if (data.type === 'FEATURE_RESULT') {
            task.resolve({features: data.features, id: data.id || task.id, addressQueryString: data.addressQueryString || task.addressQueryString });
        } else if (data.type === 'MODEL_LOADED_IN_WORKER') {
            this.mainLogger.info(`WorkerPool: Worker ${workerId} confirmed model loaded from ${data.source}. Task still pending features.`);
            return;
        } else if (data.type === 'ERROR') {
            this.mainLogger.error(`WorkerPool: Error from worker ${workerId} for task ${task.id}:`, data.message);
            task.reject(new Error(data.message));
        } else {
            this.mainLogger.warn(`WorkerPool: Unknown message type ${data.type} from worker ${workerId}. Task ${task.id} may fail.`);
            task.reject(new Error(`Unknown message type from worker: ${data.type}`));
        }

        workerEntry.busy = false;
        this.activeWorkers--;
        workerEntry.currentTask = null;
        this.adjustWorkerCountBasedOnPerformance();
        this.assignTasksToWorkers();
    }

    handleWorkerError(workerId, errorEvent) {
        const workerEntry = this.workers.find(w => w.id === workerId);
        this.mainLogger.error(`WorkerPool: Uncaught error in worker ${workerId}:`, errorEvent.message, errorEvent.filename, errorEvent.lineno);
        if (workerEntry && workerEntry.currentTask) {
            workerEntry.currentTask.reject(new Error(`Uncaught error in worker ${workerId}: ${errorEvent.message}`));
            workerEntry.busy = false;
            this.activeWorkers--;
            workerEntry.currentTask = null;
        }
        this.mainLogger.warn(`WorkerPool: Worker ${workerId} errored. Terminating and attempting to replace.`);
        try { workerEntry?.worker.terminate(); } catch(e){ this.mainLogger.warn("Error terminating errored worker:", e); }
        this.workers = this.workers.filter(w => w.id !== workerId);
        if (this.workers.length < this.maxWorkers) {
            this.mainLogger.debug("Adding new worker to replace errored one.");
            this._addWorker();
        }
        this.assignTasksToWorkers();
    }

    adjustWorkerCountBasedOnPerformance() {
        if (Date.now() - this.performanceData.lastAdjustmentTimestamp < 20000) return;
        this.mainLogger.debug("WorkerPool: Checking performance for adjustment. Avg time:", this.performanceData.avgTimePerImage.toFixed(2), "ms");
        if (this.performanceData.totalImagesProcessed < this.workers.length * 2 && this.performanceData.totalImagesProcessed < 10) {
            this.mainLogger.debug("WorkerPool: Not enough data for performance adjustment yet.");
            return;
        }

        const coreCount = navigator.hardwareConcurrency || 4;
        const targetOptimalWorkers = Math.max(1, coreCount > 1 ? coreCount - 1 : 1);

        if (this.performanceData.avgTimePerImage > 1500 && this.workers.length < targetOptimalWorkers && this.workers.length < this.maxWorkers) {
            this.mainLogger.info("WorkerPool: Performance suggests adding a worker (slow and below optimal). Current workers:", this.workers.length, "Target optimal:", targetOptimalWorkers);
            this.resizePool(this.workers.length + 1);
        } else if (this.performanceData.avgTimePerImage < this.performanceData.previousAvgTime * 0.85 && this.workers.length < this.maxWorkers && this.workers.length < (coreCount*2) ) {
            this.mainLogger.info("WorkerPool: Performance suggests adding a worker (seeing improvement). Current workers:", this.workers.length);
            this.resizePool(this.workers.length + 1);
        } else if (this.performanceData.avgTimePerImage > this.performanceData.previousAvgTime * 1.20 && this.workers.length > 1 && this.workers.length > Math.max(1, targetOptimalWorkers / 2) ) {
            this.mainLogger.info("WorkerPool: Performance suggests removing a worker (diminishing returns or too many). Current workers:", this.workers.length);
            this.resizePool(this.workers.length - 1);
        }
        this.performanceData.previousAvgTime = this.performanceData.avgTimePerImage;
        this.performanceData.lastAdjustmentTimestamp = Date.now();
    }

    getStatus() { return { totalWorkers: this.workers.length, busyWorkers: this.activeWorkers, queuedTasks: this.taskQueue.length, avgTime: this.performanceData.avgTimePerImage }; }
    terminate() {
        this.mainLogger.info("WorkerPool: Terminating all workers.");
        this.workers.forEach(w => { try { w.worker.terminate(); } catch(e){ this.mainLogger.warn("Error terminating worker:", e); }});
        this.workers = [];
        this.taskQueue = [];
        this.activeWorkers = 0;
    }
}


(async function() {
    'use strict';

    const MAIN_THREAD_LOG_CONFIG = {
        level: LogLevel.DEBUG,
        logToConsole: true,
        logToUiElement: true,
        logToAlert: true,
        alertLogLevel: LogLevel.DEBUG,
        enableWorkerLoggingRelay: true
    };
    const WORKER_LOG_CONFIG_FOR_POOL = {
        level: LogLevel.DEBUG,
        logToMainThread: true
    };
    const logger = new Logger('RenovisionBeautified', MAIN_THREAD_LOG_CONFIG);

    let API_KEY = '';
    const LOCALSTORAGE_API_KEY = 'renovisionUserApiKeyZL_v1.9.1Final';
    const STREET_VIEW_IMAGE_REQUEST_SIZE = '320x240';
    const TF_MODEL_INPUT_WIDTH = 224;
    const TF_MODEL_INPUT_HEIGHT = 224;
    const K_NEAREST_NEIGHBORS = 5;
    const MAX_EMBEDDINGS_FOR_KNN_QUERY = 100;
    const DB_NAME = 'BuildingRenovisionDB_v1.9.1_Final';
    const DB_VERSION = 2;
    const BUILDING_STORE_NAME = 'buildings';
    const IMAGE_CACHE_STORE_NAME = 'imageCache';
    let db;
    const MODEL_SIGNATURE = `MobileNetV2_Features_Pool_v1.9.1`;
    let renovatedCentroid = null;
    let unrenovatedCentroid = null;
    let allImagesToProcess = [];

    const TARGET_STREET_START_ADDRESS = "Benczúr utca 1, Budapest, Hungary";
    const TARGET_STREET_END_ADDRESS = "Benczúr utca & Bajza utca, Budapest, Hungary";
    const STREET_VIEW_FOV = 80;
    const STREET_VIEW_PITCH = 5;
    const SAMPLING_INTERVAL_METERS = 25;
    const PROJECTION_DISTANCE_METERS = 15;
    const USER_FEEDBACK_VALIDITY_DAYS = 90;

    let map;
    let directionsService;
    let streetViewService;
    let geocoder;
    let controlPanel;
    let mapDiv;
    let resultsTableUnrenovatedCell;
    let resultsTableRenovatedCell;
    let summaryDiv;
    let logDivUiElement;
    let startButton;
    let workerPoolInstance = null;
    let currentAnalysisResults = [];
    let isCrawlingGlobal = false;
    let bottomStatusBar;
    let apiKeyStatusSpanGlobal;
    let crawlingStatusSpanGlobal;
    let stopCrawlingButtonGlobal;
    let registerApiKeyButtonGlobal;
    let switchStatusOverlay = null;
    let progressBarContainerGlobal;
    let progressBarRectGlobal;
    let etrSpanGlobal;

    const svgIconUnrenovated = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style="color:red; vertical-align:middle; margin-right:5px;"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0M5.354 4.646a.5.5 0 1 0-.708.708L7.293 8l-2.647 2.646a.5.5 0 1 0 .708.708L8 8.707l2.646 2.647a.5.5 0 0 0 .708-.708L8.707 8l2.647-2.646a.5.5 0 0 0-.708-.708L8 7.293z"/></svg>`;
    const svgIconRenovated = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style="color:green; vertical-align:middle; margin-right:5px;"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0m-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/></svg>`;
    const svgIconStop = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-stop-circle-fill" viewBox="0 0 16 16" style="vertical-align: middle; margin-right: 3px;"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0M6.5 5A1.5 1.5 0 0 0 5 6.5v3A1.5 1.5 0 0 0 6.5 11h3A1.5 1.5 0 0 0 11 9.5v-3A1.5 1.5 0 0 0 9.5 5z"/></svg>`;
    const svgIconKey = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-key-fill" viewBox="0 0 16 16" style="vertical-align: middle; margin-right: 3px;"><path d="M3.5 11.5a3.5 3.5 0 1 1 3.163-5H14L15.5 8 14 9.5l-1-1-1 1-1-1-1 1-1-1-1 1H6.663a3.5 3.5 0 0 1-3.163 2M2.5 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2"/></svg>`;
    const svgIconSwitch = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-arrow-left-right" viewBox="0 0 16 16" style="vertical-align: middle; margin-right: 3px;"><path fill-rule="evenodd" d="M1 11.5a.5.5 0 0 0 .5.5h11.793l-3.147 3.146a.5.5 0 0 0 .708.708l4-4a.5.5 0 0 0 0-.708l-4-4a.5.5 0 0 0-.708.708L13.293 11H1.5a.5.5 0 0 0-.5.5m14-7a.5.5 0 0 1-.5.5H2.707l3.147 3.146a.5.5 0 1 1-.708.708l-4-4a.5.5 0 0 1 0-.708l4-4a.5.5 0 1 1 .708.708L2.707 4H14.5a.5.5 0 0 1 .5.5"/></svg>`;

    function createFeatureExtractionWorkerScriptContent() {
        logger.debug("Creating worker script content string for feature extraction (v1.9.1).");
        const tfjsCdnUrl = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.18.0';
        const modelUrl = 'https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v2_1.0_224/model.json';
        const featureLayerNameDefault = 'global_average_pooling2d_1';
        const expectedImgSize = 224;

        // Worker script content (template literal - no extra line breaks here)
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
            const MODEL_URL_W = '${modelUrl}'; const FEATURE_LAYER_NAME_W = '${featureLayerNameDefault}'; const EXPECTED_IMG_SIZE_W = ${expectedImgSize};

            async function initializeModel_W() {
                _W.d("Worker: initializeModel_W called."); if (featureExtractorModel_W) return true;
                _W.d("Worker: Attempting to load model from:", MODEL_URL_W);
                const modelPathInDb = 'indexeddb://renovision-mobilenet-v2-features';
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
                if (!featureExtractorModel_W) { const modelReady = await initializeModel_W(); if (!modelReady) throw new Error('Model could not be initialized in worker.'); }
                const { dataBuffer, width, height } = imageDataPayloadObj.imageDataPayload;
                if (!dataBuffer || width === 0 || height === 0) { _W.w("Worker: Invalid image data for feature extraction."); return null; }
                _W.d("Worker: Image for extraction - w:", width, "h:", height, "buffer:", dataBuffer.byteLength);

                return tf_W.tidy(() => {
                    const pixelData = new Uint8Array(dataBuffer);
                    let imageTensor = tf_W.tensor3d(pixelData, [height, width, 4], 'int32');
                    imageTensor = imageTensor.slice([0, 0, 0], [height, width, 3]);
                    const resizedTensor = tf_W.image.resizeBilinear(imageTensor, [EXPECTED_IMG_SIZE_W, EXPECTED_IMG_SIZE_W]);
                    const preprocessedTensor = resizedTensor.toFloat().div(127.5).sub(1);
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
                const { type, payload, imageDataPayload, id, addressQueryString, logConfig, tfjsUrl } = e.data;

                if (type === 'INIT_TF_AND_CONFIG_WORKER_POOL') {
                    workerConfig_W = payload.logConfig || workerConfig_W;
                     _W.i('Worker: INIT_TF_AND_CONFIG_WORKER_POOL. TFJS URL:', payload.tfjsUrl, 'Log Cfg:', workerConfig_W);
                    try {
                        _W.d("Worker: New Promise (implicit): importScripts for TFJS"); importScripts(payload.tfjsUrl);
                        tf_W = self.tf;
                        if (tf_W) { const modelReady = await initializeModel_W(); if (modelReady) { _W.i('Worker: TF.js and Model initialized successfully via WorkerPool.'); self.postMessage({ type: 'WORKER_READY_POOL' }); } else { throw new Error("Model initialization failed after TF.js load."); }}
                        else { throw new Error('tf object not found after importScripts.');}
                    } catch (err) { _W.e('Worker: Error importing/init TF.js in WorkerPool setup:', err.message, err.stack); self.postMessage({ type: 'ERROR', message: 'Worker TF/Model Init Failed: ' + err.message, id: 'worker_init' }); }
                    return;
                }
                if (type === 'EXTRACT_FEATURES') {
                    _W.d("Worker: EXTRACT_FEATURES request for ID:", id, "Address:", addressQueryString);
                    try {
                        _W.debug("Worker: New Promise (implicit): extractFeatures_W");
                        const features = await extractFeatures_W({imageDataPayload, id});
                        if (features) { self.postMessage({ type: 'FEATURE_RESULT', features: features, id: id, addressQueryString: addressQueryString });}
                        else { throw new Error("Feature extraction returned null/undefined."); }
                    } catch (err) { _W.e('Worker: Error during feature extraction for ID:', id, err.message, err.stack); self.postMessage({ type: 'ERROR', message: err.message, id: id, addressQueryString: addressQueryString }); }
                } else if (type) { _W.w("Worker: Unknown message type received:", type); }
                 else { _W.e("Worker: Message received without a 'type' property", e.data); }
            };
            _W.i("Worker: Script loaded, onmessage handler set. TFJS URL for import: ${tfjsCdnUrl}");
        `;
    }

    async function promptForApiKey() {
        logger.debug("New Promise: Prompt user for API Key via modal (v1.9.1).");
        updateBottomStatusBar({ apiKey: API_KEY, apiKeyFullStatus: "Unknown (Awaiting Input)", processStatus: "Awaiting API Key Input", progress: 0, etrString: "" });
        return new Promise((resolve) => {
            const overlayId = 'tm-apikey-modal-overlay-zl-v19final';
            if (document.getElementById(overlayId)) {
                logger.warn("API Key modal already shown.");
                resolve(API_KEY || null);
                return;
            }
            const overlay = document.createElement('div');
            overlay.id = overlayId;
            overlay.className = 'dialog-overlay-zl-ui-v19final';
            const dialog = document.createElement('div');
            dialog.className = 'dialog-box-zl-ui-v19final';
            dialog.style.minWidth = '350px';
            dialog.innerHTML = `
                <h3>Google Maps API Key Required</h3>
                <p>Please enter your Google Maps API Key to proceed. This key is used to fetch Street View images.</p>
                <div style="margin-bottom: 10px; position: relative;">
                    <input type="password" id="tm-apikey-input-zl-v19final" placeholder="Enter API Key (e.g., AIza...)" style="width: calc(100% - 40px); padding: 8px;" />
                    <button id="tm-apikey-toggle-zl-v19final" style="position: absolute; right: 5px; top: 50%; transform: translateY(-50%); padding: 5px; font-size:10px; background: #eee; color: #333; border:1px solid #ccc; width:30px;">Show</button>
                </div>
                <p style="font-size: 0.9em; color: #555;">
                    * Crawling can be interrupted. Your API key can be cleared from local storage.
                </p>
                <button id="tm-apikey-submit-zl-v19final" style="background-color: #28a745;">Save and Continue</button>
                <button id="tm-apikey-cancel-zl-v19final" style="background-color: #dc3545;">Cancel</button>
            `;
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
            const apiKeyInput = document.getElementById('tm-apikey-input-zl-v19final');
            const toggleBtn = document.getElementById('tm-apikey-toggle-zl-v19final');

            toggleBtn.addEventListener('click', () => {
                if (apiKeyInput.type === "password") {
                    apiKeyInput.type = "text";
                    toggleBtn.textContent = "Hide";
                } else {
                    apiKeyInput.type = "password";
                    toggleBtn.textContent = "Show";
                }
            });
            const closeDialogAndResolve = (value) => {
                try { document.body.removeChild(overlay); } catch(e){}
                resolve(value);
            };

            document.getElementById('tm-apikey-submit-zl-v19final').addEventListener('click', () => {
                const key = apiKeyInput.value;
                if (key && key.trim() !== "") {
                    API_KEY = key.trim();
                    try {
                        localStorage.setItem(LOCALSTORAGE_API_KEY, API_KEY);
                        logger.info("API Key obtained from prompt and stored in localStorage.");
                        updateBottomStatusBar({ apiKey: API_KEY, apiKeyFullStatus: "Registered (localStorage)", processStatus: "Ready", progress: 0, etrString: "" });
                    } catch (e) {
                        logger.warn("Error saving API Key to localStorage:", e);
                        updateBottomStatusBar({ apiKey: API_KEY, apiKeyFullStatus: "Error - Session only, saving failed", processStatus: "Ready", progress: 0, etrString: "" });
                        alert("Could not save API Key to localStorage.");
                    }
                    closeDialogAndResolve(API_KEY);
                } else {
                    logger.warn("Empty API Key entered in prompt.");
                    alert("Please enter a valid API Key.");
                }
            });
            document.getElementById('tm-apikey-cancel-zl-v19final').addEventListener('click', () => {
                logger.info("User cancelled API Key prompt.");
                updateBottomStatusBar({ apiKey: null, apiKeyFullStatus: "Unregistered (User Cancelled)", processStatus: "Cancelled", progress: 0, etrString: "" });
                closeDialogAndResolve(null);
            });
        });
    }

    async function getApiKey(promptIfMissing = true) {
        logger.debug("Attempting to get API Key. PromptIfMissing: "+promptIfMissing);
        let storedKey = null;
        try {
            storedKey = localStorage.getItem(LOCALSTORAGE_API_KEY);
        } catch (e) {
            logger.debug("Could not access localStorage to get API Key:", e);
        }

        if (storedKey && storedKey.trim() !== "") {
            API_KEY = storedKey;
            logger.debug("API Key loaded from localStorage: "+API_KEY);
            updateBottomStatusBar({ apiKey: API_KEY, apiKeyFullStatus: "Registered (localStorage)", processStatus: "Ready", progress: 0, etrString: ""});
            return API_KEY;
        } else {
            API_KEY = '';
            if (promptIfMissing) {
                return await promptForApiKey();
            } else {
                updateBottomStatusBar({ apiKey: null, apiKeyFullStatus: "Unregistered (Not Found)", processStatus: "Awaiting Key", progress: 0, etrString: ""});
                return null;
            }
        }
    }

    function clearApiKeyFromStorage() {
        logger.debug("Clearing API Key from localStorage.");
        try {
            localStorage.removeItem(LOCALSTORAGE_API_KEY);
            API_KEY = '';
            logger.info('API Key cleared from localStorage and session.');
            updateBottomStatusBar({ apiKey: null, apiKeyFullStatus: "Unregistered (User Cleared)", processStatus: "Key Cleared", progress: 0, etrString: "" });
            alert('API Key cleared.');
        } catch (e) {
            logger.error("Error clearing API Key from localStorage:", e);
            updateBottomStatusBar({ apiKey: API_KEY, apiKeyFullStatus: API_KEY ? "Unknown (Clear Failed)" : "Unregistered (Clear Failed)", processStatus: "Error - Clearing Key", progress: 0, etrString: ""});
            alert("Error clearing API Key from localStorage.");
        }
    }

    // --- IndexedDB Utilities (MODIFIED for imageCache store) ---
    async function setupDB() {
        logger.debug("New Promise: Setup IndexedDB", DB_NAME, "v" + DB_VERSION);
        return new Promise((resolve, reject) => {
            logger.debug("Setting up IndexedDB details:", DB_NAME, "v" + DB_VERSION);
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                logger.error("IndexedDB error:", event.target.errorCode, event);
                reject("IndexedDB error: " + event.target.errorCode);
            };

            request.onsuccess = (event) => {
                db = event.target.result;
                logger.info("IndexedDB setup successful. DB instance:", db);
                resolve(db);
            };

            request.onupgradeneeded = (event) => {
                logger.info("IndexedDB upgrade needed for", DB_NAME, "Old version:", event.oldVersion, "New version:", event.newVersion);
                db = event.target.result;
                const transaction = event.target.transaction; // Get transaction from event
                let storeBuildings;
                let storeImageCache;

                if (!db.objectStoreNames.contains(BUILDING_STORE_NAME)) {
                    logger.info("Creating object store:", BUILDING_STORE_NAME);
                    storeBuildings = db.createObjectStore(BUILDING_STORE_NAME, { keyPath: 'addressQueryString' });
                } else {
                    logger.debug("Object store", BUILDING_STORE_NAME, "already exists. Accessing for potential index creation.");
                    // Need to access store via transaction if it exists and we are in onupgradeneeded
                    if (transaction) {
                         storeBuildings = transaction.objectStore(BUILDING_STORE_NAME);
                    } else {
                        // This case should ideally not happen if onupgradeneeded is correctly triggered
                        logger.warn("Could not get transaction to access existing building store during upgrade.");
                    }
                }

                if (storeBuildings) { // Check if storeBuildings was successfully created or accessed
                    if (!storeBuildings.indexNames.contains('userVerifiedStatus')) {
                        logger.info("Creating index 'userVerifiedStatus' on store", BUILDING_STORE_NAME);
                        storeBuildings.createIndex('userVerifiedStatus', 'userVerifiedStatus', { unique: false });
                    }
                    if (!storeBuildings.indexNames.contains('lastUpdated')) {
                        logger.info("Creating index 'lastUpdated' on store", BUILDING_STORE_NAME);
                        storeBuildings.createIndex('lastUpdated', 'lastUpdated', { unique: false });
                    }
                } else {
                    logger.error("Building store could not be accessed or created during DB upgrade.");
                }

                // For Image Blob Caching (Feature #1 from previous list)
                if (!db.objectStoreNames.contains(IMAGE_CACHE_STORE_NAME)) {
                    logger.info("Creating object store:", IMAGE_CACHE_STORE_NAME);
                    storeImageCache = db.createObjectStore(IMAGE_CACHE_STORE_NAME, { keyPath: 'url' });
                    // Optional: Index for expiry timestamp if you implement that
                    // if (storeImageCache && !storeImageCache.indexNames.contains('expires')) {
                    //     storeImageCache.createIndex('expires', 'expires', { unique: false });
                    // }
                } else {
                     logger.debug("Object store", IMAGE_CACHE_STORE_NAME, "already exists.");
                }
                logger.info("IndexedDB upgrade complete.");
            };
        });
    }

    async function getImageBlobFromCache(url) {
        logger.debug("New Promise: Get ImageBlob from Cache", url.slice(-50));
        return new Promise((resolve) => { // Changed to not use reject for simpler flow
            if (!db) {
                logger.warn("DB not ready for image cache read for URL:", url);
                resolve(null);
                return;
            }
            try {
                const transaction = db.transaction([IMAGE_CACHE_STORE_NAME], 'readonly');
                const store = transaction.objectStore(IMAGE_CACHE_STORE_NAME);
                const request = store.get(url);

                request.onsuccess = (event) => {
                    if (event.target.result) {
                        logger.debug("Image blob FOUND in cache for:", url.slice(-50));
                        resolve(event.target.result.blob); // Assuming stored as {url: string, blob: Blob}
                    } else {
                        logger.debug("Image blob NOT found in cache for:", url.slice(-50));
                        resolve(null);
                    }
                };
                request.onerror = (event) => {
                    logger.error("Error getting image blob from cache for URL:", url, "Error code:", event.target.errorCode, event);
                    resolve(null);
                };
            } catch (e) {
                logger.error("Exception during getImageBlobFromCache transaction for URL:", url, e);
                resolve(null);
            }
        });
    }

    async function saveImageBlobToCache(url, blob) {
        logger.debug("New Promise: Save ImageBlob to Cache", url.slice(-50), "Blob size:", blob.size);
        return new Promise((resolve, reject) => {
            if (!db) {
                logger.warn("DB not ready for image cache write for URL:", url);
                reject("DB not ready");
                return;
            }
            try {
                const transaction = db.transaction([IMAGE_CACHE_STORE_NAME], 'readwrite');
                const store = transaction.objectStore(IMAGE_CACHE_STORE_NAME);
                const dataToStore = { url: url, blob: blob, timestamp: Date.now() }; // Add timestamp for potential pruning
                const request = store.put(dataToStore);

                request.onsuccess = () => {
                    logger.debug("Image blob saved to cache for:", url.slice(-50));
                    resolve();
                };
                request.onerror = (event) => {
                    logger.error("Error saving image blob to cache for URL:", url, "Error code:", event.target.errorCode, event);
                    reject(event.target.errorCode);
                };
            } catch (e) {
                 logger.error("Exception during saveImageBlobToCache transaction for URL:", url, e);
                 reject(e);
            }
        });
    }

    async function getBuildingData(addressQueryString) {
        logger.debug("New Promise: getBuildingData v1.9.1", addressQueryString);
        return new Promise((resolve, reject) => {
            if (!db) {
                logger.warn("DB not initialized for getBuildingData");
                reject("DB not initialized"); // Consistently reject
                return;
            }
            try {
                const transaction = db.transaction([BUILDING_STORE_NAME], 'readonly');
                const store = transaction.objectStore(BUILDING_STORE_NAME);
                const request = store.get(addressQueryString);
                request.onsuccess = (event) => {
                    logger.debug("Retrieved building data for:", addressQueryString, event.target.result ? "(Found)" : "(Not Found)");
                    resolve(event.target.result); // result is undefined if not found
                };
                request.onerror = (event) => {
                    logger.error("Error getting building data from DB:", event.target.errorCode, event);
                    reject(event.target.errorCode);
                };
            } catch (e) {
                logger.error("Exception in getBuildingData:", e);
                reject(e);
            }
        });
    }

    async function saveBuildingData(buildingData) {
        logger.debug("New Promise: saveBuildingData v1.9.1", buildingData.addressQueryString);
        buildingData.lastUpdated = new Date().toISOString();
        return new Promise((resolve, reject) => {
            if (!db) {
                logger.warn("DB not initialized for saveBuildingData");
                reject("DB not initialized");
                return;
            }
            try {
                const transaction = db.transaction([BUILDING_STORE_NAME], 'readwrite');
                const store = transaction.objectStore(BUILDING_STORE_NAME);
                const request = store.put(buildingData);
                request.onsuccess = () => {
                    logger.debug("Saved building data for:", buildingData.addressQueryString);
                    resolve();
                };
                request.onerror = (event) => {
                    logger.error("Error saving building data to DB:", event.target.errorCode, event);
                    reject(event.target.errorCode);
                };
            } catch (e) {
                logger.error("Exception in saveBuildingData:", e);
                reject(e);
            }
        });
    }

    async function clearIndexedDB() {
        logger.info("clearIndexedDB v1.9.1 is called.");
        if (db) {
            logger.debug("Attempting to close existing DB connection before deletion.");
            try {
                db.close();
                logger.info("DB connection closed.");
            } catch(e){
                logger.warn("Error closing DB during clearIndexedDB (might be already closed or invalid):", e);
            }
            db = null; // Ensure db variable is reset
        }
        logger.debug("New Promise: Delete IndexedDB v1.9.1", DB_NAME);
        return new Promise((resolve, reject) => {
            const req = indexedDB.deleteDatabase(DB_NAME);
            req.onsuccess = () => {
                logger.info("IndexedDB cache cleared successfully via deleteDatabase.");
                alert("IndexedDB cache cleared.");
                resolve();
            };
            req.onerror = (e) => {
                logger.error("Error deleting IndexedDB database:", e.target.errorCode, e);
                alert("Error clearing IndexedDB.");
                reject(e);
            };
            req.onblocked = (e) => {
                logger.warn("Clearing IndexedDB blocked. Please close other tabs/windows using this database and try again.", e);
                alert("Clearing IndexedDB blocked. Please close other tabs that might be using this database and try again.");
                reject(e); // Reject on blocked as well, as the operation didn't complete.
            };
        });
    }

    async function getVerifiedFeatures(limit = MAX_EMBEDDINGS_FOR_KNN_QUERY) {
        logger.debug("New Promise: getVerifiedFeatures v1.9.1, limit:", limit);
        return new Promise((resolve, reject) => {
            if (!db) {
                logger.warn("DB not initialized for getVerifiedFeatures.");
                reject(new Error("DB not initialized")); // Reject with an Error object
                return;
            }
            try {
                const transaction = db.transaction([BUILDING_STORE_NAME], "readonly");
                const store = transaction.objectStore(BUILDING_STORE_NAME);
                const request = store.getAll();

                request.onsuccess = () => {
                    const allRecords = request.result || [];
                    const verified = allRecords
                        .filter(r => r.userVerifiedStatus && r.embedding && r.lastUpdated)
                        .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime())
                        .slice(0, limit);
                    logger.info(`Retrieved ${verified.length} (up to ${limit}) verified features for k-NN.`);
                    resolve(verified.map(r => ({ embedding: r.embedding, status: r.userVerifiedStatus, addressQueryString: r.addressQueryString })));
                };
                request.onerror = (event) => {
                    logger.error("Error fetching verified features from DB:", event.target.errorCode, event);
                    reject(new Error("DB error fetching verified features: " + event.target.errorCode));
                };
            } catch (e) {
                logger.error("Exception in getVerifiedFeatures transaction:", e);
                reject(e);
            }
        });
    }

    function injectNativeCSS() {
        logger.debug("Injecting native CSS (v1.9.1).");
        const css = `
            #tm-renovision-panel-zl-v19final { position: fixed; top: 10px; left: 10px; width: 650px; max-width: 95vw; max-height: 95vh; background: #fff; border: 2px solid #007bff; border-radius: 8px; padding: 15px; z-index: 10001; overflow-y: auto; font-family: Arial, sans-serif; font-size: 13px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
            #tm-renovision-panel-zl-v19final h2, #tm-renovision-panel-zl-v19final h3 { margin-top: 0; color: #007bff; font-size: 18px; }
            #tm-renovision-panel-zl-v19final h3 {font-size: 15px; margin-bottom: 5px; margin-top:15px;}
            #tm-renovision-panel-zl-v19final button { background-color: #007bff; color: white; border: none; padding: 8px 12px; margin: 2px; border-radius: 4px; cursor: pointer; font-size: 13px; }
            #tm-renovision-panel-zl-v19final button:hover { background-color: #0056b3; }
            #tm-renovision-panel-zl-v19final button:disabled { background-color: #ccc; cursor: not-allowed; }
            #tm-gmaps-map-renovision-zl-v19final { width: 100%; height: 200px; margin: 10px 0; border: 1px solid #ccc; }
            .results-table-zl-v19final { width: 100%; margin-top: 5px; border-collapse: collapse; table-layout: fixed; }
            .results-table-zl-v19final th, .results-table-zl-v19final td { border: 1px solid #ddd; padding: 6px; text-align: left; font-size: 12px; vertical-align: top; word-break: break-word; }
            .results-table-zl-v19final th { background-color: #f2f2f2; }
            .results-table-zl-v19final img { width: 100px; height: auto; max-height:75px; object-fit: contain; display:block; margin-bottom:3px;}
            .result-row-zl-v19final { cursor: default; position: relative; }
            .result-row-zl-v19final:hover .switch-status-overlay-zl-v19final { opacity: 1; visibility: visible; }
            #tm-log-renovision-zl-v19final, #tm-uncertain-images-zl-v19final-list { margin-top: 10px; padding: 8px; border: 1px solid #eee; background-color: #f9f9f9; max-height: 150px; overflow-y: auto; font-family: monospace; white-space: pre-wrap; font-size: 0.8em; }
            #tm-summary-renovision-zl-v19final { margin-top:10px; padding:8px; background-color: #e9ecef; border-radius:4px; }
            .dialog-overlay-zl-ui-v19final { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 10002; }
            .dialog-box-zl-ui-v19final { background-color: white; padding: 20px; border-radius: 8px; box-shadow: 0 0 15px rgba(0,0,0,0.3); text-align: center; min-width: 300px; max-width: 90vw; }
            .dialog-box-zl-ui-v19final p { margin-bottom: 15px; white-space: pre-wrap; text-align: left;}
            .dialog-box-zl-ui-v19final button { margin: 5px; }
            .switch-status-overlay-zl-v19final { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.85); color: white; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; font-size: 11px; padding: 5px; box-sizing: border-box; opacity: 0; visibility: hidden; transition: opacity 0.2s ease-in-out, visibility 0.2s ease-in-out; cursor: default; }
            .tm-progress-bar-container-zl-v19final { width: 200px; height: 12px; background-color: #555; border-radius: 6px; overflow: hidden; margin-left: 15px; display: none; border: 1px solid #777; }
            #tm-progress-bar-rect-zl-v19final { transition: width 0.3s ease; }
            #tm-etr-status-zl-v19final { margin-left: 15px; font-style: italic; color: #ccc; }
            .batch-feedback-controls-zl-v19final button { font-size: 11px; padding: 4px 8px; margin-left: 5px;}
            .swipe-modal-zl-v19final .swipe-image-container { width: 320px; height: 240px; margin: 10px auto; border:1px solid #ccc; background-size: contain; background-repeat: no-repeat; background-position: center; }
            .swipe-modal-zl-v19final .swipe-actions button { font-size: 18px; padding: 10px 15px; }
            .uncertain-item-zl-v19final { background-color: #fff3cd; }
        `;
        const styleElement = document.createElement('style');
        styleElement.type = 'text/css';
        styleElement.id = 'tm-renovision-native-styles-zl-v19final';
        if (styleElement.styleSheet) {
            styleElement.styleSheet.cssText = css;
        } else {
            styleElement.appendChild(document.createTextNode(css));
        }
        (document.head || document.documentElement).appendChild(styleElement);
        logger.info("Native CSS styles injected (v1.9.1).");
    }

    function createUI() {
        injectNativeCSS();
        controlPanel = document.createElement('div');
        controlPanel.id = 'tm-renovision-panel-zl-v19final';
        document.body.appendChild(controlPanel);
        controlPanel.innerHTML = `
            <h2>Renovision ver.1.9.1</h2>
            <button id="tm-start-zl-v19final">Start Analysis</button>
            <button id="tm-reenter-key-zl-v19final">Enter/Update API Key</button>
            <button id="tm-clear-key-zl-v19final">Clear Stored API Key</button>
            <button id="tm-clear-db-zl-v19final">Clear IndexedDB Cache</button>
            <div id="tm-gmaps-map-renovision-zl-v19final"></div>
            <h3>Batch Feedback:</h3>
            <div class="batch-feedback-controls-zl-v19final">
                 <button id="tm-batch-mark-renovated-zl-v19final" style="background-color:green;">Mark Selected Renovated</button>
                 <button id="tm-batch-mark-unrenovated-zl-v19final" style="background-color:red;">Mark Selected Unrenovated</button>
            </div>
            <h3>Results:</h3>
            <table class="results-table-zl-v19final">
                <thead><tr>
                    <th>${svgIconUnrenovated} Most Unrenovated (Top 4)</th>
                    <th>${svgIconRenovated} Most Renovated (Top 4)</th>
                </tr></thead>
                <tbody><tr>
                    <td id="tm-unrenovated-cell-zl-v19final"></td>
                    <td id="tm-renovated-cell-zl-v19final"></td>
                </tr></tbody>
            </table>
            <h3>Images Needing Feedback (Uncertain):</h3>
            <div id="tm-uncertain-images-zl-v19final-list"></div>
            <p style="font-size:11px;text-align:center;margin-top:5px">Dbl-click row for feedback. Hover image to switch status.</p>
            <div id="tm-summary-renovision-zl-v19final">Summary...</div>
            <div id="tm-log-renovision-zl-v19final">Logs...</div>
        `;
        startButton = document.getElementById('tm-start-zl-v19final');
        mapDiv = document.getElementById('tm-gmaps-map-renovision-zl-v19final');
        resultsTableUnrenovatedCell = document.getElementById('tm-unrenovated-cell-zl-v19final');
        resultsTableRenovatedCell = document.getElementById('tm-renovated-cell-zl-v19final');
        summaryDiv = document.getElementById('tm-summary-renovision-zl-v19final');
        logDivUiElement = document.getElementById('tm-log-renovision-zl-v19final');

        logger.setUiLogElement(logDivUiElement);

        startButton.addEventListener('click', mainAnalysisWorkflow);
        document.getElementById('tm-reenter-key-zl-v19final').addEventListener('click', async () => {
            logger.info("Re-enter APIKey clicked.");
            API_KEY = await getApiKey(true);
            if (API_KEY && (!window.google || !window.google.maps)) {
                logger.info("Re-init Gmaps with new key as it wasn't loaded.");
                await loadGoogleMapsScript();
            }
        });
        document.getElementById('tm-clear-key-zl-v19final').addEventListener('click', clearApiKeyFromStorage);
        document.getElementById('tm-clear-db-zl-v19final').addEventListener('click', clearIndexedDB);
        document.getElementById('tm-batch-mark-renovated-zl-v19final').addEventListener('click', () => applyBatchFeedback('renovated'));
        document.getElementById('tm-batch-mark-unrenovated-zl-v19final').addEventListener('click', () => applyBatchFeedback('unrenovated'));
        logger.info("UI Created (v1.9.1).");
    }

    function createBottomStatusBar() {
        logger.debug("Creating bottom status bar (v1.9.1).");
        bottomStatusBar = document.createElement('div');
        bottomStatusBar.id = 'tm-statusbar-zl-v19final';
        bottomStatusBar.style.cssText = 'position:fixed;bottom:0;left:0;width:100%;background-color:#333;color:#fff;padding:8px 15px;z-index:10000;font-size:12px;display:flex;justify-content:space-between;align-items:center;box-sizing:border-box';
        const statusTextDiv = document.createElement('div');
        statusTextDiv.id = 'tm-statustext-div-zl-v19final';
        statusTextDiv.style.flexGrow = "1";
        statusTextDiv.innerHTML = `Renovision: <span id="tm-crawlstatus-zl-v19final" style="font-weight:bold">Init...</span> | APIKey: <span id="tm-apikeystatus-zl-v19final" style="font-style:italic">Unk...</span><span id="tm-etr-status-zl-v19final" style="margin-left:15px;font-style:italic;color:#ccc;"></span>`;
        bottomStatusBar.appendChild(statusTextDiv);

        crawlingStatusSpanGlobal = bottomStatusBar.querySelector('#tm-crawlstatus-zl-v19final');
        apiKeyStatusSpanGlobal = bottomStatusBar.querySelector('#tm-apikeystatus-zl-v19final');
        etrSpanGlobal = bottomStatusBar.querySelector('#tm-etr-status-zl-v19final');

        progressBarContainerGlobal = document.createElement('div');
        progressBarContainerGlobal.id = 'tm-progress-bar-container-zl-v19final';
        progressBarContainerGlobal.className = 'tm-progress-bar-container-zl-v19final';
        progressBarContainerGlobal.style.display = 'none';
        const progressBarSvg = `<svg width="100%" height="100%" preserveAspectRatio="none"><rect id="tm-progress-bar-rect-zl-v19final" x="0" y="0" width="0%" height="100%" fill="#4CAF50"/></svg>`;
        progressBarContainerGlobal.innerHTML = progressBarSvg;
        bottomStatusBar.appendChild(progressBarContainerGlobal);
        progressBarRectGlobal = progressBarContainerGlobal.querySelector('#tm-progress-bar-rect-zl-v19final');

        const btnsDiv = document.createElement('div');
        btnsDiv.id = 'tm-statusbar-btns-div-zl-v19final';
        btnsDiv.style.marginLeft = "15px";
        registerApiKeyButtonGlobal = document.createElement('button');
        registerApiKeyButtonGlobal.id = 'tm-registerbtn-zl-v19final';
        registerApiKeyButtonGlobal.innerHTML = `${svgIconKey} Register Key`;
        registerApiKeyButtonGlobal.style.cssText = 'background-color:#17a2b8;color:white;border:none;padding:5px 10px;border-radius:4px;cursor:pointer;display:none;margin-right:10px';
        registerApiKeyButtonGlobal.addEventListener('click', async () => {
            logger.info("Statusbar Register Key clicked.");
            API_KEY = await promptForApiKey();
            if(API_KEY){
                if(!window.google||!window.google.maps){
                    logger.debug("Gmaps not loaded, loading with new key.");
                    await loadGoogleMapsScript();
                }
                // Enable start button only if Gmaps is loaded AND DB is ready
                if(window.google&&window.google.maps&&db&&startButton){
                    startButton.disabled=false;
                }
                else if(startButton){
                    startButton.disabled=true;
                    logger.debug("Gmaps or DB not ready post-reg, Start disabled.");
                }
            } else { // User cancelled or entered invalid key
                if(startButton) startButton.disabled=true; // Keep main start disabled if no key
            }
        });
        btnsDiv.appendChild(registerApiKeyButtonGlobal);

        stopCrawlingButtonGlobal = document.createElement('button');
        stopCrawlingButtonGlobal.id = 'tm-stopbtn-zl-v19final';
        stopCrawlingButtonGlobal.innerHTML = `${svgIconStop} Stop Crawl`;
        stopCrawlingButtonGlobal.style.cssText = 'background-color:#dc3545;color:white;border:none;padding:5px 10px;border-radius:4px;cursor:pointer;display:none';
        stopCrawlingButtonGlobal.addEventListener('click', handleStopCrawling);
        btnsDiv.appendChild(stopCrawlingButtonGlobal);
        bottomStatusBar.appendChild(btnsDiv);

        document.body.appendChild(bottomStatusBar);
        logger.info("Bottom status bar created (v1.9.1).");
        updateBottomStatusBar({ apiKey: API_KEY, apiKeyFullStatus: "Unknown (Initializing)", processStatus: "Initializing...", progress: 0, etrString: "" });
    }

    function updateBottomStatusBar(statusInfo) {
        const { apiKey, apiKeyFullStatus, processStatus, progress, etrString } = statusInfo;
        const displayProgress = (progress === null || progress === undefined) ? 0 : Math.round(Number(progress) * 100);
        const displayEtrString = (etrString === null || etrString === undefined) ? "" : String(etrString);

        logger.debug("Update Statusbar:", { ...statusInfo, progress: displayProgress, etrString: displayEtrString });

        if (!apiKeyStatusSpanGlobal || !crawlingStatusSpanGlobal || !registerApiKeyButtonGlobal || !stopCrawlingButtonGlobal || !progressBarRectGlobal || !etrSpanGlobal || !progressBarContainerGlobal) {
            logger.warn("Statusbar elements not fully found for update. Will try to proceed.");
        }

        if (apiKeyStatusSpanGlobal) {
            let keyDisp = "Unknown";
            if (apiKey && apiKey.length > 8) { keyDisp = `${apiKey.substring(0,4)}...${apiKey.substring(apiKey.length - 4)}`; }
            else if (apiKey) { keyDisp = "Set"; }
            apiKeyStatusSpanGlobal.textContent = apiKeyFullStatus.includes("Unk") || apiKeyFullStatus.includes("Not Set") || !apiKey || apiKeyFullStatus.includes("Unreg") ? apiKeyFullStatus : `"${keyDisp}" (${apiKeyFullStatus})`;
            apiKeyStatusSpanGlobal.style.color = apiKeyFullStatus.toLowerCase().includes("error") || apiKeyFullStatus.toLowerCase().includes("unk") || apiKeyFullStatus.toLowerCase().includes("unreg") ? "khaki" : "lightblue";
        }

        if (crawlingStatusSpanGlobal) {
            crawlingStatusSpanGlobal.textContent = processStatus;
            crawlingStatusSpanGlobal.style.color = processStatus.toLowerCase().includes("error") ? "lightcoral" : "lightgreen";
        }

        if (progressBarContainerGlobal && progressBarRectGlobal) {
            if (displayProgress !== null && displayProgress >= 0 && displayProgress <= 100) {
                progressBarContainerGlobal.style.display = 'inline-block';
                progressBarRectGlobal.setAttribute('width', displayProgress + '%');
            } else {
                progressBarContainerGlobal.style.display = 'none';
            }
        }
        if (etrSpanGlobal) {
            etrSpanGlobal.textContent = displayEtrString;
            etrSpanGlobal.style.display = displayEtrString ? 'inline' : 'none';
        }

        const activeKW = ["started", "init", "fetch", "process", "crawl", "defining references", "extracting features"];
        const isActive = activeKW.some(s => processStatus.toLowerCase().includes(s));
        const needsReg = !apiKey && (processStatus.toLowerCase().includes("cancel") || apiKeyFullStatus.toLowerCase().includes("unreg") || processStatus.toLowerCase().includes("await") || processStatus.toLowerCase().includes("api key error") || processStatus.toLowerCase() === "key clear" || processStatus.toLowerCase().includes("not provided"));

        if (stopCrawlingButtonGlobal) {
            stopCrawlingButtonGlobal.style.display = isActive ? 'inline-block' : 'none';
        }
        if (registerApiKeyButtonGlobal) {
            registerApiKeyButtonGlobal.style.display = (!isActive && needsReg) ? 'inline-block' : 'none';
        }
        isCrawlingGlobal = isActive;
        if(isCrawlingGlobal){
           alert(processStatus);
        }
    }

    async function handleStopCrawling() {
        logger.info("handleStopCrawling called.");
        isCrawlingGlobal = false;
        if (workerPoolInstance) {
            logger.info("Terminating WorkerPool.");
            workerPoolInstance.terminate();
            workerPoolInstance = null;
        }
        const keyStat = API_KEY ? (localStorage.getItem(LOCALSTORAGE_API_KEY) === API_KEY ? "Registered (localStorage)" : "Session Only") : "Unregistered";
        updateBottomStatusBar({ apiKey: API_KEY, apiKeyFullStatus: keyStat, processStatus: "Stopping...", progress: 0, etrString: "" });
        logger.debug("New Promise: Stop Crawl Confirm Dialog (v1.9.1)");
        const clearKey = await showConfirmationDialog("Crawling stopped. Clear API Key from localStorage?", "tm-stop-confirm-zl-v19final", "Yes, Clear", "No, Keep");
        if (clearKey) {
            clearApiKeyFromStorage();
        } else {
            logger.info("User kept APIKey post-stop.");
            const finalKeyStat = API_KEY ? (localStorage.getItem(LOCALSTORAGE_API_KEY) === API_KEY ? "Registered (localStorage)" : "Session Only (Save Error?)") : "Unregistered";
            updateBottomStatusBar({ apiKey: API_KEY, apiKeyFullStatus: finalKeyStat, processStatus: "Stopped - By User", progress: 0, etrString: "" });
        }
        if (startButton) {
            startButton.disabled = false;
            startButton.textContent = "Start Analysis";
        }
    }

    async function mainAnalysisWorkflow() {
        if (isCrawlingGlobal) {
            logger.warn("Analysis already in progress.");
            return;
        }
        logger.info('Starting analysis workflow (v1.9.1)...');
        isCrawlingGlobal = true;
        let currentKeyFullStatus = API_KEY ? (localStorage.getItem(LOCALSTORAGE_API_KEY) === API_KEY ? "Registered (localStorage)" : "Session Only") : "Unknown (Validating)";
        updateBottomStatusBar({ apiKey: API_KEY, apiKeyFullStatus: currentKeyFullStatus, processStatus: "Started - Validating Key", progress:0, etrString: ""});
        startButton.disabled = true;
        startButton.textContent = 'Processing...';
        resultsTableUnrenovatedCell.innerHTML = 'Processing...';
        resultsTableRenovatedCell.innerHTML = 'Processing...';
        summaryDiv.textContent = 'Processing...';
        const uncertainListElement = document.getElementById('tm-uncertain-images-zl-v19final-list');
        if (uncertainListElement) uncertainListElement.innerHTML = '';
        currentAnalysisResults = [];

        if (!API_KEY) API_KEY = await getApiKey(true);
        if (!API_KEY) {
            logger.error("API Key is essential. Aborting.");
            isCrawlingGlobal = false;
            startButton.disabled = false;
            startButton.textContent = 'Start Analysis';
            if (crawlingStatusSpanGlobal && crawlingStatusSpanGlobal.textContent !== "Cancelled") { // Check if already "Cancelled" by prompt
                updateBottomStatusBar({ apiKey: null, apiKeyFullStatus: "Unregistered", processStatus: "API Key Error - Not Provided", progress: 0, etrString:""});
            }
            return;
        }

        currentKeyFullStatus = localStorage.getItem(LOCALSTORAGE_API_KEY) === API_KEY ? "Registered (localStorage)" : "Session Only";
        updateBottomStatusBar({ apiKey: API_KEY, apiKeyFullStatus, processStatus: "Started - Initializing DB", progress: 0.01, etrString: ""});

        if (!db) {
            try {
                await setupDB();
            } catch (e) {
                logger.error("DB Setup failed:", e);
                updateBottomStatusBar({ apiKey: API_KEY, apiKeyFullStatus, processStatus: "Error - DB Setup Failed", progress: 0, etrString:""});
                isCrawlingGlobal = false;
                startButton.disabled = false;
                startButton.textContent = "Start Analysis";
                return;
            }
        }
        if (!isCrawlingGlobal) {
            logger.info("Crawling stopped by user during DB setup.");
            updateBottomStatusBar({ apiKey: API_KEY, apiKeyFullStatus, processStatus: "Stopped - By User", progress: 0, etrString:""});
            return;
        }

        // Define Reference Set
        const initialRefCandidateAddresses = [
            "Budapest, Andrássy út 10", "Budapest, Váci utca 20", "Budapest, Király utca 30",
            "Budapest, Rákóczi út 5", "Budapest, Dohány utca 15",
            "Budapest, 1068, Benczúr utca 8.", "Budapest, 1077, Jósika utca 29." // Original base pair
        ].filter((v, i, a) => a.indexOf(v) === i);

        updateBottomStatusBar({ apiKey: API_KEY, apiKeyFullStatus, processStatus: `Started - Loading ${initialRefCandidateAddresses.length} Reference Candidates...`, progress: 0.02, etrString: "" });
        allImagesToProcess = [];
        for (const addr of initialRefCandidateAddresses) {
            if (!isCrawlingGlobal) { updateBottomStatusBar({ apiKey: API_KEY, apiKeyFullStatus, processStatus: "Stopped - By User", progress: 0, etrString:""}); return; }
            logger.debug("New Promise (implicit) in mainAnalysis: getImageDataForAddress for ref candidate", addr);
            const imgDataResult = await getImageDataForAddress(addr, `ref_cand_${addr.replace(/[^a-zA-Z0-9]/g, '')}`); // Create a safer ID
            if (imgDataResult && imgDataResult.imageData) {
                allImagesToProcess.push({ ...imgDataResult, id: addr, type: 'reference_candidate' });
            } else {
                logger.warn("Could not load initial image data for reference candidate:", addr);
            }
        }
        if (!isCrawlingGlobal) { updateBottomStatusBar({ apiKey: API_KEY, apiKeyFullStatus, processStatus: "Stopped - By User", progress: 0, etrString:""}); return; }

        updateBottomStatusBar({ apiKey: API_KEY, apiKeyFullStatus, processStatus: "Started - Defining Reference Set", progress: 0.05, etrString: "" });
        logger.debug("New Promise (implicit) in mainAnalysis: promptForReferenceSetUI");
        const userDefinedReferences = await promptForReferenceSetUI(initialRefCandidateAddresses); // Pass full addresses
        if (!isCrawlingGlobal) { updateBottomStatusBar({ apiKey: API_KEY, apiKeyFullStatus, processStatus: "Stopped - By User", progress: 0, etrString:""}); return; }
        if (!userDefinedReferences || (userDefinedReferences.renovated.length === 0 && userDefinedReferences.unrenovated.length === 0)) {
            logger.error("No reference images defined by user. Aborting.");
            updateBottomStatusBar({ apiKey: API_KEY, apiKeyFullStatus, processStatus: "Error - No References Defined"});
            isCrawlingGlobal = false; startButton.disabled = false; startButton.textContent = "Start Analysis"; return;
        }
        logger.info("User defined references collected:", userDefinedReferences);

        if (!workerPoolInstance) {
            logger.info("WorkerPool: Initializing for the first time.");
            const workerScriptBlob = createFeatureExtractionWorkerScriptContent();
            const workerScriptUrl = URL.createObjectURL(workerScriptBlob);
            try {
                workerPoolInstance = new WorkerPool(workerScriptUrl, logger);
                workerPoolInstance.workers.forEach(wEntry => {
                    wEntry.worker.postMessage({ type: 'INIT_TF_AND_CONFIG_WORKER_POOL', payload: { tfjsUrl: 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.18.0', logConfig: WORKER_LOG_CONFIG_FOR_POOL }});
                });
            } catch (e) {
                logger.error("Failed to create WorkerPool:", e);
                updateBottomStatusBar({ apiKey: API_KEY, apiKeyFullStatus, processStatus: "Error - WorkerPool Creation Failed"});
                isCrawlingGlobal = false; startButton.disabled = false; startButton.textContent = "Start Analysis"; return;
            }
        }
        updateBottomStatusBar({ apiKey: API_KEY, apiKeyFullStatus, processStatus: "Started - Extracting Reference Features", progress: 0.10, etrString: "" });

        const referenceImagesForPool = [
            ...userDefinedReferences.renovated.map(ref => ({...ref, classification: 'renovated', isBasePair: true})),
            ...userDefinedReferences.unrenovated.map(ref => ({...ref, classification: 'unrenovated', isBasePair: true}))
        ];

        let processedCount = 0;
        const totalRefsForPool = referenceImagesForPool.length;
        logger.debug("New Promise (implicit): Processing reference images for features via WorkerPool");
        const referenceFeaturePromises = referenceImagesForPool.map((refImg, index) => {
            if (!isCrawlingGlobal) return Promise.resolve(null);
            if (!refImg.imageData || !refImg.imageData.data) {
                logger.warn("Skipping reference image due to missing imageData:", refImg.addressQueryString);
                return Promise.resolve({...refImg, features: null, error: "Missing ref imageData"});
            }
            const imgDataForWorker = { data: refImg.imageData.data, width: refImg.imageData.width, height: refImg.imageData.height };
            return workerPoolInstance.processImage(imgDataForWorker, refImg.addressQueryString, refImg.addressQueryString)
                .then(result => {
                    processedCount++;
                    updateBottomStatusBar({ apiKey: API_KEY, apiKeyFullStatus, processStatus: `Started - Ref Features (${processedCount}/${totalRefsForPool})`, progress: 0.10 + (0.15 * (processedCount/totalRefsForPool)), etrString: "" });
                    return { ...refImg, features: result.features };
                })
                .catch(error => {
                    logger.error("Error processing reference image in pool:", refImg.addressQueryString, error);
                    return { ...refImg, features: null, error: error.message };
                });
        });
        const processedReferences = await Promise.all(referenceFeaturePromises);
        if (!isCrawlingGlobal) { updateBottomStatusBar({ apiKey: API_KEY, apiKeyFullStatus, processStatus: "Stopped - By User", progress: 0, etrString:""}); return;}

        const validRenovatedRefs = processedReferences.filter(r => r && r.classification === 'renovated' && r.features);
        const validUnrenovatedRefs = processedReferences.filter(r => r && r.classification === 'unrenovated' && r.features);

        if (validRenovatedRefs.length === 0 || validUnrenovatedRefs.length === 0) {
             logger.error("Not enough valid features for both renovated and unrenovated reference centroids. Renovated:", validRenovatedRefs.length, "Unrenovated:", validUnrenovatedRefs.length);
             updateBottomStatusBar({ apiKey: API_KEY, apiKeyFullStatus, processStatus: "Error - Centroid Calc Failed (Not enough valid refs)"});
             isCrawlingGlobal = false; startButton.disabled = false; startButton.textContent = "Start Analysis"; return;
        }
        renovatedCentroid = averageFeatures(validRenovatedRefs.map(r => r.features));
        unrenovatedCentroid = averageFeatures(validUnrenovatedRefs.map(r => r.features));
        if(!renovatedCentroid || !unrenovatedCentroid) {
            logger.error("Failed to compute centroids from reference features.");
            updateBottomStatusBar({ apiKey: API_KEY, apiKeyFullStatus, processStatus: "Error - Centroid Computation Failed"});
            isCrawlingGlobal = false; startButton.disabled = false; startButton.textContent = "Start Analysis"; return;
        }
        logger.info("Reference Centroids Calculated.");

        for (const ref of [...validRenovatedRefs, ...validUnrenovatedRefs]) {
            let buildingRecord = await getBuildingData(ref.addressQueryString) || { addressQueryString: ref.addressQueryString };
            buildingRecord.embedding = ref.features;
            buildingRecord.modelSignature = MODEL_SIGNATURE;
            buildingRecord.userVerifiedStatus = ref.classification;
            buildingRecord.userFeedbackDate = new Date().toISOString().slice(0,10).replace(/-/g,'/');
            await saveBuildingData(buildingRecord);
        }

        updateBottomStatusBar({ apiKey: API_KEY, apiKeyFullStatus, processStatus: "Started - Fetching Street Images", progress: 0.25, etrString: "" });
        allImagesToProcess = [];
        const targetStreetMetaData = await fetchImagesForStreetSection(TARGET_STREET_START_ADDRESS, TARGET_STREET_END_ADDRESS);
        if (!isCrawlingGlobal) { updateBottomStatusBar({ apiKey: API_KEY, apiKeyFullStatus, processStatus: "Stopped - By User", progress: 0, etrString:""}); return; }
        if (!targetStreetMetaData || targetStreetMetaData.length === 0) {
            logger.warn("No images found for target street.");
            updateBottomStatusBar({apiKey:API_KEY, apiKeyFullStatus, processStatus: "Error - No Target Images Found"});
            isCrawlingGlobal = false; startButton.disabled = false; startButton.textContent = "Start Analysis"; return;
        }
        allImagesToProcess = targetStreetMetaData.map(tsm => ({ ...tsm, id: tsm.addressQueryString || `target_${Math.random().toString(16).slice(2)}`}));
        updateBottomStatusBar({ apiKey: API_KEY, apiKeyFullStatus, processStatus: `Started - Extracting Target Features (0/${allImagesToProcess.length})`, progress: 0.30, etrString:"" });

        processedCount = 0;
        const totalTargetsForPool = allImagesToProcess.length;
        let currentEtrString = "";
        logger.debug("New Promise (implicit): Processing target images for features via WorkerPool");
        const targetFeaturePromises = allImagesToProcess.map((imgMeta, index) => {
            if (!isCrawlingGlobal) return Promise.resolve(null);
            if (!imgMeta.imageData || !imgMeta.imageData.data) {
                logger.warn("Skipping target image due to missing imageData:", imgMeta.id);
                return Promise.resolve({...imgMeta, features: null, error: "Missing target imageData"});
            }
            const imgDataForWorker = {data: imgMeta.imageData.data, width: imgMeta.imageData.width, height: imgMeta.imageData.height};
            return workerPoolInstance.processImage(imgDataForWorker, imgMeta.id, imgMeta.addressQueryString)
                .then(result => {
                    processedCount++;
                    const progress = 0.30 + (0.60 * (processedCount / totalTargetsForPool));
                    if (workerPoolInstance.performanceData.totalImagesProcessed > 3 && workerPoolInstance.performanceData.avgTimePerImage < Infinity && workerPoolInstance.performanceData.avgTimePerImage > 0) {
                        const remaining = totalTargetsForPool - processedCount;
                        if (remaining > 0) {
                            const etr_ms = remaining * workerPoolInstance.performanceData.avgTimePerImage;
                            const totalSeconds = Math.round(etr_ms / 1000);
                            const minutes = Math.floor(totalSeconds / 60);
                            const seconds = totalSeconds % 60;
                            currentEtrString = `${minutes.toString().padStart(2,'0')}:${seconds.toString().padStart(2,'0')}`;
                        } else {
                            currentEtrString = "Finishing...";
                        }
                    }
                    updateBottomStatusBar({ apiKey: API_KEY, apiKeyFullStatus, processStatus: `Started - Extracting Target Features (${processedCount}/${totalTargetsForPool})`, progress, etrString: currentEtrString });
                    return { ...imgMeta, features: result.features };
                })
                .catch(error => {
                    logger.error("Error processing target image in pool:", imgMeta.addressQueryString || imgMeta.id, error);
                    return { ...imgMeta, features: null, error: error.message };
                });
        });
        const allProcessedTargetImageData = await Promise.all(targetFeaturePromises);
        if (!isCrawlingGlobal) { updateBottomStatusBar({ apiKey: API_KEY, apiKeyFullStatus, processStatus: "Stopped - By User", progress: 0, etrString:""}); return; }

        updateBottomStatusBar({ apiKey: API_KEY, apiKeyFullStatus, processStatus: "Started - Finalizing & Displaying", progress: 0.90, etrString: "" });
        await processAndDisplayResultsWithKNN_Centroid(allProcessedTargetImageData);

        if (isCrawlingGlobal) { updateBottomStatusBar({ apiKey: API_KEY, apiKeyFullStatus, processStatus: "Stopped - Completed", progress: 1, etrString: ""}); }
        isCrawlingGlobal = false;
        startButton.disabled = false;
        startButton.textContent = "Start Analysis";
        logger.info("Advanced WorkerPool analysis workflow completed (v1.9.1).");
    }

    async function processAndDisplayResultsWithKNN_Centroid(processedTargetImages) {
        logger.info(`Processing ${processedTargetImages.length} target images with Centroid Model & k-NN (v1.9.1).`);
        currentAnalysisResults = [];
        const today = new Date();
        const todayISO = today.toISOString().slice(0, 10).replace(/-/g, '/');

        if (!renovatedCentroid || !unrenovatedCentroid) {
            logger.error("Reference centroids are not calculated. Cannot proceed with classification.");
            updateBottomStatusBar({ apiKey: API_KEY, apiKeyFullStatus: localStorage.getItem(LOCALSTORAGE_API_KEY) === API_KEY ? "Registered (localStorage)" : "Session Only", processStatus: "Error - Missing Centroids"});
            return;
        }

        logger.debug("New Promise (implicit): getVerifiedFeatures for kNN in processAndDisplayResultsWithKNN_Centroid (v1.9.1)");
        const verifiedFeaturesForKNN = await getVerifiedFeatures();

        for (const imgResult of processedTargetImages) {
            if (!isCrawlingGlobal) {
                logger.info("processAndDisplayResultsWithKNN_Centroid: Stop requested.");
                break;
            }
            if (!imgResult || !imgResult.features) {
                logger.warn("Skipping image due to missing features or invalid imgResult:", imgResult?.addressQueryString || imgResult?.id);
                continue;
            }

            const currentFeatures = imgResult.features;
            let buildingRecord = await getBuildingData(imgResult.addressQueryString);
            if (!buildingRecord) {
                buildingRecord = { addressQueryString: imgResult.addressQueryString, loc: imgResult.loc, comparisons: [], userVerifiedStatus: null, userFeedbackDate: null };
            }
            buildingRecord.embedding = currentFeatures;
            buildingRecord.modelSignature = MODEL_SIGNATURE;

            const distToReno = 1 - cosineSimilarity(currentFeatures, renovatedCentroid);
            const distToUnreno = 1 - cosineSimilarity(currentFeatures, unrenovatedCentroid);
            let modelUnrenovatedScore = 0.5;
            if ((distToReno + distToUnreno) > 1e-6) {
                modelUnrenovatedScore = distToReno / (distToReno + distToUnreno);
            }
            modelUnrenovatedScore = Math.max(0, Math.min(1, modelUnrenovatedScore));
            logger.debug("Centroid Model Score for", imgResult.addressQueryString, ":", modelUnrenovatedScore.toFixed(3));

            let kNNVerdict = null;
            let kNNConfidence = 0;
            let isUncertainByKNN = false;
            if (verifiedFeaturesForKNN.length >= K_NEAREST_NEIGHBORS) {
                const neighbors = findKNearestNeighbors(currentFeatures, verifiedFeaturesForKNN, K_NEAREST_NEIGHBORS);
                if (neighbors.length > 0) {
                    let renVotes=0, unrenVotes=0;
                    neighbors.forEach(n=>{if(n.status==='renovated')renVotes++;else if(n.status==='unrenovated')unrenVotes++;});
                    if(renVotes>unrenVotes)kNNVerdict='renovated';else if(unrenVotes>renVotes)kNNVerdict='unrenovated';
                    kNNConfidence=Math.max(renVotes,unrenVotes)/K_NEAREST_NEIGHBORS;
                    if(renVotes===unrenVotes || kNNConfidence < 0.7) isUncertainByKNN=true;
                    if(neighbors.length===K_NEAREST_NEIGHBORS && neighbors[K_NEAREST_NEIGHBORS-1].distance > 0.5) {
                        isUncertainByKNN=true; logger.debug("Far from Kth neighbor for", imgResult.addressQueryString);
                    }
                    logger.debug("k-NN for", imgResult.addressQueryString, ":", kNNVerdict, "Conf:", kNNConfidence.toFixed(2), "Uncertain:", isUncertainByKNN);
                }
            }

            let finalUnrenovatedScore = modelUnrenovatedScore;
            let statusSource = `Model (Centroids)`;
            if (kNNVerdict && kNNConfidence >= 0.6) { // Point 7: More Sophisticated Score Combination
                 const kNNScoreVal = kNNVerdict === 'unrenovated' ? (0.5 + 0.5 * kNNConfidence) : (0.5 - 0.5 * kNNConfidence);
                 const kNNWeight = Math.min(0.9, Math.max(0.1, (kNNConfidence - 0.5) * 1.8)); // Scales 0.5-1.0 conf to ~0.1-0.9 weight
                 const modelWeight = 1 - kNNWeight;
                 finalUnrenovatedScore = (modelWeight * modelUnrenovatedScore) + (kNNWeight * kNNScoreVal);
                 statusSource = `k-NN (W:${kNNWeight.toFixed(2)})`;
                 logger.debug("k-NN weighted score for", imgResult.addressQueryString, "to", finalUnrenovatedScore.toFixed(3));
            }

            if (buildingRecord.userVerifiedStatus && buildingRecord.userFeedbackDate) {
                 const fbDate=new Date(buildingRecord.userFeedbackDate);
                 const diffDays=(today.getTime()-fbDate.getTime())/(1000*3600*24);
                 if(diffDays<=USER_FEEDBACK_VALIDITY_DAYS){
                     finalUnrenovatedScore=buildingRecord.userVerifiedStatus==='unrenovated'?0.95:0.05;statusSource="User";
                     logger.debug("User feedback applied for", imgResult.addressQueryString, "Final score:", finalUnrenovatedScore);
                 } else {
                     logger.debug("User feedback expired for", imgResult.addressQueryString);
                 }
            }
            finalUnrenovatedScore = Math.max(0, Math.min(1, finalUnrenovatedScore));

            try {
                await saveBuildingData(buildingRecord);
            } catch(e) {
                logger.error("Failed to save building record (KNN Centroid v1.9.1):", e, imgResult.addressQueryString);
            }

            currentAnalysisResults.push({
                id: imgResult.id || imgResult.addressQueryString, addressQueryString: imgResult.addressQueryString, features: currentFeatures,
                modelUnrenovatedScore, kNNVerdict, kNNConfidence, isUncertain: isUncertainByKNN, // Added isUncertain
                unrenovatedScore: finalUnrenovatedScore, statusSource,
                originalImageUrl: imgResult.streetViewImageUrl, houseNumber: imgResult.houseNumber
            });
        }
        redrawResultTables(); // Handles uncertain display too
        updateSummary();
        logger.info("Display updated with Centroid Model, k-NN, and adaptive results (v1.9.1).");
    }

    function redrawResultTables() {
        logger.debug("redrawResultTables v1.9.1. Items:", currentAnalysisResults.length);
        currentAnalysisResults.sort((a,b)=>b.unrenovatedScore-a.unrenovatedScore); // Default: most unrenovated first
        const topUnrenovated = currentAnalysisResults.filter(r=>r.unrenovatedScore>=0.5 && !r.isUncertain).slice(0,4);
        const topRenovated = [...currentAnalysisResults].filter(r=>r.unrenovatedScore<0.5 && !r.isUncertain).sort((a,b)=>a.unrenovatedScore-b.unrenovatedScore).slice(0,4); // Sort ascending for most renovated
        displayImageResults(topUnrenovated,resultsTableUnrenovatedCell,"Unren.Scr");
        displayImageResults(topRenovated,resultsTableRenovatedCell,"Unren.Scr");

        // Point 8: Active Learning - Display uncertain images
        const uncertainImages = currentAnalysisResults.filter(r => r.isUncertain)
            .sort((a,b) => Math.abs(a.modelUnrenovatedScore - 0.5) - Math.abs(b.modelUnrenovatedScore - 0.5)) // Sort by closeness to 0.5 (most ambiguous by model)
            .slice(0,5); // Show top 5 uncertain
        displayUncertainImages(uncertainImages);
    }

    function displayImageResults(resultsList, tableCellElement, scoreLabel) {
        logger.debug("displayImageResults v1.9.1 for", scoreLabel, "Items:", resultsList.length);
        tableCellElement.innerHTML='';
        if(resultsList.length===0){
            tableCellElement.textContent="N/A";
            return;
        }
        const ul=document.createElement('ul');
        ul.style.listStyleType='none';
        ul.style.paddingLeft='0';
        resultsList.forEach(item=>{
            const li=document.createElement('li');
            li.className='result-row-zl-v19final'; // Ensure this class matches CSS
            li.dataset.addressQueryString=item.addressQueryString;
            li.dataset.currentStatus=item.unrenovatedScore>=0.5?'unrenovated':'renovated';
            li.style.cssText='margin-bottom:5px;padding:3px;border:1px solid #eee;position:relative;';

            const chk=document.createElement('input'); // For Batch Feedback (Point 5)
            chk.type='checkbox';
            chk.className='result-item-checkbox-zl-v19final'; // Unique class
            chk.dataset.addressQueryString=item.addressQueryString;
            li.appendChild(chk);

            const img=document.createElement('img');
            img.src=item.originalImageUrl;
            li.appendChild(img);
            const txtN=document.createElement('span');
            const dTxt=item.houseNumber?`HN:${item.houseNumber}`:(item.addressQueryString?item.addressQueryString.slice(0,20)+'...':'UnkAddr');
            txtN.innerHTML=` ${dTxt}(${scoreLabel}:${item.unrenovatedScore.toFixed(3)})[${item.statusSource}]`;
            li.appendChild(txtN);
            li.addEventListener('mouseenter',showSwitchStatusUI);
            li.addEventListener('mouseleave',hideSwitchStatusUI);
            li.addEventListener('dblclick',handleResultRowDoubleClick);
            ul.appendChild(li);
        });
        tableCellElement.appendChild(ul);
    }

    function displayUncertainImages(uncertainList) {
        const container = document.getElementById('tm-uncertain-images-zl-v19final-list');
        if (!container) {
            logger.warn("Uncertain images container not found.");
            return;
        }
        container.innerHTML = '';
        if (uncertainList.length === 0) {
            container.innerHTML = "<p>No images marked as highly uncertain by k-NN currently.</p>";
            return;
        }
        logger.debug("Displaying uncertain images v1.9.1. Count:", uncertainList.length);
        uncertainList.forEach(item => {
            const listItem = document.createElement('div'); // Using div for more flexibility
            listItem.className = 'result-row-zl-v19final uncertain-item-zl-v19final'; // Add specific class for styling
            listItem.dataset.addressQueryString = item.addressQueryString;
            listItem.dataset.currentStatus = item.unrenovatedScore >= 0.5 ? 'unrenovated' : 'renovated';
            listItem.style.cssText='margin-bottom:5px;padding:3px;border:1px solid #gold;position:relative; display:flex; align-items:center;';


            const chk=document.createElement('input');
            chk.type='checkbox';
            chk.className='result-item-checkbox-zl-v19final';
            chk.dataset.addressQueryString=item.addressQueryString;
            chk.style.marginRight = '5px';
            listItem.appendChild(chk);

            const img=document.createElement('img');
            img.src=item.originalImageUrl;
            img.style.marginRight = '5px';
            listItem.appendChild(img);
            const textNode = document.createElement('span');
            const displayText = item.houseNumber?`HN:${item.houseNumber}`:(item.addressQueryString?item.addressQueryString.substring(0,20)+'...':'UnkAddr');
            textNode.innerHTML = ` ${displayText} (Mdl:${item.modelUnrenovatedScore.toFixed(2)}, kNN:${item.kNNVerdict||'N/A'} C:${item.kNNConfidence.toFixed(2)}) <strong style="color:orange;">UNCERTAIN</strong>`;
            listItem.appendChild(textNode);
            listItem.addEventListener('mouseenter',showSwitchStatusUI);
            listItem.addEventListener('mouseleave',hideSwitchStatusUI);
            listItem.addEventListener('dblclick',handleResultRowDoubleClick);
            container.appendChild(listItem);
        });
    }

    function updateSummary() {
        logger.debug("updateSummary v1.9.1. Items:", currentAnalysisResults.length);
        const tot=currentAnalysisResults.length;
        const unrenC=currentAnalysisResults.filter(r=>r.unrenovatedScore>=0.5).length;
        const renC=tot-unrenC;
        const unrenP=tot>0?(unrenC/tot*100).toFixed(1):0;
        const renP=tot>0?(renC/tot*100).toFixed(1):0;
        let summaryText = `Total views: ${tot}<br>`;
        if (renovatedCentroid && unrenovatedCentroid) {
            summaryText += `Using Centroid Model for baseline.<br>`;
        } else {
            summaryText += `Using Base Pair Similarity (fallback or pre-centroid setup).<br>`;
        }
        summaryText += `Unrenovated (final score >= 0.5): ${unrenC}(${unrenP}%)<br>Renovated (final score < 0.5): ${renC}(${renP}%)`;
        summaryDiv.innerHTML = summaryText;
    }

    async function handleResultRowDoubleClick(event) {
        logger.debug("New Promise: handleResultRowDoubleClick v1.9.1");
        const rowEl=event.currentTarget;
        const addy=rowEl.dataset.addressQueryString;
        const item=currentAnalysisResults.find(r=>r.addressQueryString===addy);
        if(!item) { logger.warn("Item not found for dblclick feedback:", addy); return; }
        const curStat=item.unrenovatedScore>=0.5?'unrenovated':'renovated';
        const opStat=curStat==='unrenovated'?'renovated':'unrenovated';
        const dispTxt=item.houseNumber||addy;
        logger.debug("New Promise: Confirmation Dialog from dblclick for", addy);
        const conf=await showConfirmationDialog(`Building:"${dispTxt}"\nStatus:${curStat}(${item.unrenovatedScore.toFixed(3)},Src:${item.statusSource})\n\nChange to ${opStat}?`,'tm-feedback-confirm-zl-v19final');
        if(conf){
            logger.info(`User feedback: Mark "${addy}" as ${opStat}.`);
            item.unrenovatedScore=opStat==='unrenovated'?0.95:0.05;
            item.statusSource="User (DblClick)";
            let rec=await getBuildingData(addy);
            if(!rec) {
                logger.warn("Building record not found in DB for user feedback (dblclick), creating new for:", addy);
                rec={addressQueryString:addy,comparisons:[]};
            }
            rec.userVerifiedStatus=opStat;
            rec.userFeedbackDate=new Date().toISOString().slice(0,10).replace(/-/g,'/');
            if(item.features && !rec.embedding){
                rec.embedding=item.features; // Ensure features are stored as 'embedding' in DB
                rec.modelSignature=MODEL_SIGNATURE;
            }
            await saveBuildingData(rec);
            redrawResultTables();
            updateSummary();
        }
    }

    function showConfirmationDialog(message, dialogId = 'tm-general-confirm-dialog-zl-v19final', yesText = "Yes", noText = "No") {
        logger.debug("New Promise: showConfirmationDialog v1.9.1", message.slice(0,30));
        return new Promise(r => {
            const oid=dialogId+'-overlay';
            let exOv=document.getElementById(oid);
            if(exOv)exOv.remove();
            const ov=document.createElement('div');
            ov.id=oid;
            ov.className='dialog-overlay-zl-ui-v19final';
            const dia=document.createElement('div');
            dia.className='dialog-box-zl-ui-v19final';
            dia.innerHTML=`<p>${message}</p><button class="dialog-yes" style="background:#28a745">${yesText}</button><button class="dialog-no" style="background:#dc3545">${noText}</button>`;
            ov.appendChild(dia);
            document.body.appendChild(ov);
            const closeD=(v)=>{try{document.body.removeChild(ov);}catch(e){}r(v);};
            dia.querySelector('.dialog-yes').addEventListener('click', ()=>closeD(true));
            dia.querySelector('.dialog-no').addEventListener('click', ()=>closeD(false));
        });
    }

    function showSwitchStatusUI(event) {
        const li=event.currentTarget;
        if(li.querySelector('.switch-status-overlay-zl-v19final'))return;
        hideSwitchStatusUI(); // Hide any other existing overlay first
        const curStat=li.dataset.currentStatus;
        const tarStat=curStat==='unrenovated'?'renovated':'unrenovated';
        const addy=li.dataset.addressQueryString;
        switchStatusOverlay=document.createElement('div');
        switchStatusOverlay.className='switch-status-overlay-zl-v19final'; // Matches CSS
        // CSS for overlay opacity/visibility transition is in injectNativeCSS

        const btn=document.createElement('button');
        btn.innerHTML=`${svgIconSwitch} Switch to ${tarStat}`;
        btn.style.cssText='padding:5px 8px;margin-top:5px;background-color:#ffc107;color:#000;border:none;border-radius:3px;cursor:pointer;';
        btn.addEventListener('click', async (e)=>{
            e.stopPropagation();
            hideSwitchStatusUI();
            logger.info(`User initiated switch for "${addy}" to ${tarStat}.`);
            const itemUpd=currentAnalysisResults.find(r=>r.addressQueryString===addy);
            if(itemUpd){
                logger.debug("New Promise: Switch Confirmation Dialog from overlay");
                const conf=await showConfirmationDialog(`Switch status of "${itemUpd.houseNumber||addy}" to ${tarStat}?`,'tm-switch-confirm-zl-v19final_overlay');
                if(conf){
                    itemUpd.unrenovatedScore=tarStat==='unrenovated'?0.95:0.05;
                    itemUpd.statusSource="User (Switched)";
                    let rec=await getBuildingData(addy);
                    if(!rec)rec={addressQueryString:addy,comparisons:[]};
                    rec.userVerifiedStatus=tarStat;
                    rec.userFeedbackDate=new Date().toISOString().slice(0,10).replace(/-/g,'/');
                    if(itemUpd.features&&!rec.embedding){
                        rec.embedding=itemUpd.features; // Store features as 'embedding'
                        rec.modelSignature=MODEL_SIGNATURE;
                    }
                    await saveBuildingData(rec);
                    redrawResultTables();
                    updateSummary();
                }
            }
        });
        const txt=document.createElement('p');
        txt.textContent=`Mark as ${tarStat}?`;
        txt.style.margin='5px 0';
        switchStatusOverlay.appendChild(txt);
        switchStatusOverlay.appendChild(btn);
        li.appendChild(switchStatusOverlay);
        // Trigger transition
        requestAnimationFrame(()=>{
            if(switchStatusOverlay) { // Check if not removed by rapid mouseleave
                switchStatusOverlay.style.opacity='1';
                switchStatusOverlay.style.visibility='visible';
            }
        });
    }

    function hideSwitchStatusUI() {
        if(switchStatusOverlay&&switchStatusOverlay.parentElement){
            switchStatusOverlay.parentElement.removeChild(switchStatusOverlay);
        }
        switchStatusOverlay=null;
    }

    async function applyBatchFeedback(targetStatus) {
        logger.info(`Applying batch feedback: Mark as ${targetStatus}`);
        const checkboxes = document.querySelectorAll('.result-item-checkbox-zl-v19final:checked');
        if (checkboxes.length === 0) {
            alert("No images selected for batch feedback.");
            return;
        }
        logger.debug("New Promise: Batch Feedback Confirmation Dialog v1.9.1");
        const confirmed = await showConfirmationDialog(`Mark ${checkboxes.length} selected image(s) as ${targetStatus}?`, 'tm-batch-confirm-zl-v19final');
        if (!confirmed) return;

        for (const checkbox of checkboxes) {
            const addressQueryString = checkbox.dataset.addressQueryString;
            const item = currentAnalysisResults.find(r => r.addressQueryString === addressQueryString);
            if (item) {
                item.unrenovatedScore = targetStatus === 'unrenovated' ? 0.95 : 0.05;
                item.statusSource = "User (Batch)";
                let buildingRecord = await getBuildingData(addressQueryString) || { addressQueryString, comparisons: [] };
                buildingRecord.userVerifiedStatus = targetStatus;
                buildingRecord.userFeedbackDate = new Date().toISOString().slice(0,10).replace(/-/g,'/');
                if (item.features && !buildingRecord.embedding) {
                    buildingRecord.embedding = item.features; // Store features as 'embedding'
                    buildingRecord.modelSignature = MODEL_SIGNATURE;
                }
                await saveBuildingData(buildingRecord);
            }
        }
        redrawResultTables();
        updateSummary();
        logger.info(`Batch feedback applied for ${checkboxes.length} items.`);
    }

    async function promptForReferenceSetUI(candidateAddresses) {
        logger.info("New Promise: Prompting user for reference set via swipe UI (v1.9.1).");
        updateBottomStatusBar({ apiKey: API_KEY, apiKeyFullStatus: localStorage.getItem(LOCALSTORAGE_API_KEY) === API_KEY ? "Registered (localStorage)" : "Session Only", processStatus: "Started - Defining Reference Set", progress: 0, etrString: "" });
        const collectedReferences = { renovated: [], unrenovated: [] };
        const overlayId = 'tm-swipe-modal-overlay-zl-v19final';
        if (document.getElementById(overlayId)) {
            logger.warn("Swipe modal already open.");
            return collectedReferences;
        }
        const overlay = document.createElement('div');
        overlay.id = overlayId;
        overlay.className = 'dialog-overlay-zl-ui-v19final swipe-modal-zl-v19final';
        const dialog = document.createElement('div');
        dialog.className = 'dialog-box-zl-ui-v19final';
        dialog.style.minWidth = '400px';
        dialog.innerHTML = `
            <h3>Define Reference Buildings (${candidateAddresses.length} candidates)</h3>
            <p>Classify images as Renovated or Unrenovated.</p>
            <div class="swipe-image-container" id="tm-swipe-image-zl-v19final" style="background-image: url('');"></div>
            <p id="tm-swipe-address-zl-v19final" style="text-align:center; font-style:italic; min-height:1.2em;"></p>
            <div class="swipe-actions" style="margin-top:15px;">
                <button id="tm-swipe-unrenovated-zl-v19final" style="background-color:#dc3545;">${svgIconUnrenovated} Unrenovated</button>
                <button id="tm-swipe-skip-zl-v19final" style="background-color:#6c757d;">Skip</button>
                <button id="tm-swipe-renovated-zl-v19final" style="background-color:#28a745;">${svgIconRenovated} Renovated</button>
            </div>
            <p id="tm-swipe-progress-zl-v19final" style="text-align:center; margin-top:10px;"></p>
            <button id="tm-swipe-finish-zl-v19final" style="margin-top:15px; background-color:#007bff; display:none;">Finish Defining</button>
        `;
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const imageContainer = document.getElementById('tm-swipe-image-zl-v19final');
        const addressP = document.getElementById('tm-swipe-address-zl-v19final');
        const progressP = document.getElementById('tm-swipe-progress-zl-v19final');
        const btnUnrenovated = document.getElementById('tm-swipe-unrenovated-zl-v19final');
        const btnSkip = document.getElementById('tm-swipe-skip-zl-v19final');
        const btnRenovated = document.getElementById('tm-swipe-renovated-zl-v19final');
        const btnFinish = document.getElementById('tm-swipe-finish-zl-v19final');

        let currentIndex = 0;
        let currentImageDataForRef = null;

        async function loadNextCandidate() {
            if (!isCrawlingGlobal && currentIndex > 0) { // Allow first image load even if crawling stopped, but not further ones
                closeSwipeModal("Process stopped externally");
                return;
            }
            if (currentIndex >= candidateAddresses.length) {
                addressP.textContent = "All candidates shown.";
                imageContainer.style.backgroundImage = `url('')`;
                imageContainer.textContent = "Done!";
                btnUnrenovated.disabled = true; btnSkip.disabled = true; btnRenovated.disabled = true;
                btnFinish.style.display = 'inline-block';
                return;
            }
            progressP.textContent = `Image ${currentIndex + 1} of ${candidateAddresses.length}`;
            const address = candidateAddresses[currentIndex];
            addressP.textContent = address;
            imageContainer.style.backgroundImage = `url('')`;
            imageContainer.textContent = "Loading...";
            currentImageDataForRef = null;

            const preFetchedImage = allImagesToProcess.find(img => img.addressQueryString === address);

            if (preFetchedImage && preFetchedImage.imageData) {
                currentImageDataForRef = preFetchedImage.imageData;
                const canvas = document.createElement('canvas');
                canvas.width = currentImageDataForRef.width;
                canvas.height = currentImageDataForRef.height;
                const ctx = canvas.getContext('2d');
                const imgDataInstance = new ImageData(new Uint8ClampedArray(currentImageDataForRef.data), currentImageDataForRef.width, currentImageDataForRef.height);
                ctx.putImageData(imgDataInstance, 0, 0);
                imageContainer.style.backgroundImage = `url('${canvas.toDataURL()}')`;
                imageContainer.textContent = "";
            } else {
                logger.warn("Image data not pre-fetched for reference candidate:", address, "This might indicate an issue in mainAnalysisWorkflow's pre-fetch logic.");
                imageContainer.textContent = "Error: Image data not pre-loaded.";
                // Skip if data not found, as it's expected to be in allImagesToProcess
                setTimeout(() => handleChoice('skip'), 500); // Auto-skip problematic one
            }
        }

        const handleChoice = (choice) => {
            if (currentIndex < candidateAddresses.length) {
                const currentAddress = candidateAddresses[currentIndex];
                if (choice !== 'skip' && currentImageDataForRef) {
                    collectedReferences[choice].push({ addressQueryString: currentAddress, imageData: currentImageDataForRef });
                    logger.debug(`Reference: ${currentAddress} classified as ${choice}`);
                }
            }
            currentIndex++;
            loadNextCandidate();
        };

        btnUnrenovated.addEventListener('click', () => handleChoice('unrenovated'));
        btnSkip.addEventListener('click', () => handleChoice('skip'));
        btnRenovated.addEventListener('click', () => handleChoice('renovated'));

        return new Promise(resolve => {
            let keydownHandlerForSwipeModal;
            const closeSwipeModal = (reason) => {
                logger.info("Closing swipe modal, reason:", reason);
                try { document.body.removeChild(overlay); } catch (e) {}
                if (keydownHandlerForSwipeModal) document.removeEventListener('keydown', keydownHandlerForSwipeModal);
                resolve(collectedReferences);
            };
            keydownHandlerForSwipeModal = (e) => {
                if (e.key === "Escape") { closeSwipeModal("Escape key"); }
                else if (e.key === "ArrowLeft") { btnUnrenovated.click(); }
                else if (e.key === "ArrowRight") { btnRenovated.click(); }
                else if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") { btnSkip.click(); }
            };
            document.addEventListener('keydown', keydownHandlerForSwipeModal);
            btnFinish.addEventListener('click', () => closeSwipeModal("User finished"));
            overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSwipeModal("Overlay click"); });
            loadNextCandidate();
        });
    }

    function averageFeatures(featureArrays) {
        if (!featureArrays || featureArrays.length === 0) return null;
        logger.debug("New Promise (implicit): Averaging features for centroid. Count:", featureArrays.length);
        const validFeatureArrays = featureArrays.filter(f => f && Array.isArray(f) && f.length > 0); // Ensure it's an array and not empty
        if (validFeatureArrays.length === 0) {
            logger.warn("No valid (non-empty array) feature arrays to average for centroid.");
            return null;
        }
        const featureLength = validFeatureArrays[0].length;
        const sum = new Array(featureLength).fill(0);
        for (const features of validFeatureArrays) {
            if (features.length === featureLength) {
                for (let i = 0; i < featureLength; i++) {
                    sum[i] += (features[i] || 0); // Ensure numbers
                }
            } else {
                logger.warn("Skipping feature array of inconsistent length in centroid calculation. Expected:", featureLength, "Got:", features.length);
            }
        }
        return sum.map(s => s / validFeatureArrays.length);
    }

    function loadGoogleMapsScript() {
        alert("load google..");
        logger.debug("New Promise: Load Google Maps API Script (v1.9.1).");
        return new Promise((resolve, reject) => {
            if (!API_KEY) {
                logger.error("Cannot load Google Maps API without API Key.");
                updateBottomStatusBar({ apiKey: null, apiKeyFullStatus: "Unregistered", processStatus: "API Key Error - Required for Maps", progress: 0, etrString:"" });
                reject(new Error("API Key missing."));
                return;
            }
            if (typeof window.google === 'object' && typeof window.google.maps === 'object') {
                logger.info("Gmaps API already loaded.");
                initializeGoogleMapsServices();
                resolve();
                return;
            }
            window.tmRenovisionV19FinalInitMapZL = () => {
                initializeGoogleMapsServices();
                resolve();
            };
            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=geometry,directions&callback=tmRenovisionV19FinalInitMapZL`;
            script.async = true;
            script.onerror = (e) => {
                logger.error("Failed to load Gmaps API script:", e);
                updateBottomStatusBar({apiKey: API_KEY, apiKeyFullStatus: "Error (Invalid Key?)", processStatus: "Error - Gmaps Load Failed", progress: 0, etrString:""});
                reject(new Error("Gmaps API script load failed."));
            };
            document.head.appendChild(script);
            logger.info("Gmaps API script tag injected.");
        });
    }

    async function initScript() {
        logger.debug("Initializing Renovision Script (v1.9.1 - Beautified & Full)...");
        createUI();
        createBottomStatusBar();

        API_KEY = await getApiKey(true); // prompt immediately

        if (!API_KEY) {
            logger.debug("API Key not in localStorage. User needs to act (click Register or Start).");
            if (startButton) startButton.disabled = false;
            API_KEY = await promptForApiKey();
        }
        if(!API_KEY){
           return updateBottomStatusBar({apiKey: API_KEY, apiKeyFullStatus: "unregistered", processStatus: "User cancelled API key management..", progress: 0, etrString: ""});
        }
        try {
            const currentKeyFullStatusOnLoad = "Registered (localStorage)";
            updateBottomStatusBar({apiKey: API_KEY, apiKeyFullStatus: currentKeyFullStatusOnLoad, processStatus: "Initializing - Loading Maps", progress: 0.01, etrString: ""});
            await loadGoogleMapsScript();
            logger.debug("Attempting to setup IndexedDB post Gmaps load.");
            updateBottomStatusBar({apiKey: API_KEY, apiKeyFullStatus: currentKeyFullStatusOnLoad, processStatus: "Initializing - Setup DB", progress: 0.02, etrString: ""});
            await setupDB();
            updateBottomStatusBar({apiKey: API_KEY, apiKeyFullStatus: currentKeyFullStatusOnLoad, processStatus: "Ready", progress: 0, etrString: ""});
            if(startButton) startButton.disabled = false;
        } catch (err) {
            logger.debug("Error during Gmaps load or DB setup in initScript:", err);
            const errorKeyStatus = API_KEY ? (localStorage.getItem(LOCALSTORAGE_API_KEY) ? "Registered (localStorage)" : "Session Only (Error)") : "Unregistered";
            if (crawlingStatusSpanGlobal && !crawlingStatusSpanGlobal.textContent.includes("Gmaps Load Failed")) {
                 updateBottomStatusBar({apiKey: API_KEY, apiKeyFullStatus: errorKeyStatus, processStatus: "Error - Initialization Failed", progress: 0, etrString: ""});
            }
            if(startButton) startButton.disabled = true;
        }
    }

    function initializeGoogleMapsServices() {
        logger.info("Google Maps API loaded callback. Initializing services (v1.9.1)...");
        try {
            const mapElement = document.getElementById('tm-gmaps-map-renovision-zl-v19final');
            if (!mapElement) {
                logger.error("Map div 'tm-gmaps-map-renovision-zl-v19final' not found!");
                throw new Error("Map div not found");
            }
            map = new google.maps.Map(mapElement, { center: { lat: 47.5086, lng: 19.0740 }, zoom: 16 });
            directionsService = new google.maps.DirectionsService();
            streetViewService = new google.maps.StreetViewService();
            geocoder = new google.maps.Geocoder();
            logger.info("Google Maps services successfully initialized (v1.9.1).");
        } catch (e) {
            logger.error("Error initializing Google Maps Services (v1.9.1):", e);
            const errorKeyStatus = API_KEY ? (localStorage.getItem(LOCALSTORAGE_API_KEY) ? "Registered (localStorage)" : "Session Only (Gmaps Init Error)"):"Unregistered";
            updateBottomStatusBar({apiKey: API_KEY, apiKeyFullStatus: errorKeyStatus, processStatus: "Error - Gmaps Init Failed", progress: 0, etrString: ""});
            if(startButton) startButton.disabled = true;
        }
    }

    initScript();

})();
