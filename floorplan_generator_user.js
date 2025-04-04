// ==UserScript==
// @name         Floorplan Manager (Async Processing/Render)
// @version      0.8
// @description  Async OpenCV processing & D3 rendering within requestAnimationFrame.
// @author       ZLudany
// @match        https://home.google.com/*
// @grant        GM_addStyle
// @require      https://docs.opencv.org/4.5.4/opencv.js
// @require      https://d3js.org/d3.v7.min.js
// @require      https://d3js.org/d3-drag.v3.min.js
// @require      https://d3js.org/d3-zoom.v3.min.js
// ==/UserScript==
(function() {
    'use strict';

    // --- CSS Styles ---
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
             text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;
             background: linear-gradient(to right, #3498db, #2980b9);
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

    // --- Floorplan SVG Creator Class ---
    class FloorplanCreator {
        svgContainer = null; svg = null; svgGroup = null; contourData = []; d3 = null; zoom = null;
        POLYGON_FILL = 'rgba(100, 150, 255, 0.7)'; POLYGON_STROKE = '#d0d0ff'; POLYGON_STROKE_WIDTH = 1;
        DRAGGING_STROKE = 'yellow'; DRAGGING_STROKE_WIDTH = 1.5; CONTAINER_ID = 'floorplan-svg-container'; parentContainer = null;

        constructor(contoursData, d3Instance, parentContainer) {
            if (!contoursData || !d3Instance || !parentContainer) throw new Error("FloorplanCreator requires contour data, D3 instance, and parent container.");
            this.contourData = contoursData; this.d3 = d3Instance; this.parentContainer = parentContainer;
        }

        render() {
            const self = this;

            return new Promise((resolve, reject) => {
                setTimeout(() => {
                    try {
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
                        self.svg.call(self.zoom);

                        self.svgContainer.style.display = 'block';

                        console.log("FloorplanCreator: SVG rendered asynchronously.");
                        resolve();

                    } catch (error) {
                        console.error("FloorplanCreator: Error during async render.", error);
                        reject(error);
                    }
                }, 0);
            });
        }

        setupZoom() {
            const zoomed = (event) => { this.svgGroup.attr('transform', event.transform); };
            this.zoom = this.d3.zoom().scaleExtent([0.1, 10]).on('zoom', zoomed);
        }

        setupDrag() {
            const creatorInstance = this;
            return this.d3.drag()
                .on('start', function(event, d) { creatorInstance.d3.select(this).raise().classed('dragging', true).style('stroke', creatorInstance.DRAGGING_STROKE).style('stroke-width', creatorInstance.DRAGGING_STROKE_WIDTH); })
                .on('drag', function(event, d) {
                    const currentTransform = d3.select(this).attr('transform') || ""; let currentX = 0, currentY = 0;
                    const match = currentTransform.match(/translate\(([^,]+),([^)]+)\)/); if (match) { currentX = parseFloat(match[1]); currentY = parseFloat(match[2]); }
                    const newX = currentX + event.dx; const newY = currentY + event.dy; d3.select(this).attr('transform', `translate(${newX}, ${newY})`);
                })
                .on('end', function(event, d) { creatorInstance.d3.select(this).classed('dragging', false).style('stroke', creatorInstance.POLYGON_STROKE).style('stroke-width', creatorInstance.POLYGON_STROKE_WIDTH); });
        }

        destroy() {
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
        CANVAS_WIDTH = 800; CANVAS_HEIGHT = 600; CANNY_THRESHOLD1 = 50; CANNY_THRESHOLD2 = 100; MIN_CONTOUR_AREA = 50;
        cv = null; d3 = null; librariesReady = false; uiCreated = false;
        loadingIndicator = null; container = null; controlsDiv = null; fileInput = null; statusLabel = null; canvas = null; canvasCtx = null; canvasLabel = null; closeButton = null;

        constructor() { }

        showLoadingIndicator() {
            if (!document.getElementById('floorplan-loading-indicator')) {
                this.loadingIndicator = document.createElement('div');
                this.loadingIndicator.id = 'floorplan-loading-indicator';
                this.loadingIndicator.textContent = 'Waiting for the floorplan processor...';
                document.body.appendChild(this.loadingIndicator);
            }
        }

        hideLoadingIndicator() {
            if (this.loadingIndicator) {
                this.loadingIndicator.remove();
                this.loadingIndicator = null;
            }
        }

        updateLoadingIndicator(message) {
            if (this.loadingIndicator) {
                this.loadingIndicator.textContent = message;
            } else {
                console.log("Floorplan Loading Status:", message);
            }
        }

        start() {
            window.Module.onRuntimeInitialized = () => {
                console.log("OpenCV Runtime Initialized.");
                this.cv = cv; // Access the global cv object
                this.hideLoadingIndicator();
                this.createUI();
                this.updateStatus("Libraries ready. Select an image file.");
                console.log("FloorplanProcessor: Base UI created.");
            };
        }

        createUI() {
            this.container = document.createElement('div'); this.container.id = 'floorplan-container';
            this.controlsDiv = document.createElement('div'); this.controlsDiv.id = 'floorplan-controls';
            const fileInputLabel = document.createElement('label'); fileInputLabel.textContent = 'Upload Floorplan Image:'; fileInputLabel.htmlFor = 'floorplan-file-input'; this.fileInput = document.createElement('input'); this.fileInput.type = 'file'; this.fileInput.accept = 'image/*'; this.fileInput.id = 'floorplan-file-input'; this.controlsDiv.appendChild(fileInputLabel); this.controlsDiv.appendChild(this.fileInput);
            this.closeButton = document.createElement('button'); this.closeButton.id = 'floorplan-close-btn'; this.closeButton.textContent = '✕'; this.closeButton.title = 'Close';
            this.canvas = document.createElement('canvas'); this.canvas.id = 'floorplan-canvas'; this.canvas.width = this.CANVAS_WIDTH; this.canvas.height = this.CANVAS_HEIGHT; this.canvasCtx = this.canvas.getContext('2d');
            this.canvasLabel = document.createElement('div'); this.canvasLabel.id = 'floorplan-canvas-label'; this.canvasLabel.textContent = "Upload an image to see the detected shape preview.";
            this.statusLabel = document.createElement('span'); this.statusLabel.id = 'floorplan-status'; this.statusLabel.textContent = 'Initializing...';
            this.container.appendChild(this.closeButton);
            this.container.appendChild(this.controlsDiv);
            this.container.appendChild(this.canvas);
            this.container.appendChild(this.canvasLabel);
            this.container.appendChild(this.statusLabel);
            document.body.appendChild(this.container);
            this.uiCreated = true;
            console.log("FloorplanProcessor: Base UI elements created.");
        }

        updateStatus(message) {
            if (this.statusLabel) {
                this.statusLabel.textContent = message;
            } else if (this.loadingIndicator) {
                this.updateLoadingIndicator(message);
            }
            console.log("Floorplan Status:", message);
        }
    }

    // --Floorplan Manager Class (Orchestrator)--
    class FloorplanManager extends FloorplanProcessor {
        floorplanCreatorInstance = null;

        constructor() {
            super();
            console.log("FloorplanManager: Initializing...");
            this.showLoadingIndicator();
            this.start();
        }
    }

    // --- Instantiate the Manager ---
    new FloorplanManager();
})();