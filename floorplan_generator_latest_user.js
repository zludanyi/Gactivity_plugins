// ==UserScript==
// @name         Floorplan Manager (Worker OpenCV importScripts + Forced Worker Debug)
// @version      1.1.9
// @description  Uses Web Worker/importScripts for OpenCV, worker always requests debug logs, formatted.
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
    const PARENT_DEV_MODE = false; // Log level for the main userscript (true=alert, false=console)
    const WORKER_DEV_MODE = true; // <<< FORCED: Worker always requests debug logs (true=alert request, false=console request) >>>
    // --- End Configuration ---

    // --- Parent Logging Helpers (Now with Origin) ---
    function logDebug(message, ...optionalParams /*, origin = 'PARENT' - implicit last arg */ ) {
        const origin = (optionalParams.length > 0 && optionalParams[optionalParams.length - 1].includes('WORKER'))
                       ? optionalParams[optionalParams.length - 1].pop()
                       : 'PARENT';
        //alert(origin+" :\n "+optionalParams[optionalParams.length - 1]+" :\n "+message);
        // Use PARENT_DEV_MODE or WORKER_DEV_MODE to decide if PARENT logs use alert
        const useAlert = (origin === 'PARENT' && PARENT_DEV_MODE) || (origin === 'WORKER' && WORKER_DEV_MODE);
        const prefix = `[${origin} DEBUG]`;
        //alert(origin+" : "+useAlert);

        if (useAlert) {
            let alertMsg = prefix + " " + message;
            if (optionalParams.length > 0) {
                try {
                    alertMsg += " :: " + optionalParams.map(p => JSON.stringify(p)).join('; ');
                } catch (e) {
                    alertMsg += " :: [Error stringifying params]";
                }
            }
            alert(alertMsg);
        } else {
            console.log(prefix, message, ...optionalParams);
        }
    }

    function logWarn(message, ...optionalParams /*, origin = 'PARENT' */ ) {
        const origin = (optionalParams.length > 0 && ['PARENT', 'WORKER'].includes(optionalParams[optionalParams.length - 1]))
                       ? optionalParams.pop()
                       : 'PARENT';
        // Use PARENT_DEV_MODE or WORKER_DEV_MODE to decide if PARENT logs use alert
        const useAlert = (origin === 'PARENT' && PARENT_DEV_MODE) || (origin === 'WORKER' && WORKER_DEV_MODE);
        const prefix = `[${origin} WARN]`;
        const fullMessage = prefix + " " + message;

        if (useAlert) {
            let alertMsg = fullMessage;
            if (optionalParams.length > 0) {
                try {
                    alertMsg += " :: " + optionalParams.map(p => JSON.stringify(p)).join('; ');
                } catch (e) {
                    alertMsg += " :: [Error stringifying params]";
                }
            }
            alert(alertMsg);
        } else {
            console.warn(fullMessage, ...optionalParams);
        }
    }

    function logError(message, ...optionalParams /*, origin = 'PARENT' */ ) {
        const origin = (optionalParams.length > 0 && optionalParams[optionalParams.length - 1].includes('WORKER'))
                       ? optionalParams[optionalParams.length - 1].pop()
                       : 'PARENT';
        // Use PARENT_DEV_MODE or WORKER_DEV_MODE to decide if PARENT logs use alert
        const useAlert = (origin === 'PARENT' && PARENT_DEV_MODE) || (origin === 'WORKER' && WORKER_DEV_MODE);
        const prefix = `[${origin} ERROR]`;
        const fullMessage = prefix + " " + message;

        if (useAlert) {
            let alertMsg = fullMessage;
            if (optionalParams.length > 0) {
                try {
                    alertMsg += " :: " + optionalParams.map(p => JSON.stringify(p)).join('; ');
                } catch (e) {
                    alertMsg += " :: [Error stringifying params]";
                }
            }
            alert(alertMsg);
        } else {
            console.error(fullMessage, ...optionalParams);
        }
    }
    // --- End Parent Logging Helpers ---

    logDebug(`--- Floorplan Manager (Worker/importScripts, Forced Worker Debug) Execution Starting ---`);

    // --- Constants ---
    const OPENCV_URL = 'https://docs.opencv.org/4.5.4/opencv.js';

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
            style.id = 'floorplan-manager-styles';
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
        #floorplan-container {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.85);
            z-index: 2147483647 !important;
            display: none; /* Initially hidden, shown by manager */
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 20px;
            box-sizing: border-box;
            font-family: sans-serif;
            color: white;
            overflow: hidden;
        }
        /* No loading indicator style needed - using logs */
        #floorplan-controls {
            background: #333;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 10px;
            display: flex;
            gap: 15px;
            align-items: center;
            flex-shrink: 0;
            z-index: 1;
        }
        #floorplan-canvas { /* For parent preview */
            background: #444;
            border: 1px solid #777;
            max-width: 90%;
            max-height: 65vh;
            object-fit: contain;
            display: block;
            margin-bottom: 5px;
            flex-shrink: 1;
        }
        #floorplan-canvas-label {
            color: #ccc;
            font-size: 0.9em;
            font-style: italic;
            text-align: center;
            margin-bottom: 10px;
            display: block;
            flex-shrink: 0;
        }
        #floorplan-close-btn {
            position: absolute;
            top: 15px;
            right: 20px;
            background: #ff4444;
            color: white;
            border: none;
            padding: 8px 12px;
            cursor: pointer;
            font-size: 1.2em;
            border-radius: 3px;
            z-index: 2;
        }
        #floorplan-status { /* Status label in the main UI */
            margin-top: auto;
            font-style: italic;
            background: #333;
            padding: 5px 10px;
            border-radius: 3px;
            flex-shrink: 0;
            z-index: 1;
        }
        #floorplan-controls label {
            margin-right: 5px;
        }
        #floorplan-controls input[type=file] {
            border: 1px solid #666;
            padding: 5px;
            border-radius: 3px;
            background: #555;
            color: white;
        }
        #floorplan-svg-container {
            width: 90%;
            height: 75vh;
            border: 1px solid #66aaff;
            display: none;
            flex-grow: 1;
            flex-shrink: 1;
            overflow: hidden;
            box-sizing: border-box;
            background-color: #282c34;
        }
        #floorplan-svg-container svg {
            display: block;
            width: 100%;
            height: 100%;
        }
        .floorplan-polygon {
            fill: rgba(100, 150, 255, 0.7);
            stroke: #d0d0ff;
            stroke-width: 1;
            cursor: grab;
        }
        .floorplan-polygon:active {
            cursor: grabbing;
        }
        .floorplan-polygon.dragging {
            stroke: yellow;
            stroke-width: 1.5;
        }
    `;
    addGlobalStyle(cssStyles);


    // --- Worker Script Content ---
    const workerScriptContent = `
        // --- Worker Configuration ---
        const WORKER_DEV_MODE = ${WORKER_DEV_MODE}; // Injected from parent
        const OPENCV_URL = '${OPENCV_URL}';
        // --- End Worker Configuration ---

        // --- Worker Function Call Helper ---
        function callParentFunction(functionName, ...args) {
            // Worker always requests its preferred log type based on WORKER_DEV_MODE
            const targetFunctionName = WORKER_DEV_MODE && functionName.startsWith('log') ? functionName : 'alert';
            const finalArgs = WORKER_DEV_MODE && functionName.startsWith('log') ? ["[WORKER " + functionName.toUpperCase() + "] " + args[0]].concat(args.slice(1)) : args;

            if (targetFunctionName === 'alert') {
                 let alertMsg = args.join(' '); // Simple join for alert
                 self.postMessage({
                     type: "functionCall",
                     payload: {
                         functionName: 'alert', // Request alert specifically
                         args: [alertMsg]
                     }
                 });
            } else {
                 // Request standard function call (logDebug, logWarn, logError, updateStatus etc.)
                 self.postMessage({
                     type: "functionCall",
                     payload: {
                         functionName: functionName,
                         args: args
                     }
                 });
            }
        }
        // --- End Worker Function Call Helper ---

        callParentFunction('logDebug', "Worker script started.");

        let cv = null;
        let isReady = false;

        // Define Module for OpenCV initialization
        self.Module = {
            onRuntimeInitialized: () => {
                callParentFunction('logDebug', ">>> Module.onRuntimeInitialized fired.");
                if (typeof self.cv !== 'undefined' && self.cv && typeof self.cv.imread === 'function') {
                    cv = self.cv;
                    isReady = true;
                    callParentFunction('logDebug', "OpenCV is ready in Worker (onRuntimeInitialized confirmed).");
                    self.postMessage({ type: 'opencv_ready' });
                } else {
                    callParentFunction('logError', "Worker: onRuntimeInitialized fired, but cv or cv.imread is invalid!");
                }
            },
            onAbort: (reason) => {
                 callParentFunction('logError', "Worker OpenCV WASM Aborted:", reason);
                 isReady = false;
            }
        };
        callParentFunction('logDebug', "Worker: Module defined. Importing OpenCV script via importScripts()...");
        callParentFunction('updateStatus', "Worker: Loading OpenCV...");

        // --- Load OpenCV using importScripts ---
        try {
            importScripts(OPENCV_URL);
            callParentFunction('logDebug', "Worker: importScripts call completed for OpenCV. Waiting for onRuntimeInitialized...");
            callParentFunction('updateStatus', "Worker: Waiting for OpenCV WASM initialization...");
        } catch (error) {
            callParentFunction('logError', "Worker: importScripts FAILED for OpenCV:", error.message, error.stack);
            callParentFunction('updateStatus', "Worker: Failed to load OpenCV (Security Policy or Network Error).");
            isReady = false;
        }
        // --- End Load OpenCV ---


        // --- Message Handling ---
        self.onmessage = async (event) => {
            console.log("[WORKER INTERNAL] Received message:", event.data); // Keep console log
            const message = event.data;
            if (!message || !message.type) {
                callParentFunction('logWarn', "Worker: Received message with no type.");
                return;
            }

            if (message.type === 'process_image_blob') {
                if (!isReady || !cv) {
                    callParentFunction('logError', "Worker: Received image blob but OpenCV is not ready.");
                    return;
                }
                if (!(message.payload && message.payload.imageBlob instanceof Blob)) {
                    callParentFunction('logError', "Worker: Invalid image blob received.");
                    return;
                }
                await processImageBlob(message.payload.imageBlob);
            } else {
                callParentFunction('logWarn', "Worker: Received unknown message type:", message.type);
            }
        };

        // --- Image Processing Function ---
        async function processImageBlob(imageBlob) {
            callParentFunction('logDebug', "Worker: Starting image blob processing.");
            callParentFunction('updateStatus', "Worker: Processing image...");

            let src = null;
            let gray = null;
            let edges = null;
            let contours = null;
            let hierarchy = null;
            const formattedContours = [];
            let imageBitmap = null;
            let offscreenCanvas = null;
            let ctx = null;

            try {
                imageBitmap = await createImageBitmap(imageBlob);
                callParentFunction('logDebug', \`Worker: Created ImageBitmap \${imageBitmap.width}x\${imageBitmap.height}\`);

                offscreenCanvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
                ctx = offscreenCanvas.getContext('2d');
                if (!ctx) {
                    throw new Error("Could not get OffscreenCanvas 2D context.");
                }
                ctx.drawImage(imageBitmap, 0, 0);
                callParentFunction('logDebug', "Worker: Image drawn to OffscreenCanvas.");
                imageBitmap.close();

                src = cv.imread(offscreenCanvas);
                if (src.empty()) {
                    throw new Error("cv.imread failed from OffscreenCanvas.");
                }

                gray = new cv.Mat();
                cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
                cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
                edges = new cv.Mat();
                cv.Canny(gray, edges, 50, 100);
                contours = new cv.MatVector();
                hierarchy = new cv.Mat();
                cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
                callParentFunction('logDebug', \`Worker: Found \${contours.size()} raw contours.\`);

                const minArea = 50;
                for (let i = 0; i < contours.size(); ++i) {
                    const contour = contours.get(i);
                    try {
                         const area = cv.contourArea(contour);
                         if (area < minArea || contour.rows < 3) {
                             continue;
                         }
                         const pointsArray = [];
                         const pointData = contour.data32S;
                         for (let j = 0; j < contour.rows; ++j) {
                             pointsArray.push({ x: pointData[j * 2], y: pointData[j * 2 + 1] });
                         }
                         formattedContours.push({ id: \`worker-contour-\${Date.now()}-\${i}\`, points: pointsArray });
                    } finally {
                        if(contour) {
                            contour.delete();
                        }
                    }
                }
                callParentFunction('logDebug', \`Worker: Processed \${formattedContours.length} valid contours.\`);

                self.postMessage({
                    type: 'processing_complete',
                    payload: {
                        contours: formattedContours,
                        originalWidth: offscreenCanvas.width,
                        originalHeight: offscreenCanvas.height
                    }
                });

            } catch (error) {
                callParentFunction('logError', "Worker processing error:", error);
            } finally {
                if (src) {
                    src.delete();
                }
                if (gray) {
                    gray.delete();
                }
                if (edges) {
                    edges.delete();
                }
                if (contours) {
                    contours.delete();
                }
                if (hierarchy) {
                    hierarchy.delete();
                }
                if (imageBitmap && !imageBitmap.closed) {
                    imageBitmap.close();
                }
                callParentFunction('logDebug', "Worker: OpenCV Mats cleaned up.");
            }
        }

        callParentFunction('logDebug', "Worker: Event listener set up. Waiting for messages or OpenCV init.");

    `; // End workerScriptContent


    // --- Floorplan SVG Creator Class (Parent Scope) ---
    logDebug("Defining FloorplanCreator class...");
    class FloorplanCreator {
        svgContainer = null;
        svg = null;
        svgGroup = null;
        contourData = [];
        d3 = null;
        zoom = null;
        POLYGON_FILL = 'rgba(100, 150, 255, 0.7)';
        POLYGON_STROKE = '#d0d0ff';
        POLYGON_STROKE_WIDTH = 1;
        DRAGGING_STROKE = 'yellow';
        DRAGGING_STROKE_WIDTH = 1.5;
        CONTAINER_ID = 'floorplan-svg-container';
        parentContainer = null;
        targetWidth = 800;
        targetHeight = 600;

        constructor(parentContainerRef, d3Instance, targetWidth = 800, targetHeight = 600) {
            if (!parentContainerRef) {
                throw new Error("FloorplanCreator requires parent container reference.");
            }
            if (!d3Instance) {
                throw new Error("FloorplanCreator requires D3 instance.");
            }
            this.parentContainer = parentContainerRef;
            this.d3 = d3Instance;
            this.targetWidth = targetWidth;
            this.targetHeight = targetHeight;
            logDebug("FloorplanCreator initialized in parent.");
        }

        renderContourData(contourData, originalWidth, originalHeight) {
             if (!contourData) {
                 logWarn("FloorplanCreator: No contour data provided to render.");
                 this.destroy();
                 return Promise.resolve();
             }
             logDebug(`FloorplanCreator: Received ${contourData.length} contours. Original size: ${originalWidth}x${originalHeight}`);
             this.contourData = this.scaleContours(contourData, originalWidth, originalHeight);
             return this.render();
        }

        scaleContours(rawContours, originalWidth, originalHeight) {
            if (!originalWidth || !originalHeight) {
                 logWarn("Cannot scale contours: Original dimensions missing.");
                 return rawContours;
            }
             const scaleX = this.targetWidth / originalWidth;
             const scaleY = this.targetHeight / originalHeight;
             const scale = Math.min(scaleX, scaleY);
             logDebug(`Scaling contours by factor: ${scale.toFixed(3)} (Target: ${this.targetWidth}x${this.targetHeight})`);
             return rawContours.map(contour => ({
                 ...contour,
                 points: contour.points.map(p => ({
                     x: Math.round(p.x * scale),
                     y: Math.round(p.y * scale)
                 }))
             }));
        }

        render() {
            const self = this;
            return new Promise((resolve, reject) => {
                setTimeout(() => {
                    try {
                        if (!self.d3) {
                            throw new Error("D3 missing in render.");
                        }
                        if (!self.parentContainer || !document.contains(self.parentContainer)) {
                            throw new Error("Parent container missing/detached in render.");
                        }
                        if (!self.contourData || self.contourData.length === 0) {
                             logDebug("FloorplanCreator: No scaled contours to render.");
                             self.destroy();
                             return resolve();
                        }
                        self.destroy();
                        self.svgContainer = document.createElement('div');
                        self.svgContainer.id = self.CONTAINER_ID;
                        const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                        self.svg = self.d3.select(svgElement);
                        self.svgGroup = self.svg.append('g')
                            .attr('id', 'floorplan-shapes');
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
                        const statusLabelElement = self.parentContainer.querySelector('#floorplan-status');
                        if (statusLabelElement) {
                            self.parentContainer.insertBefore(self.svgContainer, statusLabelElement);
                        } else {
                            self.parentContainer.appendChild(self.svgContainer);
                        }
                        self.svgContainer.appendChild(svgElement);
                        self.setupZoom();
                        if (self.zoom) {
                            self.svg.call(self.zoom);
                        }
                        self.svgContainer.style.display = 'block';
                        logDebug("FloorplanCreator: SVG rendered successfully.");
                        resolve();
                    } catch (error) {
                        logError("FloorplanCreator: Error during SVG render.", error);
                        reject(error);
                    }
                }, 0);
            });
        }

        setupZoom() {
            if (!this.d3) {
                logError("D3 missing in setupZoom");
                return;
            }
            const zoomed = (event) => {
                if (this.svgGroup) {
                    this.svgGroup.attr('transform', event.transform);
                }
            };
            this.zoom = this.d3.zoom()
                .scaleExtent([0.1, 10])
                .on('zoom', zoomed);
        }

        setupDrag() {
            if (!this.d3) {
                logError("D3 missing in setupDrag");
                return () => {};
            }
            const creatorInstance = this;
            return this.d3.drag()
                .on('start', function(event, d) {
                    creatorInstance.d3.select(this)
                        .raise()
                        .classed('dragging', true)
                        .style('stroke', creatorInstance.DRAGGING_STROKE)
                        .style('stroke-width', creatorInstance.DRAGGING_STROKE_WIDTH);
                })
                .on('drag', function(event, d) {
                    const currentTransform = creatorInstance.d3.select(this).attr('transform') || "";
                    let currentX = 0;
                    let currentY = 0;
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
                    creatorInstance.d3.select(this)
                        .classed('dragging', false)
                        .style('stroke', creatorInstance.POLYGON_STROKE)
                        .style('stroke-width', creatorInstance.POLYGON_STROKE_WIDTH);
                });
        }

        destroy() {
            if (this.svgContainer) {
                if (this.svg) {
                    this.svg.on('.zoom', null);
                }
                if (this.svgGroup) {
                    this.svgGroup.selectAll('.floorplan-polygon').on('.drag', null);
                }
                this.svgContainer.remove();
                this.svgContainer = null;
                this.svg = null;
                this.svgGroup = null;
                this.zoom = null;
                logDebug("FloorplanCreator: SVG destroyed.");
            }
        }
    }
    logDebug("FloorplanCreator class defined.");


    // --- Floorplan Manager Class (Parent Scope) ---
    logDebug("Defining FloorplanManager class...");
    class FloorplanManager extends FloorplanCreator {
        worker = null;
        isWorkerReady = false;
        uiCreated = false;
        container = null;
        controlsDiv = null;
        fileInput = null;
        statusLabel = null;
        canvas = null;
        canvasCtx = null;
        canvasLabel = null;
        closeButton = null;

        constructor() {
            logDebug("FloorplanManager constructor started.");
            if (typeof d3 === 'undefined' || !d3) {
                logError("FATAL: D3 library failed!");
                throw new Error("D3 library failed to load.");
            }
            logDebug("FloorplanManager: D3 found.");
            const baseContainerElement = document.createElement('div');
            baseContainerElement.id = 'floorplan-container';
            logDebug("FloorplanManager: Calling super(FloorplanCreator constructor)...");
            super(baseContainerElement, d3, 800, 600);
            logDebug("FloorplanManager: super(FloorplanCreator constructor) finished.");
            this.container = baseContainerElement;
            logDebug("FloorplanManager: 'this.container' assigned.");
            try {
                logDebug("FloorplanManager: Populating UI container...");
                this.populateUIContainer();
                this.uiCreated = true;
                logDebug("FloorplanManager: UI container populated.");
            } catch(e) {
                logError("FloorplanManager: Error populating UI container:", e);
                if (this.container) {
                    try {
                        this.container.remove();
                    } catch(remErr){}
                }
                this.container = null;
                this.uiCreated = false;
                this.updateStatus(`Error Creating UI: ${e.message}`);
                throw new Error(`Failed to populate UI: ${e.message}`);
            }
            try {
                logDebug("FloorplanManager: Appending main container to DOM...");
                const rootEl = document.documentElement || document.body;
                if (rootEl) {
                    rootEl.appendChild(this.container);
                    logDebug("FloorplanManager: Main container appended.");
                } else {
                    throw new Error("Could not find documentElement or body to append UI.");
                }
            } catch (e) {
                logError("FloorplanManager: Error appending UI container:", e);
                if (this.container) {
                    try {
                        this.container.remove();
                    } catch(remErr){}
                }
                this.container = null;
                this.uiCreated = false;
                this.updateStatus(`Error Displaying UI: ${e.message}`);
                throw new Error(`Failed to append UI: ${e.message}`);
            }

            this.updateStatus("Initializing OpenCV Processor (Worker)...");
            this.setupWorker();
            logDebug("FloorplanManager constructor finished successfully.");
        }

        populateUIContainer() {
            if (!this.container) {
                throw new Error("populateUIContainer called but this.container is null.");
            }
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
            this.container.appendChild(this.controlsDiv);
            this.closeButton = document.createElement('button');
            this.closeButton.id = 'floorplan-close-btn';
            this.closeButton.textContent = '✕';
            this.closeButton.title = 'Close';
            this.container.appendChild(this.closeButton);
            this.canvas = document.createElement('canvas');
            this.canvas.id = 'floorplan-canvas';
            this.canvas.width = 800;
            this.canvas.height = 600;
            this.canvasCtx = this.canvas.getContext('2d');
            this.container.appendChild(this.canvas);
            this.canvasLabel = document.createElement('div');
            this.canvasLabel.id = 'floorplan-canvas-label';
            this.canvasLabel.textContent = "Upload image for preview & processing.";
            this.container.appendChild(this.canvasLabel);
            this.statusLabel = document.createElement('span');
            this.statusLabel.id = 'floorplan-status';
            this.statusLabel.textContent = 'Initializing...';
            this.container.appendChild(this.statusLabel);
            if (this.fileInput) {
                this.fileInput.addEventListener('change', (e) => this.handleFileChange(e));
            } else {
                logError("Manager populateUI: File input missing.");
            }
            if (this.closeButton) {
                this.closeButton.addEventListener('click', () => this.closeUI());
            } else {
                logError("Manager populateUI: Close button missing.");
            }
            logDebug("Manager: UI elements populated in container.");
        }

        setupWorker() {
            logDebug("Setting up Web Worker...");
            try {
                const blob = new Blob([workerScriptContent], { type: 'application/javascript' });
                const workerUrl = URL.createObjectURL(blob);
                this.worker = new Worker(workerUrl);
                URL.revokeObjectURL(workerUrl);

                this.worker.onmessage = this.handleWorkerMessage.bind(this);
                this.worker.onerror = (error) => {
                    logError("Web Worker error:", error.message, error, 'WORKER');
                    //alert("[WORKER DEBUG] "+error.message);
                    this.updateStatus(`Worker Error: ${error.message}. See console.`,'WORKER');
                    this.isWorkerReady = false;
                };
                logDebug("Web Worker created and listeners attached.");

            } catch (error) {
                logError("Failed to create Web Worker:", error);
                this.updateStatus("Error: Could not initialize background processor.");
                this.isWorkerReady = false;
            }
        }

        handleWorkerMessage(event) {
            logDebug("Parent received message from worker:", event.data);
            const message = event.data;
            if (!message || !message.type) {
                return;
            }

            switch (message.type) {
                case 'opencv_ready':
                    logDebug("Parent: Worker reported OpenCV is ready.");
                    this.isWorkerReady = true;
                    if (this.container) {
                        this.container.style.display = 'flex';
                    } else {
                        logError("Cannot show container, reference missing after worker ready!");
                    }
                    this.updateStatus("Ready. Select floorplan image.");
                    break;
                case 'processing_complete':
                    logDebug("Parent: Received processing_complete message.",["WORKER"]);
                    this.updateStatus("Processing complete. Rendering SVG...");
                    if (message.payload && message.payload.contours) {
                        this.renderContourData(message.payload.contours, message.payload.originalWidth, message.payload.originalHeight)
                            .then(() => {
                                 this.updateStatus(`SVG rendered with ${message.payload.contours.length} shapes.`);
                                 this.hideCanvas();
                            })
                            .catch(error => {
                                 logError("Parent: Error rendering SVG:", error);
                                 this.updateStatus(`Error rendering SVG: ${error.message}`);
                                 this.showCanvas();
                            });
                    } else {
                         logWarn("Parent: processing_complete message missing contour data.");
                         this.updateStatus("Processing finished, but no contour data received.");
                         this.showCanvas();
                    }
                    break;
                case 'processing_error':
                    // Error is logged by the worker via functionCall below
                    this.updateStatus(`Processing Error: ${message.payload.message}`);
                    this.showCanvas();
                    this.destroy();
                    break;
                case 'functionCall':
                    const { functionName, args } = message.payload;
                    if (typeof functionName === 'string' && Array.isArray(args)) {
                        logDebug(`Parent: Worker requested call: ${functionName}(${args.length} args)`,["WORKER"]);
                        const targetFunction = this[functionName] || window[functionName];
                        if (typeof targetFunction === 'function') {
                            try {
                                if (this[functionName]) {
                                     // Call method on this instance
                                     targetFunction.apply(this, ['WORKER', args]);
                                } else if (functionName === 'alert') {
                                     // Handle alert specifically - check PARENT mode for actual alert
                                     if (PARENT_DEV_MODE) {
                                         alert("[WORKER::] " + args.join(' '));
                                     } else {
                                         // Log worker's alert request to console if parent alerts are off
                                         console.log("[WORKER ALERT REQUEST]", ...args);
                                     }
                                } else if (functionName.startsWith('log')) {
                                     // Call global loggers, passing 'WORKER' as origin
                                     targetFunction(...args, ['WORKER']);
                                }
                                // Add other safe global functions if needed
                            } catch (e) {
                                logError(`Parent: Error executing requested worker function '${functionName}':`, e);
                            }
                        } else {
                            logWarn(`Parent received request to call unknown/disallowed function from worker: ${functionName}`);
                        }
                    } else {
                        logWarn("Parent received invalid functionCall message format from worker.");
                    }
                    break;
                  default:
                    logWarn("Parent: Received unknown message type from worker:", message.type);
            }
        }

        updateStatus(...message) {
            if (this.uiCreated && this.statusLabel) {
                 if (this.container && this.container.style.display !== 'flex' && this.isWorkerReady) {
                      this.container.style.display = 'flex';
                 }
                this.statusLabel.textContent = message;
            } else {
                 logDebug("Manager Status (UI not ready):", message);
            }
            PARENT_DEV_MODE?logDebug("Manager Status Update:", message):function(){};
        }

        handleFileChange(e) {
            logDebug("Manager: handleFileChange triggered.");
            if (!this.worker) {
                 this.updateStatus("Error: Background processor not initialized.");
                 e.target.value = null;
                 return;
            }
             if (!this.isWorkerReady) {
                 this.updateStatus("Error: Processor is not ready. Please wait for OpenCV to load.");
                 e.target.value = null;
                 return;
            }

            const file = e.target.files[0];
            if (!file || !file.type.startsWith('image/')) {
                 this.updateStatus('Error: Please select a valid image file.');
                 this.showCanvas();
                 this.destroy();
                 return;
            }

            this.updateStatus('Reading file for preview...');
            this.displayPreview(file);

            logDebug(`Manager: Sending image blob (\`${file.name}\`, ${file.size} bytes) to worker.`);
            this.updateStatus('Sending image to processor...');
            try {
                this.worker.postMessage({
                    type: 'process_image_blob',
                    payload: { imageBlob: file }
                });
                this.updateStatus('Image sent. Waiting for processing results...');
            } catch (error) {
                 logError("Manager: Error posting message to worker:", error);
                 this.updateStatus('Error sending image to processor.');
            }
        }

        displayPreview(file) {
             const reader = new FileReader();
             reader.onload = (event) => {
                 const img = new Image();
                 img.onload = () => {
                      if (this.canvas && this.canvasCtx) {
                          const scale = Math.min(this.canvas.width / img.naturalWidth, this.canvas.height / img.naturalHeight);
                          const drawWidth = img.naturalWidth * scale;
                          const drawHeight = img.naturalHeight * scale;
                          const dx = (this.canvas.width - drawWidth) / 2;
                          const dy = (this.canvas.height - drawHeight) / 2;
                          this.canvasCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                          this.canvasCtx.drawImage(img, dx, dy, drawWidth, drawHeight);
                          this.updateCanvasLabel("Preview shown below. Processing in background...");
                          this.showCanvas();
                           logDebug("Parent: Preview displayed.");
                      }
                 };
                 img.onerror = () => {
                     logError("Parent: Error loading preview image.");
                     this.updateCanvasLabel("Could not display preview.");
                 };
                 img.src = event.target.result;
             };
             reader.onerror = () => {
                 logError("Parent: Error reading file for preview.");
                 this.updateCanvasLabel("Could not read file for preview.");
             };
             reader.readAsDataURL(file);
        }

        showCanvas() {
             if (this.canvas) {
                 this.canvas.style.display = 'block';
             }
             if (this.canvasLabel) {
                 this.canvasLabel.style.display = 'block';
             }
             this.destroy();
             logDebug("Manager: Canvas shown.");
         }

         hideCanvas() {
             if (this.canvas) {
                 this.canvas.style.display = 'none';
             }
             if (this.canvasLabel) {
                 this.canvasLabel.style.display = 'none';
             }
             logDebug("Manager: Canvas hidden.");
         }

         updateCanvasLabel(text) {
            if (this.canvasLabel) {
                this.canvasLabel.textContent = text;
            }
         }

        closeUI() {
            logDebug("Manager: Closing UI and Worker...");
            super.destroy();

            if (this.worker) {
                try {
                    this.worker.terminate();
                    logDebug("Manager: Worker terminated.");
                } catch(e) {
                    logError("Manager: Error terminating worker:", e);
                }
                this.worker = null;
            }
            if (this.container) {
                 try {
                     this.container.remove();
                 } catch (e) {}
                 this.container = null;
            }

            this.isWorkerReady = false;
            this.uiCreated = false;
            logDebug("Manager: UI closed completely.");
        }

    } // End FloorplanManager Class
    logDebug("FloorplanManager class defined.");


    // --- Instantiate the Manager ---
    logDebug("Instantiating FloorplanManager (Worker/importScripts Version)...");
    try {
        if (typeof d3 === 'undefined') {
            throw new Error("D3 is not defined.");
        }
        new FloorplanManager();
        logDebug("FloorplanManager instance created.");
    } catch (error) {
         logError("Critical error during script startup:", error);
         alert(`Critical Error: ${error.message}. Floorplan Manager cannot start.`);
         // try { showStandaloneLoadingIndicator(`Startup Error: ${error.message}`); } catch(e){} // No indicator element
    }
    logDebug(`--- Floorplan Manager (Worker/importScripts Strategy, Parent Dev: ${PARENT_DEV_MODE}, Worker Dev: ${WORKER_DEV_MODE}) Execution Finished ---`);

})(); // End IIFE
