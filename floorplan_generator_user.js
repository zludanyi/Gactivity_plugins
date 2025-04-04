// ==UserScript==
// @name         Floorplan Manager (GM_XHR OpenCV Load v3 - ALERT DEBUG)
// @version      0.9.6
// @description  Async OpenCV processing & D3 rendering. Uses GM_xmlhttpRequest + local Module. ALERT DEBUGGING.
// @author       ZLudany
// @match        https://home.google.com/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest // Grant needed
// @require      https://d3js.org/d3.v7.min.js
// @require      https://d3js.org/d3-drag.v3.min.js
// @require      https://d3js.org/d3-zoom.v3.min.js
// ==/UserScript==

(function() {
    'use strict';
    // --- WARNING: Using alert() for debugging is highly disruptive! ---
    // --- VERY EARLY ALERT ---
    try {
        alert("--- Floorplan Manager [ALERT DEBUG v0.9.6] Execution Starting ---");
    } catch(e) { alert("ERROR: Cannot even alert! " + e); return; } // Bail if alert broken

    // --- Constants ---
    const OPENCV_URL = 'https://docs.opencv.org/4.5.4/opencv.js';
    const OPENCV_LOAD_TIMEOUT = 30000; // 30 seconds timeout

    // --- CSS Styles --- (Same as before)
    try {
        GM_addStyle(`
            #floorplan-container { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.85); z-index: 2147483647 !important; display: none; flex-direction: column; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box; font-family: sans-serif; color: white; overflow: hidden; }
            #floorplan-loading-indicator { position: fixed; top: 10px; left: 10px; background: rgba(0,0,0,0.8); color: white; padding: 10px 15px; border-radius: 5px; z-index: 2147483647 !important; font-family: sans-serif; text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000; background: linear-gradient(to right, #3498db, #2980b9); display: none; }
            #floorplan-controls { background: #333; padding: 15px; border-radius: 5px; margin-bottom: 10px; display: flex; gap: 15px; align-items: center; flex-shrink: 0; z-index: 1; }
            #floorplan-canvas { background: #444; border: 1px solid #777; max-width: 90%; max-height: 65vh; object-fit: contain; display: block; margin-bottom: 5px; flex-shrink: 1; }
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
        `);
        alert("[DEBUG] GM_addStyle executed.");
    } catch(e) { alert("[DEBUG] Error executing GM_addStyle: " + e); }


    // --- Standalone Loading Indicator Helpers ---
    function showStandaloneLoadingIndicator(message) {
         alert("[DEBUG] Attempting to show standalone indicator: " + message);
         let indicator = null;
         try {
             indicator = document.getElementById('floorplan-loading-indicator');
             if (!indicator) {
                 indicator = document.createElement('div');
                 indicator.id = 'floorplan-loading-indicator';
                 const rootEl = document.documentElement || document.body;
                 if (rootEl) {
                     rootEl.appendChild(indicator);
                     alert("[DEBUG] Standalone loading indicator created and appended.");
                 } else {
                     alert("[DEBUG] Cannot append indicator: No documentElement or body found!");
                     return null;
                 }
             } else {
                 alert("[DEBUG] Reusing existing standalone indicator.");
             }
             indicator.textContent = message;
             indicator.style.display = 'block';
             alert("[DEBUG] Standalone loading indicator shown.");
         } catch (e) {
             alert("[DEBUG] Error in showStandaloneLoadingIndicator: " + e);
             indicator = null;
         }
         return indicator;
     }
     function updateStandaloneLoadingIndicator(indicator, message) {
         alert("[DEBUG] Attempting to update standalone indicator: " + message);
         try {
             const targetIndicator = indicator || document.getElementById('floorplan-loading-indicator');
             if (targetIndicator) {
                 targetIndicator.textContent = message;
                 targetIndicator.style.display = 'block';
                 alert("[DEBUG] Standalone loading indicator updated.");
             } else {
                 alert("[DEBUG] updateStandaloneLoadingIndicator: Indicator not found.");
                 showStandaloneLoadingIndicator("[Update Fallback] " + message);
             }
         } catch (e) {
             alert("[DEBUG] Error in updateStandaloneLoadingIndicator: " + e);
         }
     }
     function hideStandaloneLoadingIndicator(indicator) {
         alert("[DEBUG] Attempting to hide standalone indicator.");
         try {
             const targetIndicator = indicator || document.getElementById('floorplan-loading-indicator');
             if (targetIndicator) {
                 targetIndicator.style.display = 'none';
                 alert("[DEBUG] Standalone loading indicator hidden.");
             } else {
                 alert("[DEBUG] hideStandaloneLoadingIndicator: Indicator not found.");
             }
         } catch (e) {
             alert("[DEBUG] Error in hideStandaloneLoadingIndicator: " + e);
         }
     }
    // --- End Standalone Helpers ---

    // --- Helper: OpenCV Loader using GM_xmlhttpRequest + Local Module ---
    function loadOpenCV_GM_XHR() {
        let cvInstance = null;
        alert("[DEBUG] loadOpenCV_GM_XHR function started.");

        return new Promise((resolve, reject) => {
            let loaderIndicator;
             try {
                alert("[DEBUG] loadOpenCV_GM_XHR: Showing initial indicator.");
                loaderIndicator = showStandaloneLoadingIndicator("Fetching OpenCV script...");
                if (!loaderIndicator) throw new Error("Failed to create/show loader indicator.");
             } catch (e) {
                  alert("[DEBUG] loadOpenCV_GM_XHR: Error setting up indicator: " + e);
                  reject(new Error("Failed to show loading indicator. " + e.message));
                  return;
             }

            alert("[DEBUG] loadOpenCV_GM_XHR: Setting timeout.");
            const timeoutId = setTimeout(() => {
                 alert(`[DEBUG] loadOpenCV_GM_XHR: Timeout reached after ${OPENCV_LOAD_TIMEOUT / 1000}s.`);
                 try { hideStandaloneLoadingIndicator(loaderIndicator); } catch(e){}
                 reject(new Error(`OpenCV loading timed out (${OPENCV_LOAD_TIMEOUT / 1000}s).`));
            }, OPENCV_LOAD_TIMEOUT);

            let Module;
            try {
                Module = {};
                alert("[DEBUG] loadOpenCV_GM_XHR: Local Module object created.");
            } catch (e) {
                 alert("[DEBUG] loadOpenCV_GM_XHR: Failed to create local Module object: " + e);
                 clearTimeout(timeoutId);
                 try { hideStandaloneLoadingIndicator(loaderIndicator); } catch(e){}
                 reject(new Error("Failed to create local Module object. " + e.message));
                 return;
            }

            Module.onRuntimeInitialized = () => {
                alert("[DEBUG] OpenCV onRuntimeInitialized fired (GM_XHR -> local Module).");
                try {
                    clearTimeout(timeoutId);
                    if (typeof cv !== 'undefined' && cv && typeof cv.imread === 'function') {
                        alert("[DEBUG] Local 'cv' object confirmed via imread function.");
                        cvInstance = cv;
                        try { hideStandaloneLoadingIndicator(loaderIndicator); } catch(e){}
                        resolve(cvInstance);
                    } else {
                        alert("[DEBUG] onRuntimeInitialized fired, but local 'cv' is missing or invalid! Type: " + typeof cv);
                        try { updateStandaloneLoadingIndicator(loaderIndicator, "Error: OpenCV initialization failed (cv invalid)."); } catch(e){}
                        reject(new Error("OpenCV initialized, but local 'cv' object is invalid."));
                    }
                } catch (e) {
                     alert("[DEBUG] Error inside onRuntimeInitialized: " + e);
                     try { updateStandaloneLoadingIndicator(loaderIndicator, "Error during OpenCV init callback."); } catch(e){}
                     reject(new Error("Error in onRuntimeInitialized callback. " + e.message));
                }
            };

            Module.onAbort = (reason) => {
                  alert("[DEBUG] OpenCV WASM Aborted: " + reason);
                  clearTimeout(timeoutId);
                  try { updateStandaloneLoadingIndicator(loaderIndicator, `Error: OpenCV Aborted (${reason})`); } catch(e){}
                  reject(new Error(`OpenCV WASM Aborted: ${reason}`));
             };

            alert("[DEBUG] loadOpenCV_GM_XHR: Preparing GM_xmlhttpRequest...");
            try {
                GM_xmlhttpRequest({
                    method: "GET",
                    url: OPENCV_URL,
                    timeout: OPENCV_LOAD_TIMEOUT - 2000,
                    onload: function(response) {
                        alert("[DEBUG] GM_xmlhttpRequest onload fired. Status: " + response.status);
                        try {
                            if (response.status >= 200 && response.status < 300) {
                                alert("[DEBUG] OpenCV script fetched successfully. Preparing to execute.");
                                try { updateStandaloneLoadingIndicator(loaderIndicator, "Initializing OpenCV (WASM)..."); } catch(e){} // Changed message

                                try {
                                    alert("[DEBUG] Executing OpenCV script text via new Function()...");
                                    new Function(response.responseText)();
                                    alert("[DEBUG] OpenCV script text executed. Now waiting for local Module.onRuntimeInitialized...");
                                } catch (e) {
                                    alert("[DEBUG] Error executing fetched OpenCV script: " + e);
                                    clearTimeout(timeoutId);
                                    try { updateStandaloneLoadingIndicator(loaderIndicator, `Error executing OpenCV: ${e.message}`); } catch(e){}
                                    reject(new Error(`Error executing OpenCV script: ${e.message}`));
                                }
                            } else {
                                alert("[DEBUG] Failed to fetch OpenCV script. Status: " + response.status + " " + response.statusText);
                                clearTimeout(timeoutId);
                                try { updateStandaloneLoadingIndicator(loaderIndicator, `Error fetching OpenCV: Status ${response.status}`); } catch(e){}
                                reject(new Error(`Failed to fetch OpenCV script. Status: ${response.status}`));
                            }
                        } catch(e) {
                             alert("[DEBUG] Error inside GM_xmlhttpRequest onload handler: " + e);
                             clearTimeout(timeoutId);
                             try { updateStandaloneLoadingIndicator(loaderIndicator, `Internal error after fetch.`); } catch(e){}
                             reject(new Error("Internal error processing fetch response. " + e.message));
                        }
                    },
                    onerror: function(response) {
                        alert("[DEBUG] Network error during GM_xmlhttpRequest for OpenCV: " + (response.details || response.error || 'Unknown'));
                        clearTimeout(timeoutId);
                        try { updateStandaloneLoadingIndicator(loaderIndicator, `Network Error fetching OpenCV.`); } catch(e){}
                        reject(new Error(`Network error fetching OpenCV: ${response.error || response.details || 'Unknown'}`));
                    },
                    ontimeout: function() {
                         alert("[DEBUG] GM_xmlhttpRequest timed out for OpenCV.");
                         clearTimeout(timeoutId);
                         try { updateStandaloneLoadingIndicator(loaderIndicator, `Timeout fetching OpenCV.`); } catch(e){}
                         reject(new Error("Request timed out fetching OpenCV script."));
                     }
                });
                alert("[DEBUG] GM_xmlhttpRequest initiated.");
            } catch(e) {
                alert("[DEBUG] Error initiating GM_xmlhttpRequest: " + e);
                clearTimeout(timeoutId);
                try { hideStandaloneLoadingIndicator(loaderIndicator); } catch(e){}
                reject(new Error("Failed to initiate script request. " + e.message));
            }
        });
    }
    // --- End OpenCV Loader ---


    // --- Floorplan SVG Creator Class --- (Same as before - no changes needed)
    alert("[DEBUG] Defining FloorplanCreator class...");
    class FloorplanCreator { /* ... */ }
    alert("[DEBUG] FloorplanCreator class defined.");


    // --- Base Floorplan Processor Class ---
    alert("[DEBUG] Defining FloorplanProcessor class...");
    class FloorplanProcessor {
        // Config, State, UI Refs (same as before)
        cv = null; d3 = null; librariesReady = false; uiCreated = false;
        container = null; controlsDiv = null; fileInput = null; statusLabel = null;
        canvas = null; canvasCtx = null; canvasLabel = null; closeButton = null;

        constructor() {
            alert("[DEBUG] FloorplanProcessor constructor started.");
            try {
                if (typeof d3 !== 'undefined' && d3) {
                    this.d3 = d3;
                    alert(`[DEBUG] D3 library confirmed in constructor: v${this.d3.version}`);
                } else {
                    alert("[DEBUG] FATAL: D3 library not found or invalid in constructor.");
                    try { showStandaloneLoadingIndicator("Error: Core D3 library failed! Cannot start."); } catch(e){}
                    throw new Error("D3 library failed to load.");
                }
                alert("[DEBUG] FloorplanProcessor constructor finished.");
            } catch(e) {
                 alert("[DEBUG] Error in FloorplanProcessor constructor: " + e);
                 throw e;
            }
        }

        async initialize() {
             alert("[DEBUG] FloorplanProcessor initialize started.");
             let initIndicator;
             try {
                  initIndicator = showStandaloneLoadingIndicator("Initializing Floorplan Manager...");
                  if (!this.d3) throw new Error("D3 not loaded.");

                  alert("[DEBUG] initialize: Calling loadOpenCV_GM_XHR...");
                  // updateStandaloneLoadingIndicator happens inside loadOpenCV_GM_XHR
                  this.cv = await loadOpenCV_GM_XHR();
                  alert("[DEBUG] initialize: loadOpenCV_GM_XHR promise resolved.");

                  if (!this.cv) throw new Error("loadOpenCV_GM_XHR resolved but cv object is invalid.");
                  alert("[DEBUG] initialize: OpenCV and D3 confirmed ready.");

                  this.librariesReady = true;
                  try { updateStandaloneLoadingIndicator(initIndicator || document.getElementById('floorplan-loading-indicator'), "Starting UI..."); } catch(e){}
                  alert("[DEBUG] initialize: Calling startUI...");

                  const uiStarted = this.startUI();
                  if (!uiStarted) {
                       alert("[DEBUG] initialize: startUI returned false.");
                       throw new Error("UI initialization failed (startUI returned false).");
                  }
                  alert("[DEBUG] initialize: Initialization complete, UI started.");

             } catch (error) {
                  alert("[DEBUG] FloorplanProcessor Initialization failed: " + error);
                  const errorIndicator = initIndicator || document.getElementById('floorplan-loading-indicator');
                  try { updateStandaloneLoadingIndicator(errorIndicator, `Initialization Error: ${error.message}.`); } catch(e){}
                  if (errorIndicator) try { errorIndicator.style.display = 'block'; } catch(e){}
             }
        }

        startUI() {
            alert("[DEBUG] startUI started. Libraries ready: " + this.librariesReady + " UI Created: " + this.uiCreated);
            try {
                hideStandaloneLoadingIndicator(document.getElementById('floorplan-loading-indicator'));
            } catch (e) { alert("[DEBUG] Error hiding indicator in startUI: " + e); }


            if (!this.librariesReady) {
                alert("[DEBUG] startUI: Aborting, libraries not ready.");
                 try { showStandaloneLoadingIndicator("Error: Libraries not ready for UI."); } catch(e){}
                return false;
            }
            if (this.uiCreated) {
                alert("[DEBUG] startUI: UI already exists. Ensuring visibility.");
                try {
                    if (this.container && document.contains(this.container)) {
                        this.container.style.display = 'flex';
                        alert("[DEBUG] startUI: Re-set existing container display to flex.");
                        return true;
                    } else {
                        alert("[DEBUG] startUI: UI marked created, but container missing/detached!");
                        this.uiCreated = false;
                    }
                } catch(e) { alert("[DEBUG] Error ensuring visibility of existing UI: " + e); this.uiCreated = false; }
            }

            alert("[DEBUG] startUI: Preparing to create Base UI...");
            try {
                this.createBaseUI();

                if (this.container && document.contains(this.container)) {
                    alert("[DEBUG] startUI: Setting main container display to 'flex'.");
                    this.container.style.display = 'flex';

                    const finalDisplay = window.getComputedStyle(this.container).display;
                    alert(`[DEBUG] startUI: Main container display style after setting: ${finalDisplay}.`);
                    if (finalDisplay !== 'flex') alert(`[DEBUG] Container display style is not 'flex' (${finalDisplay}). Check CSS conflicts.`);

                    this.updateStatus("Ready. Select an image file.");
                    alert("[DEBUG] startUI: Base UI created and display set to flex. Returning true.");
                    return true;

                } else {
                    alert("[DEBUG] Error startUI: container invalid after createBaseUI.");
                    throw new Error("UI Container creation/appending failed.");
                }

            } catch (error) {
                 alert("[DEBUG] Error during createBaseUI or making UI visible: " + error);
                 try { showStandaloneLoadingIndicator(`UI Creation Error: ${error.message}.`); } catch(e){}
                 if (this.container) { try { this.container.remove(); } catch(e){} }
                 this.container = null; this.uiCreated = false;
                 return false;
            }
        }

        createBaseUI() {
            alert("[DEBUG] Executing createBaseUI...");
            if (this.container) { alert("[DEBUG] createBaseUI called but container already exists."); return; }
            this.container = document.createElement('div'); this.container.id = 'floorplan-container';
            this.controlsDiv = document.createElement('div'); this.controlsDiv.id = 'floorplan-controls';
            const fileInputLabel = document.createElement('label'); fileInputLabel.textContent = 'Upload Floorplan Image:'; fileInputLabel.htmlFor = 'floorplan-file-input'; this.fileInput = document.createElement('input'); this.fileInput.type = 'file'; this.fileInput.accept = 'image/*'; this.fileInput.id = 'floorplan-file-input'; this.controlsDiv.appendChild(fileInputLabel); this.controlsDiv.appendChild(this.fileInput);
            this.closeButton = document.createElement('button'); this.closeButton.id = 'floorplan-close-btn'; this.closeButton.textContent = '✕'; this.closeButton.title = 'Close';
            this.canvas = document.createElement('canvas'); this.canvas.id = 'floorplan-canvas'; this.canvas.width = this.CANVAS_WIDTH; this.canvas.height = this.CANVAS_HEIGHT; this.canvasCtx = this.canvas.getContext('2d');
            this.canvasLabel = document.createElement('div'); this.canvasLabel.id = 'floorplan-canvas-label'; this.canvasLabel.textContent = "Upload an image to see the detected shape preview.";
            this.statusLabel = document.createElement('span'); this.statusLabel.id = 'floorplan-status'; this.statusLabel.textContent = 'Initializing...';
            this.container.appendChild(this.closeButton); this.container.appendChild(this.controlsDiv); this.container.appendChild(this.canvas); this.container.appendChild(this.canvasLabel); this.container.appendChild(this.statusLabel);
            try {
                if (document.body) { document.documentElement.insertBefore(this.container, document.body); alert("[DEBUG] Container inserted before document.body."); }
                else { alert("[DEBUG] document.body not found, appending container to documentElement."); document.documentElement.appendChild(this.container); }
            } catch (e) { alert("[DEBUG] Error inserting container:" + e); document.documentElement.appendChild(this.container); }
            this.uiCreated = true;
            alert("[DEBUG] FloorplanProcessor: Base UI DOM elements created and inserted.");
            if (this.fileInput) { this.fileInput.addEventListener('change', (e) => this.handleFileChange(e)); }
            else { alert("[DEBUG] File input not found after creation."); }
            if (this.closeButton) { this.closeButton.addEventListener('click', () => this.closeUI()); }
            else { alert("[DEBUG] Close button not found after creation."); }
            alert("[DEBUG] createBaseUI finished.");
        }

        updateStatus(message) {
            if (this.uiCreated && this.statusLabel && this.container && this.container.style.display === 'flex') {
                this.statusLabel.textContent = message;
            } else {
                 alert("Floorplan Status (UI not visible/ready): " + message); // Log status anyway
            }
        }

        processImage(imgElement) { /* ... */ return new Promise((resolve, reject)=>{/*...*/}); }
        handleFileChange(e) { /* ... */ }
        showCanvas() { /* ... */ }
        hideCanvas() { /* ... */ }
        updateCanvasLabel(count) { /* ... */ }
        closeUI() { /* ... */ }
    } // End FloorplanProcessor Class
    alert("[DEBUG] FloorplanProcessor class defined.");


    // --Floorplan Manager Class (Orchestrator)-- (Same as before)
    alert("[DEBUG] Defining FloorplanManager class...");
    class FloorplanManager extends FloorplanProcessor {
        floorplanCreatorInstance = null;
        constructor() {
            alert("[DEBUG] FloorplanManager constructor started.");
            super();
            alert("[DEBUG] FloorplanManager: Calling initialize...");
            this.initialize().catch(err => {
                 alert("[DEBUG] FloorplanManager constructor caught error during initialize: " + err);
            });
            alert("[DEBUG] FloorplanManager constructor finished.");
        }
    } // End FloorplanManager Class
    alert("[DEBUG] FloorplanManager class defined.");

    // --- Instantiate the Manager ---
    alert("[DEBUG] Instantiating FloorplanManager...");
    try {
        alert("[DEBUG] Checking D3 before instantiation...");
        if (typeof d3 === 'undefined' || !d3) {
            throw new Error("D3 is not defined or invalid at instantiation point.");
        }
         alert("[DEBUG] D3 check passed. Creating new FloorplanManager instance...");
        new FloorplanManager();
        alert("[DEBUG] FloorplanManager instance created successfully.");
    } catch (error) {
         alert("[DEBUG] CRITICAL ERROR during script startup (Instantiation): " + error);
         alert(`CRITICAL Error: ${error.message}. Floorplan Manager cannot start.`);
         try { showStandaloneLoadingIndicator(`Startup Error: ${error.message}`); } catch(e){}
    }
    alert("--- Floorplan Manager [ALERT DEBUG v0.9.6] Script Execution Finished ---");

})(); // End IIFE


// --- FloorplanCreator Implementation (for completeness, no changes) ---
alert("[DEBUG] Redefining FloorplanCreator class (ensure it's captured)..."); // Should already be defined, but ensure scope
class FloorplanCreator {
    svgContainer = null; svg = null; svgGroup = null; contourData = []; d3 = null; zoom = null;
    POLYGON_FILL = 'rgba(100, 150, 255, 0.7)'; POLYGON_STROKE = '#d0d0ff'; POLYGON_STROKE_WIDTH = 1;
    DRAGGING_STROKE = 'yellow'; DRAGGING_STROKE_WIDTH = 1.5; CONTAINER_ID = 'floorplan-svg-container'; parentContainer = null;
    constructor(contoursData, d3Instance, parentContainer) { /* ... */ this.d3=d3Instance; this.contourData=contoursData; this.parentContainer=parentContainer; }
    render() { const self = this; return new Promise((resolve, reject) => { setTimeout(() => { try { /* ... d3 render logic ... */ resolve(); } catch (error) { alert("FloorplanCreator Render Error: " + error); reject(error); } }, 0); }); }
    setupZoom() { /* ... */ }
    setupDrag() { /* ... */ }
    destroy() { /* ... */ }
}
alert("[DEBUG] FloorplanCreator class redefined.");