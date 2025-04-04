// ==UserScript==
// @name         Floorplan Manager (DefineProperty OpenCV Load)
// @version      0.9.2
// @description  Async OpenCV processing & D3 rendering. Uses defineProperty to detect OpenCV load.
// @author       ZLudany
// @match        https://home.google.com/*
// @grant        GM_addStyle
// @require      https://d3js.org/d3.v7.min.js
// @require      https://d3js.org/d3-drag.v3.min.js
// @require      https://d3js.org/d3-zoom.v3.min.js
// ==/UserScript==

(function() {
    'use strict';
    console.log("--- Floorplan Manager Script (DefineProperty Load) Execution Starting ---");

    // --- Constants ---
    const OPENCV_URL = 'https://docs.opencv.org/4.5.4/opencv.js';
    const OPENCV_LOAD_TIMEOUT = 25000; // Increased timeout slightly (25 seconds)

    // --- CSS Styles --- (Same as before, including high z-index)
    GM_addStyle(`
        #floorplan-container {
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.85);
            z-index: 2147483647 !important;
            display: none; /* Initially hidden */
            flex-direction: column;
            align-items: center; justify-content: center;
            padding: 20px; box-sizing: border-box; font-family: sans-serif; color: white;
            overflow: hidden;
        }
        #floorplan-loading-indicator {
             position: fixed; top: 10px; left: 10px; background: rgba(0,0,0,0.8); color: white;
             padding: 10px 15px; border-radius: 5px;
             z-index: 2147483647 !important;
             font-family: sans-serif;
             text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;
             background: linear-gradient(to right, #3498db, #2980b9);
             display: none; /* Initially hidden */
        }
        /* ... other styles remain the same ... */
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

    // --- Helper: OpenCV Loader using Object.defineProperty ---
    function loadOpenCVPromise() {
        return new Promise((resolve, reject) => {
            console.log("Setting up OpenCV load listener via Object.defineProperty...");
            let cvValue = undefined; // Internal storage for the cv object
            let resolved = false; // Flag to prevent multiple resolves/rejects

            // Timeout for the whole process
            const timeoutId = setTimeout(() => {
                if (resolved) return; // Already handled
                // Check one last time directly before rejecting
                if (window.cv && typeof window.cv.imread === 'function') {
                    console.log("OpenCV found just before timeout.");
                    resolved = true;
                    Object.defineProperty(window, 'cv', { value: window.cv, writable: true, configurable: true, enumerable: true }); // Restore default behavior
                    resolve(window.cv);
                } else {
                    console.error(`OpenCV loading timed out after ${OPENCV_LOAD_TIMEOUT / 1000}s (defineProperty).`);
                    resolved = true;
                    Object.defineProperty(window, 'cv', { value: cvValue, writable: true, configurable: true, enumerable: true }); // Restore default behavior with whatever value we got
                    reject(new Error(`OpenCV loading timed out (${OPENCV_LOAD_TIMEOUT / 1000}s).`));
                }
            }, OPENCV_LOAD_TIMEOUT);

            // Intercept the 'cv' property assignment on the window object
            Object.defineProperty(window, 'cv', {
                configurable: true, // IMPORTANT: Allow us to delete/redefine later
                enumerable: true,
                get() {
                    // console.log("Getter called for window.cv"); // Can be noisy
                    return cvValue;
                },
                set(value) {
                    // console.log("Setter called for window.cv", (value ? "with value" : "with null/undefined"));
                    cvValue = value; // Store the assigned value internally

                    // THE CRITICAL CHECK: Is the assigned value valid and has imread?
                    // This implies the WASM part is likely ready enough.
                    if (!resolved && value && typeof value.imread === 'function') {
                        console.log("OpenCV detected via setter! cv.imread is available.");
                        resolved = true;
                        clearTimeout(timeoutId); // Success, clear timeout

                        // IMPORTANT: Restore the original property descriptor after detection
                        // to avoid interfering with potential subsequent assignments or deletions.
                        Object.defineProperty(window, 'cv', {
                            value: value,
                            writable: true,
                            configurable: true,
                            enumerable: true
                        });
                        console.log("Restored original window.cv property descriptor.");
                        resolve(value); // Resolve the promise with the valid cv object
                    } else if (!resolved) {
                         // console.log("Setter called, but value is invalid or imread is missing, or already resolved.");
                    }
                }
            });
            console.log("window.cv property listener defined. Injecting OpenCV script...");

            // Inject the OpenCV script tag asynchronously
            const script = document.createElement('script');
            script.src = OPENCV_URL;
            script.async = true;
            script.onerror = (event) => {
                if (resolved) return;
                console.error("Error loading OpenCV script tag:", event);
                resolved = true;
                clearTimeout(timeoutId);
                Object.defineProperty(window, 'cv', { value: cvValue, writable: true, configurable: true, enumerable: true }); // Restore
                reject(new Error("Failed to load OpenCV script tag (onerror event)."));
            };
            // Append to head for execution
            (document.head || document.documentElement).appendChild(script);
            console.log("OpenCV script tag appended to head.");
        });
    }


    // --- Floorplan SVG Creator Class --- (Same as before)
    class FloorplanCreator {
        // ... (constructor, render, setupZoom, setupDrag, destroy methods remain the same) ...
        svgContainer = null; svg = null; svgGroup = null; contourData = []; d3 = null; zoom = null;
        POLYGON_FILL = 'rgba(100, 150, 255, 0.7)'; POLYGON_STROKE = '#d0d0ff'; POLYGON_STROKE_WIDTH = 1;
        DRAGGING_STROKE = 'yellow'; DRAGGING_STROKE_WIDTH = 1.5; CONTAINER_ID = 'floorplan-svg-container'; parentContainer = null;

        constructor(contoursData, d3Instance, parentContainer) {
            if (!contoursData) throw new Error("FloorplanCreator requires contour data.");
            if (!d3Instance) throw new Error("FloorplanCreator requires D3 instance.");
            if (!parentContainer) throw new Error("FloorplanCreator requires parent container.");
            this.d3 = d3Instance;
            this.contourData = contoursData;
            this.parentContainer = parentContainer;
        }

        render() {
            const self = this;
            return new Promise((resolve, reject) => {
                setTimeout(() => {
                    try {
                        if (!self.d3) throw new Error("D3 instance is not available in FloorplanCreator render.");
                        if (!self.parentContainer || !document.contains(self.parentContainer)) {
                             throw new Error("Parent container is missing or detached from DOM before SVG render.");
                        }
                        self.destroy();
                        self.svgContainer = document.createElement('div');
                        self.svgContainer.id = self.CONTAINER_ID;
                        const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                        self.svg = self.d3.select(svgElement);
                        self.svgGroup = self.svg.append('g').attr('id', 'floorplan-shapes');
                        self.svgGroup.selectAll('.floorplan-polygon')
                            .data(self.contourData, d => d.id)
                            .enter()
                            .append('polygon')
                            .attr('class', 'floorplan-polygon')
                            .attr('points', d => d.points.map(p => `${p.x},${p.y}`).join(' '))
                            .style('fill', self.POLYGON_FILL).style('stroke', self.POLYGON_STROKE)
                            .style('stroke-width', self.POLYGON_STROKE_WIDTH).attr('transform', d => d.transform || null)
                            .call(self.setupDrag());
                        const statusLabelElement = self.parentContainer.querySelector('#floorplan-status');
                        if (statusLabelElement) { self.parentContainer.insertBefore(self.svgContainer, statusLabelElement); }
                        else { console.warn("Status label not found, appending SVG container."); self.parentContainer.appendChild(self.svgContainer); }
                        self.svgContainer.appendChild(svgElement);
                        self.setupZoom();
                        if (self.zoom) { self.svg.call(self.zoom); } else { console.warn("Zoom behavior not initialized."); }
                        self.svgContainer.style.display = 'block';
                        console.log("FloorplanCreator: SVG rendered and container made visible.");
                        resolve();
                    } catch (error) { console.error("FloorplanCreator: Error during async render.", error); reject(error); }
                }, 0);
            });
        }
        setupZoom() { if (!this.d3) { console.error("D3 missing in setupZoom"); return; } const zoomed = (event) => { if (this.svgGroup) { this.svgGroup.attr('transform', event.transform); }}; this.zoom = this.d3.zoom().scaleExtent([0.1, 10]).on('zoom', zoomed); }
        setupDrag() { if (!this.d3) { console.error("D3 missing in setupDrag"); return () => {}; } const creatorInstance = this; return this.d3.drag().on('start', function(event, d) { creatorInstance.d3.select(this).raise().classed('dragging', true).style('stroke', creatorInstance.DRAGGING_STROKE).style('stroke-width', creatorInstance.DRAGGING_STROKE_WIDTH); }).on('drag', function(event, d) { const currentTransform = creatorInstance.d3.select(this).attr('transform') || ""; let currentX = 0, currentY = 0; const match = currentTransform.match(/translate\(([^,]+),([^)]+)\)/); if (match) { currentX = parseFloat(match[1]); currentY = parseFloat(match[2]); } const newX = currentX + event.dx; const newY = currentY + event.dy; creatorInstance.d3.select(this).attr('transform', `translate(${newX}, ${newY})`); }).on('end', function(event, d) { creatorInstance.d3.select(this).classed('dragging', false).style('stroke', creatorInstance.POLYGON_STROKE).style('stroke-width', creatorInstance.POLYGON_STROKE_WIDTH); }); }
        destroy() { if (this.svgContainer) { if (this.svg) this.svg.on('.zoom', null); if (this.svgGroup) this.svgGroup.selectAll('.floorplan-polygon').on('.drag', null); this.svgContainer.remove(); this.svgContainer = null; this.svg = null; this.svgGroup = null; this.zoom = null; console.log("FloorplanCreator: SVG destroyed."); } }
    }


    // --- Base Floorplan Processor Class ---
    class FloorplanProcessor {
        // Config & State (same as before)
        CANVAS_WIDTH = 800; CANVAS_HEIGHT = 600; CANNY_THRESHOLD1 = 50; CANNY_THRESHOLD2 = 100; MIN_CONTOUR_AREA = 50;
        cv = null; d3 = null; librariesReady = false; uiCreated = false;
        // UI Refs (same as before)
        container = null; controlsDiv = null; fileInput = null; statusLabel = null;
        canvas = null; canvasCtx = null; canvasLabel = null; closeButton = null;
        loadingIndicator = null; // Ref for the processor's loading indicator

        constructor() {
            console.log("FloorplanProcessor constructor.");
            if (typeof d3 !== 'undefined') {
                 this.d3 = d3;
                 console.log("D3 library confirmed in constructor:", this.d3.version);
            } else {
                // This is fatal, stop immediately
                console.error("FATAL: D3 library not found in constructor.");
                this.showLoadingIndicator("Error: Core D3 library failed to load! Cannot start."); // Use the processor's indicator
                throw new Error("D3 library failed to load.");
            }
        }

         // --- Loading Indicator Management ---
         showLoadingIndicator(message = "Loading...") {
             if (!this.loadingIndicator) {
                 this.loadingIndicator = document.getElementById('floorplan-loading-indicator');
                 if (!this.loadingIndicator) {
                     this.loadingIndicator = document.createElement('div');
                     this.loadingIndicator.id = 'floorplan-loading-indicator';
                     // Append high in DOM to ensure visibility even if body isn't ready
                     (document.documentElement || document.body).appendChild(this.loadingIndicator);
                     console.log("Processor's loading indicator created.");
                 }
             }
             this.loadingIndicator.textContent = message;
             this.loadingIndicator.style.display = 'block'; // Make visible
             console.log("Processor's loading indicator shown:", message);
         }

         hideLoadingIndicator() {
             if (this.loadingIndicator) {
                 this.loadingIndicator.style.display = 'none';
                 console.log("Processor's loading indicator hidden.");
             }
         }

         updateLoadingIndicator(message) {
             if (this.loadingIndicator && this.loadingIndicator.style.display === 'block') {
                 this.loadingIndicator.textContent = message;
                 console.log("Processor's loading indicator updated:", message);
             } else {
                  // If main UI is up, use status label instead
                  this.updateStatus(message);
             }
         }
         // --- End Loading Indicator ---


        async initialize() {
             console.log("FloorplanProcessor initializing...");
             this.showLoadingIndicator("Initializing Floorplan Manager...");
             try {
                  if (!this.d3) throw new Error("D3 not loaded."); // Should be caught by constructor

                  console.log("Starting OpenCV load via defineProperty listener...");
                  this.updateLoadingIndicator("Loading OpenCV (may take time)...");
                  this.cv = await loadOpenCVPromise(); // Wait for defineProperty detection
                  console.log("OpenCV load promise resolved in initialize.");

                  if (!this.cv) throw new Error("loadOpenCVPromise resolved but cv object is invalid.");
                  console.log("OpenCV and D3 confirmed ready.");

                  this.librariesReady = true;
                  this.updateLoadingIndicator("Libraries ready. Starting UI...");
                  console.log("Calling startUI from initialize...");

                  const uiStarted = this.startUI();
                  if (!uiStarted) {
                       // startUI logs the specific error
                       throw new Error("UI initialization failed.");
                  }
                  // If startUI succeeded, hide the initial loading indicator
                   this.hideLoadingIndicator();

             } catch (error) {
                  console.error("FloorplanProcessor Initialization failed:", error);
                  // Keep the loading indicator visible with the error
                  this.showLoadingIndicator(`Initialization Error: ${error.message}. Check console.`);
                  // Optionally, rethrow if the manager needs to know
                  // throw error;
             }
        }


        startUI() {
            // This function now assumes libraries are ready if called from initialize's success path
            console.log("Executing startUI. UI Created previously:", this.uiCreated);

            if (this.uiCreated) {
                console.warn("FloorplanProcessor: startUI called but UI already exists. Ensuring visibility.");
                if (this.container && document.contains(this.container)) {
                    this.container.style.display = 'flex'; // Ensure visible
                    return true; // Indicate success (UI is ready)
                } else {
                    console.error("UI marked as created, but container is missing or not in DOM!");
                    this.uiCreated = false; // Reset flag, something went wrong
                     // Fall through to recreate
                }
            }

            console.log("FloorplanProcessor: Preparing to create Base UI...");

            try {
                console.log("Calling createBaseUI...");
                this.createBaseUI(); // Create the DOM elements

                if (this.container && document.contains(this.container)) {
                    console.log("Setting main container display to 'flex'.");
                    this.container.style.display = 'flex'; // <<< MAKE UI VISIBLE

                    const finalDisplay = window.getComputedStyle(this.container).display;
                    console.log(`Main container display style after setting: ${finalDisplay}.`);
                    if (finalDisplay !== 'flex') {
                         console.warn(`Container display style is not 'flex' (${finalDisplay}), check CSS conflicts.`);
                    }
                    this.updateStatus("Ready. Select an image file.");
                    console.log("FloorplanProcessor: Base UI created and display set to flex.");
                    return true; // Success

                } else {
                    console.error("Error in startUI: this.container is null or not in DOM after createBaseUI.");
                    throw new Error("UI Container creation or appending failed.");
                }

            } catch (error) {
                 console.error("Error occurred during createBaseUI or making UI visible:", error);
                 this.showLoadingIndicator(`UI Creation Error: ${error.message}. Check console.`); // Show error on loader
                 // Attempt cleanup
                 if (this.container) this.container.remove();
                 this.container = null;
                 this.uiCreated = false;
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
            this.statusLabel = document.createElement('span'); this.statusLabel.id = 'floorplan-status'; this.statusLabel.textContent = 'Initializing...';
            this.container.appendChild(this.closeButton); this.container.appendChild(this.controlsDiv); this.container.appendChild(this.canvas); this.container.appendChild(this.canvasLabel); this.container.appendChild(this.statusLabel);

            // Append container before body
            try {
                if (document.body) { document.documentElement.insertBefore(this.container, document.body); console.log("Container inserted before document.body."); }
                else { console.warn("document.body not found, appending container to documentElement."); document.documentElement.appendChild(this.container); }
            } catch (e) { console.error("Error inserting container:", e); document.documentElement.appendChild(this.container); } // Fallback append

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
            // Update status only if the UI is actually created and visible
            if (this.uiCreated && this.statusLabel && this.container && this.container.style.display === 'flex') {
                this.statusLabel.textContent = message;
                 console.log("Status label updated:", message);
            } else {
                 // Log status anyway, even if UI not fully visible/ready
                 console.log("Floorplan Status (UI not visible/ready):", message);
            }
        }

         // --- Image Processing (Async) --- (Same as before)
         processImage(imgElement) {
             // ... (Implementation remains unchanged) ...
             const self = this;
             return new Promise((resolve, reject) => {
                 if (!self.cv) return reject(new Error("OpenCV (cv object) is not available."));
                 if (!imgElement || !(imgElement instanceof HTMLImageElement) || !imgElement.complete || imgElement.naturalWidth === 0) return reject(new Error("Invalid image element."));
                 console.log("Processing image...");
                 setTimeout(() => { /* ... OpenCV logic ... */ resolve(formattedContours); }, 0); // Simplified for brevity
             });
         }

          // --- UI Interaction Methods --- (Same as before)
          handleFileChange(e) {
             // ... (Implementation remains unchanged) ...
               if (!this.librariesReady || !this.uiCreated) { console.warn("handleFileChange called too early."); this.updateStatus("System not ready."); return; }
               if (!this.cv) { console.error("handleFileChange: OpenCV is missing!"); this.updateStatus("Error: OpenCV component missing."); return; }
               const file = e.target.files[0]; if (!file || !file.type.startsWith('image/')) { this.updateStatus('Invalid file.'); this.showCanvas(); return; }
               this.updateStatus('Reading file...'); const reader = new FileReader();
               reader.onload = (event) => { /* ... img loading and processing logic ... */ };
               reader.onerror = () => { this.updateStatus('Error reading file.'); this.showCanvas(); };
               reader.readAsDataURL(file);
          }
          showCanvas() { if (this.canvas) this.canvas.style.display = 'block'; if (this.canvasLabel) this.canvasLabel.style.display = 'block'; if (this.floorplanCreatorInstance && this.floorplanCreatorInstance.svgContainer) { this.floorplanCreatorInstance.svgContainer.style.display = 'none'; } console.log("Canvas shown"); }
          hideCanvas() { if (this.canvas) this.canvas.style.display = 'none'; if (this.canvasLabel) this.canvasLabel.style.display = 'none'; console.log("Canvas hidden"); }
          updateCanvasLabel(count) { if (this.canvasLabel) { this.canvasLabel.textContent = count > 0 ? `Preview: ${count} raw shape(s) detected.` : "Preview: No distinct shapes detected."; } }
          closeUI() { console.log("Closing UI..."); if (this.floorplanCreatorInstance) { this.floorplanCreatorInstance.destroy(); this.floorplanCreatorInstance = null; } if (this.container) { this.container.remove(); this.container = null; this.uiCreated = false; console.log("FloorplanProcessor: UI Closed."); } this.librariesReady = false; this.cv = null; /* d3 stays global */ }
    }

    // --Floorplan Manager Class (Orchestrator)-- (Same as before)
    class FloorplanManager extends FloorplanProcessor {
        floorplanCreatorInstance = null; // Instance specific to the manager

        constructor() {
            super(); // Calls FloorplanProcessor constructor
            console.log("FloorplanManager: Initializing...");
            // Initialize handles loading/UI startup
            this.initialize().catch(err => {
                 console.error("FloorplanManager failed to initialize:", err);
                 // Error should be displayed on the loading indicator by initialize()
            });
        }
        // No overrides needed for now, base class handles UI interactions
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
         // Attempt to show error message using the processor's indicator logic
         const tempLoader = new FloorplanProcessor(); // Create temp instance just for loader
         tempLoader.showLoadingIndicator(`Startup Error: ${error.message}`);
    }
    console.log("--- Floorplan Manager Script Execution Finished ---");
})(); // End IIFE