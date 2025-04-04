// ==UserScript==
// @name         Floorplan Manager (Async Processing/Render) - Manual OpenCV Load v3
// @version      0.9.1
// @description  Async OpenCV processing & D3 rendering within requestAnimationFrame. Manually loads OpenCV. Addresses UI visibility.
// @author       ZLudany
// @match        https://home.google.com/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow // Needed to define Module in page scope
// @require      https://d3js.org/d3.v7.min.js
// @require      https://d3js.org/d3-drag.v3.min.js
// @require      https://d3js.org/d3-zoom.v3.min.js
// ==/UserScript==

(function() {
    'use strict';
    console.log("--- Floorplan Manager Script Execution Starting ---"); // Very early log

    // --- Constants ---
    const OPENCV_URL = 'https://docs.opencv.org/4.5.4/opencv.js';
    const OPENCV_LOAD_TIMEOUT = 20000; // 20 seconds timeout for OpenCV loading

    // --- CSS Styles ---
    GM_addStyle(`
        #floorplan-container {
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.85); /* Slightly darker background */
            /* CRITICAL: Set a very high z-index */
            z-index: 2147483647 !important; /* Max 32-bit signed integer, !important for emphasis */
            display: none; /* Initially hidden, shown by startUI() */
            flex-direction: column;
            align-items: center; justify-content: center;
            padding: 20px; box-sizing: border-box; font-family: sans-serif; color: white;
            overflow: hidden;
        }
        #floorplan-controls {
            background: #333; padding: 15px; border-radius: 5px; margin-bottom: 10px;
            display: flex; gap: 15px; align-items: center;
            flex-shrink: 0;
            z-index: 1; /* Ensure controls are above canvas/svg if overlapping */
        }
        #floorplan-canvas {
            background: #444; border: 1px solid #777; max-width: 90%;
            max-height: 65vh; object-fit: contain; display: block; /* Start shown within container */
            margin-bottom: 5px; flex-shrink: 1;
        }
         #floorplan-canvas-label {
            color: #ccc; font-size: 0.9em; font-style: italic;
            text-align: center; margin-bottom: 10px; display: block; /* Start shown */
            flex-shrink: 0;
         }
        #floorplan-close-btn {
            position: absolute; top: 15px; right: 20px; background: #ff4444; color: white;
            border: none; padding: 8px 12px; cursor: pointer; font-size: 1.2em; border-radius: 3px;
            z-index: 2; /* Above controls */
        }
        #floorplan-status {
            margin-top: auto; font-style: italic; background: #333; padding: 5px 10px; border-radius: 3px;
            flex-shrink: 0;
            z-index: 1;
        }
        #floorplan-controls label { margin-right: 5px; }
        #floorplan-controls input[type=file] {
            border: 1px solid #666; padding: 5px; border-radius: 3px; background: #555; color: white;
        }
        #floorplan-loading-indicator {
             position: fixed; top: 10px; left: 10px; background: rgba(0,0,0,0.8); color: white;
             padding: 10px 15px; border-radius: 5px;
             z-index: 2147483647 !important; /* Also needs highest z-index */
             font-family: sans-serif;
             text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;
             background: linear-gradient(to right, #3498db, #2980b9);
             display: none; /* Initially hidden */
        }
        #floorplan-svg-container {
             width: 90%; height: 75vh; border: 1px solid #66aaff;
             display: none; /* Initially hidden, shown by FloorplanCreator */
             flex-grow: 1; flex-shrink: 1;
             overflow: hidden; box-sizing: border-box;
             background-color: #282c34; /* Add background here too */
        }
        #floorplan-svg-container svg {
             display: block; width: 100%; height: 100%;
             /* background already set on container */
        }
        .floorplan-polygon {
            fill: rgba(100, 150, 255, 0.7); stroke: #d0d0ff;
            stroke-width: 1; cursor: grab;
        }
        .floorplan-polygon:active { cursor: grabbing; }
        .floorplan-polygon.dragging { stroke: yellow; stroke-width: 1.5; }
    `);

    // --- Helper: Manual OpenCV Loader --- (Same as before)
    function loadOpenCV() {
        console.log("Attempting to manually load OpenCV...");
        return new Promise((resolve, reject) => {
            const loadingIndicator = showTemporaryLoadingIndicator("Loading OpenCV library...");
            let timeoutId = setTimeout(() => {
                console.error("OpenCV loading timed out.");
                hideTemporaryLoadingIndicator(loadingIndicator);
                reject(new Error(`OpenCV loading timed out after ${OPENCV_LOAD_TIMEOUT / 1000} seconds.`));
            }, OPENCV_LOAD_TIMEOUT);

            // Define the Module object in the page's scope *before* loading the script
            try {
                unsafeWindow.Module = {
                    onRuntimeInitialized: () => {
                        clearTimeout(timeoutId); // Clear timeout on successful initialization
                        console.log("OpenCV Runtime Initialized (manual load).");
                        // Check if cv is actually available and usable
                        if (typeof unsafeWindow.cv !== 'undefined' && unsafeWindow.cv && typeof unsafeWindow.cv.imread === 'function') {
                             console.log("cv object confirmed via imread function.");
                             hideTemporaryLoadingIndicator(loadingIndicator);
                             resolve(unsafeWindow.cv); // Resolve with the cv object
                        } else {
                            console.error("onRuntimeInitialized called, but 'cv' object or crucial methods (like imread) seem missing/invalid!", unsafeWindow.cv);
                             hideTemporaryLoadingIndicator(loadingIndicator);
                            reject(new Error("OpenCV runtime initialized, but 'cv' object seems invalid."));
                        }
                    },
                     locateFile: function(path, scriptDirectory) {
                          // console.log("locateFile called with:", path); // Debugging if needed
                          return path; // Standard path usually works for CDN
                     },
                     // Add error listeners for WASM loading itself
                     onAbort: (reason) => {
                         console.error("OpenCV WASM Aborted:", reason);
                         clearTimeout(timeoutId);
                         hideTemporaryLoadingIndicator(loadingIndicator);
                         reject(new Error(`OpenCV WASM Aborted: ${reason}`));
                     }
                     // printErr: (text) => { console.error("OpenCV STDERR:", text); } // Optional: Log stderr
                };
                 console.log("unsafeWindow.Module object defined.");
            } catch (e) {
                console.error("Error defining unsafeWindow.Module:", e);
                clearTimeout(timeoutId);
                hideTemporaryLoadingIndicator(loadingIndicator);
                reject(new Error("Failed to define Module object in unsafeWindow."));
                return; // Stop execution
            }


            console.log("Requesting OpenCV script via GM_xmlhttpRequest:", OPENCV_URL);
            GM_xmlhttpRequest({
                method: "GET",
                url: OPENCV_URL,
                timeout: OPENCV_LOAD_TIMEOUT - 1000, // Timeout for the request itself
                onload: function(response) {
                    if (response.status >= 200 && response.status < 300) {
                        console.log("OpenCV script fetched successfully. Injecting into head...");
                        updateTemporaryLoadingIndicator(loadingIndicator, "Initializing OpenCV (WASM)...");

                        try {
                            const script = document.createElement('script');
                            script.textContent = response.responseText;
                            // Append to head to execute in page scope where Module is defined
                            (document.head || document.documentElement).appendChild(script);
                            // Note: Execution is asynchronous, rely on onRuntimeInitialized
                             // Remove the script tag after appending, execution starts upon append
                            script.remove();
                            console.log("OpenCV script injected. Waiting for onRuntimeInitialized...");
                        } catch (e) {
                             console.error("Error injecting OpenCV script:", e);
                             clearTimeout(timeoutId);
                             hideTemporaryLoadingIndicator(loadingIndicator);
                             reject(new Error("Failed to inject OpenCV script tag."));
                        }
                    } else {
                        clearTimeout(timeoutId);
                        console.error("Failed to fetch OpenCV script. Status:", response.status, response.statusText);
                         hideTemporaryLoadingIndicator(loadingIndicator);
                        reject(new Error(`Failed to fetch OpenCV script. Status: ${response.status}`));
                    }
                },
                onerror: function(response) {
                    clearTimeout(timeoutId);
                    console.error("Error during GM_xmlhttpRequest for OpenCV:", response);
                     hideTemporaryLoadingIndicator(loadingIndicator);
                    reject(new Error("Network error fetching OpenCV script."));
                },
                 ontimeout: function() {
                     clearTimeout(timeoutId);
                     console.error("GM_xmlhttpRequest timed out for OpenCV.");
                     hideTemporaryLoadingIndicator(loadingIndicator);
                     reject(new Error("Request timed out fetching OpenCV script."));
                 }
            });
        });
    }

     // --- Temporary Loading Indicator Helpers --- (Same as before)
     function showTemporaryLoadingIndicator(message) {
         let indicator = document.getElementById('floorplan-loading-indicator');
         if (!indicator) {
             indicator = document.createElement('div');
             indicator.id = 'floorplan-loading-indicator';
             // Style is applied via GM_addStyle
             document.documentElement.appendChild(indicator); // Append high in DOM
              console.log("Temporary loading indicator created.");
         } else {
              console.log("Reusing existing temporary loading indicator.");
         }
         indicator.textContent = message;
         indicator.style.display = 'block'; // Make it visible
         return indicator;
     }

     function updateTemporaryLoadingIndicator(indicator, message) {
         if (indicator) {
             indicator.textContent = message;
         } else {
              console.warn("Attempted to update non-existent temporary indicator with:", message);
         }
     }

     function hideTemporaryLoadingIndicator(indicator) {
         if (indicator) {
             indicator.style.display = 'none';
             console.log("Temporary loading indicator hidden.");
             // Don't remove it, might be needed for error messages later
         } else {
              console.warn("Attempted to hide non-existent temporary indicator.");
         }
     }


    // --- Floorplan SVG Creator Class --- (Same as before)
    class FloorplanCreator {
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
             // console.log("FloorplanCreator initialized with D3:", this.d3);
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

                        self.destroy(); // Clear previous SVG

                        self.svgContainer = document.createElement('div');
                        self.svgContainer.id = self.CONTAINER_ID;
                        // display: none set by CSS initially

                        const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                        self.svg = self.d3.select(svgElement);

                        self.svgGroup = self.svg.append('g').attr('id', 'floorplan-shapes');

                        console.log(`Rendering ${self.contourData.length} contours into SVG.`);
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

                        // Insert SVG container *before* the status label within the main container
                        const statusLabelElement = self.parentContainer.querySelector('#floorplan-status');
                        if (statusLabelElement) {
                            self.parentContainer.insertBefore(self.svgContainer, statusLabelElement);
                             // console.log("SVG container inserted before status label.");
                        } else {
                             console.warn("Status label not found, appending SVG container to parent.");
                            self.parentContainer.appendChild(self.svgContainer);
                        }
                        self.svgContainer.appendChild(svgElement);

                        self.setupZoom();
                        if (self.zoom) { // Ensure zoom was set up
                             self.svg.call(self.zoom);
                        } else {
                             console.warn("Zoom behavior not initialized for SVG.");
                        }

                        self.svgContainer.style.display = 'block'; // Make SVG container visible
                        console.log("FloorplanCreator: SVG rendered and container made visible.");
                        resolve();

                    } catch (error) {
                        console.error("FloorplanCreator: Error during async render.", error);
                        reject(error);
                    }
                }, 0); // setTimeout 0 yields execution
            });
        }

        setupZoom() {
             if (!this.d3) { console.error("D3 missing in setupZoom"); return; }
            const zoomed = (event) => {
                 if (this.svgGroup) {
                     this.svgGroup.attr('transform', event.transform);
                 }
            };
            this.zoom = this.d3.zoom().scaleExtent([0.1, 10]).on('zoom', zoomed);
        }

        setupDrag() {
             if (!this.d3) { console.error("D3 missing in setupDrag"); return () => {}; }
            const creatorInstance = this;
            return this.d3.drag()
                .on('start', function(event, d) {
                    creatorInstance.d3.select(this).raise().classed('dragging', true)
                         .style('stroke', creatorInstance.DRAGGING_STROKE)
                         .style('stroke-width', creatorInstance.DRAGGING_STROKE_WIDTH);
                    // console.log("Drag start:", d.id);
                })
                .on('drag', function(event, d) {
                    const currentTransform = creatorInstance.d3.select(this).attr('transform') || "";
                    let currentX = 0, currentY = 0;
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
                    creatorInstance.d3.select(this).classed('dragging', false)
                         .style('stroke', creatorInstance.POLYGON_STROKE)
                         .style('stroke-width', creatorInstance.POLYGON_STROKE_WIDTH);
                     // console.log("Drag end:", d.id);
                });
        }

        destroy() {
            if (this.svgContainer) {
                if (this.svg) this.svg.on('.zoom', null);
                if (this.svgGroup) this.svgGroup.selectAll('.floorplan-polygon').on('.drag', null);
                this.svgContainer.remove();
                this.svgContainer = null;
                this.svg = null;
                this.svgGroup = null;
                this.zoom = null;
                console.log("FloorplanCreator: SVG destroyed.");
            }
        }
    }


    // --- Base Floorplan Processor Class ---
    class FloorplanProcessor {
        // Config
        CANVAS_WIDTH = 800; CANVAS_HEIGHT = 600; CANNY_THRESHOLD1 = 50; CANNY_THRESHOLD2 = 100; MIN_CONTOUR_AREA = 50;
        // State
        cv = null; d3 = null; librariesReady = false; uiCreated = false;
        // UI Refs
        container = null; controlsDiv = null; fileInput = null; statusLabel = null;
        canvas = null; canvasCtx = null; canvasLabel = null; closeButton = null;
        loadingIndicator = null; // Reference to the temporary loading indicator

        constructor() {
            console.log("FloorplanProcessor constructor called.");
            if (typeof d3 !== 'undefined') {
                 this.d3 = d3;
                 console.log("D3 library confirmed in constructor:", this.d3.version);
            } else {
                console.error("FATAL: D3 library not found in constructor. @require failed?");
                showTemporaryLoadingIndicator("Error: D3 library failed to load! Cannot start.");
                throw new Error("D3 library failed to load."); // Stop execution
            }
        }

        async initialize() {
             console.log("FloorplanProcessor initializing...");
             this.loadingIndicator = showTemporaryLoadingIndicator("Initializing Floorplan Manager..."); // Get ref
             try {
                  if (!this.d3) throw new Error("D3 not loaded, cannot proceed."); // Should be caught by constructor

                  console.log("Starting OpenCV load...");
                  updateTemporaryLoadingIndicator(this.loadingIndicator, "Loading OpenCV...");
                  this.cv = await loadOpenCV(); // Wait for manual load
                  console.log("OpenCV load promise resolved in initialize.");

                  if (!this.cv) throw new Error("loadOpenCV resolved but cv object is null or undefined.");
                  console.log("OpenCV and D3 confirmed ready.");

                  this.librariesReady = true;
                  updateTemporaryLoadingIndicator(this.loadingIndicator, "Libraries ready. Starting UI...");
                  console.log("Calling startUI from initialize...");
                  const uiStarted = this.startUI(); // Call the UI setup function
                   if (!uiStarted) {
                        throw new Error("startUI function returned false or failed.");
                   }

             } catch (error) {
                  console.error("FloorplanProcessor Initialization failed:", error);
                  if (this.loadingIndicator) { // Check if indicator exists
                     updateTemporaryLoadingIndicator(this.loadingIndicator, `Error: ${error.message}. Check console.`);
                  } else {
                      alert(`Initialization Error: ${error.message}. Check console.`); // Fallback
                  }
                  // Rethrow or handle appropriately if needed downstream
                  // throw error;
             }
        }


        startUI() {
            console.log("Executing startUI. Libraries ready:", this.librariesReady, "UI Created:", this.uiCreated);

            if (!this.librariesReady) {
                console.error("FloorplanProcessor: startUI called before libraries were ready.");
                const indicator = this.loadingIndicator || document.getElementById('floorplan-loading-indicator');
                if (indicator) updateTemporaryLoadingIndicator(indicator, "Error: Libraries not ready.");
                return false;
            }
            if (this.uiCreated) {
                console.warn("FloorplanProcessor: startUI called but UI already exists. Ensuring visibility.");
                if (this.container) {
                    this.container.style.display = 'flex'; // Ensure visible
                    console.log("UI already created, ensured container display is flex.");
                } else {
                    console.error("UI marked as created, but container reference is missing!");
                }
                return false; // Return false because it was already created
            }

            console.log("FloorplanProcessor: Preparing to create Base UI...");
            // Hide the temporary/initial loading indicator *before* creating the main UI
            if (this.loadingIndicator) {
                console.log("Hiding temporary loading indicator:", this.loadingIndicator.id);
                hideTemporaryLoadingIndicator(this.loadingIndicator);
                // Keep ref in case needed for errors during creation? No, clear it.
                this.loadingIndicator = null;
            } else {
                 console.warn("Temporary loading indicator reference was already null before hiding.");
            }


            try {
                console.log("Calling createBaseUI...");
                this.createBaseUI(); // Create the DOM elements

                if (this.container && document.contains(this.container)) { // Check it was created and appended
                    console.log("Setting main container display to 'flex'. Current display:", window.getComputedStyle(this.container).display);
                    this.container.style.display = 'flex'; // <<< MAKE UI VISIBLE
                    // Double check style application
                    const finalDisplay = window.getComputedStyle(this.container).display;
                    console.log(`Main container display style after setting: ${finalDisplay}.`);
                    if (finalDisplay !== 'flex') {
                         console.warn(`Container display style is not 'flex' (${finalDisplay}), check CSS conflicts.`);
                         // Attempt force with !important as last resort (bad practice generally)
                         // this.container.style.setProperty('display', 'flex', 'important');
                         // console.log(`Attempted to force display:flex !important. New style: ${window.getComputedStyle(this.container).display}`);
                    }
                } else {
                    console.error("Error in startUI: this.container is null or not in DOM after createBaseUI was called.");
                    throw new Error("UI Container creation or appending failed."); // Throw to be caught below
                }

                this.updateStatus("Ready. Select an image file.");
                console.log("FloorplanProcessor: Base UI created and display set to flex.");
                return true; // Success

            } catch (error) {
                 console.error("Error occurred during createBaseUI or making UI visible:", error);
                 // Use alert as primary UI might be broken
                 alert("Error creating the user interface. Check the console for details.");
                 // Attempt cleanup
                 if (this.container) this.container.remove();
                 this.container = null;
                 this.uiCreated = false;
                 return false; // Failure
            }
        }

        createBaseUI() {
            console.log("Executing createBaseUI...");
            if (this.container) {
                 console.warn("createBaseUI called but container already exists. Skipping recreation.");
                 return;
            }
            this.container = document.createElement('div');
            this.container.id = 'floorplan-container';
             // Starts hidden via CSS

            this.controlsDiv = document.createElement('div');
            this.controlsDiv.id = 'floorplan-controls';
            // ... (file input creation) ...
             const fileInputLabel = document.createElement('label'); fileInputLabel.textContent = 'Upload Floorplan Image:'; fileInputLabel.htmlFor = 'floorplan-file-input'; this.fileInput = document.createElement('input'); this.fileInput.type = 'file'; this.fileInput.accept = 'image/*'; this.fileInput.id = 'floorplan-file-input'; this.controlsDiv.appendChild(fileInputLabel); this.controlsDiv.appendChild(this.fileInput);

            this.closeButton = document.createElement('button');
            this.closeButton.id = 'floorplan-close-btn'; this.closeButton.textContent = '✕'; this.closeButton.title = 'Close';

            this.canvas = document.createElement('canvas');
            this.canvas.id = 'floorplan-canvas'; this.canvas.width = this.CANVAS_WIDTH; this.canvas.height = this.CANVAS_HEIGHT; this.canvasCtx = this.canvas.getContext('2d');

            this.canvasLabel = document.createElement('div');
            this.canvasLabel.id = 'floorplan-canvas-label'; this.canvasLabel.textContent = "Upload an image to see the detected shape preview.";

            this.statusLabel = document.createElement('span');
            this.statusLabel.id = 'floorplan-status'; this.statusLabel.textContent = 'Initializing...';

            // Append elements to container
            this.container.appendChild(this.closeButton);
            this.container.appendChild(this.controlsDiv);
            this.container.appendChild(this.canvas);
            this.container.appendChild(this.canvasLabel);
            this.container.appendChild(this.statusLabel); // Status label added last

            // *** CHANGE: Append container before body ***
            try {
                if (document.body) {
                     document.documentElement.insertBefore(this.container, document.body);
                     console.log("Container inserted before document.body.");
                } else {
                     console.warn("document.body not found, appending container to documentElement as fallback.");
                     document.documentElement.appendChild(this.container); // Fallback if body isn't ready (unlikely)
                }
            } catch (e) {
                 console.error("Error inserting container into documentElement:", e);
                 console.log("Falling back to appending container to documentElement.");
                 document.documentElement.appendChild(this.container); // Ensure it gets added somewhere
            }


            this.uiCreated = true; // Set flag *after* successful creation and appending
            console.log("FloorplanProcessor: Base UI DOM elements created and inserted into DOM.");

             // Add event listeners
             if (this.fileInput) {
                 this.fileInput.addEventListener('change', (e) => this.handleFileChange(e));
             } else {
                 console.error("FloorplanProcessor: File input not found after creation.");
             }
             if (this.closeButton) {
                 this.closeButton.addEventListener('click', () => this.closeUI());
             } else {
                 console.error("FloorplanProcessor: Close button not found after creation.");
             }
              console.log("createBaseUI finished.");
        }

        updateStatus(message) {
            // Update status only if the UI is actually created and visible
            if (this.uiCreated && this.statusLabel && this.container && this.container.style.display === 'flex') {
                this.statusLabel.textContent = message;
            } else if (this.loadingIndicator) {
                 // If main UI not up, update the temporary indicator
                 updateTemporaryLoadingIndicator(this.loadingIndicator, message);
            }
            console.log("Floorplan Status Updated:", message); // Log status changes regardless
        }

         // --- Image Processing (Async) --- (Same as before)
         processImage(imgElement) {
             // ... (no changes needed here based on current issue) ...
             const self = this; // Capture context for promise/setTimeout

             return new Promise((resolve, reject) => {
                 if (!self.cv) {
                     return reject(new Error("OpenCV (cv object) is not available for processing."));
                 }
                 if (!imgElement || !(imgElement instanceof HTMLImageElement) || !imgElement.complete || imgElement.naturalWidth === 0) {
                      return reject(new Error("Invalid or incomplete image element provided to processImage."));
                 }

                 console.log("Processing image with OpenCV...");

                 setTimeout(() => {
                     let src = null, gray = null, edges = null, contours = null, hierarchy = null;
                     let displayMat = null;
                     const formattedContours = [];

                     try {
                         const cv = self.cv;
                         src = cv.imread(imgElement);
                         if (src.empty()) throw new Error("cv.imread failed, source matrix is empty.");
                         // console.log(`Image loaded: ${src.cols}x${src.rows}`);

                         // --- Canvas Preview Handling ---
                         const scale = Math.min(self.CANVAS_WIDTH / src.cols, self.CANVAS_HEIGHT / src.rows);
                         const dsize = new cv.Size(Math.round(src.cols * scale), Math.round(src.rows * scale));
                         displayMat = new cv.Mat();
                         cv.resize(src, displayMat, dsize, 0, 0, cv.INTER_AREA);

                         if (self.canvas && self.canvasCtx) {
                             self.canvas.width = displayMat.cols;
                             self.canvas.height = displayMat.rows;
                             self.canvasCtx.clearRect(0, 0, self.canvas.width, self.canvas.height);
                             cv.imshow(self.canvas, displayMat);
                              // console.log("Preview shown on canvas.");
                         } else {
                              console.warn("Canvas or context not available for preview.");
                         }
                         // --- End Canvas Preview ---

                         // --- OpenCV Contour Detection ---
                         gray = new cv.Mat();
                         cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
                         cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
                         edges = new cv.Mat();
                         cv.Canny(gray, edges, self.CANNY_THRESHOLD1, self.CANNY_THRESHOLD2);
                         contours = new cv.MatVector();
                         hierarchy = new cv.Mat();
                         cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
                          console.log(`Found ${contours.size()} raw contours.`);
                         // --- End Contour Detection ---

                         // --- Format and Scale Contours ---
                         for (let i = 0; i < contours.size(); ++i) {
                             const contour = contours.get(i);
                             try { // Add try inside loop for individual contour issues
                                 const area = cv.contourArea(contour);
                                 if (area < self.MIN_CONTOUR_AREA || contour.rows < 3) {
                                     continue; // Skip small/invalid contours
                                 }

                                 const pointsArray = [];
                                 const pointData = contour.data32S;
                                 for (let j = 0; j < contour.rows; ++j) {
                                     pointsArray.push({
                                         x: Math.round(pointData[j * 2] * scale),
                                         y: Math.round(pointData[j * 2 + 1] * scale)
                                     });
                                 }
                                 formattedContours.push({
                                      id: `contour-${Date.now()}-${i}`,
                                      points: pointsArray,
                                 });
                             } finally {
                                 // Ensure individual contour Mat is deleted even if skipped/errored
                                 if (contour) contour.delete();
                             }
                         }
                         // --- End Formatting ---

                         console.log(`Formatted ${formattedContours.length} valid contours asynchronously.`);
                         resolve(formattedContours);

                     } catch (error) {
                         console.error("OpenCV Error during async image processing:", error);
                         reject(error);
                     } finally {
                         // --- OpenCV Memory Management ---
                         if (src) src.delete();
                         if (gray) gray.delete();
                         if (edges) edges.delete();
                         if (contours) contours.delete();
                         if (hierarchy) hierarchy.delete();
                         if (displayMat) displayMat.delete();
                          console.log('OpenCV Mats from processImage cleaned up.');
                     }
                 }, 0); // setTimeout 0 yields execution
             });
         }


          // --- UI Interaction Methods --- (Same as before)
          handleFileChange(e) {
               if (!this.librariesReady || !this.uiCreated) {
                    console.warn("handleFileChange called before ready or UI created.");
                    this.updateStatus("Error: System not ready. Please reload.");
                    return;
               }
               if (!this.cv) { // Add check for CV object specifically
                    console.error("handleFileChange: OpenCV (cv) object is missing!");
                    this.updateStatus("Error: OpenCV component not loaded correctly.");
                    return;
               }

               const file = e.target.files[0];
               if (!file || !file.type.startsWith('image/')) {
                    this.updateStatus('Error: Please select a valid image file.');
                    this.showCanvas();
                    if (this.floorplanCreatorInstance) {
                         this.floorplanCreatorInstance.destroy(); this.floorplanCreatorInstance = null;
                    }
                    return;
               }

               this.updateStatus('Reading file...');
               const reader = new FileReader();

               reader.onload = (event) => {
                    const imgElement = document.createElement('img');

                    imgElement.onload = () => {
                         if (imgElement.naturalWidth === 0) { // Check if image loaded correctly
                              this.updateStatus('Error: Image could not be decoded.');
                              this.showCanvas();
                              return;
                         }
                         this.updateStatus('Processing image (please wait)...');
                         this.showCanvas();

                         requestAnimationFrame(async () => {
                              let contoursData = [];
                              try {
                                   console.time("ProcessingTime");
                                   this.updateStatus('Detecting shapes...');
                                   contoursData = await this.processImage(imgElement);
                                   console.timeEnd("ProcessingTime");

                                   this.updateCanvasLabel(contoursData.length);

                                   if (this.floorplanCreatorInstance) {
                                        this.floorplanCreatorInstance.destroy(); this.floorplanCreatorInstance = null;
                                   }

                                   if (contoursData.length > 0) {
                                        this.updateStatus(`Found ${contoursData.length} shapes. Creating SVG...`);
                                        this.floorplanCreatorInstance = new FloorplanCreator(contoursData, this.d3, this.container);

                                        console.time("RenderingTime");
                                        await this.floorplanCreatorInstance.render();
                                        console.timeEnd("RenderingTime");

                                        this.hideCanvas();
                                        this.updateStatus(`SVG created with ${contoursData.length} shapes. Ready.`);
                                   } else {
                                        this.updateStatus("No suitable shapes found. Showing preview.");
                                        this.showCanvas();
                                   }

                              } catch (error) {
                                   console.error("FloorplanManager: Error during async image handling:", error);
                                   this.updateStatus(`Error: ${error.message}. Check console.`);
                                   this.showCanvas();
                                   if (this.floorplanCreatorInstance) {
                                        this.floorplanCreatorInstance.destroy(); this.floorplanCreatorInstance = null;
                                   }
                              } finally {
                                   // Clean up object URL if applicable
                                   if (imgElement.src && imgElement.src.startsWith('blob:')) {
                                        URL.revokeObjectURL(imgElement.src);
                                        // console.log("Revoked object URL");
                                   }
                              }
                         });
                    };

                    imgElement.onerror = () => {
                         this.updateStatus('Error loading image data into image element.');
                         this.showCanvas();
                    };

                    // Check if reader result is valid before assigning
                    if (event.target.result) {
                        imgElement.src = event.target.result;
                    } else {
                         this.updateStatus('Error: File could not be read.');
                         this.showCanvas();
                    }
               };

               reader.onerror = () => {
                    this.updateStatus('Error reading file.');
                    this.showCanvas();
               };

               reader.readAsDataURL(file);
          }

          showCanvas() { /* ... (no changes needed) ... */ }
          hideCanvas() { /* ... (no changes needed) ... */ }
          updateCanvasLabel(count) { /* ... (no changes needed) ... */ }
          closeUI() { /* ... (no changes needed) ... */ }
    }

    // --Floorplan Manager Class (Orchestrator)-- (Same as before)
    class FloorplanManager extends FloorplanProcessor {
        floorplanCreatorInstance = null; // Specific to the manager

        constructor() {
            super(); // Calls FloorplanProcessor constructor
            console.log("FloorplanManager: Initializing...");
            this.initialize().catch(err => { // Initialize handles loading/UI startup
                 console.error("FloorplanManager failed to initialize:", err);
            });
        }
    }

    // --- Instantiate the Manager ---
    // Ensures the script starts executing when loaded
    console.log("Checking D3 and Instantiating FloorplanManager...");
    try {
        if (typeof d3 === 'undefined') {
            throw new Error("D3 is not defined. @require failed.");
        }
         console.log("D3 found globally. Proceeding with instantiation.");
        new FloorplanManager();
         console.log("FloorplanManager instance created.");
    } catch (error) {
         console.error("Failed to instantiate FloorplanManager:", error);
         alert(`Critical Error: ${error.message}. Floorplan Manager cannot start.`);
         // Show persistent error message if possible
         const indicator = document.getElementById('floorplan-loading-indicator');
         if (indicator) {
            updateTemporaryLoadingIndicator(indicator, `Error: ${error.message}`);
            indicator.style.display = 'block'; // Ensure it's visible
         }
    }
    console.log("--- Floorplan Manager Script Execution Finished ---"); // End log
})(); // End IIFE