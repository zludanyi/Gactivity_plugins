// ==UserScript==
// @name         Floorplan Manager (Iframe OpenCV + Dev Mode
// @version      1.0.3
// @description  Uses iframe for OpenCV, dev mode toggle for logging, standard style/script injection.
// @author       ZLudany
// @match        https://home.google.com/*
// @grant        none
// @require      https://d3js.org/d3.v7.min.js
// @require      https://d3js.org/d3-drag.v3.min.js
// @require      https://d3js.org/d3-zoom.v3.min.js
// ==/UserScript==

(function() {
    'use strict';

    // --- Configuration ---
    const DEV_MODE = false; // <<< SET TO true FOR ALERT LOGGING, false FOR CONSOLE LOGGING >>>
    // --- End Configuration ---

    // --- Logging Helpers ---
    function logDebug(message, ...optionalParams) {
        if (DEV_MODE) {
            let alertMsg = "[DEBUG] " + message;
            if (optionalParams.length > 0) { try { alertMsg += " :: " + optionalParams.map(p => JSON.stringify(p)).join('; '); } catch (e) { alertMsg += " :: [Error stringifying params]"; } }
            alert(alertMsg);
        } else { console.log("[DEBUG]", message, ...optionalParams); }
    }
    function logWarn(message, ...optionalParams) {
        const fullMessage = "[WARN] " + message;
        if (DEV_MODE) {
            let alertMsg = fullMessage;
            if (optionalParams.length > 0) { try { alertMsg += " :: " + optionalParams.map(p => JSON.stringify(p)).join('; '); } catch (e) { alertMsg += " :: [Error stringifying params]"; } }
            alert(alertMsg);
        } else { console.warn(fullMessage, ...optionalParams); }
    }
    function logError(message, ...optionalParams) {
        const fullMessage = "[ERROR] " + message;
        if (DEV_MODE) {
            let alertMsg = fullMessage;
            if (optionalParams.length > 0) { try { alertMsg += " :: " + optionalParams.map(p => JSON.stringify(p)).join('; '); } catch (e) { alertMsg += " :: [Error stringifying params]"; } }
            alert(alertMsg);
        } else { console.error(fullMessage, ...optionalParams); }
    }
    // --- End Logging Helpers ---

    logDebug("--- Floorplan Manager (Iframe Strategy, Dev Mode: " + DEV_MODE + ", Final) Execution Starting ---");

    // --- Constants ---
    const IFRAME_ID = 'opencv-processor-iframe';
    const OPENCV_URL = 'https://docs.opencv.org/4.5.4/opencv.js'; // Used inside iframe script

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
            style.id = 'floorplan-manager-styles'; // Optional ID
            style.appendChild(document.createTextNode(css));
            head.appendChild(style);
            logDebug("Global styles added to <head>.");
        } catch (e) {
            logError("Error adding global styles:", e);
        }
    }
    // --- End Style Helper ---

    // --- CSS Styles ---
    const cssStyles = `
        #floorplan-container { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.85); z-index: 2147483647 !important; display: none; flex-direction: column; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box; font-family: sans-serif; color: white; overflow: hidden; }
        #floorplan-loading-indicator { position: fixed; top: 10px; left: 10px; background: rgba(0,0,0,0.8); color: white; padding: 10px 15px; border-radius: 5px; z-index: 2147483647 !important; font-family: sans-serif; text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000; background: linear-gradient(to right, #3498db, #2980b9); display: none; }
        #floorplan-controls { background: #333; padding: 15px; border-radius: 5px; margin-bottom: 10px; display: flex; gap: 15px; align-items: center; flex-shrink: 0; z-index: 1; }
        #floorplan-canvas { background: #444; border: 1px solid #777; max-width: 90%; max-height: 65vh; object-fit: contain; display: block; margin-bottom: 5px; flex-shrink: 1; } /* Canvas is for preview in parent */
        #floorplan-canvas-label { color: #ccc; font-size: 0.9em; font-style: italic; text-align: center; margin-bottom: 10px; display: block; flex-shrink: 0; }
        #floorplan-close-btn { position: absolute; top: 15px; right: 20px; background: #ff4444; color: white; border: none; padding: 8px 12px; cursor: pointer; font-size: 1.2em; border-radius: 3px; z-index: 2; }
        #floorplan-status { margin-top: auto; font-style: italic; background: #333; padding: 5px 10px; border-radius: 3px; flex-shrink: 0; z-index: 1; }
        #floorplan-controls label { margin-right: 5px; }
        #floorplan-controls input[type=file] { border: 1px solid #666; padding: 5px; border-radius: 3px; background: #555; color: white; }
        #floorplan-svg-container { width: 90%; height: 75vh; border: 1px solid #66aaff; display: none; flex-grow: 1; flex-shrink: 1; overflow: hidden; box-sizing: border-box; background-color: #282c34; }
        #floorplan-svg-container svg { display: block; width: 100%; height: 100%; }
        .floorplan-polygon { fill: rgba(100, 150, 255, 0.7); stroke: #d0d0ff; stroke-width: 1; cursor: grab; }
        .floorplan-polygon:active { cursor: grabbing; }
        .floorplan-polygon.dragging { stroke: yellow; stroke-width: 1.5; }
    `;
    addGlobalStyle(cssStyles);


    // --- Iframe Content (HTML + JS) ---
    // Uses standard script loading inside
    const iframeContent = `
<!DOCTYPE html>
<html>
<head>
    <title>OpenCV Processor</title>
    <meta charset="UTF-8">
    <style> body { margin: 0; padding: 0; background-color: #111; color: #eee; font-family: sans-serif; font-size: 10px; } #iframe-status { padding: 5px; background-color: #333; } #processing-canvas { display: none; } </style>
</head>
<body>
    <div id="iframe-status">Iframe Processor: Initializing...</div>
    <canvas id="processing-canvas"></canvas>

    <script>
        // --- Injected Config & Helpers ---
        const DEV_MODE = ${DEV_MODE}; // Inject parent's DEV_MODE setting
        const OPENCV_URL = '${OPENCV_URL}';
        const PARENT_ORIGIN = '${window.location.origin}';

        // Logging helpers copied into iframe scope
        function logDebug(message, ...optionalParams) { if (DEV_MODE) { let alertMsg = "[IFRAME DEBUG] " + message; if (optionalParams.length > 0) { try { alertMsg += " :: " + optionalParams.map(p => JSON.stringify(p)).join('; '); } catch (e) { alertMsg += " :: [Error stringifying params]"; } } alert(alertMsg); } else { console.log("[IFRAME DEBUG]", message, ...optionalParams); } }
        function logWarn(message, ...optionalParams) { const fullMessage = "[IFRAME WARN] " + message; if (DEV_MODE) { let alertMsg = fullMessage; if (optionalParams.length > 0) { try { alertMsg += " :: " + optionalParams.map(p => JSON.stringify(p)).join('; '); } catch (e) { alertMsg += " :: [Error stringifying params]"; } } alert(alertMsg); } else { console.warn(fullMessage, ...optionalParams); } }
        function logError(message, ...optionalParams) { const fullMessage = "[IFRAME ERROR] " + message; if (DEV_MODE) { let alertMsg = fullMessage; if (optionalParams.length > 0) { try { alertMsg += " :: " + optionalParams.map(p => JSON.stringify(p)).join('; '); } catch (e) { alertMsg += " :: [Error stringifying params]"; } } alert(alertMsg); } else { console.error(fullMessage, ...optionalParams); } }
        // --- End Injected Config & Helpers ---

        logDebug("Iframe script started.");

        function updateIframeStatus(message) {
            const statusEl = document.getElementById('iframe-status');
            if (statusEl) statusEl.textContent = "Iframe: " + message;
            logDebug("Iframe Status Update: " + message); // Use helper
        }

        // Standard script loader within iframe
        function loadScript(url) {
            updateIframeStatus("Loading OpenCV script tag: " + url);
            return new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = url;
                script.async = true;
                script.onload = () => {
                    updateIframeStatus("OpenCV script tag loaded.");
                    // Now we wait for onRuntimeInitialized
                    resolve();
                };
                script.onerror = (err) => {
                    const errorMsg = "Error loading OpenCV script tag.";
                    updateIframeStatus(errorMsg);
                    logError("Iframe script load error:", err); // Use helper
                    reject(new Error(\`Failed to load script: \${url}\`));
                };
                document.head.appendChild(script);
            });
        }

        // --- Core OpenCV Processing Logic (within iframe) ---
        class OpenCVProcessor {
            cv = null;
            isReady = false;
            processingCanvas = null;
            processingCtx = null;

            constructor() {
                updateIframeStatus("OpenCVProcessor constructor called.");
                this.processingCanvas = document.getElementById('processing-canvas');
                if (this.processingCanvas) {
                    this.processingCtx = this.processingCanvas.getContext('2d');
                } else {
                     logError("Iframe: Processing canvas not found!"); // Use helper
                     this.sendMessageToParent('processing_error', { message: "Iframe internal error: Canvas missing." });
                }

                // Define Module object *before* loading the script
                window.Module = {
                    onRuntimeInitialized: this.onCvReady.bind(this),
                    onAbort: (reason) => {
                         const errorMsg = "Fatal Error: OpenCV WASM Aborted: " + reason;
                         logError("Iframe OpenCV WASM Aborted:", reason); // Use helper
                         updateIframeStatus(errorMsg);
                         this.sendMessageToParent('processing_error', { message: "OpenCV WASM Aborted: " + reason });
                         this.isReady = false;
                    }
                };
                updateIframeStatus("Module defined. Attempting to load OpenCV script...");
                loadScript(OPENCV_URL).catch(error => {
                    // Error logged in loadScript
                    this.sendMessageToParent('processing_error', { message: "Failed to load OpenCV script in iframe: " + error.message });
                });
            }

            onCvReady() {
                updateIframeStatus("OpenCV Runtime Initialized.");
                if (typeof cv !== 'undefined' && cv.imread) {
                    this.cv = cv; // Assign the global cv created by the script
                    this.isReady = true;
                    updateIframeStatus("OpenCV is ready.");
                    this.sendMessageToParent('opencv_ready');
                } else {
                    logError("Iframe: onRuntimeInitialized called, but cv or cv.imread is invalid!"); // Use helper
                    updateIframeStatus("Error: OpenCV loaded but invalid.");
                    this.sendMessageToParent('processing_error', { message: "OpenCV loaded in iframe but was invalid." });
                }
            }

            sendMessageToParent(type, data = {}) {
                // Keep console.log for messages SENT, less intrusive than alert
                console.log(\`Iframe: Sending message to parent: \${type}\`, data);
                window.parent.postMessage({ type: type, payload: data }, PARENT_ORIGIN);
            }

            async processImageBlob(imageBlob) {
                updateIframeStatus("Received image blob for processing.");
                if (!this.isReady || !this.cv || !this.processingCanvas || !this.processingCtx) {
                    logError("Iframe: Not ready or missing components for processing."); // Use helper
                    this.sendMessageToParent('processing_error', { message: "Iframe processor not ready or canvas missing." });
                    return;
                }

                let src = null, gray = null, edges = null, contours = null, hierarchy = null;
                const formattedContours = [];
                let blobUrl = null;

                try {
                    blobUrl = URL.createObjectURL(imageBlob);
                    updateIframeStatus("Created Blob URL, loading image...");

                    const imgElement = await this.loadImageFromUrl(blobUrl);
                    updateIframeStatus("Image loaded into element.");

                    this.processingCanvas.width = imgElement.naturalWidth;
                    this.processingCanvas.height = imgElement.naturalHeight;
                    this.processingCtx.drawImage(imgElement, 0, 0);
                    updateIframeStatus("Image drawn to processing canvas.");

                    // --- OpenCV Processing ---
                    const cv = this.cv;
                    src = cv.imread(this.processingCanvas); // Read from canvas
                    if (src.empty()) throw new Error("cv.imread failed from canvas.");

                    gray = new cv.Mat(); cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
                    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
                    edges = new cv.Mat(); cv.Canny(gray, edges, 50, 100); // Example thresholds
                    contours = new cv.MatVector(); hierarchy = new cv.Mat();
                    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
                    updateIframeStatus(\`Found \${contours.size()} raw contours.\`);

                    const minArea = 50; // Example minimum area

                    for (let i = 0; i < contours.size(); ++i) {
                        const contour = contours.get(i);
                        try {
                             const area = cv.contourArea(contour);
                             if (area < minArea || contour.rows < 3) continue;
                             const pointsArray = []; const pointData = contour.data32S;
                             for (let j = 0; j < contour.rows; ++j) { pointsArray.push({ x: pointData[j * 2], y: pointData[j * 2 + 1] }); }
                             formattedContours.push({ id: \`iframe-contour-\${Date.now()}-\${i}\`, points: pointsArray });
                        } finally { if(contour) contour.delete(); }
                    }
                    updateIframeStatus(\`Processed \${formattedContours.length} valid contours.\`);
                    this.sendMessageToParent('processing_complete', { contours: formattedContours, originalWidth: imgElement.naturalWidth, originalHeight: imgElement.naturalHeight });

                } catch (error) {
                    logError("Iframe processing error:", error); // Use helper
                    updateIframeStatus("Error during processing: " + error.message);
                    this.sendMessageToParent('processing_error', { message: "Error in iframe processing: " + error.message });
                } finally {
                    // OpenCV Memory Cleanup
                    if (src) src.delete(); if (gray) gray.delete(); if (edges) edges.delete();
                    if (contours) contours.delete(); if (hierarchy) hierarchy.delete();
                    // Blob URL Cleanup
                    if (blobUrl) URL.revokeObjectURL(blobUrl);
                    // Keep console log for cleanup message
                    console.log("Iframe: OpenCV Mats and Blob URL cleaned up.");
                }
            }

            // Helper to load image from URL
            loadImageFromUrl(url) {
                return new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = (err) => {
                         const errorMsg = "Failed to load image from Blob URL in iframe.";
                         logError(errorMsg, err); // Use helper
                         reject(new Error(errorMsg));
                    };
                    img.src = url;
                });
            }
        } // End OpenCVProcessor Class

        // --- Iframe Global Scope ---
        let processorInstance = null;

        window.addEventListener('message', (event) => {
             if (event.origin !== PARENT_ORIGIN) { return; }
             // Keep console log for received messages
             console.log("Iframe received message:", event.data);
             const message = event.data;
            if (message && message.type === 'process_image_blob' && message.payload && message.payload.imageBlob instanceof Blob) {
                if (processorInstance && processorInstance.isReady) { processorInstance.processImageBlob(message.payload.imageBlob); }
                else { const errorMsg = "Iframe processor not ready to handle image."; logError(errorMsg); window.parent.postMessage({ type: 'processing_error', payload: { message: errorMsg } }, PARENT_ORIGIN); }
            } else { /* logWarn("Iframe: Received unknown message format:", message); */ }
        });

        // Initialize the processor
        try {
            processorInstance = new OpenCVProcessor();
        } catch (error) {
             logError("Iframe: Failed to instantiate OpenCVProcessor:", error); // Use helper
             window.parent.postMessage({ type: 'processing_error', payload: { message: "Iframe failed to initialize processor: " + error.message } }, PARENT_ORIGIN);
             updateIframeStatus("Fatal Error: Failed to initialize processor: " + error.message);
        }

    </script>
</body>
</html>
`; // End iframeContent template literal


    // --- Standalone Loading Indicator Helpers ---
    // (Need to be defined before use in classes/startup)
    function showStandaloneLoadingIndicator(message) {
         logDebug("Attempting to show standalone indicator:", message);
         let indicator = null;
         try {
             indicator = document.getElementById('floorplan-loading-indicator');
             if (!indicator) {
                 indicator = document.createElement('div');
                 indicator.id = 'floorplan-loading-indicator';
                 const rootEl = document.documentElement || document.body;
                 if (rootEl) { rootEl.appendChild(indicator); logDebug("Standalone loading indicator created and appended."); }
                 else { logError("Cannot append indicator: No documentElement or body found!"); return null; }
             } else { logDebug("Reusing existing standalone indicator."); }
             indicator.textContent = message;
             indicator.style.display = 'block';
             logDebug("Standalone loading indicator shown.");
         } catch (e) { logError("Error in showStandaloneLoadingIndicator:", e); indicator = null; }
         return indicator;
     }
     function updateStandaloneLoadingIndicator(indicator, message) {
         logDebug("Attempting to update standalone indicator:", message);
         try {
             const targetIndicator = indicator || document.getElementById('floorplan-loading-indicator');
             if (targetIndicator) {
                 targetIndicator.textContent = message;
                 targetIndicator.style.display = 'block';
                 logDebug("Standalone loading indicator updated.");
             } else { logWarn("updateStandaloneLoadingIndicator: Indicator not found."); showStandaloneLoadingIndicator("[Update Fallback] " + message); }
         } catch (e) { logError("Error in updateStandaloneLoadingIndicator:", e); }
     }
     function hideStandaloneLoadingIndicator(indicator) {
         logDebug("Attempting to hide standalone indicator.");
         try {
             const targetIndicator = indicator || document.getElementById('floorplan-loading-indicator');
             if (targetIndicator) { targetIndicator.style.display = 'none'; logDebug("Standalone loading indicator hidden."); }
             else { logWarn("hideStandaloneLoadingIndicator: Indicator not found."); }
         } catch (e) { logError("Error in hideStandaloneLoadingIndicator:", e); }
     }
    // --- End Standalone Helpers ---


    // --- Floorplan SVG Creator Class (Parent Scope) ---
    logDebug("Defining FloorplanCreator class...");
    class FloorplanCreator {
        svgContainer = null; svg = null; svgGroup = null; contourData = []; d3 = null; zoom = null;
        POLYGON_FILL = 'rgba(100, 150, 255, 0.7)'; POLYGON_STROKE = '#d0d0ff'; POLYGON_STROKE_WIDTH = 1;
        DRAGGING_STROKE = 'yellow'; DRAGGING_STROKE_WIDTH = 1.5; CONTAINER_ID = 'floorplan-svg-container'; parentContainer = null;
        targetWidth = 800; targetHeight = 600;

        constructor(parentContainerRef, d3Instance, targetWidth = 800, targetHeight = 600) {
            if (!parentContainerRef) throw new Error("FloorplanCreator requires parent container reference.");
            if (!d3Instance) throw new Error("FloorplanCreator requires D3 instance.");
            this.parentContainer = parentContainerRef;
            this.d3 = d3Instance;
            this.targetWidth = targetWidth;
            this.targetHeight = targetHeight;
            logDebug("FloorplanCreator initialized in parent.");
        }

        renderContourData(contourData, originalWidth, originalHeight) {
             if (!contourData) { logWarn("FloorplanCreator: No contour data provided to render."); this.destroy(); return Promise.resolve(); }
             logDebug(`FloorplanCreator: Received ${contourData.length} contours. Original size: ${originalWidth}x${originalHeight}`);
             this.contourData = this.scaleContours(contourData, originalWidth, originalHeight);
             return this.render();
        }

        scaleContours(rawContours, originalWidth, originalHeight) {
            if (!originalWidth || !originalHeight) { logWarn("Cannot scale contours: Original dimensions missing."); return rawContours; }
             const scaleX = this.targetWidth / originalWidth; const scaleY = this.targetHeight / originalHeight;
             const scale = Math.min(scaleX, scaleY);
             logDebug(`Scaling contours by factor: ${scale.toFixed(3)} (Target: ${this.targetWidth}x${this.targetHeight})`);
             return rawContours.map(contour => ({ ...contour, points: contour.points.map(p => ({ x: Math.round(p.x * scale), y: Math.round(p.y * scale) })) }));
        }

        render() {
            const self = this;
            return new Promise((resolve, reject) => {
                setTimeout(() => {
                    try {
                        if (!self.d3) throw new Error("D3 missing in render.");
                        if (!self.parentContainer || !document.contains(self.parentContainer)) throw new Error("Parent container missing/detached in render.");
                        if (!self.contourData || self.contourData.length === 0) { logDebug("FloorplanCreator: No scaled contours to render."); self.destroy(); return resolve(); }
                        self.destroy();
                        self.svgContainer = document.createElement('div'); self.svgContainer.id = self.CONTAINER_ID;
                        const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                        self.svg = self.d3.select(svgElement); self.svgGroup = self.svg.append('g').attr('id', 'floorplan-shapes');
                        self.svgGroup.selectAll('.floorplan-polygon').data(self.contourData, d => d.id).enter().append('polygon').attr('class', 'floorplan-polygon').attr('points', d => d.points.map(p => `${p.x},${p.y}`).join(' ')).style('fill', self.POLYGON_FILL).style('stroke', self.POLYGON_STROKE).style('stroke-width', self.POLYGON_STROKE_WIDTH).attr('transform', d => d.transform || null).call(self.setupDrag());
                        const statusLabelElement = self.parentContainer.querySelector('#floorplan-status');
                        if (statusLabelElement) { self.parentContainer.insertBefore(self.svgContainer, statusLabelElement); } else { self.parentContainer.appendChild(self.svgContainer); }
                        self.svgContainer.appendChild(svgElement); self.setupZoom(); if (self.zoom) { self.svg.call(self.zoom); }
                        self.svgContainer.style.display = 'block'; logDebug("FloorplanCreator: SVG rendered successfully."); resolve();
                    } catch (error) { logError("FloorplanCreator: Error during SVG render.", error); reject(error); }
                }, 0);
            });
        }
        setupZoom() { if (!this.d3) { logError("D3 missing in setupZoom"); return; } const zoomed = (event) => { if (this.svgGroup) { this.svgGroup.attr('transform', event.transform); }}; this.zoom = this.d3.zoom().scaleExtent([0.1, 10]).on('zoom', zoomed); }
        setupDrag() { if (!this.d3) { logError("D3 missing in setupDrag"); return () => {}; } const creatorInstance = this; return this.d3.drag().on('start', function(event, d) { creatorInstance.d3.select(this).raise().classed('dragging', true).style('stroke', creatorInstance.DRAGGING_STROKE).style('stroke-width', creatorInstance.DRAGGING_STROKE_WIDTH); }).on('drag', function(event, d) { const currentTransform = creatorInstance.d3.select(this).attr('transform') || ""; let currentX = 0, currentY = 0; const match = currentTransform.match(/translate\(([^,]+),([^)]+)\)/); if (match) { currentX = parseFloat(match[1]); currentY = parseFloat(match[2]); } const newX = currentX + event.dx; const newY = currentY + event.dy; creatorInstance.d3.select(this).attr('transform', `translate(${newX}, ${newY})`); }).on('end', function(event, d) { creatorInstance.d3.select(this).classed('dragging', false).style('stroke', creatorInstance.POLYGON_STROKE).style('stroke-width', creatorInstance.POLYGON_STROKE_WIDTH); }); }
        destroy() { if (this.svgContainer) { if (this.svg) this.svg.on('.zoom', null); if (this.svgGroup) this.svgGroup.selectAll('.floorplan-polygon').on('.drag', null); this.svgContainer.remove(); this.svgContainer = null; this.svg = null; this.svgGroup = null; this.zoom = null; logDebug("FloorplanCreator: SVG destroyed."); } }
    }
    logDebug("FloorplanCreator class defined.");


    // --- Floorplan Manager Class (Parent Scope) ---
    logDebug("Defining FloorplanManager class...");
    class FloorplanManager extends FloorplanCreator {
        iframe = null; isIframeReady = false; currentBlobUrl = null; uiCreated = false;
        container = null; controlsDiv = null; fileInput = null; statusLabel = null;
        canvas = null; canvasCtx = null; canvasLabel = null; closeButton = null;
        loadingIndicator = null;

        constructor() {
            logDebug("FloorplanManager constructor started.");
            if (typeof d3 === 'undefined' || !d3) { logError("FATAL: D3 library failed!"); try { showStandaloneLoadingIndicator("Error: D3 Library Failed!"); } catch(e){} throw new Error("D3 library failed to load."); }
            logDebug("FloorplanManager: D3 found.");
            const baseContainerElement = document.createElement('div'); baseContainerElement.id = 'floorplan-container';
            logDebug("FloorplanManager: Calling super(FloorplanCreator constructor)...");
            super(baseContainerElement, d3, 800, 600);
            logDebug("FloorplanManager: super(FloorplanCreator constructor) finished.");
            this.container = baseContainerElement;
            logDebug("FloorplanManager: 'this.container' assigned.");
            try { logDebug("FloorplanManager: Populating UI container..."); this.populateUIContainer(); this.uiCreated = true; logDebug("FloorplanManager: UI container populated."); }
            catch(e) { logError("FloorplanManager: Error populating UI container:", e); if (this.container) { try { this.container.remove(); } catch(remErr){} } this.container = null; this.uiCreated = false; this.showLoadingIndicator(`Error Creating UI: ${e.message}`); throw new Error(`Failed to populate UI: ${e.message}`); }
            try { logDebug("FloorplanManager: Appending main container to DOM..."); const rootEl = document.documentElement || document.body; if (rootEl) { rootEl.appendChild(this.container); logDebug("FloorplanManager: Main container appended."); } else { throw new Error("Could not find documentElement or body to append UI."); } }
            catch (e) { logError("FloorplanManager: Error appending UI container:", e); if (this.container) { try { this.container.remove(); } catch(remErr){} } this.container = null; this.uiCreated = false; this.showLoadingIndicator(`Error Displaying UI: ${e.message}`); throw new Error(`Failed to append UI: ${e.message}`); }
            this.showLoadingIndicator("Initializing OpenCV Processor (Iframe)...");
            this.setupIframe(); this.setupMessageListener();
            logDebug("FloorplanManager constructor finished successfully.");
        }

        populateUIContainer() { if (!this.container) throw new Error("populateUIContainer called but this.container is null."); this.controlsDiv = document.createElement('div'); this.controlsDiv.id = 'floorplan-controls'; const fileInputLabel = document.createElement('label'); fileInputLabel.textContent = 'Upload Floorplan Image:'; fileInputLabel.htmlFor = 'floorplan-file-input'; this.fileInput = document.createElement('input'); this.fileInput.type = 'file'; this.fileInput.accept = 'image/*'; this.fileInput.id = 'floorplan-file-input'; this.controlsDiv.appendChild(fileInputLabel); this.controlsDiv.appendChild(this.fileInput); this.container.appendChild(this.controlsDiv); this.closeButton = document.createElement('button'); this.closeButton.id = 'floorplan-close-btn'; this.closeButton.textContent = '✕'; this.closeButton.title = 'Close'; this.container.appendChild(this.closeButton); this.canvas = document.createElement('canvas'); this.canvas.id = 'floorplan-canvas'; this.canvas.width = 800; this.canvas.height = 600; this.canvasCtx = this.canvas.getContext('2d'); this.container.appendChild(this.canvas); this.canvasLabel = document.createElement('div'); this.canvasLabel.id = 'floorplan-canvas-label'; this.canvasLabel.textContent = "Upload image for preview & processing."; this.container.appendChild(this.canvasLabel); this.statusLabel = document.createElement('span'); this.statusLabel.id = 'floorplan-status'; this.statusLabel.textContent = 'Initializing...'; this.container.appendChild(this.statusLabel); if (this.fileInput) { this.fileInput.addEventListener('change', (e) => this.handleFileChange(e)); } else { logError("Manager populateUI: File input missing."); } if (this.closeButton) { this.closeButton.addEventListener('click', () => this.closeUI()); } else { logError("Manager populateUI: Close button missing."); } logDebug("Manager: UI elements populated in container."); }
        showLoadingIndicator(message = "Loading...") { if (!this.loadingIndicator) { this.loadingIndicator = document.getElementById('floorplan-loading-indicator'); if (!this.loadingIndicator) { this.loadingIndicator = document.createElement('div'); this.loadingIndicator.id = 'floorplan-loading-indicator'; const rootEl = document.documentElement || document.body; if(rootEl) rootEl.appendChild(this.loadingIndicator); logDebug("Manager's loading indicator created."); } } this.loadingIndicator.textContent = message; this.loadingIndicator.style.display = 'block'; logDebug("Manager's loading indicator shown:", message); }
        hideLoadingIndicator() { if (this.loadingIndicator) { this.loadingIndicator.style.display = 'none'; logDebug("Manager's loading indicator hidden."); } }
        updateLoadingIndicator(message) { if (this.loadingIndicator && this.loadingIndicator.style.display === 'block') { this.loadingIndicator.textContent = message; logDebug("Manager's loading indicator updated:", message); } else if (this.uiCreated && this.statusLabel) { this.updateStatus(message); } else { logDebug("Manager Status (no indicator/UI visible):", message); } }
        setupIframe() { logDebug("Setting up iframe..."); this.iframe = document.createElement('iframe'); this.iframe.id = IFRAME_ID; this.iframe.src = 'about:blank'; this.iframe.style.display = 'none'; document.body.appendChild(this.iframe); this.iframe.onload = () => { logDebug("Iframe loaded ('about:blank'). Injecting content..."); try { this.iframe.contentWindow.document.open(); this.iframe.contentWindow.document.write(iframeContent); this.iframe.contentWindow.document.close(); logDebug("Iframe content injected."); } catch (error) { logError("Error injecting content into iframe:", error); this.updateLoadingIndicator("Error: Failed to initialize processor iframe."); this.isIframeReady = false; } }; this.iframe.onerror = (error) => { logError("Iframe loading error (onerror):", error); this.updateLoadingIndicator("Error: Processor iframe failed to load."); this.isIframeReady = false; }; }
        setupMessageListener() { logDebug("Setting up parent message listener."); window.addEventListener('message', (event) => { if (!this.iframe || event.source !== this.iframe.contentWindow) { return; } logDebug("Parent received message:", event.data); const message = event.data; if (!message || !message.type) return; switch (message.type) { case 'opencv_ready': logDebug("Parent: Received opencv_ready message from iframe."); this.isIframeReady = true; this.hideLoadingIndicator(); if (this.container) this.container.style.display = 'flex'; else logError("Cannot show container, reference missing after iframe ready!"); this.updateStatus("Ready. Select floorplan image."); break; case 'processing_complete': logDebug("Parent: Received processing_complete message."); this.updateStatus("Processing complete. Rendering SVG..."); if (message.payload && message.payload.contours) { this.renderContourData(message.payload.contours, message.payload.originalWidth, message.payload.originalHeight).then(() => { this.updateStatus(`SVG rendered with ${message.payload.contours.length} shapes.`); this.hideCanvas(); }).catch(error => { logError("Parent: Error rendering SVG:", error); this.updateStatus(`Error rendering SVG: ${error.message}`); this.showCanvas(); }); } else { logWarn("Parent: processing_complete message missing contour data."); this.updateStatus("Processing finished, but no contour data received."); this.showCanvas(); } break; case 'processing_error': logError("Parent: Received processing_error message from iframe:", message.payload.message); this.updateStatus(`Processing Error: ${message.payload.message}`); this.showCanvas(); this.destroy(); break; case 'status_update': logDebug("Parent: Received status_update from iframe:", message.payload.message); this.updateStatus(message.payload.message); break; default: logWarn("Parent: Received unknown message type from iframe:", message.type); } }); }
        updateStatus(message) { if (this.uiCreated && this.statusLabel && this.container && this.container.style.display === 'flex') { this.statusLabel.textContent = message; } else { this.updateLoadingIndicator(message); } logDebug("Manager Status:", message); }
        handleFileChange(e) { logDebug("Manager: handleFileChange triggered."); if (!this.isIframeReady) { this.updateStatus("Error: Processor is not ready. Please wait."); e.target.value = null; return; } const file = e.target.files[0]; if (!file || !file.type.startsWith('image/')) { this.updateStatus('Error: Please select a valid image file.'); this.showCanvas(); this.destroy(); return; } this.updateStatus('Reading file...'); this.displayPreview(file); logDebug(`Manager: Sending image blob (\`${file.name}\`, ${file.size} bytes) to iframe.`); this.updateStatus('Sending image to processor...'); if (this.iframe && this.iframe.contentWindow) { const imageBlobToSend = new Blob([file], { type: file.type }); this.iframe.contentWindow.postMessage({ type: 'process_image_blob', payload: { imageBlob: imageBlobToSend } }, '*'); this.updateStatus('Image sent. Waiting for processing results...'); } else { logError("Manager: Cannot send image, iframe not available."); this.updateStatus('Error: Processor iframe connection lost.'); } }
        displayPreview(file) { const reader = new FileReader(); reader.onload = (event) => { const img = new Image(); img.onload = () => { if (this.canvas && this.canvasCtx) { const scale = Math.min(this.canvas.width / img.naturalWidth, this.canvas.height / img.naturalHeight); const drawWidth = img.naturalWidth * scale; const drawHeight = img.naturalHeight * scale; const dx = (this.canvas.width - drawWidth) / 2; const dy = (this.canvas.height - drawHeight) / 2; this.canvasCtx.clearRect(0, 0, this.canvas.width, this.canvas.height); this.canvasCtx.drawImage(img, dx, dy, drawWidth, drawHeight); this.updateCanvasLabel("Preview shown below. Processing in background..."); this.showCanvas(); logDebug("Parent: Preview displayed."); } }; img.onerror = () => { logError("Parent: Error loading preview image."); this.updateCanvasLabel("Could not display preview.");}; img.src = event.target.result; }; reader.onerror = () => { logError("Parent: Error reading file for preview."); this.updateCanvasLabel("Could not read file for preview."); }; reader.readAsDataURL(file); }
        showCanvas() { if (this.canvas) this.canvas.style.display = 'block'; if (this.canvasLabel) this.canvasLabel.style.display = 'block'; this.destroy(); logDebug("Manager: Canvas shown."); }
        hideCanvas() { if (this.canvas) this.canvas.style.display = 'none'; if (this.canvasLabel) this.canvasLabel.style.display = 'none'; logDebug("Manager: Canvas hidden."); }
        updateCanvasLabel(text) { if (this.canvasLabel) this.canvasLabel.textContent = text; }
        closeUI() { logDebug("Manager: Closing UI and iframe..."); super.destroy(); if (this.iframe) { try { this.iframe.remove(); } catch (e) {} this.iframe = null; logDebug("Manager: Iframe removed."); } if (this.container) { try { this.container.remove(); } catch (e) {} this.container = null; } try { this.hideLoadingIndicator(); } catch (e) {} this.isIframeReady = false; this.uiCreated = false; logDebug("Manager: UI closed completely."); }
    } // End FloorplanManager Class
    logDebug("FloorplanManager class defined.");


    // --- Instantiate the Manager ---
    logDebug("Instantiating FloorplanManager (Iframe Version)...");
    try {
        if (typeof d3 === 'undefined') throw new Error("D3 is not defined.");
        new FloorplanManager();
        logDebug("FloorplanManager instance created.");
    } catch (error) {
         logError("Critical error during script startup:", error);
         alert(`Critical Error: ${error.message}. Floorplan Manager cannot start.`); // Use alert for critical startup failure
         try { showStandaloneLoadingIndicator(`Startup Error: ${error.message}`); } catch(e){}
    }
    logDebug("--- Floorplan Manager (Iframe Strategy, Dev Mode: " + DEV_MODE + ", Final) Execution Finished ---");

})(); // End IIFE
