// ==UserScript==
// @name         Floorplan Manager (Iframe OpenCV)
// @version      1.0.1.
// @description  Uses an iframe to load and run OpenCV, communicating via postMessage.
// @author       ZLudany
// @match        https://home.google.com/*
// @grant        GM_addStyle
// @require      https://d3js.org/d3.v7.min.js
// @require      https://d3js.org/d3-drag.v3.min.js
// @require      https://d3js.org/d3-zoom.v3.min.js
// ==/UserScript==

(function() {
    'use strict';
    console.log("--- Floorplan Manager (Iframe Strategy) Execution Starting ---");

    // --- Constants ---
    const IFRAME_ID = 'opencv-processor-iframe';
    const OPENCV_URL = 'https://docs.opencv.org/4.5.4/opencv.js'; // Used inside iframe script

    // --- CSS Styles --- (Parent UI Styles)
    GM_addStyle(`
        #floorplan-container { /* ... High z-index, display: none initially ... */ }
        #floorplan-loading-indicator { /* ... High z-index, display: none initially ... */ }
        /* ... All other parent UI styles ... */
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
    `);

    // --- Iframe Content (HTML + JS) ---
    // This string contains the entire document that will run inside the iframe
    const iframeContent = `
<!DOCTYPE html>
<html>
<head>
    <title>OpenCV Processor</title>
    <meta charset="UTF-8">
    <style>
        body { margin: 0; padding: 0; background-color: #111; color: #eee; font-family: sans-serif; font-size: 10px; }
        #iframe-status { padding: 5px; background-color: #333; }
        #processing-canvas { display: none; } /* Hidden canvas for processing */
    </style>
</head>
<body>
    <div id="iframe-status">Iframe Processor: Initializing...</div>
    <canvas id="processing-canvas"></canvas> <!-- Canvas needed for imread -->

    <script>
        const OPENCV_URL = '${OPENCV_URL}'; // Get URL from parent template literal
        const PARENT_ORIGIN = '${window.location.origin}'; // Get parent origin for postMessage security

        function updateIframeStatus(message) {
            const statusEl = document.getElementById('iframe-status');
            if (statusEl) statusEl.textContent = "Iframe: " + message;
            alert("Iframe Status:", message); // Log within iframe console
        }

        // Simple script loader within iframe
        function loadScript(url) {
            updateIframeStatus("Loading OpenCV script: " + url);
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
                    updateIframeStatus("Error loading OpenCV script tag.");
                    console.error("Iframe script load error:", err);
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
                     console.error("Iframe: Processing canvas not found!");
                     this.sendMessageToParent('processing_error', { message: "Iframe internal error: Canvas missing." });
                }

                // Define Module object *before* loading the script
                window.Module = {
                    onRuntimeInitialized: this.onCvReady.bind(this),
                    // printErr: (text) => { console.error("Iframe OpenCV stderr:", text); }, // Optional debug
                    onAbort: (reason) => {
                         console.error("Iframe OpenCV WASM Aborted:", reason);
                         updateIframeStatus("Fatal Error: OpenCV WASM Aborted: " + reason);
                         this.sendMessageToParent('processing_error', { message: "OpenCV WASM Aborted: " + reason });
                         this.isReady = false; // Ensure not marked as ready
                    }
                };
                updateIframeStatus("Module defined. Attempting to load OpenCV script...");
                loadScript(OPENCV_URL).catch(error => {
                    updateIframeStatus("OpenCV script load failed: " + error.message);
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
                    console.error("Iframe: onRuntimeInitialized called, but cv or cv.imread is invalid!");
                    updateIframeStatus("Error: OpenCV loaded but invalid.");
                    this.sendMessageToParent('processing_error', { message: "OpenCV loaded in iframe but was invalid." });
                }
            }

            sendMessageToParent(type, data = {}) {
                console.log(\`Iframe: Sending message to parent: \${type}\`, data);
                // Use PARENT_ORIGIN for security if possible, fallback to '*' if issues arise
                window.parent.postMessage({ type: type, payload: data }, PARENT_ORIGIN);
                // window.parent.postMessage({ type: type, payload: data }, '*'); // Less secure fallback
            }

            async processImageBlob(imageBlob) {
                updateIframeStatus("Received image blob for processing.");
                if (!this.isReady || !this.cv || !this.processingCanvas || !this.processingCtx) {
                    console.error("Iframe: Not ready or missing components for processing.");
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

                    // Draw image to hidden canvas to use cv.imread
                    this.processingCanvas.width = imgElement.naturalWidth;
                    this.processingCanvas.height = imgElement.naturalHeight;
                    this.processingCtx.drawImage(imgElement, 0, 0);
                    updateIframeStatus("Image drawn to processing canvas.");

                    // --- OpenCV Processing ---
                    const cv = this.cv;
                    src = cv.imread(this.processingCanvas); // Read from canvas
                    if (src.empty()) throw new Error("cv.imread failed from canvas.");

                    // Calculate scale relative to some reference (e.g., 800x600) or just return raw points?
                    // Let's return points relative to original image size for now, parent can scale if needed.
                    // const scale = 1.0; // Or calculate based on desired output size

                    gray = new cv.Mat();
                    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
                    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
                    edges = new cv.Mat();
                    cv.Canny(gray, edges, 50, 100); // Example thresholds
                    contours = new cv.MatVector();
                    hierarchy = new cv.Mat();
                    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
                    updateIframeStatus(\`Found \${contours.size()} raw contours.\`);

                    const minArea = 50; // Example minimum area

                    for (let i = 0; i < contours.size(); ++i) {
                        const contour = contours.get(i);
                        try {
                             const area = cv.contourArea(contour);
                             if (area < minArea || contour.rows < 3) continue;

                             const pointsArray = [];
                             const pointData = contour.data32S;
                             for (let j = 0; j < contour.rows; ++j) {
                                 // Return original coordinates (no scaling here)
                                 pointsArray.push({ x: pointData[j * 2], y: pointData[j * 2 + 1] });
                             }
                             formattedContours.push({ id: \`iframe-contour-\${Date.now()}-\${i}\`, points: pointsArray });
                        } finally {
                             if(contour) contour.delete();
                        }
                    }
                    updateIframeStatus(\`Processed \${formattedContours.length} valid contours.\`);
                    this.sendMessageToParent('processing_complete', { contours: formattedContours, originalWidth: imgElement.naturalWidth, originalHeight: imgElement.naturalHeight });

                } catch (error) {
                    console.error("Iframe processing error:", error);
                    updateIframeStatus("Error during processing: " + error.message);
                    this.sendMessageToParent('processing_error', { message: "Error in iframe processing: " + error.message });
                } finally {
                    // OpenCV Memory Cleanup
                    if (src) src.delete(); if (gray) gray.delete(); if (edges) edges.delete();
                    if (contours) contours.delete(); if (hierarchy) hierarchy.delete();
                    // Blob URL Cleanup
                    if (blobUrl) URL.revokeObjectURL(blobUrl);
                     console.log("Iframe: OpenCV Mats and Blob URL cleaned up.");
                }
            }

            // Helper to load image from URL (handles async nature)
            loadImageFromUrl(url) {
                return new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = (err) => reject(new Error("Failed to load image from Blob URL in iframe."));
                    img.src = url;
                });
            }
        } // End OpenCVProcessor Class

        // --- Iframe Global Scope ---
        let processorInstance = null;

        window.addEventListener('message', (event) => {
            // --- SECURITY: Check message origin ---
            // Only accept messages from the parent window's origin
             if (event.origin !== PARENT_ORIGIN) {
                 console.warn(\`Iframe: Discarding message from unexpected origin: \${event.origin}\`);
                 return;
             }

            console.log("Iframe received message:", event.data);
            const message = event.data;

            if (message && message.type === 'process_image_blob' && message.payload && message.payload.imageBlob instanceof Blob) {
                if (processorInstance && processorInstance.isReady) {
                    processorInstance.processImageBlob(message.payload.imageBlob);
                } else {
                    console.error("Iframe: Received image blob but processor is not ready.");
                     // Send error back to parent
                     window.parent.postMessage({ type: 'processing_error', payload: { message: "Iframe processor not ready to handle image." } }, PARENT_ORIGIN);
                }
            } else {
                 console.warn("Iframe: Received unknown message format:", message);
            }
        });

        // Initialize the processor
        try {
            processorInstance = new OpenCVProcessor();
        } catch (error) {
             console.error("Iframe: Failed to instantiate OpenCVProcessor:", error);
             // Try to notify parent if possible
             window.parent.postMessage({ type: 'processing_error', payload: { message: "Iframe failed to initialize processor: " + error.message } }, PARENT_ORIGIN);
             updateIframeStatus("Fatal Error: Failed to initialize processor: " + error.message);
        }

    </script>
</body>
</html>
`; // End iframeContent template literal


    // --- Floorplan SVG Creator Class (Parent Scope) ---
    // (Identical to previous versions, handles D3 rendering in parent)
    class FloorplanCreator {
        svgContainer = null; svg = null; svgGroup = null; contourData = []; d3 = null; zoom = null;
        POLYGON_FILL = 'rgba(100, 150, 255, 0.7)'; POLYGON_STROKE = '#d0d0ff'; POLYGON_STROKE_WIDTH = 1;
        DRAGGING_STROKE = 'yellow'; DRAGGING_STROKE_WIDTH = 1.5; CONTAINER_ID = 'floorplan-svg-container'; parentContainer = null;
        targetWidth = 800; targetHeight = 600; // Target size for scaling SVG

        constructor(parentContainerRef, d3Instance, targetWidth = 800, targetHeight = 600) {
            if (!parentContainerRef) throw new Error("FloorplanCreator requires parent container reference.");
            if (!d3Instance) throw new Error("FloorplanCreator requires D3 instance.");
            this.parentContainer = parentContainerRef;
            this.d3 = d3Instance;
            this.targetWidth = targetWidth;
            this.targetHeight = targetHeight;
            console.log("FloorplanCreator initialized in parent.");
        }

        // New method to update data and render
        renderContourData(contourData, originalWidth, originalHeight) {
             if (!contourData) {
                 console.warn("FloorplanCreator: No contour data provided to render.");
                 this.destroy(); // Clear any previous SVG
                 return Promise.resolve(); // Return resolved promise as nothing to render
             }
             console.log(`FloorplanCreator: Received ${contourData.length} contours from iframe. Original size: ${originalWidth}x${originalHeight}`);
             this.contourData = this.scaleContours(contourData, originalWidth, originalHeight);
             return this.render(); // Call the existing render method
        }

        // Scale contours received from iframe to fit the target display area
        scaleContours(rawContours, originalWidth, originalHeight) {
            if (!originalWidth || !originalHeight) {
                 console.warn("Cannot scale contours: Original dimensions missing.");
                 return rawContours; // Return unscaled
            }
            // Calculate scale factor based on target size
             const scaleX = this.targetWidth / originalWidth;
             const scaleY = this.targetHeight / originalHeight;
             const scale = Math.min(scaleX, scaleY); // Maintain aspect ratio

             console.log(`Scaling contours by factor: ${scale.toFixed(3)} (Target: ${this.targetWidth}x${this.targetHeight})`);

             return rawContours.map(contour => ({
                 ...contour, // Keep id, etc.
                 points: contour.points.map(p => ({
                     x: Math.round(p.x * scale),
                     y: Math.round(p.y * scale)
                 }))
             }));
        }


        render() { // Renders this.contourData
            const self = this;
            return new Promise((resolve, reject) => {
                setTimeout(() => {
                    try {
                        if (!self.d3) throw new Error("D3 missing in render.");
                        if (!self.parentContainer || !document.contains(self.parentContainer)) throw new Error("Parent container missing/detached in render.");
                        if (!self.contourData || self.contourData.length === 0) {
                             console.log("FloorplanCreator: No scaled contours to render.");
                             self.destroy(); // Ensure no old SVG remains
                             return resolve(); // Nothing to do
                        }

                        self.destroy(); // Clear previous SVG first

                        self.svgContainer = document.createElement('div');
                        self.svgContainer.id = self.CONTAINER_ID;

                        const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                        // Set viewBox for scaling? Let CSS handle size for now.
                        // svgElement.setAttribute('viewBox', `0 0 ${self.targetWidth} ${self.targetHeight}`);
                        self.svg = self.d3.select(svgElement);

                        self.svgGroup = self.svg.append('g').attr('id', 'floorplan-shapes');

                        // console.log("Rendering scaled contours:", self.contourData);
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
                        else { self.parentContainer.appendChild(self.svgContainer); }
                        self.svgContainer.appendChild(svgElement);

                        self.setupZoom();
                        if (self.zoom) { self.svg.call(self.zoom); }

                        self.svgContainer.style.display = 'block';
                        console.log("FloorplanCreator: SVG rendered successfully.");
                        resolve();
                    } catch (error) { console.error("FloorplanCreator: Error during SVG render.", error); reject(error); }
                }, 0);
            });
        }
        setupZoom() { /* ... same ... */ }
        setupDrag() { /* ... same ... */ }
        destroy() { /* ... same ... */ }
    } // End FloorplanCreator Class


    // --- Floorplan Manager Class (Parent Scope) ---
    // Manages UI, Iframe communication, and uses FloorplanCreator for rendering
    class FloorplanManager extends FloorplanCreator { // Extending Creator as requested
        // State
        iframe = null;
        isIframeReady = false;
        currentBlobUrl = null; // Keep track for cleanup

        // UI Refs (inherited or specific)
        container = null; controlsDiv = null; fileInput = null; statusLabel = null;
        canvas = null; canvasCtx = null; canvasLabel = null; closeButton = null;
        loadingIndicator = null; // For the main UI loading indicator

        constructor() {
            console.log("FloorplanManager constructor started.");
            // Call FloorplanCreator constructor first - needs a parent container ref immediately.
            // We'll create a temporary placeholder, then the real one. This is awkward due to extension choice.
            // Let's postpone creator init until UI is built.

            // Check D3 dependency (crucial)
             if (typeof d3 === 'undefined' || !d3) {
                console.error("FATAL: FloorplanManager requires D3. @require failed?");
                this.showLoadingIndicator("Error: D3 Library Failed!");
                throw new Error("D3 library failed to load.");
            }
             // Initialize properties needed before super() call (none here)
             console.log("FloorplanManager: D3 found. Preparing UI and Iframe.");

             // Don't call super() yet. Initialize properties first.
             this.iframe = null;
             this.isIframeReady = false;
             this.currentBlobUrl = null;
             this.container = null; // etc.

            // Now, initialize the UI structure first, which provides the parent container
            this.createBaseUI(); // Create main UI elements including this.container

            // Initialize the FloorplanCreator part (super class constructor) AFTER container exists
            // Pass the container, d3, and desired render size
            super(this.container, d3, 800, 600); // Calls FloorplanCreator constructor
             console.log("FloorplanManager: FloorplanCreator part (superclass) initialized.");


            this.showLoadingIndicator("Initializing OpenCV Processor (Iframe)...");
            this.setupIframe();
            this.setupMessageListener();
            alert("FloorplanManager constructor finished.");
        }

        // --- Loading Indicator Management --- (Copied from previous Processor)
         showLoadingIndicator(message = "Loading...") {
             // Use this.loadingIndicator ref
             if (!this.loadingIndicator) {
                 this.loadingIndicator = document.getElementById('floorplan-loading-indicator');
                 if (!this.loadingIndicator) {
                     this.loadingIndicator = document.createElement('div');
                     this.loadingIndicator.id = 'floorplan-loading-indicator';
                      // Append high in DOM
                      const rootEl = document.documentElement || document.body;
                      if(rootEl) rootEl.appendChild(this.loadingIndicator);
                     console.log("Manager's loading indicator created.");
                 }
             }
             this.loadingIndicator.textContent = message;
             this.loadingIndicator.style.display = 'block'; // Make visible
             console.log("Manager's loading indicator shown:", message);
         }
         hideLoadingIndicator() {
             if (this.loadingIndicator) {
                 this.loadingIndicator.style.display = 'none';
                 console.log("Manager's loading indicator hidden.");
             }
         }
         updateLoadingIndicator(message) {
             if (this.loadingIndicator && this.loadingIndicator.style.display === 'block') {
                 this.loadingIndicator.textContent = message;
                 console.log("Manager's loading indicator updated:", message);
             } else if (this.uiCreated && this.statusLabel) {
                 // If main UI is up, update its status label
                 this.updateStatus(message);
             } else {
                  console.log("Manager Status (no indicator/UI visible):", message);
             }
         }
         // --- End Loading Indicator ---


        setupIframe() {
            alert("Setting up iframe...");
            this.iframe = document.createElement('iframe');
            this.iframe.id = IFRAME_ID;
            this.iframe.src = 'about:blank';
            this.iframe.style.display = 'none'; // Keep it hidden
            document.body.appendChild(this.iframe);

            this.iframe.onload = () => {
                 alert("Iframe loaded ('about:blank'). Injecting content...");
                 try {
                     // Inject the HTML and script content
                     this.iframe.contentWindow.document.open();
                     this.iframe.contentWindow.document.write(iframeContent);
                     this.iframe.contentWindow.document.close();
                     alert("Iframe content injected.");
                     // Now wait for the 'opencv_ready' message from the iframe script
                 } catch (error) {
                      console.error("Error injecting content into iframe:", error);
                      this.updateLoadingIndicator("Error: Failed to initialize processor iframe.");
                      this.isIframeReady = false;
                 }
            };
             this.iframe.onerror = (error) => {
                  console.error("Iframe loading error (onerror):", error);
                  this.updateLoadingIndicator("Error: Processor iframe failed to load.");
                  this.isIframeReady = false;
             };
        }

        setupMessageListener() {
            console.log("Setting up parent message listener.");
            window.addEventListener('message', (event) => {
                // SECURITY: Check if the message is from our iframe
                if (!this.iframe || event.source !== this.iframe.contentWindow) {
                    // console.warn("Parent: Discarding message not from known iframe.", event.source);
                    return;
                }
                 // Optionally, double check origin if iframe src could change, but about:blank is tricky.
                 // Relying on event.source check is primary here.

                console.log("Parent received message:", event.data);
                const message = event.data;

                if (!message || !message.type) return;

                switch (message.type) {
                    case 'opencv_ready':
                        alert("Parent: Received opencv_ready message from iframe.");
                        this.isIframeReady = true;
                        this.hideLoadingIndicator(); // Hide main loader
                        this.container.style.display = 'flex'; // Show main UI
                        this.updateStatus("Ready. Select floorplan image.");
                        break;
                    case 'processing_complete':
                        alert("Parent: Received processing_complete message.");
                        this.updateStatus("Processing complete. Rendering SVG...");
                        if (message.payload && message.payload.contours) {
                            // Call the inherited render method from FloorplanCreator
                            this.renderContourData(message.payload.contours, message.payload.originalWidth, message.payload.originalHeight)
                                .then(() => {
                                     this.updateStatus(`SVG rendered with ${message.payload.contours.length} shapes.`);
                                     this.hideCanvas(); // Hide preview canvas after SVG is shown
                                })
                                .catch(error => {
                                     console.error("Parent: Error rendering SVG:", error);
                                     this.updateStatus(`Error rendering SVG: ${error.message}`);
                                     this.showCanvas(); // Show preview on error
                                });
                        } else {
                             console.warn("Parent: processing_complete message missing contour data.");
                             this.updateStatus("Processing finished, but no contour data received.");
                             this.showCanvas();
                        }
                        break;
                    case 'processing_error':
                        alert("Parent: Received processing_error message from iframe:", message.payload.message);
                        this.updateStatus(`Processing Error: ${message.payload.message}`);
                        this.showCanvas(); // Show preview canvas on error
                        this.destroy(); // Destroy any potentially partial SVG (inherited method)
                        break;
                    case 'status_update': // Optional: iframe can send status updates
                        alert("Parent: Received status_update from iframe:", message.payload.message);
                        this.updateStatus(message.payload.message); // Update parent status label
                        break;
                    default:
                        console.warn("Parent: Received unknown message type from iframe:", message.type);
                }
            });
        }

        // --- UI Related Methods (Mostly same as FloorplanProcessor) ---
        createBaseUI() {
             console.log("Manager: createBaseUI executing...");
             // Almost identical to Processor's version, but sets 'this' properties directly
            if (this.container) return; // Already created
            this.container = document.createElement('div'); this.container.id = 'floorplan-container';
            this.controlsDiv = document.createElement('div'); this.controlsDiv.id = 'floorplan-controls';
            const fileInputLabel = document.createElement('label'); fileInputLabel.textContent = 'Upload Floorplan Image:'; fileInputLabel.htmlFor = 'floorplan-file-input'; this.fileInput = document.createElement('input'); this.fileInput.type = 'file'; this.fileInput.accept = 'image/*'; this.fileInput.id = 'floorplan-file-input'; this.controlsDiv.appendChild(fileInputLabel); this.controlsDiv.appendChild(this.fileInput);
            this.closeButton = document.createElement('button'); this.closeButton.id = 'floorplan-close-btn'; this.closeButton.textContent = '✕'; this.closeButton.title = 'Close';
            this.canvas = document.createElement('canvas'); this.canvas.id = 'floorplan-canvas'; this.canvas.width = 800; this.canvas.height = 600; this.canvasCtx = this.canvas.getContext('2d'); // Canvas for preview
            this.canvasLabel = document.createElement('div'); this.canvasLabel.id = 'floorplan-canvas-label'; this.canvasLabel.textContent = "Upload image for preview & processing.";
            this.statusLabel = document.createElement('span'); this.statusLabel.id = 'floorplan-status'; this.statusLabel.textContent = 'Initializing...';
            this.container.appendChild(this.closeButton); this.container.appendChild(this.controlsDiv); this.container.appendChild(this.canvas); this.container.appendChild(this.canvasLabel);
            // Note: SVG container added by FloorplanCreator render method
            this.container.appendChild(this.statusLabel);

            // Append container high in DOM
            try {
                const rootEl = document.documentElement || document.body;
                if(rootEl) rootEl.appendChild(this.container);
                console.log("Manager: UI container appended.");
            } catch (e) { console.error("Manager: Failed to append UI container:", e); alert("Failed to create UI container!"); }

            this.uiCreated = true; // Set flag

             // Add event listeners
             if (this.fileInput) { this.fileInput.addEventListener('change', (e) => this.handleFileChange(e)); }
             else { console.error("Manager: File input missing after create."); }
             if (this.closeButton) { this.closeButton.addEventListener('click', () => this.closeUI()); }
             else { console.error("Manager: Close button missing after create."); }
             console.log("Manager: createBaseUI finished.");
        }

         updateStatus(message) {
            // Update status label inside the main UI if it's ready
            if (this.uiCreated && this.statusLabel) {
                this.statusLabel.textContent = message;
            } else {
                 // If UI not ready, maybe update loading indicator or log
                 this.updateLoadingIndicator(message); // Use the manager's loader method
            }
             // console.log("Manager Status:", message); // Optional reduced logging
        }

        handleFileChange(e) {
            console.log("Manager: handleFileChange triggered.");
            if (!this.isIframeReady) {
                 this.updateStatus("Error: Processor is not ready. Please wait.");
                 // Clear file input?
                 e.target.value = null;
                 return;
            }

            const file = e.target.files[0];
            if (!file || !file.type.startsWith('image/')) {
                 this.updateStatus('Error: Please select a valid image file.');
                 this.showCanvas(); // Show canvas preview area
                 this.destroy(); // Destroy any existing SVG (inherited method)
                 return;
            }

            this.updateStatus('Reading file...');
            // Display preview in parent immediately (optional)
            this.displayPreview(file);

             // Send Blob to iframe
             console.log(`Manager: Sending image blob (\`${file.name}\`, ${file.size} bytes) to iframe.`);
             this.updateStatus('Sending image to processor...');
             if (this.iframe && this.iframe.contentWindow) {
                  // Create a new Blob object to ensure it's handled correctly by postMessage
                 const imageBlobToSend = new Blob([file], { type: file.type });
                 this.iframe.contentWindow.postMessage({
                     type: 'process_image_blob',
                     payload: { imageBlob: imageBlobToSend }
                 }, '*'); // Use '*' targetOrigin for about:blank iframe initially, or derive origin if needed
                 this.updateStatus('Image sent. Waiting for processing results...');
             } else {
                  console.error("Manager: Cannot send image, iframe not available.");
                  this.updateStatus('Error: Processor iframe connection lost.');
             }
        }

         // Optional: Display preview on parent canvas
        displayPreview(file) {
             const reader = new FileReader();
             reader.onload = (event) => {
                 const img = new Image();
                 img.onload = () => {
                      if (this.canvas && this.canvasCtx) {
                          // Scale preview to fit canvas
                          const scale = Math.min(this.canvas.width / img.naturalWidth, this.canvas.height / img.naturalHeight);
                          const drawWidth = img.naturalWidth * scale;
                          const drawHeight = img.naturalHeight * scale;
                          const dx = (this.canvas.width - drawWidth) / 2;
                          const dy = (this.canvas.height - drawHeight) / 2;
                          this.canvasCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                          this.canvasCtx.drawImage(img, dx, dy, drawWidth, drawHeight);
                          this.updateCanvasLabel("Preview shown below. Processing in background...");
                          this.showCanvas();
                           console.log("Parent: Preview displayed.");
                      }
                 };
                 img.onerror = () => { console.error("Parent: Error loading preview image."); this.updateCanvasLabel("Could not display preview.");};
                 img.src = event.target.result;
             };
             reader.onerror = () => { console.error("Parent: Error reading file for preview."); this.updateCanvasLabel("Could not read file for preview."); };
             reader.readAsDataURL(file);
        }

        showCanvas() {
             if (this.canvas) this.canvas.style.display = 'block';
             if (this.canvasLabel) this.canvasLabel.style.display = 'block';
             this.destroy(); // Destroy SVG when showing canvas (inherited method)
             console.log("Manager: Canvas shown.");
         }

         hideCanvas() {
             if (this.canvas) this.canvas.style.display = 'none';
             if (this.canvasLabel) this.canvasLabel.style.display = 'none';
             console.log("Manager: Canvas hidden.");
         }

         updateCanvasLabel(text) {
            if (this.canvasLabel) this.canvasLabel.textContent = text;
         }

        closeUI() {
            console.log("Manager: Closing UI and iframe...");
            super.closeUI(); // Calls FloorplanCreator closeUI (which calls destroy)

            if (this.iframe) {
                this.iframe.remove();
                this.iframe = null;
                console.log("Manager: Iframe removed.");
            }
            if (this.container) { // Ensure container is removed if super didn't
                 this.container.remove();
                 this.container = null;
            }
             this.hideLoadingIndicator(); // Ensure loader is hidden
            this.isIframeReady = false;
            this.uiCreated = false; // Reset state
            console.log("Manager: UI closed completely.");
        }

    } // End FloorplanManager Class


    // --- Instantiate the Manager ---
    try {
        if (typeof d3 === 'undefined') throw new Error("D3 is not defined.");
        new FloorplanManager();
        console.log("FloorplanManager instance created.");
    } catch (error) {
         console.error("Critical error during script startup:", error);
         alert(`Critical Error: ${error.message}. Floorplan Manager cannot start.`);
    }

})(); // End IIFE
