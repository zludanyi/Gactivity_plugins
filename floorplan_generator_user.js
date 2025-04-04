// ==UserScript==
// @name         Floorplan Manager (Async Processing/Render) - Manual OpenCV Load
// @version      0.9
// @description  Async OpenCV processing & D3 rendering within requestAnimationFrame. Manually loads OpenCV.
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

    // --- Constants ---
    const OPENCV_URL = 'https://docs.opencv.org/4.5.4/opencv.js';
    const OPENCV_LOAD_TIMEOUT = 20000; // 20 seconds timeout for OpenCV loading

    // --- CSS Styles --- (Same as before)
    GM_addStyle(`
        #floorplan-container {
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.75); z-index: 9990;
            display: none; /* Initially hidden */
            flex-direction: column;
            align-items: center; justify-content: center;
            padding: 20px; box-sizing: border-box; font-family: sans-serif; color: white;
            overflow: hidden;
        }
        #floorplan-controls {
            background: #333; padding: 15px; border-radius: 5px; margin-bottom: 10px;
            display: flex; gap: 15px; align-items: center;
            flex-shrink: 0;
        }
        #floorplan-canvas {
            background: #444; border: 1px solid #777; max-width: 90%;
            max-height: 65vh; object-fit: contain; display: block;
            margin-bottom: 5px; flex-shrink: 1;
        }
         #floorplan-canvas-label {
            color: #ccc; font-size: 0.9em; font-style: italic;
            text-align: center; margin-bottom: 10px; display: block;
            flex-shrink: 0;
         }
        #floorplan-close-btn {
            position: absolute; top: 15px; right: 20px; background: #ff4444; color: white;
            border: none; padding: 8px 12px; cursor: pointer; font-size: 1.2em; border-radius: 3px;
            z-index: 10000;
        }
        #floorplan-status {
            margin-top: auto; font-style: italic; background: #333; padding: 5px 10px; border-radius: 3px;
            flex-shrink: 0;
        }
        #floorplan-controls label { margin-right: 5px; }
        #floorplan-controls input[type=file] {
            border: 1px solid #666; padding: 5px; border-radius: 3px; background: #555; color: white;
        }
        #floorplan-loading-indicator {
             position: fixed; top: 10px; left: 10px; background: rgba(0,0,0,0.8); color: white;
             padding: 10px 15px; border-radius: 5px; z-index: 10001;
             font-family: sans-serif;
             text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;
             background: linear-gradient(to right, #3498db, #2980b9);
             display: none; /* Initially hidden */
        }
        #floorplan-svg-container {
             width: 90%; height: 75vh; border: 1px solid #66aaff;
             display: none; flex-grow: 1; flex-shrink: 1;
             overflow: hidden; box-sizing: border-box;
        }
        #floorplan-svg-container svg {
             display: block; width: 100%; height: 100%;
             background-color: #282c34;
        }
        .floorplan-polygon {
            fill: rgba(100, 150, 255, 0.7); stroke: #d0d0ff;
            stroke-width: 1; cursor: grab;
        }
        .floorplan-polygon:active { cursor: grabbing; }
        .floorplan-polygon.dragging { stroke: yellow; stroke-width: 1.5; }
    `);

    // --- Helper: Manual OpenCV Loader ---
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
            // unsafeWindow grants access to the page's window object
            unsafeWindow.Module = {
                onRuntimeInitialized: () => {
                    clearTimeout(timeoutId); // Clear timeout on successful initialization
                    console.log("OpenCV Runtime Initialized (manual load).");
                    // Check if cv is actually available
                    if (typeof unsafeWindow.cv !== 'undefined' && unsafeWindow.cv.imread) {
                         console.log("cv object confirmed.");
                         hideTemporaryLoadingIndicator(loadingIndicator);
                         resolve(unsafeWindow.cv); // Resolve with the cv object
                    } else {
                        console.error("onRuntimeInitialized called, but 'cv' object or crucial methods are missing!");
                         hideTemporaryLoadingIndicator(loadingIndicator);
                        reject(new Error("OpenCV runtime initialized, but 'cv' object seems invalid."));
                    }
                },
                // Optional: Add other Module configurations if needed
                 locateFile: function(path, scriptDirectory) {
                      // Helps locate the .wasm file if needed, adjust path if necessary
                      // For the standard CDN, it usually finds it automatically.
                      return path;
                 }
            };

            console.log("Requesting OpenCV script:", OPENCV_URL);
            GM_xmlhttpRequest({
                method: "GET",
                url: OPENCV_URL,
                onload: function(response) {
                    if (response.status >= 200 && response.status < 300) {
                        console.log("OpenCV script fetched successfully. Injecting...");
                        updateTemporaryLoadingIndicator(loadingIndicator, "Initializing OpenCV (WASM)...");

                        const script = document.createElement('script');
                        script.textContent = response.responseText;
                        // Append to head to execute in page scope where Module is defined
                        (document.head || document.documentElement).appendChild(script);
                        // Note: Execution is asynchronous, rely on onRuntimeInitialized
                        script.remove(); // Clean up the script tag itself
                        console.log("OpenCV script injected. Waiting for onRuntimeInitialized...");
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

     // --- Temporary Loading Indicator Helpers ---
     function showTemporaryLoadingIndicator(message) {
         let indicator = document.getElementById('floorplan-loading-indicator');
         if (!indicator) {
             indicator = document.createElement('div');
             indicator.id = 'floorplan-loading-indicator';
             indicator.style.display = 'block'; // Make it visible
             document.body.appendChild(indicator);
         }
         indicator.textContent = message;
         indicator.style.display = 'block';
         return indicator;
     }

     function updateTemporaryLoadingIndicator(indicator, message) {
         if (indicator) {
             indicator.textContent = message;
         }
     }

     function hideTemporaryLoadingIndicator(indicator) {
         if (indicator) {
             indicator.style.display = 'none';
             // Optionally remove if it's only for initial load:
             // indicator.remove();
         }
     }


    // --- Floorplan SVG Creator Class --- (Same as before, no changes needed)
    class FloorplanCreator {
        svgContainer = null; svg = null; svgGroup = null; contourData = []; d3 = null; zoom = null;
        POLYGON_FILL = 'rgba(100, 150, 255, 0.7)'; POLYGON_STROKE = '#d0d0ff'; POLYGON_STROKE_WIDTH = 1;
        DRAGGING_STROKE = 'yellow'; DRAGGING_STROKE_WIDTH = 1.5; CONTAINER_ID = 'floorplan-svg-container'; parentContainer = null;

        constructor(contoursData, d3Instance, parentContainer) {
            if (!contoursData || !d3Instance || !parentContainer) throw new Error("FloorplanCreator requires contour data, D3 instance, and parent container.");
            // Use the d3 instance passed from the global scope
            this.d3 = d3Instance;
            this.contourData = contoursData;
            this.parentContainer = parentContainer;
             console.log("FloorplanCreator initialized with D3:", this.d3);
        }

        render() {
            const self = this;
            return new Promise((resolve, reject) => {
                // Use setTimeout to yield, ensuring DOM is ready for D3 manipulation
                setTimeout(() => {
                    try {
                        if (!self.d3) {
                            throw new Error("D3 instance is not available in FloorplanCreator render.");
                        }
                        self.destroy(); // Clear previous SVG

                        self.svgContainer = document.createElement('div');
                        self.svgContainer.id = self.CONTAINER_ID;
                        self.svgContainer.style.display = 'none'; // Hide until ready

                        const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                        self.svg = self.d3.select(svgElement); // Use D3

                        self.svgGroup = self.svg.append('g').attr('id', 'floorplan-shapes');

                        // --- D3 Data Binding ---
                         console.log(`Rendering ${self.contourData.length} contours.`);
                        self.svgGroup.selectAll('.floorplan-polygon')
                            .data(self.contourData, d => d.id) // Use unique ID for object constancy
                            .enter()
                            .append('polygon')
                            .attr('class', 'floorplan-polygon')
                            .attr('points', d => d.points.map(p => `${p.x},${p.y}`).join(' '))
                            .style('fill', self.POLYGON_FILL)
                            .style('stroke', self.POLYGON_STROKE)
                            .style('stroke-width', self.POLYGON_STROKE_WIDTH)
                            .attr('transform', d => d.transform || null) // Apply existing transform if any
                            .call(self.setupDrag()); // Apply drag behavior from D3
                         // --- End D3 Data Binding ---

                        // Insert SVG container into the main UI container
                        // Ensure it's inserted before the status label for layout
                        const statusLabelElement = self.parentContainer.querySelector('#floorplan-status');
                        if (statusLabelElement) {
                            self.parentContainer.insertBefore(self.svgContainer, statusLabelElement);
                        } else {
                            self.parentContainer.appendChild(self.svgContainer); // Fallback append
                        }
                         self.svgContainer.appendChild(svgElement);


                        // Setup Zoom after elements are added
                        self.setupZoom(); // Setup D3 zoom
                        self.svg.call(self.zoom); // Apply zoom listener


                        self.svgContainer.style.display = 'block'; // Make SVG visible *after* setup

                        console.log("FloorplanCreator: SVG rendered asynchronously.");
                        resolve(); // Resolve the promise when rendering is complete

                    } catch (error) {
                        console.error("FloorplanCreator: Error during async render.", error);
                        reject(error); // Reject the promise on error
                    }
                }, 0); // setTimeout 0 yields execution, allows D3 select to work reliably
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
             if (!this.d3) { console.error("D3 missing in setupDrag"); return () => {}; } // Return no-op if d3 missing
            const creatorInstance = this; // Capture 'this' context
            return this.d3.drag()
                .on('start', function(event, d) {
                    // 'this' refers to the DOM element being dragged
                    creatorInstance.d3.select(this).raise().classed('dragging', true)
                         .style('stroke', creatorInstance.DRAGGING_STROKE)
                         .style('stroke-width', creatorInstance.DRAGGING_STROKE_WIDTH);
                    console.log("Drag start:", d.id);
                })
                .on('drag', function(event, d) {
                     // Get current transform or default to none
                    const currentTransform = d3.select(this).attr('transform') || "";
                    let currentX = 0, currentY = 0;

                     // Extract existing translate values if present
                    const match = currentTransform.match(/translate\(([^,]+),([^)]+)\)/);
                    if (match) {
                        currentX = parseFloat(match[1]);
                        currentY = parseFloat(match[2]);
                    }

                    // Calculate new position
                    const newX = currentX + event.dx;
                    const newY = currentY + event.dy;

                    // Apply the new translation
                    d3.select(this).attr('transform', `translate(${newX}, ${newY})`);

                     // OPTIONAL: Update the data object if you need to persist the position
                     // d.transform = `translate(${newX}, ${newY})`;
                })
                .on('end', function(event, d) {
                    creatorInstance.d3.select(this).classed('dragging', false)
                         .style('stroke', creatorInstance.POLYGON_STROKE)
                         .style('stroke-width', creatorInstance.POLYGON_STROKE_WIDTH);
                     console.log("Drag end:", d.id);
                });
        }

        destroy() {
            if (this.svgContainer) {
                 // Clean up D3 event listeners
                if (this.svg) this.svg.on('.zoom', null); // Remove zoom listeners
                if (this.svgGroup) this.svgGroup.selectAll('.floorplan-polygon').on('.drag', null); // Remove drag listeners

                this.svgContainer.remove();
                this.svgContainer = null;
                this.svg = null;
                this.svgGroup = null;
                this.zoom = null; // Clear zoom behavior object
                console.log("FloorplanCreator: SVG destroyed.");
            }
        }
    }


    // --- Base Floorplan Processor Class ---
    class FloorplanProcessor {
        // Config
        CANVAS_WIDTH = 800; CANVAS_HEIGHT = 600; CANNY_THRESHOLD1 = 50; CANNY_THRESHOLD2 = 100; MIN_CONTOUR_AREA = 50;

        // State
        cv = null; // Will be populated by loadOpenCV
        d3 = null; // Will be populated by @require
        librariesReady = false;
        uiCreated = false;

        // UI Refs
        container = null; controlsDiv = null; fileInput = null; statusLabel = null;
        canvas = null; canvasCtx = null; canvasLabel = null; closeButton = null;
        loadingIndicator = null; // For the main UI loading indicator

        constructor() {
            // D3 should be available globally thanks to @require
            if (typeof d3 !== 'undefined') {
                 this.d3 = d3;
                 console.log("D3 library found:", this.d3.version);
            } else {
                console.error("FATAL: D3 library not found. @require might have failed.");
                // Show an error message to the user immediately
                showTemporaryLoadingIndicator("Error: D3 library failed to load!");
            }
        }

        // Removed show/hide/updateLoadingIndicator - using temporary ones now

        async initialize() {
             this.loadingIndicator = showTemporaryLoadingIndicator("Initializing...");
             try {
                  if (!this.d3) {
                      throw new Error("D3 not loaded, cannot proceed.");
                  }
                  console.log("Starting OpenCV load...");
                  this.cv = await loadOpenCV(); // Wait for manual load
                  console.log("OpenCV loaded successfully, cv object:", this.cv);
                  this.librariesReady = true;
                  updateTemporaryLoadingIndicator(this.loadingIndicator, "Libraries ready.");
                  this.startUI();

             } catch (error) {
                  console.error("Initialization failed:", error);
                  updateTemporaryLoadingIndicator(this.loadingIndicator, `Error: ${error.message}`);
                  // Maybe add a retry button or more info here
             }
        }


        startUI() {
            if (!this.librariesReady) {
                console.error("FloorplanProcessor: startUI called before libraries were ready.");
                updateTemporaryLoadingIndicator(this.loadingIndicator, "Error: Libraries not ready.");
                return false;
            }
            if (this.uiCreated) {
                console.warn("FloorplanProcessor: startUI called but UI already exists.");
                this.container.style.display = 'flex'; // Ensure visible if called again
                return false;
            }

            console.log("FloorplanProcessor: Creating UI...");
             hideTemporaryLoadingIndicator(this.loadingIndicator); // Hide the initial loader
            this.createBaseUI();
            this.container.style.display = 'flex'; // Show the main container
            this.updateStatus("Ready. Select an image file.");
            console.log("FloorplanProcessor: Base UI created and displayed.");
            return true;
        }

        createBaseUI() {
            if (this.container) { // Avoid creating duplicates
                 console.warn("UI already created, skipping.");
                 return;
            }
            this.container = document.createElement('div');
            this.container.id = 'floorplan-container';
            // container starts hidden via CSS, shown in startUI

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

            this.closeButton = document.createElement('button');
            this.closeButton.id = 'floorplan-close-btn';
            this.closeButton.textContent = '✕'; // Use a proper close symbol
            this.closeButton.title = 'Close'; // Tooltip

            this.canvas = document.createElement('canvas');
            this.canvas.id = 'floorplan-canvas';
            // Set initial size, might be adjusted by processImage
            this.canvas.width = this.CANVAS_WIDTH;
            this.canvas.height = this.CANVAS_HEIGHT;
            this.canvasCtx = this.canvas.getContext('2d');

            this.canvasLabel = document.createElement('div');
            this.canvasLabel.id = 'floorplan-canvas-label';
            this.canvasLabel.textContent = "Upload an image to see the detected shape preview.";

            this.statusLabel = document.createElement('span');
            this.statusLabel.id = 'floorplan-status';
            this.statusLabel.textContent = 'Initializing...'; // Initial status

            // Append elements to the container
            this.container.appendChild(this.closeButton);
            this.container.appendChild(this.controlsDiv);
            this.container.appendChild(this.canvas);
            this.container.appendChild(this.canvasLabel);
            // SVG container will be inserted here by FloorplanCreator
            this.container.appendChild(this.statusLabel);

            document.body.appendChild(this.container);
            this.uiCreated = true;
            console.log("FloorplanProcessor: Base UI DOM elements created.");

             // Add event listeners (moved here from Manager)
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
        }

        updateStatus(message) {
            if (this.statusLabel) {
                this.statusLabel.textContent = message;
            }
            console.log("Floorplan Status:", message);
        }

         // --- Image Processing (Async) ---
         processImage(imgElement) {
            const self = this; // Capture context for promise/setTimeout

             return new Promise((resolve, reject) => {
                 if (!self.cv) {
                     return reject(new Error("OpenCV (cv object) is not available for processing."));
                 }
                 if (!imgElement || !(imgElement instanceof HTMLImageElement)) {
                      return reject(new Error("Invalid image element provided to processImage."));
                 }

                 console.log("Processing image with OpenCV...");

                 // Use setTimeout to make the OpenCV part truly async and yield CPU
                 setTimeout(() => {
                     let src = null, gray = null, edges = null, contours = null, hierarchy = null;
                     let displayMat = null;
                     const formattedContours = [];

                     try {
                         // Get the cv instance
                         const cv = self.cv;

                         // Read image data into OpenCV Mat object
                         src = cv.imread(imgElement);
                         if (src.empty()) {
                             throw new Error("cv.imread failed, source matrix is empty.");
                         }
                         console.log(`Image loaded: ${src.cols}x${src.rows}`);


                         // --- Canvas Preview Handling ---
                         // Calculate scaling factor to fit canvas preview
                         const scale = Math.min(self.CANVAS_WIDTH / src.cols, self.CANVAS_HEIGHT / src.rows);
                         const dsize = new cv.Size(Math.round(src.cols * scale), Math.round(src.rows * scale));

                         displayMat = new cv.Mat();
                         cv.resize(src, displayMat, dsize, 0, 0, cv.INTER_AREA); // Resize for preview

                         // Display the resized image on the canvas
                         if (self.canvas && self.canvasCtx) {
                             // Adjust canvas size to match the preview image
                             self.canvas.width = displayMat.cols;
                             self.canvas.height = displayMat.rows;
                             self.canvasCtx.clearRect(0, 0, self.canvas.width, self.canvas.height); // Clear previous
                             cv.imshow(self.canvas, displayMat); // Display using OpenCV's helper
                              console.log("Preview shown on canvas.");
                         } else {
                              console.warn("Canvas or context not available for preview.");
                         }
                         // --- End Canvas Preview ---


                         // --- OpenCV Contour Detection (on original image data for accuracy) ---
                         gray = new cv.Mat();
                         cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY); // Convert to grayscale

                         cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT); // Blur

                         edges = new cv.Mat();
                         cv.Canny(gray, edges, self.CANNY_THRESHOLD1, self.CANNY_THRESHOLD2); // Edge detection

                         contours = new cv.MatVector(); // To store contours
                         hierarchy = new cv.Mat(); // For contour hierarchy info

                         // Find contours - RETR_EXTERNAL gets only outer contours
                         // CHAIN_APPROX_SIMPLE compresses segments (saves memory)
                         cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
                         console.log(`Found ${contours.size()} raw contours.`);
                         // --- End Contour Detection ---


                         // --- Format and Scale Contours for SVG/Display ---
                         for (let i = 0; i < contours.size(); ++i) {
                             const contour = contours.get(i);
                             const area = cv.contourArea(contour);

                             // Filter small contours (area threshold applied to original scale)
                              // Also ensure contour has at least 3 points for a polygon
                             if (area < self.MIN_CONTOUR_AREA || contour.rows < 3) {
                                 contour.delete(); // Clean up memory
                                 continue;
                             }

                             const pointsArray = [];
                             const pointData = contour.data32S; // Access contour point data (signed 32-bit integers, x/y pairs)

                             for (let j = 0; j < contour.rows; ++j) {
                                 // Scale points to match the display size used for the canvas/SVG
                                 pointsArray.push({
                                     x: Math.round(pointData[j * 2] * scale),     // X coordinate * scale
                                     y: Math.round(pointData[j * 2 + 1] * scale)  // Y coordinate * scale
                                 });
                             }

                              // Store formatted contour data
                             formattedContours.push({
                                  id: `contour-${Date.now()}-${i}`, // More unique ID
                                  points: pointsArray,
                                  // originalArea: area // Optionally store original area
                             });

                             contour.delete(); // Clean up memory for this contour Mat
                         }
                         // --- End Formatting ---

                         console.log(`Formatted ${formattedContours.length} contours asynchronously.`);
                         resolve(formattedContours); // Resolve promise with the formatted data

                     } catch (error) {
                         console.error("OpenCV Error during async image processing:", error);
                         reject(error); // Reject promise on error
                     } finally {
                         // --- OpenCV Memory Management ---
                         // Crucial to prevent memory leaks in WASM
                         if (src) src.delete();
                         if (gray) gray.delete();
                         if (edges) edges.delete();
                         if (contours) contours.delete(); // Deletes the MatVector itself
                         if (hierarchy) hierarchy.delete();
                         if (displayMat) displayMat.delete();
                         console.log('OpenCV Mats from processImage cleaned up.');
                         // --- End Memory Management ---
                     }
                 }, 0); // setTimeout 0 yields execution
             });
         }


          // --- UI Interaction Methods --- (Moved from Manager)
          handleFileChange(e) {
              if (!this.librariesReady || !this.uiCreated) {
                  console.warn("handleFileChange called before ready or UI created.");
                  return;
              }

              const file = e.target.files[0];
              if (!file || !file.type.startsWith('image/')) {
                  this.updateStatus('Error: Please select a valid image file.');
                   this.showCanvas(); // Show canvas even on error
                   if (this.floorplanCreatorInstance) { // Use the instance defined in the derived class
                       this.floorplanCreatorInstance.destroy();
                       this.floorplanCreatorInstance = null;
                   }
                  return;
              }

              this.updateStatus('Reading file...');
              const reader = new FileReader();

              reader.onload = (event) => {
                  const imgElement = document.createElement('img');
                  imgElement.onload = () => {
                      this.updateStatus('Processing image (please wait)...');
                      this.showCanvas(); // Ensure canvas is visible for preview

                      // --- Use requestAnimationFrame for smoother UI updates ---
                      requestAnimationFrame(async () => { // Make the callback async
                          let contoursData = [];
                          try {
                              console.time("ProcessingTime");
                              // 1. Await Asynchronous Image Processing
                              this.updateStatus('Detecting shapes...');
                              contoursData = await this.processImage(imgElement); // Await the promise
                              console.timeEnd("ProcessingTime");

                              this.updateCanvasLabel(contoursData.length);

                              // 2. Destroy previous SVG synchronously (quick operation)
                              if (this.floorplanCreatorInstance) {
                                  this.floorplanCreatorInstance.destroy();
                                  this.floorplanCreatorInstance = null;
                              }

                              // 3. Create and Await Asynchronous SVG Rendering
                              if (contoursData.length > 0) {
                                  this.updateStatus(`Found ${contoursData.length} shapes. Creating SVG...`);
                                  // Pass the d3 instance we stored
                                  this.floorplanCreatorInstance = new FloorplanCreator(contoursData, this.d3, this.container);

                                  console.time("RenderingTime");
                                  await this.floorplanCreatorInstance.render(); // Await the render promise
                                  console.timeEnd("RenderingTime");

                                  // 4. Hide Canvas, Show SVG (after rendering finishes)
                                  this.hideCanvas(); // Hide preview canvas
                                  this.updateStatus(`SVG created with ${contoursData.length} shapes. Ready.`);
                              } else {
                                  this.updateStatus("No suitable shapes found. Showing preview.");
                                  this.showCanvas(); // Keep canvas visible if no SVG
                              }

                          } catch (error) {
                              console.error("FloorplanManager: Error during async image handling:", error);
                              this.updateStatus(`Error: ${error.message}. Check console.`);
                              this.showCanvas(); // Ensure canvas visible on error
                              // Clean up SVG instance if creation failed partially
                              if (this.floorplanCreatorInstance) {
                                  this.floorplanCreatorInstance.destroy();
                                  this.floorplanCreatorInstance = null;
                              }
                          } finally {
                              // Clean up object URL
                              if (imgElement.src.startsWith('blob:')) {
                                   URL.revokeObjectURL(imgElement.src);
                                   console.log("Revoked object URL");
                              }
                          }
                      }); // End requestAnimationFrame callback
                  }; // End img.onload

                  imgElement.onerror = () => {
                       this.updateStatus('Error loading image data into image element.');
                       this.showCanvas(); // Ensure canvas is visible
                  };

                  // Use the result from FileReader
                  imgElement.src = event.target.result; // event.target here refers to the FileReader

              }; // End reader.onload

              reader.onerror = () => {
                  this.updateStatus('Error reading file.');
                  this.showCanvas(); // Ensure canvas is visible
              };

              reader.readAsDataURL(file); // Read the file as a Data URL
          }

          showCanvas() {
              if (this.canvas) this.canvas.style.display = 'block';
              if (this.canvasLabel) this.canvasLabel.style.display = 'block';
              // Hide SVG container if showing canvas
              if (this.floorplanCreatorInstance && this.floorplanCreatorInstance.svgContainer) {
                  this.floorplanCreatorInstance.svgContainer.style.display = 'none';
              }
              console.log("Canvas shown");
          }

          hideCanvas() {
              if (this.canvas) this.canvas.style.display = 'none';
              if (this.canvasLabel) this.canvasLabel.style.display = 'none';
              console.log("Canvas hidden");
          }

          updateCanvasLabel(count) {
              if (this.canvasLabel) {
                  if (count > 0) {
                      this.canvasLabel.textContent = `Preview: ${count} raw shape(s) detected.`;
                  } else {
                      this.canvasLabel.textContent = "Preview: No distinct shapes detected.";
                  }
              }
          }

         closeUI() {
             console.log("Closing UI...");
             // Destroy SVG first if it exists (logic is now in the derived class)
             if (this.floorplanCreatorInstance) {
                  this.floorplanCreatorInstance.destroy();
                  this.floorplanCreatorInstance = null;
             }

             if (this.container) {
                 // Remove event listeners maybe? (Often handled by node removal)
                 this.container.remove();
                 this.container = null; // Clear reference
                 this.uiCreated = false;
                 console.log("FloorplanProcessor: UI Closed and resources released.");
             }
             // Reset state if needed
             this.librariesReady = false;
             this.cv = null;
             // this.d3 might still be globally available, but reset internal ref
             this.d3 = null;
         }
    }

    // --Floorplan Manager Class (Orchestrator)--
    // Now mainly responsible for initiating the process and holding the SVG creator instance
    class FloorplanManager extends FloorplanProcessor {
        floorplanCreatorInstance = null; // Specific to the manager

        constructor() {
            super(); // Calls FloorplanProcessor constructor (gets D3)
            console.log("FloorplanManager: Initializing...");
            // Initialize method now handles loading and UI creation
            this.initialize().catch(err => {
                 console.error("FloorplanManager failed to initialize:", err);
                 // The error message should already be on the temp indicator
            });
        }

         // Override closeUI to ensure the creator instance is handled correctly
         // The base class already calls this.floorplanCreatorInstance.destroy()
         // so we might not need to override unless there's manager-specific cleanup.
         // closeUI() {
         //      console.log("FloorplanManager specific cleanup (if any)...");
         //      super.closeUI(); // Call base class method to handle common cleanup
         // }

         // Override handleFileChange ONLY if manager needs specific logic
         // Otherwise, the base class implementation is sufficient.
         // handleFileChange(e) {
         //      console.log("Manager handling file change...");
         //      super.handleFileChange(e); // Call base implementation
         // }
    }

    // --- Instantiate the Manager ---
    // Ensures the script starts executing when loaded
    console.log("Instantiating FloorplanManager...");
    new FloorplanManager();

})();