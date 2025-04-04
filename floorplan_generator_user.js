// ==UserScript==
// @name         Floorplan Manager (GM_XHR OpenCV Load v2)
// @version      0.9.4
// @description  Async OpenCV processing & D3 rendering. Uses GM_xmlhttpRequest + local Module. Refined loading message.
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
    console.log("--- Floorplan Manager Script (GM_XHR Load v2) Execution Starting ---");

    // --- Constants ---
    const OPENCV_URL = 'https://docs.opencv.org/4.5.4/opencv.js';
    const OPENCV_LOAD_TIMEOUT = 30000; // 30 seconds timeout

    // --- CSS Styles --- (Same as before, including high z-index)
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

    // --- Helper: OpenCV Loader using GM_xmlhttpRequest + Local Module ---
    function loadOpenCV_GM_XHR() {
        let cvInstance = null; // Use locally scoped variable

        return new Promise((resolve, reject) => {
            console.log("Attempting to load OpenCV via GM_xmlhttpRequest + local Module...");
            const loaderIndicator = showStandaloneLoadingIndicator("Fetching OpenCV script..."); // Initial message

            const timeoutId = setTimeout(() => {
                 hideStandaloneLoadingIndicator(loaderIndicator);
                 console.error(`OpenCV fetch/init via GM_XHR timed out after ${OPENCV_LOAD_TIMEOUT / 1000}s.`);
                 reject(new Error(`OpenCV loading timed out (${OPENCV_LOAD_TIMEOUT / 1000}s).`));
            }, OPENCV_LOAD_TIMEOUT);

            // Define Module object *locally*
            const Module = {};

            Module.onRuntimeInitialized = () => {
                console.log("OpenCV onRuntimeInitialized fired (GM_XHR -> local Module).");
                clearTimeout(timeoutId); // Clear the master timeout

                // After execution via 'new Function', 'cv' should be defined in *this* scope
                // Check carefully
                if (typeof cv !== 'undefined' && cv && typeof cv.imread === 'function') {
                    console.log("Local 'cv' object confirmed via imread function.");
                    cvInstance = cv; // Assign to our shielded variable
                    hideStandaloneLoadingIndicator(loaderIndicator); // Hide indicator on success
                    resolve(cvInstance);
                } else {
                    console.error("onRuntimeInitialized fired, but local 'cv' is missing or invalid!", typeof cv);
                     // Keep indicator visible with error
                     updateStandaloneLoadingIndicator(loaderIndicator, "Error: OpenCV initialization failed.");
                    reject(new Error("OpenCV initialized, but local 'cv' object is invalid."));
                }
            };

            // Add other necessary Module properties if needed (locateFile, printErr, onAbort)
            Module.onAbort = (reason) => {
                  console.error("OpenCV WASM Aborted:", reason);
                  clearTimeout(timeoutId);
                  updateStandaloneLoadingIndicator(loaderIndicator, `Error: OpenCV Aborted (${reason})`);
                  reject(new Error(`OpenCV WASM Aborted: ${reason}`));
             };
             // Module.printErr = (text) => { console.error("OpenCV stderr:", text); }; // Optional

            console.log("Requesting OpenCV script via GM_xmlhttpRequest:", OPENCV_URL);
            GM_xmlhttpRequest({
                method: "GET",
                url: OPENCV_URL,
                timeout: OPENCV_LOAD_TIMEOUT - 2000,
                onload: function(response) {
                    if (response.status >= 200 && response.status < 300) {
                        console.log("OpenCV script fetched successfully. Preparing to execute.");

                        // <<< --- UPDATE INDICATOR AS REQUESTED --- >>>
                        updateStandaloneLoadingIndicator(loaderIndicator, "Waiting for the floorplanProcessor to get initialized..");
                        // <<< --- END UPDATE --- >>>

                        try {
                            // Execute the script text within the current scope.
                            console.log("Executing OpenCV script text via new Function()...");
                            new Function(response.responseText)();
                            console.log("OpenCV script text executed. Now waiting for local Module.onRuntimeInitialized...");
                            // Now we wait for the callback (Module.onRuntimeInitialized).
                        } catch (e) {
                            clearTimeout(timeoutId); // Clear timeout on execution error
                            updateStandaloneLoadingIndicator(loaderIndicator, `Error executing OpenCV: ${e.message}`);
                            console.error("Error executing fetched OpenCV script:", e);
                            reject(new Error(`Error executing OpenCV script: ${e.message}`));
                        }
                    } else {
                        clearTimeout(timeoutId);
                        updateStandaloneLoadingIndicator(loaderIndicator, `Error fetching OpenCV: Status ${response.status}`);
                        console.error("Failed to fetch OpenCV script. Status:", response.status, response.statusText);
                        reject(new Error(`Failed to fetch OpenCV script. Status: ${response.status}`));
                    }
                },
                onerror: function(response) {
                    clearTimeout(timeoutId);
                    updateStandaloneLoadingIndicator(loaderIndicator, `Network Error fetching OpenCV.`);
                    console.error("Network error during GM_xmlhttpRequest for OpenCV:", response.details);
                    reject(new Error(`Network error fetching OpenCV: ${response.error || 'Unknown'}`));
                },
                ontimeout: function() {
                     clearTimeout(timeoutId);
                     updateStandaloneLoadingIndicator(loaderIndicator, `Timeout fetching OpenCV.`);
                     console.error("GM_xmlhttpRequest timed out for OpenCV.");
                     reject(new Error("Request timed out fetching OpenCV script."));
                 }
            });
        });
    }

    // --- Standalone Loading Indicator Helpers --- (Same as before)
    function showStandaloneLoadingIndicator(message) { /* ... */ }
    function updateStandaloneLoadingIndicator(indicator, message) { /* ... */ }
    function hideStandaloneLoadingIndicator(indicator) { /* ... */ }
    // --- End Standalone Helpers ---


    // --- Floorplan SVG Creator Class --- (Same as before)
    class FloorplanCreator { /* ... */ }


    // --- Base Floorplan Processor Class --- (Same as before)
    class FloorplanProcessor {
        // ... (Config, State, UI Refs) ...
        cv = null; d3 = null; librariesReady = false; uiCreated = false;
        container = null; controlsDiv = null; fileInput = null; statusLabel = null;
        canvas = null; canvasCtx = null; canvasLabel = null; closeButton = null;

        constructor() { /* ... D3 check ... */ }

        async initialize() {
             console.log("FloorplanProcessor initializing...");
             const initIndicator = showStandaloneLoadingIndicator("Initializing Floorplan Manager...");
             try {
                  if (!this.d3) throw new Error("D3 not loaded.");

                  console.log("Starting OpenCV load via GM_XHR + local Module...");
                  // updateStandaloneLoadingIndicator happens inside loadOpenCV_GM_XHR now
                  this.cv = await loadOpenCV_GM_XHR();
                  console.log("OpenCV load promise resolved in initialize.");

                  if (!this.cv) throw new Error("loadOpenCV_GM_XHR resolved but cv object is invalid.");
                  console.log("OpenCV and D3 confirmed ready.");

                  this.librariesReady = true;
                  // Indicator should be hidden by loadOpenCV_GM_XHR on success path
                  console.log("Calling startUI from initialize...");

                  const uiStarted = this.startUI();
                  if (!uiStarted) {
                       throw new Error("UI initialization failed (startUI returned false).");
                  }
                  console.log("Initialization complete, UI should be visible.");

             } catch (error) {
                  console.error("FloorplanProcessor Initialization failed:", error);
                  // Update indicator with error, ensure it's visible
                   const currentIndicator = initIndicator || document.getElementById('floorplan-loading-indicator');
                   updateStandaloneLoadingIndicator(currentIndicator, `Initialization Error: ${error.message}. Check console.`);
                   if (currentIndicator) currentIndicator.style.display = 'block';
             }
        }

        startUI() {
            console.log("Executing startUI. Libraries ready:", this.librariesReady, "UI Created:", this.uiCreated);
             // Hide any potential lingering loading indicator from init phase
            hideStandaloneLoadingIndicator(document.getElementById('floorplan-loading-indicator'));
            // ... (Rest of startUI logic: check libraries, check uiCreated, call createBaseUI, set display:flex) ...
             return true; // Or false on error
        }
        createBaseUI() { /* ... Same as before ... */ }
        updateStatus(message) { /* ... Same as before ... */ }
        processImage(imgElement) { /* ... Same as before ... */ }
        handleFileChange(e) { /* ... Same as before ... */ }
        showCanvas() { /* ... Same as before ... */ }
        hideCanvas() { /* ... Same as before ... */ }
        updateCanvasLabel(count) { /* ... Same as before ... */ }
        closeUI() { /* ... Same as before ... */ }
    } // End FloorplanProcessor Class


    // --Floorplan Manager Class (Orchestrator)-- (Same as before)
    class FloorplanManager extends FloorplanProcessor {
        floorplanCreatorInstance = null;
        constructor() {
            super();
            console.log("FloorplanManager: Initializing...");
            this.initialize().catch(err => {
                 console.error("FloorplanManager constructor failed during initialize:", err);
            });
        }
    } // End FloorplanManager Class

    // --- Instantiate the Manager --- (Same as before)
    console.log("Checking D3 and Instantiating FloorplanManager...");
    try { /* ... */ new FloorplanManager(); /* ... */ }
    catch (error) { /* ... */ }
    console.log("--- Floorplan Manager Script Execution Finished ---");

})(); // End IIFE


// --- Standalone Loading Indicator Helper Implementations ---
// (Duplicating here for clarity, they were correct before)
function showStandaloneLoadingIndicator(message) {
     let indicator = document.getElementById('floorplan-loading-indicator');
     if (!indicator) {
         indicator = document.createElement('div');
         indicator.id = 'floorplan-loading-indicator';
         (document.documentElement || document.body).appendChild(indicator);
         // console.log("Standalone loading indicator created.");
     }
     indicator.textContent = message;
     indicator.style.display = 'block';
     // console.log("Standalone loading indicator shown:", message);
     return indicator;
 }
 function updateStandaloneLoadingIndicator(indicator, message) {
     // Ensure indicator exists and is visible before updating text
     if (indicator && indicator.style.display === 'block') {
         indicator.textContent = message;
         // console.log("Standalone loading indicator updated:", message);
     } else if (indicator) {
         // If exists but hidden, update text and show it (e.g., for errors)
          indicator.textContent = message;
          indicator.style.display = 'block';
          console.log("Standalone loading indicator updated and shown:", message);
     } else {
         console.warn("Attempted to update non-existent indicator with:", message);
         // Fallback: show a new one if we absolutely need to display this message
         showStandaloneLoadingIndicator(message);
     }
 }
 function hideStandaloneLoadingIndicator(indicator) {
     // Find it by ID if no specific ref passed
     const targetIndicator = indicator || document.getElementById('floorplan-loading-indicator');
     if (targetIndicator) {
         targetIndicator.style.display = 'none';
         // console.log("Standalone loading indicator hidden.");
     } else {
         // console.warn("Attempted to hide non-existent standalone indicator.");
     }
 }
 // --- End Standalone Helpers ---