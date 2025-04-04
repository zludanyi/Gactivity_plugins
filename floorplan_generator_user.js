// ==UserScript==
// @name         Floorplan Manager (GM_XHR OpenCV Load)
// @version      0.9.3
// @description  Async OpenCV processing & D3 rendering. Uses GM_xmlhttpRequest + local Module.
// @author       ZLudany
// @match        https://home.google.com/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest // Grant needed again
// @require      https://d3js.org/d3.v7.min.js
// @require      https://d3js.org/d3-drag.v3.min.js
// @require      https://d3js.org/d3-zoom.v3.min.js
// ==/UserScript==

(function() {
    'use strict';
    console.log("--- Floorplan Manager Script (GM_XHR Load) Execution Starting ---");

    // --- Constants ---
    const OPENCV_URL = 'https://docs.opencv.org/4.5.4/opencv.js';
    const OPENCV_LOAD_TIMEOUT = 30000; // Increase timeout further (30 seconds)

    // --- CSS Styles --- (Same as before, including high z-index)
    GM_addStyle(`
        #floorplan-container { /* ... */ z-index: 2147483647 !important; display: none; /* ... */ }
        #floorplan-loading-indicator { /* ... */ z-index: 2147483647 !important; display: none; /* ... */ }
        /* ... other styles ... */
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
        // Use a locally scoped variable to avoid potential conflicts if window.cv exists
        let cvInstance = null;

        return new Promise((resolve, reject) => {
            console.log("Attempting to load OpenCV via GM_xmlhttpRequest + local Module...");
            // We need access to the Processor's indicator methods. Pass them in or make them global?
            // Let's assume FloorplanProcessor instance methods `show/hide/updateLoadingIndicator` are accessible
            // This requires this function to be called *after* the processor is instantiated.
            // Or, make the indicator functions standalone again. Let's do standalone for simplicity here.
            const loaderIndicator = showStandaloneLoadingIndicator("Fetching OpenCV script...");

            const timeoutId = setTimeout(() => {
                 hideStandaloneLoadingIndicator(loaderIndicator);
                 console.error(`OpenCV fetch/init via GM_XHR timed out after ${OPENCV_LOAD_TIMEOUT / 1000}s.`);
                 reject(new Error(`OpenCV loading timed out (${OPENCV_LOAD_TIMEOUT / 1000}s).`));
            }, OPENCV_LOAD_TIMEOUT);

            // Define Module object *locally* within this userscript's scope
            const Module = {}; // This will be captured by the `new Function()` execution context

            Module.onRuntimeInitialized = () => {
                console.log("OpenCV onRuntimeInitialized fired (GM_XHR -> local Module).");
                clearTimeout(timeoutId);

                // After execution via 'new Function', 'cv' should be defined in *this* scope
                if (typeof cv !== 'undefined' && cv && typeof cv.imread === 'function') {
                    console.log("Local 'cv' object confirmed via imread function.");
                    cvInstance = cv; // Assign to our shielded variable
                    hideStandaloneLoadingIndicator(loaderIndicator);
                    resolve(cvInstance); // Resolve with the cv object found in this scope
                } else {
                    console.error("onRuntimeInitialized fired, but local 'cv' is missing or invalid!", typeof cv);
                     hideStandaloneLoadingIndicator(loaderIndicator);
                    reject(new Error("OpenCV initialized, but local 'cv' object is invalid."));
                }
            };

            // Optional: Provide locateFile if needed (often helps WASM find itself)
            // Module.locateFile = (path, scriptDir) => {
            //     console.log(`OpenCV trying to locate: ${path}`);
            //     // Usually the default is fine when executed this way, but you could override
            //     return path;
            // };
            // Module.print = (text) => { console.log("OpenCV stdout:", text); }; // Log stdout
            // Module.printErr = (text) => { console.error("OpenCV stderr:", text); }; // Log stderr
             Module.onAbort = (reason) => {
                  console.error("OpenCV WASM Aborted:", reason);
                  clearTimeout(timeoutId);
                  hideStandaloneLoadingIndicator(loaderIndicator);
                  reject(new Error(`OpenCV WASM Aborted: ${reason}`));
             };

            console.log("Requesting OpenCV script via GM_xmlhttpRequest:", OPENCV_URL);
            GM_xmlhttpRequest({
                method: "GET",
                url: OPENCV_URL,
                timeout: OPENCV_LOAD_TIMEOUT - 2000, // Slightly less for the request itself
                onload: function(response) {
                    if (response.status >= 200 && response.status < 300) {
                        console.log("OpenCV script fetched successfully. Executing text...");
                        updateStandaloneLoadingIndicator(loaderIndicator, "Initializing OpenCV (WASM)...");

                        try {
                            // Execute the script text within the current scope.
                            // It should pick up the 'Module' object defined above.
                            // It will define 'cv' within this userscript's execution context.
                            new Function(response.responseText)();
                            console.log("OpenCV script text executed via new Function(). Waiting for local Module.onRuntimeInitialized...");
                            // Now we wait for the callback defined above.
                        } catch (e) {
                            clearTimeout(timeoutId);
                            hideStandaloneLoadingIndicator(loaderIndicator);
                            console.error("Error executing fetched OpenCV script:", e);
                            reject(new Error(`Error executing OpenCV script: ${e.message}`));
                        }
                    } else {
                        clearTimeout(timeoutId);
                        hideStandaloneLoadingIndicator(loaderIndicator);
                        console.error("Failed to fetch OpenCV script. Status:", response.status, response.statusText);
                        reject(new Error(`Failed to fetch OpenCV script. Status: ${response.status}`));
                    }
                },
                onerror: function(response) {
                    clearTimeout(timeoutId);
                    hideStandaloneLoadingIndicator(loaderIndicator);
                    console.error("Network error during GM_xmlhttpRequest for OpenCV:", response.details);
                    reject(new Error(`Network error fetching OpenCV: ${response.error || 'Unknown'}`));
                },
                ontimeout: function() {
                     clearTimeout(timeoutId);
                     hideStandaloneLoadingIndicator(loaderIndicator);
                     console.error("GM_xmlhttpRequest timed out for OpenCV.");
                     reject(new Error("Request timed out fetching OpenCV script."));
                 }
            });
        });
    }

    // --- Standalone Loading Indicator Helpers ---
    // Needed because loadOpenCV might run before processor instance exists
    function showStandaloneLoadingIndicator(message) {
         let indicator = document.getElementById('floorplan-loading-indicator');
         if (!indicator) {
             indicator = document.createElement('div');
             indicator.id = 'floorplan-loading-indicator';
             (document.documentElement || document.body).appendChild(indicator);
             console.log("Standalone loading indicator created.");
         }
         indicator.textContent = message;
         indicator.style.display = 'block';
         console.log("Standalone loading indicator shown:", message);
         return indicator; // Return ref so it can be hidden/updated
     }
     function updateStandaloneLoadingIndicator(indicator, message) {
         if (indicator && indicator.style.display === 'block') {
             indicator.textContent = message;
             console.log("Standalone loading indicator updated:", message);
         }
     }
     function hideStandaloneLoadingIndicator(indicator) {
         if (indicator) {
             indicator.style.display = 'none';
             console.log("Standalone loading indicator hidden.");
         }
     }
    // --- End Standalone Helpers ---


    // --- Floorplan SVG Creator Class --- (Same as before)
    class FloorplanCreator { /* ... no changes ... */ }


    // --- Base Floorplan Processor Class ---
    class FloorplanProcessor {
        // Config, State, UI Refs (same as before)
        CANVAS_WIDTH = 800; CANVAS_HEIGHT = 600; CANNY_THRESHOLD1 = 50; CANNY_THRESHOLD2 = 100; MIN_CONTOUR_AREA = 50;
        cv = null; d3 = null; librariesReady = false; uiCreated = false;
        container = null; controlsDiv = null; fileInput = null; statusLabel = null;
        canvas = null; canvasCtx = null; canvasLabel = null; closeButton = null;
        // No loadingIndicator ref needed here now, using standalone helpers for init

        constructor() {
            console.log("FloorplanProcessor constructor.");
            if (typeof d3 !== 'undefined') {
                 this.d3 = d3;
                 console.log("D3 library confirmed in constructor:", this.d3.version);
            } else {
                console.error("FATAL: D3 library not found in constructor.");
                showStandaloneLoadingIndicator("Error: Core D3 library failed to load! Cannot start."); // Use standalone
                throw new Error("D3 library failed to load.");
            }
        }

        // Remove processor's show/hide/updateLoadingIndicator methods
        // We use standalone ones during init, and statusLabel after UI is up.

        async initialize() {
             console.log("FloorplanProcessor initializing...");
             const initIndicator = showStandaloneLoadingIndicator("Initializing Floorplan Manager..."); // Show initial message
             try {
                  if (!this.d3) throw new Error("D3 not loaded.");

                  console.log("Starting OpenCV load via GM_XHR + local Module...");
                  updateStandaloneLoadingIndicator(initIndicator, "Loading OpenCV (may take time)...");
                  // Pass the indicator control functions if needed, or rely on standalone
                  this.cv = await loadOpenCV_GM_XHR(); // Wait for GM_XHR loader
                  console.log("OpenCV load promise resolved in initialize.");

                  if (!this.cv) throw new Error("loadOpenCV_GM_XHR resolved but cv object is invalid.");
                  console.log("OpenCV and D3 confirmed ready.");

                  this.librariesReady = true;
                  // Don't update indicator here, startUI will hide it on success
                  console.log("Calling startUI from initialize...");

                  const uiStarted = this.startUI();
                  if (!uiStarted) {
                       throw new Error("UI initialization failed (startUI returned false).");
                  }
                   // Success! startUI should have created UI and hidden indicator
                  console.log("Initialization complete, UI should be visible.");

             } catch (error) {
                  console.error("FloorplanProcessor Initialization failed:", error);
                  // Keep the loading indicator visible with the error
                  updateStandaloneLoadingIndicator(initIndicator || document.getElementById('floorplan-loading-indicator'), `Initialization Error: ${error.message}. Check console.`);
                  // Ensure it stays visible if update failed
                  if (initIndicator) initIndicator.style.display = 'block';
             }
        }


        startUI() {
            console.log("Executing startUI. Libraries ready:", this.librariesReady, "UI Created:", this.uiCreated);

            if (!this.librariesReady) { // This check should technically not be hit if called from initialize success
                console.error("FloorplanProcessor: startUI called before libraries were ready.");
                 showStandaloneLoadingIndicator("Error: Libraries not ready for UI.");
                return false;
            }
            if (this.uiCreated) {
                console.warn("FloorplanProcessor: startUI called but UI already exists. Ensuring visibility.");
                if (this.container && document.contains(this.container)) {
                    this.container.style.display = 'flex';
                    hideStandaloneLoadingIndicator(document.getElementById('floorplan-loading-indicator')); // Hide any lingering loader
                    return true;
                } else {
                    console.error("UI marked created, but container missing/detached!");
                    this.uiCreated = false; // Reset flag
                }
            }

            console.log("FloorplanProcessor: Preparing to create Base UI...");
            // Hide the standalone loading indicator *before* creating/showing the main UI
            hideStandaloneLoadingIndicator(document.getElementById('floorplan-loading-indicator'));

            try {
                console.log("Calling createBaseUI...");
                this.createBaseUI(); // Create DOM

                if (this.container && document.contains(this.container)) {
                    console.log("Setting main container display to 'flex'.");
                    this.container.style.display = 'flex'; // MAKE VISIBLE

                    const finalDisplay = window.getComputedStyle(this.container).display;
                    console.log(`Main container display style after setting: ${finalDisplay}.`);
                    if (finalDisplay !== 'flex') console.warn(`Container display style is not 'flex' (${finalDisplay}).`);

                    this.updateStatus("Ready. Select an image file."); // Update status label within the UI
                    console.log("FloorplanProcessor: Base UI created and display set to flex.");
                    return true; // Success

                } else {
                    console.error("Error startUI: container invalid after createBaseUI.");
                    throw new Error("UI Container creation/appending failed.");
                }

            } catch (error) {
                 console.error("Error during createBaseUI or making UI visible:", error);
                 showStandaloneLoadingIndicator(`UI Creation Error: ${error.message}. Check console.`); // Show error
                 if (this.container) this.container.remove(); // Cleanup
                 this.container = null; this.uiCreated = false;
                 return false; // Failure
            }
        }

        createBaseUI() {
            // ... (Element creation logic is identical to previous version) ...
            console.log("Executing createBaseUI...");
            if (this.container) { console.warn("createBaseUI called but container already exists."); return; }
            this.container = document.createElement('div'); this.container.id = 'floorplan-container';
            this.controlsDiv = document.createElement('div'); this.controlsDiv.id = 'floorplan-controls';
            const fileInputLabel = document.createElement('label'); fileInputLabel.textContent = 'Upload Floorplan Image:'; fileInputLabel.htmlFor = 'floorplan-file-input'; this.fileInput = document.createElement('input'); this.fileInput.type = 'file'; this.fileInput.accept = 'image/*'; this.fileInput.id = 'floorplan-file-input'; this.controlsDiv.appendChild(fileInputLabel); this.controlsDiv.appendChild(this.fileInput);
            this.closeButton = document.createElement('button'); this.closeButton.id = 'floorplan-close-btn'; this.closeButton.textContent = '✕'; this.closeButton.title = 'Close';
            this.canvas = document.createElement('canvas'); this.canvas.id = 'floorplan-canvas'; this.canvas.width = this.CANVAS_WIDTH; this.canvas.height = this.CANVAS_HEIGHT; this.canvasCtx = this.canvas.getContext('2d');
            this.canvasLabel = document.createElement('div'); this.canvasLabel.id = 'floorplan-canvas-label'; this.canvasLabel.textContent = "Upload an image to see the detected shape preview.";
            this.statusLabel = document.createElement('span'); this.statusLabel.id = 'floorplan-status'; this.statusLabel.textContent = 'Initializing...'; // Status label within the UI
            this.container.appendChild(this.closeButton); this.container.appendChild(this.controlsDiv); this.container.appendChild(this.canvas); this.container.appendChild(this.canvasLabel); this.container.appendChild(this.statusLabel);

            // Append container before body
            try {
                if (document.body) { document.documentElement.insertBefore(this.container, document.body); console.log("Container inserted before document.body."); }
                else { console.warn("document.body not found, appending container to documentElement."); document.documentElement.appendChild(this.container); }
            } catch (e) { console.error("Error inserting container:", e); document.documentElement.appendChild(this.container); }

            this.uiCreated = true;
            console.log("FloorplanProcessor: Base UI DOM elements created and inserted.");

             // Add event listeners
             if (this.fileInput) { this.fileInput.addEventListener('change', (e) => this.handleFileChange(e)); }
             else { console.error("File input not found after creation."); }
             if (this.closeButton) { this.closeButton.addEventListener('click', () => this.closeUI()); }
             else { console.error("Close button not found after creation."); }
            console.log("createBaseUI finished.");
        }

        updateStatus(message) {
            // Update status label inside the main UI if it's ready
            if (this.uiCreated && this.statusLabel && this.container && this.container.style.display === 'flex') {
                this.statusLabel.textContent = message;
                 // console.log("Status label updated:", message); // Optional log
            } else {
                 // Log status anyway, perhaps to console if UI not visible
                 console.log("Floorplan Status (UI not visible/ready):", message);
            }
        }

        // --- Image Processing (Async) --- (Same as before)
        processImage(imgElement) { /* ... */ }
        // --- UI Interaction Methods --- (Same as before)
        handleFileChange(e) { /* ... */ }
        showCanvas() { /* ... */ }
        hideCanvas() { /* ... */ }
        updateCanvasLabel(count) { /* ... */ }
        closeUI() { /* ... */ }
    }

    // --Floorplan Manager Class (Orchestrator)-- (Same as before)
    class FloorplanManager extends FloorplanProcessor {
        floorplanCreatorInstance = null; // Instance specific to the manager

        constructor() {
            super(); // Calls FloorplanProcessor constructor
            console.log("FloorplanManager: Initializing...");
            this.initialize().catch(err => { // Initialize handles loading/UI startup
                 console.error("FloorplanManager constructor failed during initialize:", err);
                 // Error should be displayed on the loading indicator by initialize()
            });
        }
    }

    // --- Instantiate the Manager ---
    console.log("Checking D3 and Instantiating FloorplanManager...");
    try {
        if (typeof d3 === 'undefined') throw new Error("D3 is not defined.");
        new FloorplanManager();
        console.log("FloorplanManager instance created.");
    } catch (error) {
         console.error("Critical error during script startup:", error);
         alert(`Critical Error: ${error.message}. Floorplan Manager cannot start.`);
         showStandaloneLoadingIndicator(`Startup Error: ${error.message}`); // Show persistent error
    }
    console.log("--- Floorplan Manager Script Execution Finished ---");

})(); // End IIFE