// ==UserScript==
// @name         Offline Speech-to-Text
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Offline speech-to-text using HuggingFace WASM models
// @author       Your name
// @match        *://*/*
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @require      https://cdn.jsdelivr.net/npm/@xenova/transformers@2.6.0
// ==/UserScript==

(function() {
    'use strict';

    // Create UI elements
    const createUI = () => {
        const container = document.createElement('div');
        container.id = 'stt-container';
        container.innerHTML = `
            <div class="stt-controls">
                <button id="stt-record" class="stt-button">Start Recording</button>
                <button id="stt-stop" class="stt-button" disabled>Stop</button>
                <div id="stt-status">Ready</div>
            </div>
            <div id="stt-output" class="stt-output"></div>
        `;

        document.body.appendChild(container);

        // Add styles
        GM_addStyle(`
            #stt-container {
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: white;
                padding: 15px;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                z-index: 10000;
                width: 300px;
            }
            .stt-controls {
                display: flex;
                gap: 10px;
                margin-bottom: 10px;
            }
            .stt-button {
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                background: #007bff;
                color: white;
                cursor: pointer;
            }
            .stt-button:disabled {
                background: #ccc;
                cursor: not-allowed;
            }
            #stt-status {
                padding: 8px;
                font-size: 14px;
            }
            .stt-output {
                min-height: 100px;
                max-height: 200px;
                overflow-y: auto;
                padding: 10px;
                border: 1px solid #ddd;
                border-radius: 4px;
            }
        `);
    };

    // Initialize Web Worker
    const initializeWorker = () => {
        const workerBlob = new Blob([`
            importScripts('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.6.0');

            let pipeline;

            self.onmessage = async function(e) {
                if (e.data.type === 'initialize') {
                    try {
                        const { pipeline: Pipeline } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.6.0');
                        pipeline = await Pipeline.new('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
                        self.postMessage({ type: 'initialized' });
                    } catch (error) {
                        self.postMessage({ type: 'error', error: error.message });
                    }
                } else if (e.data.type === 'transcribe') {
                    try {
                        const result = await pipeline(e.data.audio);
                        self.postMessage({ type: 'result', text: result.text });
                    } catch (error) {
                        self.postMessage({ type: 'error', error: error.message });
                    }
                }
            };
        `], { type: 'application/javascript' });

        return new Worker(URL.createObjectURL(workerBlob));
    };

    // Audio recording setup
    let mediaRecorder = null;
    let audioChunks = [];
    let worker = null;

    const setupRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);

            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                worker.postMessage({
                    type: 'transcribe',
                    audio: await audioBlob.arrayBuffer()
                });
                audioChunks = [];
                updateStatus('Processing audio...');
            };

        } catch (error) {
            console.error('Error accessing microphone:', error);
            updateStatus('Error: ' + error.message);
        }
    };

    // UI event handlers
    const updateStatus = (message) => {
        document.getElementById('stt-status').textContent = message;
    };

    const handleStartRecording = () => {
        if (mediaRecorder && mediaRecorder.state === 'inactive') {
            mediaRecorder.start();
            document.getElementById('stt-record').disabled = true;
            document.getElementById('stt-stop').disabled = false;
            updateStatus('Recording...');
        }
    };

    const handleStopRecording = () => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            document.getElementById('stt-record').disabled = false;
            document.getElementById('stt-stop').disabled = true;
        }
    };

    // Initialize application
    const initialize = async () => {
        createUI();
        worker = initializeWorker();

        worker.onmessage = (e) => {
            if (e.data.type === 'initialized') {
                updateStatus('Ready to record');
            } else if (e.data.type === 'result') {
                const outputDiv = document.getElementById('stt-output');
                outputDiv.textContent = e.data.text;
                updateStatus('Ready');
            } else if (e.data.type === 'error') {
                updateStatus('Error: ' + e.data.error);
            }
        };

        worker.postMessage({ type: 'initialize' });
        await setupRecording();

        // Add event listeners
        document.getElementById('stt-record').addEventListener('click', handleStartRecording);
        document.getElementById('stt-stop').addEventListener('click', handleStopRecording);
    };

    // Start the application
    initialize().catch(error => {
        console.error('Initialization error:', error);
        updateStatus('Initialization error: ' + error.message);
    });
})();
