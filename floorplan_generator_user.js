// ==UserScript==
// @name         Floorplan Manager (Async Processing/Render)
// @version      0.8
// @description  Async OpenCV processing & D3 rendering within requestAnimationFrame.
// @author       ZLudany
// @match        https://home.google.com/*
// @grant        GM_addStyle
// ==/UserScript==
(function() {
    'use strict';

    // --- CSS Styles --- (Remain the same as version 0.7)
    GM_addStyle(`
        /* ... CSS styles from v0.7 ... */
        #floorplan-container {
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.75); z-index: 9990;
            display: flex; flex-direction: column;
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
    // --- Helper Function to Load Scripts Asynchronously --- (Remains the same)
    function loadScript(url) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url; script.async = true;
            script.onload = () => { console.log(`Script loaded: ${url}`); resolve(); };
            script.onerror = (err) => { console.error(`Failed to load script: ${url}`, err); reject(new Error(`Failed to load script: ${url}`)); };
            document.head.appendChild(script);
        });
    }
    // --- Floorplan SVG Creator Class ---
    class FloorplanCreator {
        // ... (properties remain the same) ...
        svgContainer = null; svg = null; svgGroup = null; contourData = []; d3 = null; zoom = null;
        POLYGON_FILL = 'rgba(100, 150, 255, 0.7)'; POLYGON_STROKE = '#d0d0ff'; POLYGON_STROKE_WIDTH = 1;
        DRAGGING_STROKE = 'yellow'; DRAGGING_STROKE_WIDTH = 1.5; CONTAINER_ID = 'floorplan-svg-container'; parentContainer = null;

        constructor(contoursData, d3Instance, parentContainer) {
            // ... (constructor remains the same) ...
             if (!contoursData || !d3Instance || !parentContainer) throw new Error("FloorplanCreator requires contour data, D3 instance, and parent container.");
             this.contourData = contoursData; this.d3 = d3Instance; this.parentContainer = parentContainer;
        }
        // Modified to return a Promise and yield
        render() {
            // Store 'this' context for use inside the Promise/setTimeout
            const self = this;

            return new Promise((resolve, reject) => {
                // Yield control briefly before potentially heavy DOM/D3 work
                setTimeout(() => {
                    try {
                        self.destroy(); // Clear previous SVG if any

                        self.svgContainer = document.createElement('div');
                        self.svgContainer.id = self.CONTAINER_ID;

                        const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                        self.svg = self.d3.select(svgElement);

                        self.svgGroup = self.svg.append('g').attr('id', 'floorplan-shapes');

                        // D3 Data Binding (can be slow with many elements)
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
                            .call(self.setupDrag()); // Apply drag behavior

                        // Insert SVG container before status label
                        const statusLabelElement = self.parentContainer.querySelector('#floorplan-status');
                        if (statusLabelElement) {
                             self.parentContainer.insertBefore(self.svgContainer, statusLabelElement);
                        } else {
                             self.parentContainer.appendChild(self.svgContainer);
                        }
                        self.svgContainer.appendChild(svgElement);

                        // Setup Zoom after elements are added
                        self.setupZoom();
                        self.svg.call(self.zoom);

                        // Make SVG container visible
                        self.svgContainer.style.display = 'block';

                        console.log("FloorplanCreator: SVG rendered asynchronously.");
                        resolve(); // Resolve the promise when done

                    } catch (error) {
                        console.error("FloorplanCreator: Error during async render.", error);
                        reject(error); // Reject the promise on error
                    }
                }, 0); // setTimeout 0 yields execution
            });
        }
        // --- setupZoom and setupDrag remain the same ---
        setupZoom() { /* ... */
             const zoomed = (event) => { this.svgGroup.attr('transform', event.transform); };
             this.zoom = this.d3.zoom().scaleExtent([0.1, 10]).on('zoom', zoomed);
        }
        setupDrag() { /* ... */
             const creatorInstance = this;
             return this.d3.drag()
                 .on('start', function(event, d) { creatorInstance.d3.select(this).raise().classed('dragging', true).style('stroke', creatorInstance.DRAGGING_STROKE).style('stroke-width', creatorInstance.DRAGGING_STROKE_WIDTH); })
                 .on('drag', function(event, d) {
                     const currentTransform = d3.select(this).attr('transform') || ""; let currentX = 0, currentY = 0;
                     const match = currentTransform.match(/translate\(([^,]+),([^)]+)\)/); if (match) { currentX = parseFloat(match[1]); currentY = parseFloat(match[2]); }
                     const newX = currentX + event.dx; const newY = currentY + event.dy; d3.select(this).attr('transform', `translate(${newX}, ${newY})`);
                     // d.transform = `translate(${newX}, ${newY})`; // Update datum if needed
                 })
                 .on('end', function(event, d) { creatorInstance.d3.select(this).classed('dragging', false).style('stroke', creatorInstance.POLYGON_STROKE).style('stroke-width', creatorInstance.POLYGON_STROKE_WIDTH); });
        }
        // --- destroy remains the same ---
        destroy() { /* ... */
             if (this.svgContainer) {
                 if (this.svg) this.svg.on('.zoom', null);
                 if (this.svgGroup) this.svgGroup.selectAll('.floorplan-polygon').on('.drag', null);
                 this.svgContainer.remove(); this.svgContainer = null; this.svg = null; this.svgGroup = null; this.zoom = null;
                 console.log("FloorplanCreator: SVG destroyed.");
             }
        }
    }
    // --- Base Floorplan Processor Class ---
    class FloorplanProcessor {
        // ... (Config, State, UI Refs remain the same) ...
        OPENCV_URL = 'https://docs.opencv.org/4.5.4/opencv.js'; D3_URL = 'https://d3js.org/d3.v7.min.js'; D3_DRAG_URL = 'https://d3js.org/d3-drag.v3.min.js'; D3_ZOOM_URL = 'https://d3js.org/d3-zoom.v3.min.js';
        CANVAS_WIDTH = 800; CANVAS_HEIGHT = 600; CANNY_THRESHOLD1 = 50; CANNY_THRESHOLD2 = 100; MIN_CONTOUR_AREA = 50;
        cv = null; d3 = null; librariesReady = false; uiCreated = false;
        loadingIndicator = null; container = null; controlsDiv = null; fileInput = null; statusLabel = null; canvas = null; canvasCtx = null; canvasLabel = null; closeButton = null;

        constructor() { /* ... (remains the same) ... */ }
        showLoadingIndicator() { /* ... */ if (!document.getElementById('floorplan-loading-indicator')) { this.loadingIndicator = document.createElement('div'); this.loadingIndicator.id = 'floorplan-loading-indicator'; this.loadingIndicator.textContent = 'Loading Libraries...'; document.body.appendChild(this.loadingIndicator); } }
        hideLoadingIndicator() { /* ... */ if (this.loadingIndicator) { this.loadingIndicator.remove(); this.loadingIndicator = null; } }
        updateLoadingIndicator(message) { /* ... */ if (this.loadingIndicator) { this.loadingIndicator.textContent = message; } else { console.log("Floorplan Loading Status:", message); } }
        loadLibraries() { /* ... (remains the same - returns Promise) ... */
             console.log("FloorplanProcessor: Loading required libraries..."); this.updateLoadingIndicator("Loading OpenCV & D3...");
             const openCvReadyPromise = new Promise((resolve, reject) => {
                 window.Module = { ...(window.Module || {}), onRuntimeInitialized: () => { if (typeof cv !== 'undefined') { console.log("FloorplanProcessor: OpenCV Runtime Initialized."); this.cv = cv; resolve(); } else { const errorMsg="OpenCV object not found after initialization."; console.error("FloorplanProcessor:", errorMsg); reject(new Error(errorMsg)); } } };
                 loadScript(this.OPENCV_URL).catch(reject);
             });
             const d3CorePromise = loadScript(this.D3_URL); const d3DragPromise = loadScript(this.D3_DRAG_URL); const d3ZoomPromise = loadScript(this.D3_ZOOM_URL);
             return Promise.all([openCvReadyPromise, d3CorePromise, d3DragPromise, d3ZoomPromise])
                 .then(() => { if (typeof window.d3 !== 'undefined') { console.log("FloorplanProcessor: All libraries ready."); this.d3 = window.d3; this.librariesReady = true; } else { throw new Error("D3 object not found on window after loading scripts."); } })
                 .catch(error => { console.error("FloorplanProcessor: Failed to load one or more libraries.", error); this.updateLoadingIndicator(`Error loading libraries: ${error.message}`); throw error; });
        }
        start() { /* ... (remains the same) ... */
             if (!this.librariesReady) { console.error("FloorplanProcessor: Start called before libraries were ready."); return false; } if (this.uiCreated) { console.warn("FloorplanProcessor: Start called but UI already exists."); return false; }
             console.log("FloorplanProcessor: Base start actions..."); this.hideLoadingIndicator(); this.createUI(); this.updateStatus("Libraries ready. Select an image file."); console.log("FloorplanProcessor: Base UI created."); return true;
        }
        createUI() { /* ... (remains the same - creates canvasLabel) ... */
              this.container = document.createElement('div'); this.container.id = 'floorplan-container';
              this.controlsDiv = document.createElement('div'); this.controlsDiv.id = 'floorplan-controls';
              const fileInputLabel = document.createElement('label'); fileInputLabel.textContent = 'Upload Floorplan Image:'; fileInputLabel.htmlFor = 'floorplan-file-input'; this.fileInput = document.createElement('input'); this.fileInput.type = 'file'; this.fileInput.accept = 'image/*'; this.fileInput.id = 'floorplan-file-input'; this.controlsDiv.appendChild(fileInputLabel); this.controlsDiv.appendChild(this.fileInput);
              this.closeButton = document.createElement('button'); this.closeButton.id = 'floorplan-close-btn'; this.closeButton.textContent = '✕'; this.closeButton.title = 'Close';
              this.canvas = document.createElement('canvas'); this.canvas.id = 'floorplan-canvas'; this.canvas.width = this.CANVAS_WIDTH; this.canvas.height = this.CANVAS_HEIGHT; this.canvasCtx = this.canvas.getContext('2d');
              this.canvasLabel = document.createElement('div'); this.canvasLabel.id = 'floorplan-canvas-label'; this.canvasLabel.textContent = "Upload an image to see the detected shape preview.";
              this.statusLabel = document.createElement('span'); this.statusLabel.id = 'floorplan-status'; this.statusLabel.textContent = 'Initializing...'; this.container.appendChild(this.closeButton); this.container.appendChild(this.controlsDiv); this.container.appendChild(this.canvas); this.container.appendChild(this.canvasLabel); this.container.appendChild(this.statusLabel);
document.body.appendChild(this.container); this.uiCreated = true; console.log("FloorplanProcessor: Base UI elements created.");
        }
        updateStatus(message) { /* ... (remains the same) ... */ if (this.statusLabel) { this.statusLabel.textContent = message; } else if(this.loadingIndicator) { this.updateLoadingIndicator(message); } console.log("Floorplan Status:", message); }

        // Modified to return a Promise and yield
        processImage(imgElement) {
            // Store 'this' context
            const self = this;

            return new Promise((resolve, reject) => {
                if (!self.cv) {
                    return reject(new Error("OpenCV reference is not available."));
                }

                // Yield control before starting heavy OpenCV work
                setTimeout(() => {
                    let src = null, gray = null, edges = null, contours = null, hierarchy = null;
                    let displayMat = null;
                    const formattedContours = [];

                    try {
                        const cv = self.cv;
                        src = cv.imread(imgElement);

                        // --- Canvas Preview Handling ---
                        const scale = Math.min(self.CANVAS_WIDTH / src.cols, self.CANVAS_HEIGHT / src.rows);
                        const dsize = new cv.Size(Math.round(src.cols * scale), Math.round(src.rows * scale));
                        displayMat = new cv.Mat();
                        cv.resize(src, displayMat, dsize, 0, 0, cv.INTER_AREA);

                        if (self.canvasCtx) {
                             self.canvas.width = displayMat.cols; // Adjust canvas size for imshow
                             self.canvas.height = displayMat.rows;
                             self.canvasCtx.clearRect(0, 0, self.canvas.width, self.canvas.height);
                             cv.imshow(self.canvas, displayMat);
                        }
                        // --- End Canvas Preview ---


                        // --- OpenCV Contour Detection (on original image data) ---
                        gray = new cv.Mat();
                        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
                        cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
                        edges = new cv.Mat();
                        cv.Canny(gray, edges, self.CANNY_THRESHOLD1, self.CANNY_THRESHOLD2);
                        contours = new cv.MatVector();
                        hierarchy = new cv.Mat();
                        cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
                        // --- End Contour Detection ---


                        // --- Format and Scale Contours ---
                        for (let i = 0; i < contours.size(); ++i) {
                            const contour = contours.get(i);
                            const area = cv.contourArea(contour);

                            // Filter small contours (area threshold applied to original scale)
                            if (area < self.MIN_CONTOUR_AREA || contour.rows < 3) {
                                contour.delete();
                                continue;
                            }

                            const pointsArray = [];
                            const pointData = contour.data32S;
                            for (let j = 0; j < contour.rows; ++j) {
                                // Scale points to match the display size used for the canvas/SVG
                                pointsArray.push({
                                    x: Math.round(pointData[j * 2] * scale),
                                    y: Math.round(pointData[j * 2 + 1] * scale)
                                });
                            }
                            formattedContours.push({ id: `contour-${i}`, points: pointsArray });
                            contour.delete();
                        }
                        // --- End Formatting ---

                        console.log(`Formatted ${formattedContours.length} contours asynchronously.`);
                        resolve(formattedContours); // Resolve promise with data

                    } catch (error) {
                        console.error("OpenCV Error during async image processing:", error);
                        reject(error); // Reject promise on error
                    } finally {
                        // --- Memory Management ---
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
        closeUI() { /* ... (remains the same) ... */ if (this.container) { this.container.remove(); this.container = null; this.uiCreated = false; console.log("FloorplanProcessor: Base UI Closed."); } this.librariesReady = false; }
    }
    // --Floorplan Manager Class (Orchestrator)--
    class FloorplanManager extends FloorplanProcessor {
        floorplanCreatorInstance = null;
        constructor() { /* ... (remains the same - loads libs, calls this.start) ... */
            super(); console.log("FloorplanManager: Initializing..."); this.showLoadingIndicator();
            this.loadLibraries().then(() => { this.start(); }).catch(error => { console.error("FloorplanManager: Initialization failed due to library loading error."); });
        }
        start() { /* ... (remains the same - calls super.start, adds listeners) ... */
            const baseStarted = super.start();
            if (baseStarted) { console.log("FloorplanManager: Setting up event listeners."); if (this.fileInput) { this.fileInput.addEventListener('change', (e) => this.handleFileChange(e)); } else { console.error("FloorplanManager: File input not found."); } if (this.closeButton) { this.closeButton.addEventListener('click', () => this.closeUI()); } else { console.error("FloorplanManager: Close button not found."); } }
        }
        // Modified to use async/await
        handleFileChange(e) {
            if (!this.librariesReady || !this.uiCreated) return;

            const file = e.target.files[0];
            if (!file || !file.type.startsWith('image/')) {
                this.updateStatus('Error: Please select a valid image file.');
                return;
            }

            const reader = new FileReader();
            reader.onload = (event) => {
                const imgElement = document.createElement('img');
                imgElement.onload = () => {
                    this.updateStatus('Processing image (please wait)...'); // Update status before async work
                    this.showCanvas(); // Ensure canvas visible for preview

                    // --- Use async callback with requestAnimationFrame ---
                    requestAnimationFrame(async () => { // Make the callback async
                        let contoursData = [];
                        try {
                            console.time("ProcessingTime"); // Optional: measure time

                            // 1. Await Asynchronous Image Processing
                            this.updateStatus('Detecting shapes...'); // More specific status
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
                                this.floorplanCreatorInstance = new FloorplanCreator(contoursData, this.d3, this.container);

                                console.time("RenderingTime");
                                await this.floorplanCreatorInstance.render(); // Await the promise
                                console.timeEnd("RenderingTime");

                                // 4. Hide Canvas, Show SVG (after rendering finishes)
                                this.hideCanvas();
                                this.updateStatus(`SVG created with ${contoursData.length} shapes. Ready.`);
                            } else {
                                this.updateStatus("No suitable shapes found. Showing preview.");
                                this.showCanvas(); // Keep canvas visible
                            }

                        } catch (error) {
                            console.error("FloorplanManager: Error during async handling:", error);
                            this.updateStatus(`Error: ${error.message}`);
                            this.showCanvas(); // Ensure canvas visible on error
                            if (this.floorplanCreatorInstance) { // Clean up partial SVG on error
                                this.floorplanCreatorInstance.destroy();
                                this.floorplanCreatorInstance = null;
                            }
                        } finally {
                            URL.revokeObjectURL(imgElement.src);
                        }
                    }); // End async rAF callback
                }; // End img.onload
                imgElement.onerror = () => this.updateStatus('Error loading image data.');
                imgElement.src = event.target.result;
            };
            reader.onerror = () => this.updateStatus('Error reading file.');
            reader.readAsDataURL(file);
        }
        showCanvas() { /* ... (remains the same) ... */ if (this.canvas) this.canvas.style.display = 'block'; if (this.canvasLabel) this.canvasLabel.style.display = 'block'; if (this.floorplanCreatorInstance && this.floorplanCreatorInstance.svgContainer) { this.floorplanCreatorInstance.svgContainer.style.display = 'none'; } }
        hideCanvas() { /* ... (remains the same) ... */ if (this.canvas) this.canvas.style.display = 'none'; if (this.canvasLabel) this.canvasLabel.style.display = 'none'; }
        updateCanvasLabel(count) { /* ... (remains the same) ... */ if (this.canvasLabel) { if (count > 0) { this.canvasLabel.textContent = `Preview: ${count} raw shape(s) detected.`; } else { this.canvasLabel.textContent = "Preview: No distinct shapes detected."; } } }
        closeUI() { /* ... (remains the same - calls super.closeUI after destroying creator) ... */ console.log("FloorplanManager: Closing UI..."); if (this.floorplanCreatorInstance) { this.floorplanCreatorInstance.destroy(); this.floorplanCreatorInstance = null; } super.closeUI(); }
    }
    // --- Instantiate the Manager ---
    new FloorplanManager();
})();
