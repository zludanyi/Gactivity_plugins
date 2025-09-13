// ==UserScript==
// @name         PodCastor
// @namespace    http://tampermonkey.net/
// @version      2.8
// @description  AI story generator with a modal for initial loading and a separate modal for generation.
// @author       ZLudany
// @match        *://*.ingatlan.com/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// ==/UserScript==
(function() {
    'use strict';

    // =========================================================================
    // 1. GENERIC LOGGING MECHANISM
    // =========================================================================
    const GenericLogger = {
        logContainer: null,
        progressBar: null,
        progressText: null,
        devVersion: true,

        init(container, progressBar, progressText) {
            this.logContainer = container;
            this.progressBar = progressBar;
            this.progressText = progressText;
        },
        log(message, source = 'Main') {
            if(this.devVersion){
               alert(`[${source}][LOG] ${message}`);
            }
            this.addMessage(`[${source}][LOG] ${message}`, 'log');
        },
        info(message, source = 'Main') {
            if(this.devVersion){
               alert(`[${source}][INFO] ${message}`);
            }
            this.addMessage(`[${source}][INFO] ${message}`, 'info');
        },
        error(message, source = 'Main') {
            if(this.devVersion){
               alert(`[${source}][ERROR] ${message}`);
            }
            this.addMessage(`[${source}][ERROR] ${message}`, 'error');
        },
        addMessage(text, type) {
            if (!this.logContainer) return;
            const p = document.createElement('p');
            p.textContent = text;
            p.className = type;
            this.logContainer.appendChild(p);
            this.logContainer.scrollTop = this.logContainer.scrollHeight;
        },
        updateProgress(value, text) {
            if (this.progressBar) {
                this.progressBar.value = value;
            }
            if (this.progressText) {
                this.progressText.textContent = text;
            }
        },
        clearProgress() {
            if (this.progressBar) {
                this.progressBar.value = 0;
            }
            if (this.progressText) {
                this.progressText.textContent = '';
            }
        }
    };

    // =========================================================================
    // 2. STORY GENERATOR
    // =========================================================================
    class StoryGenerator {
        constructor() {
            this.pipeline = null;
            this.generator = null;
            this.isLoading = false;
            this.isInitialized = false;
            this.loadingDialog = null;
            this.progressBar = null;
            this.progressText = null;
            this.db = null;
            this.DB_NAME = 'PodCastorAssetsDB';
            this.STORE_NAME = 'assetCache';
            this.DB_VERSION = 1;
            this.TRANSFORMERS_LIB_KEY = 'transformers-js-lib';
        }

        async openDB() {
            return new Promise((resolve, reject) => {
                if (this.db) {
                    resolve(this.db);
                    return;
                }

                const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                        db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
                    }
                };

                request.onsuccess = (event) => {
                    this.db = event.target.result;
                    resolve(this.db);
                };

                request.onerror = (event) => {
                    reject(event.target.error);
                };
            });
        }

        async getAssetFromCache(key) {
            const db = await this.openDB();
            return new Promise((resolve) => {
                const transaction = db.transaction([this.STORE_NAME], 'readonly');
                const store = transaction.objectStore(this.STORE_NAME);
                const request = store.get(key);
                request.onsuccess = () => {
                    resolve(request.result ? request.result.value : null);
                };
                request.onerror = () => {
                    resolve(null);
                };
            });
        }

        async saveAssetToCache(key, value) {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.STORE_NAME], 'readwrite');
                const store = transaction.objectStore(this.STORE_NAME);
                const request = store.put({ id: key, value: value });
                request.onsuccess = () => {
                    resolve();
                };
                request.onerror = (event) => {
                    reject(event.target.error);
                };
            });
        }

        async loadTransformersLibrary() {
            GenericLogger.updateProgress(0, "Checking for cached AI library...");

            const cachedScript = await this.getAssetFromCache(this.TRANSFORMERS_LIB_KEY);
            if (cachedScript) {
                GenericLogger.info("Loading Transformers.js library from IndexedDB cache.", "Generator");
                GenericLogger.updateProgress(100, "Executing cached AI library...");
                try {
                    (1,eval)(cachedScript);
                    if (typeof self.transformers !== 'undefined') {
                        return;
                    }
                    GenericLogger.warn("Cached script executed but `self.transformers` is not defined. Re-fetching.", "Generator");
                } catch (e) {
                    GenericLogger.error(`Failed to execute cached library: ${e.message}`, "Generator");
                }
            }

            return new Promise((resolve, reject) => {
                GenericLogger.updateProgress(0, "Downloading AI library (first time)...");
                const client = new XMLHttpRequest();
                client.open("GET", "https://cdn.jsdelivr.net/npm/@xenova/transformers/dist/transformers.min.js");
                client.onprogress = (pe) => {
                    if (pe.lengthComputable) {
                        const percentage = Math.round((pe.loaded / pe.total) * 100);
                        GenericLogger.updateProgress(percentage, `Downloading AI library... (${percentage}%)`);
                    }
                };
                client.onload = async () => {
                    if (client.status >= 200 && client.status < 300) {
                        const scriptText = client.responseText;
                        GenericLogger.updateProgress(100, "Library downloaded. Executing...");
                        try {
                            (1,eval)(scriptText);
                            if (typeof self.transformers !== 'undefined') {
                                await this.saveAssetToCache(this.TRANSFORMERS_LIB_KEY, scriptText);
                                GenericLogger.info("Saved Transformers.js library to cache.", "Generator");
                                resolve();
                            } else {
                                throw new Error("`self.transformers` not defined after execution.");
                            }
                        } catch (e) {
                            reject(e);
                        }
                    } else {
                        reject(new Error(`Failed to download library. Status: ${client.status}`));
                    }
                };
                client.onerror = () => {
                    reject(new Error("Network error downloading library."));
                };
                client.send();
            });
        }

        async initialize() {
            if (this.isInitialized) {
                return true;
            }
            if (this.isLoading) {
                GenericLogger.warn("Initialization already in progress.", "Generator");
                this.showLoadingModal("Initializing AI...");
                return false;
            }

            this.isLoading = true;
            this.showLoadingModal("Initializing AI...");

            try {
                if (typeof self.transformers === 'undefined') {
                    await this.loadTransformersLibrary();
                }

                const { pipeline, env } = self.transformers;
                env.allowLocalModels = false;
                env.useCache = true;

                this.pipeline = pipeline;
                GenericLogger.info("Transformers.js is ready.", "Generator");

                GenericLogger.updateProgress(0, "Loading AI model (may use cache)...");
                this.generator = await this.pipeline('text-generation', 'Xenova/gemma-2b-it', {
                    progress_callback: (progress) => {
                        const percentage = Math.round(progress.progress || 0);
                        const statusText = `Model: ${progress.file} (${percentage}%) - Status: ${progress.status}`;
                        GenericLogger.updateProgress(percentage, statusText);
                    }
                });

                GenericLogger.info('AI Model loaded and ready.', "Generator");
                GenericLogger.updateProgress(100, "Initialization Complete!");
                this.isLoading = false;
                this.isInitialized = true;

                setTimeout(() => this.closeLoadingModal(), 1200);
                return true;

            } catch (err) {
                GenericLogger.error('Initialization failed: ' + err.message, "Generator");
                GenericLogger.updateProgress(100, `Error: Initialization Failed!`);
                this.isLoading = false;
                return false;
            }
        }

        async generateStory(wordList) {
            if (!this.isInitialized) {
                GenericLogger.error("Generator is not initialized. Cannot generate story.", "Generator");
                alert("The AI generator has not been initialized. Please refresh and wait for initialization.");
                return null;
            }

            this.showLoadingModal("Generating story...");
            GenericLogger.info("Generating story...", "Generator");
            if (this.progressBar) {
                this.progressBar.removeAttribute('value');
                this.progressBar.classList.add('pulsing-progress');
            }

            let generationTimeoutId = null;

            try {
                const timeoutPromise = new Promise((_, reject) => {
                    generationTimeoutId = setTimeout(() => {
                        const timeoutError = new Error("Story generation timed out after 30 seconds.");
                        timeoutError.name = "TimeoutError";
                        reject(timeoutError);
                    }, 30000);
                });

                const formattedWordList = wordList.split('\n').filter(w => w.trim() !== '').join(', ');
                const messages = [
                    { role: "system", content: "You are a professional creative writer in Budapest. Today is Thursday, September 11, 2025. Your task is to generate a long, engaging, podcast-style English story of at least 400 words." },
                    { role: "user", content: `Please generate the story using this list of phrases: ${formattedWordList}` },
                ];

                const output = await Promise.race([
                    this.generator(messages, {
                        max_new_tokens: 768,
                        temperature: 0.7,
                        top_k: 50,
                    }),
                    timeoutPromise
                ]);

                clearTimeout(generationTimeoutId);
                generationTimeoutId = null;

                const fullResponse = output[0].generated_text;
                const story = fullResponse.split('<start_of_turn>model\n').pop().trim();

                GenericLogger.info('Story generation complete.', "Generator");
                GenericLogger.updateProgress(100, "Story generated successfully!");

                setTimeout(() => this.closeLoadingModal(), 1200);

                return story;

            } catch (err) {
                GenericLogger.error('Story generation error or timeout: ' + err.message, "Generator");

                if (generationTimeoutId) {
                    clearTimeout(generationTimeoutId);
                }

                if (this.loadingDialog) {
                    let errorMessage = '';
                    let buttonHtml = '';

                    if (err.name === "TimeoutError") {
                        errorMessage = `The story generation took too long to respond.
                                      <br><br><strong>Suggestion:</strong> Try again with fewer or simpler words in your list.`;
                        buttonHtml = `<button id="stg-retry-btn-zl" style="background-color: #007bff;">Try Again</button>`;
                    } else {
                        errorMessage = `An unexpected error occurred during generation:
                                      <br><br><em>${err.message}</em>`;
                        buttonHtml = `<button id="stg-close-btn-zl" style="background-color: #6c757d;">Close</button>`;
                    }

                    if (this.progressText) {
                        this.progressText.innerHTML = errorMessage;
                        this.progressText.style.textAlign = 'left';
                        this.progressText.style.fontStyle = 'normal';
                    }

                    if (this.progressBar) {
                        this.progressBar.outerHTML = buttonHtml;
                        this.progressBar = null;
                    }

                    const retryBtn = this.loadingDialog.querySelector('#stg-retry-btn-zl');
                    if (retryBtn) {
                        retryBtn.addEventListener('click', () => {
                            this.closeLoadingModal(true);
                            document.getElementById('generate-btn')?.click();
                        });
                    }

                    const closeBtn = this.loadingDialog.querySelector('#stg-close-btn-zl');
                    if (closeBtn) {
                        closeBtn.addEventListener('click', () => this.closeLoadingModal());
                    }
                }

                return null;
            }
        }

        showLoadingModal(title = "Processing...") {
            if (document.getElementById('stg-loading-dialog-zl')) {
                const dialog = document.getElementById('stg-loading-dialog-zl');
                if (!dialog.open) dialog.showModal();
                const titleEl = dialog.querySelector('h2');
                if (titleEl) titleEl.textContent = title;
                return;
            }
            this.loadingDialog = document.createElement('dialog');
            this.loadingDialog.id = 'stg-loading-dialog-zl';
            this.loadingDialog.innerHTML = `
                <h2>${title}</h2>
                <p>Please wait, this may take a moment.</p>
                <progress id="stg-progress-bar-zl" max="100" style="width: 100%;"></progress>
                <p id="stg-progress-text-zl" style="text-align: center; font-style: italic; min-height: 1.2em;"></p>
            `;
            document.body.appendChild(this.loadingDialog);
            this.progressBar = this.loadingDialog.querySelector('#stg-progress-bar-zl');
            this.progressText = this.loadingDialog.querySelector('#stg-progress-text-zl');

            GenericLogger.progressBar = this.progressBar;
            GenericLogger.progressText = this.progressText;

            this.loadingDialog.showModal();
        }

        closeLoadingModal(immediately = false) {
            if (this.loadingDialog && this.loadingDialog.open) {
                const dialogToRemove = this.loadingDialog;
                dialogToRemove.close();
                if (immediately) {
                    dialogToRemove.remove();
                } else {
                    dialogToRemove.addEventListener('close', () => dialogToRemove.remove(), { once: true });
                }
            }
            this.loadingDialog = null;
            this.progressBar = null;
            this.progressText = null;
            GenericLogger.progressBar = null;
            GenericLogger.progressText = null;
        }
    }

    // --- AudioCaptureService (Full definition from v2.6) ---
    class AudioCaptureService {
        constructor() { this.mediaRecorder = null; this.audioChunks = []; this.audioStream = null; this.audioContext = new (window.AudioContext || window.webkitAudioContext)();}
        async startCapture() { if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) { throw new Error('Your browser does not support screen/tab audio capture.'); } const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: { sampleRate: 44100 }}); this.audioStream = new MediaStream(displayStream.getAudioTracks()); this.mediaRecorder = new MediaRecorder(this.audioStream); this.audioChunks = []; this.mediaRecorder.ondataavailable = event => this.audioChunks.push(event.data); this.mediaRecorder.start(); return this.audioStream; }
        stopCapture() { return new Promise(resolve => { this.mediaRecorder.onstop = () => { (async () => { this.audioStream.getTracks().forEach(track => track.stop()); const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' }); const audioBuffer = await this.audioContext.decodeAudioData(await audioBlob.arrayBuffer()); const wavBlob = this.encodeWav(audioBuffer); resolve(wavBlob); })(); }; this.mediaRecorder.stop(); });}
        encodeWav(audioBuffer) { const numOfChan = audioBuffer.numberOfChannels; const length = audioBuffer.length * numOfChan * 2 + 44; const buffer = new ArrayBuffer(length); const view = new DataView(buffer); const channels = []; let i, sample, offset = 0; const writeString = (s) => { for (i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i)); }; writeString('RIFF'); offset += 4; view.setUint32(offset, length - 8, true); offset += 4; writeString('WAVE'); offset += 4; writeString('fmt '); offset += 4; view.setUint32(offset, 16, true); offset += 4; view.setUint16(offset, 1, true); offset += 2; view.setUint16(offset, numOfChan, true); offset += 2; view.setUint32(offset, audioBuffer.sampleRate, true); offset += 4; view.setUint32(offset, audioBuffer.sampleRate * 2 * numOfChan, true); offset += 4; view.setUint16(offset, numOfChan * 2, true); offset += 2; view.setUint16(offset, 16, true); offset += 2; writeString('data'); offset += 4; view.setUint32(offset, length - offset - 4, true); offset += 4; for (i = 0; i < numOfChan; i++) channels.push(audioBuffer.getChannelData(i)); for (i = 0; i < audioBuffer.length; i++) { for (let ch = 0; ch < numOfChan; ch++) { sample = Math.max(-1, Math.min(1, channels[ch][i])); sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0; view.setInt16(offset, sample, true); offset += 2; } } return new Blob([view], { type: 'audio/wav' });}
    }

    // --- AudioStoryPlayer (Full definition from v2.6) ---
    class AudioStoryPlayer {
        constructor(storyStorage) { this.container = null; this.speechSynthesis = window.speechSynthesis; this.isSpeaking = false; this.isRecording = false; this.currentIndex = 0; this.sentences = []; this.currentStoryText = ''; this.captureService = new AudioCaptureService(); this.selectedVoice = null; this.storyStorage = storyStorage; }
        setupDOM() {
            if (document.getElementById('audio-story-container')) return;
            this.container = document.createElement('div'); this.container.id = 'audio-story-container'; this.container.innerHTML = `<h2>Generated Story</h2><div class="story-config"><label for="voice-select">Voice:</label><select id="voice-select"></select></div><div id="story-display"></div><div id="story-controls"><button id="play-btn">Play</button><button id="pause-btn" disabled>Pause</button><button id="stop-btn" disabled>Stop</button><button id="record-btn">Record & Download</button><span id="record-status" class="record-status"></span><button id="save-story-btn">Save Story</button></div><div id="download-container"></div>`;
            document.body.appendChild(this.container); this.setupControls(); this.populateVoiceList(); if (this.speechSynthesis.getVoices().length === 0) { this.speechSynthesis.onvoiceschanged = () => this.populateVoiceList(); }
        }
        setupControls() {
            document.getElementById('play-btn').addEventListener('click', () => this.play()); document.getElementById('pause-btn').addEventListener('click', () => this.pause()); document.getElementById('stop-btn').addEventListener('click', () => this.stop()); document.getElementById('record-btn').addEventListener('click', () => this.handleRecording()); document.getElementById('save-story-btn').addEventListener('click', () => this.saveCurrentStory()); document.getElementById('voice-select').addEventListener('change', (e) => { const voiceName = e.target.value; this.selectedVoice = this.speechSynthesis.getVoices().find(voice => voice.name === voiceName); GenericLogger.log(`Selected voice: ${voiceName}`, "AudioPlayer");}); this.updateButtonState();
        }
        populateVoiceList() {
            const voiceSelect = document.getElementById('voice-select'); if(!voiceSelect) return; voiceSelect.innerHTML = ''; const voices = this.speechSynthesis.getVoices(); if (voices.length === 0) { GenericLogger.warn("No voices available yet.", "AudioPlayer"); return;} const defaultVoice = voices.find(voice => voice.lang === 'en-US' && voice.name.includes('Google') || voice.default); voices.forEach(voice => { const option = document.createElement('option'); option.textContent = `${voice.name} (${voice.lang})`; option.value = voice.name; if (defaultVoice && voice.name === defaultVoice.name) { option.selected = true; this.selectedVoice = defaultVoice; } voiceSelect.appendChild(option);}); if (!this.selectedVoice && voices.length > 0) { this.selectedVoice = voices[0]; voiceSelect.value = voices[0].name; } GenericLogger.info(`Found ${voices.length} speech synthesis voices.`, "AudioPlayer");
        }
        loadStory(storyText) {
            this.stop(); this.currentStoryText = storyText; this.sentences = storyText.match(/[^.!?]+[.!?]+/g) || [storyText]; this.currentIndex = 0; const storyDisplay = document.getElementById('story-display'); if(!storyDisplay) return; storyDisplay.innerHTML = ''; this.sentences.forEach((sentence, index) => { const span = document.createElement('span'); span.textContent = sentence.trim() + ' '; span.id = `sentence-${index}`; storyDisplay.appendChild(span); }); this.container.style.display = 'flex'; this.updateButtonState(); this.play();
        }
        play() { if (!this.currentStoryText) return; if (this.speechSynthesis.paused) { this.speechSynthesis.resume(); } else { this.speak(this.currentIndex); } this.isSpeaking = true; this.updateButtonState(); }
        pause() { this.speechSynthesis.pause(); this.isSpeaking = false; this.updateButtonState(); }
        stop() { this.speechSynthesis.cancel(); this.isSpeaking = false; this.currentIndex = 0; this.updateButtonState(); const spans = document.querySelectorAll('#story-display span'); if(spans) spans.forEach(s => s.classList.remove('highlight')); }
        speak(index) { if (!this.selectedVoice) { GenericLogger.error("No speech synthesis voice selected.", "AudioPlayer"); this.stop(); return; } if (index >= this.sentences.length) { this.stop(); return; } this.highlightAndScroll(index); const utterance = new SpeechSynthesisUtterance(this.sentences[index]); utterance.voice = this.selectedVoice; utterance.onend = () => { this.currentIndex++; this.speak(this.currentIndex); }; this.speechSynthesis.speak(utterance); }
        highlightAndScroll(index) {
            const spans = document.querySelectorAll('#story-display span'); if(spans) spans.forEach(s => s.classList.remove('highlight')); const el = document.getElementById(`sentence-${index}`); if (el) { el.classList.add('highlight'); const rect = el.getBoundingClientRect(); const containerRect = document.getElementById('story-display').getBoundingClientRect(); if (rect.top < containerRect.top || rect.bottom > containerRect.bottom) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }
        }
        updateButtonState() { const hasStory = this.sentences.length > 0; const playBtn = document.getElementById('play-btn'); const pauseBtn = document.getElementById('pause-btn'); const stopBtn = document.getElementById('stop-btn'); const recordBtn = document.getElementById('record-btn'); const saveBtn = document.getElementById('save-story-btn'); if(playBtn) playBtn.disabled = this.isSpeaking || !hasStory; if(pauseBtn) pauseBtn.disabled = !this.isSpeaking || !hasStory; if(stopBtn) stopBtn.disabled = (!this.isSpeaking && this.currentIndex === 0) || !hasStory; if(recordBtn) recordBtn.disabled = this.isRecording || !hasStory; if(saveBtn) saveBtn.disabled = !hasStory; }
        async handleRecording() {
            if (this.isRecording || this.sentences.length === 0) return; const recordBtn = document.getElementById('record-btn'); const recordStatus = document.getElementById('record-status'); if(!recordBtn || !recordStatus) return; recordBtn.textContent = 'Recording...'; recordBtn.classList.add('recording-active'); recordStatus.textContent = 'Recording tab audio...'; this.isRecording = true; this.updateButtonState(); document.getElementById('download-container').innerHTML = ''; try { await this.captureService.startCapture(); GenericLogger.info("Audio capture started.", "CaptureService"); const fullText = this.sentences.join(' '); const utterance = new SpeechSynthesisUtterance(fullText); utterance.voice = this.selectedVoice; utterance.onend = async () => { GenericLogger.info("Speech synthesis finished. Stopping audio capture...", "CaptureService"); const wavBlob = await this.captureService.stopCapture(); this.createDownloadLink(wavBlob); this.isRecording = false; recordBtn.textContent = 'Record & Download'; recordBtn.classList.remove('recording-active'); recordStatus.textContent = ''; this.updateButtonState(); GenericLogger.info("Audio capture and WAV conversion complete.", "CaptureService"); }; utterance.onerror = (e) => { GenericLogger.error(`Speech synthesis error during recording: ${e.error}`, "CaptureService"); this.captureService.stopCapture().catch(err => GenericLogger.error(`Error stopping capture after TTS error: ${err.message}`, "CaptureService")); this.isRecording = false; recordBtn.textContent = 'Record & Download'; recordBtn.classList.remove('recording-active'); recordStatus.textContent = 'Recording failed.'; this.updateButtonState(); alert("Speech synthesis failed during recording."); }; this.speechSynthesis.speak(utterance); } catch (err) { GenericLogger.error(err.message, "CaptureService"); alert("Audio capture failed. Grant permission and check console."); this.isRecording = false; recordBtn.textContent = 'Record & Download'; recordBtn.classList.remove('recording-active'); recordStatus.textContent = 'Recording failed.'; this.updateButtonState(); }
        }
        createDownloadLink(blob) {
            const url = URL.createObjectURL(blob); const downloadContainer = document.getElementById('download-container'); const fileName = `PodCastor-Story-${new Date().toISOString().slice(0,10).replace(/-/g, '')}.wav`; if(downloadContainer) downloadContainer.innerHTML = `<a href="${url}" download="${fileName}" class="download-link">Download Captured Story (.wav)</a>`;
        }
        async saveCurrentStory() { if (!this.currentStoryText) { GenericLogger.error("No story to save.", "AudioPlayer"); return; } const defaultTitle = `Story - ${new Date().toLocaleString()}`; const storyTitle = prompt("Enter a title for your story:", defaultTitle); if (storyTitle === null) { return; } try { await this.storyStorage.saveStory({ title: storyTitle || defaultTitle, content: this.currentStoryText, timestamp: new Date().toISOString() }); GenericLogger.info(`Story "${storyTitle || defaultTitle}" saved successfully!`, "AudioPlayer"); await PodCastorApp.instance.refreshSavedStoriesUI(); } catch (error) { GenericLogger.error(`Failed to save story: ${error.message}`, "AudioPlayer"); alert("Failed to save story. See log for details."); } }
        loadSavedStory(storyObject) { if (storyObject && storyObject.content) { GenericLogger.info(`Loading saved story: "${storyObject.title}"`, "AudioPlayer"); this.loadStory(storyObject.content); } else { GenericLogger.error("Attempted to load an invalid saved story object.", "AudioPlayer"); }}
    }

    // --- StoryStorage (Full definition from v2.6) ---
    class StoryStorage {
        constructor() { this.db = null; this.DB_NAME = 'PodCastorDB'; this.STORE_NAME = 'stories'; this.DB_VERSION = 1;}
        async openDB() { return new Promise((resolve, reject) => { if (this.db) { resolve(this.db); return; } const request = indexedDB.open(this.DB_NAME, this.DB_VERSION); request.onupgradeneeded = (event) => { const db = event.target.result; if (!db.objectStoreNames.contains(this.STORE_NAME)) { db.createObjectStore(this.STORE_NAME, { keyPath: 'id', autoIncrement: true }); GenericLogger.log("IndexedDB object store created.", "StoryStorage"); } }; request.onsuccess = (event) => { this.db = event.target.result; GenericLogger.log("IndexedDB opened successfully.", "StoryStorage"); resolve(this.db); }; request.onerror = (event) => { GenericLogger.error(`IndexedDB error: ${event.target.error}`, "StoryStorage"); reject(event.target.error); }; });}
        async saveStory(story) { const db = await this.openDB(); return new Promise((resolve, reject) => { const transaction = db.transaction([this.STORE_NAME], 'readwrite'); const store = transaction.objectStore(this.STORE_NAME); const request = store.add(story); request.onsuccess = () => resolve(request.result); request.onerror = (event) => reject(event.target.error); });}
        async getStories() { const db = await this.openDB(); return new Promise((resolve, reject) => { const transaction = db.transaction([this.STORE_NAME], 'readonly'); const store = transaction.objectStore(this.STORE_NAME); const request = store.getAll(); request.onsuccess = () => resolve(request.result); request.onerror = (event) => reject(event.target.error); });}
        async getStory(id) { const db = await this.openDB(); return new Promise((resolve, reject) => { const transaction = db.transaction([this.STORE_NAME], 'readonly'); const store = transaction.objectStore(this.STORE_NAME); const request = store.get(id); request.onsuccess = () => resolve(request.result); request.onerror = (event) => reject(event.target.error); });}
        async deleteStory(id) { const db = await this.openDB(); return new Promise((resolve, reject) => { const transaction = db.transaction([this.STORE_NAME], 'readwrite'); const store = transaction.objectStore(this.STORE_NAME); const request = store.delete(id); request.onsuccess = () => resolve(); request.onerror = (event) => reject(event.target.error); });}
    }


    // =========================================================================
    // 7. MAIN APPLICATION CLASS: PodCastor (MODIFIED)
    // =========================================================================
    class PodCastorApp {
        constructor() {
            if (PodCastorApp.instance) {
                return PodCastorApp.instance;
            }
            PodCastorApp.instance = this;

            this.storyStorage = new StoryStorage();
            this.audioPlayer = new AudioStoryPlayer(this.storyStorage);
            this.storyGenerator = new StoryGenerator();
            this.DOM = {};
        }

        async init() {
            this.injectUI();
            this.addStyles();
            GenericLogger.init(this.DOM.logContainer, this.DOM.progressBar, this.DOM.progressText);
            this.audioPlayer.setupDOM();
            this.setupEventListeners();
            await this.storyStorage.openDB();
            await this.refreshSavedStoriesUI();
            GenericLogger.info("PodCastor application initialized.", "System");

            // --- TRIGGER INITIALIZATION ---
            // This will show the modal for the initial, one-time load.
            const success = await this.storyGenerator.initialize();

            if (success) {
                this.DOM.generateBtn.disabled = false;
                GenericLogger.info("AI is ready. You can now generate a story.", "System");
            } else {
                this.DOM.generateBtn.textContent = 'Generator Failed to Load';
                this.DOM.generateBtn.disabled = true;
                GenericLogger.error("AI Initialization Failed. Check modal/console for details.", "System");
            }
        }

        injectUI() {
             document.body.innerHTML = '';
             document.title = 'PodCastor';
             const appContainer = document.createElement('div');
             appContainer.id = 'podcastor-app';
             appContainer.innerHTML = `
                <div class="header"><h1>PodCastor 🎙️</h1><p>AI-Powered Story Generator</p></div>
                <div class="content">
                    <label for="word-list">Enter your words (one per line):</label>
                    <textarea id="word-list" rows="10" placeholder="Julianna, traveling, meet new people"></textarea>
                    <button id="generate-btn" disabled>Initializing AI...</button>
                    <div class="progress-container">
                        <progress id="llm-progress" value="0" max="100"></progress>
                        <span id="llm-progress-text"></span>
                    </div>
                    <div class="log-panel"><h3>Process Log</h3><div id="log-container"></div></div>
                    <div class="saved-stories-panel"><h3>Saved Stories</h3><div id="saved-stories-list"><p>Loading...</p></div></div>
                </div>`;
            document.body.appendChild(appContainer);
            this.DOM.wordListInput = document.getElementById('word-list');
            this.DOM.generateBtn = document.getElementById('generate-btn');
            this.DOM.progressBar = document.getElementById('llm-progress');
            this.DOM.progressText = document.getElementById('llm-progress-text');
            this.DOM.logContainer = document.getElementById('log-container');
            this.DOM.savedStoriesList = document.getElementById('saved-stories-list');
        }

        /**
         * Injects all necessary CSS styles into the document's <head>
         * by creating a <style> tag. This is Tampermonkey-agnostic.
         */
        addStyles() {
            // Use the beautified CSS from above
            const styles = `
                body {
                    background-color: #1c1c1e;
                    color: #f2f2f7;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    margin: 0;
                    padding: 0;
                }

                #podcastor-app {
                    max-width: 800px;
                    margin: 40px auto;
                    padding: 20px;
                    background-color: #2c2c2e;
                    border-radius: 12px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                }

                body {
                    background-color: #1c1c1e;
                    color: #f2f2f7;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    margin: 0;
                    padding: 0;
                }

                #podcastor-app {
                    max-width: 800px;
                    margin: 40px auto;
                    padding: 20px;
                    background-color: #2c2c2e;
                    border-radius: 12px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                }

                .header {
                    text-align: center;
                    border-bottom: 1px solid #444;
                    padding-bottom: 20px;
                    margin-bottom: 20px;
                }

                .header h1 {
                    margin: 0;
                    color: #0a84ff;
                }

                .content label {
                    display: block;
                    font-size: 16px;
                    margin-bottom: 10px;
                }

                #word-list {
                    width: 100%;
                    padding: 10px;
                    background-color: #3a3a3c;
                    border: 1px solid #555;
                    border-radius: 8px;
                    color: white;
                    font-size: 1em;
                    box-sizing: border-box;
                    resize: vertical;
                    margin-bottom: 15px;
                }

                #generate-btn {
                    display: block;
                    width: 100%;
                    padding: 15px;
                    margin-bottom: 20px;
                    background-color: #007aff;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-size: 18px;
                    font-weight: bold;
                    cursor: pointer;
                    transition: background-color 0.2s;
                }

                #generate-btn:hover:not(:disabled) {
                    background-color: #0a84ff;
                }

                #generate-btn:disabled {
                    background-color: #555;
                    cursor: not-allowed;
                }

                .progress-container {
                    margin-bottom: 20px;
                    text-align: center;
                }

                #llm-progress {
                    width: 100%;
                    height: 10px;
                    border-radius: 5px;
                    appearance: none;
                    -webkit-appearance: none;
                    background-color: #444;
                }

                #llm-progress::-webkit-progress-bar {
                    background-color: #444;
                    border-radius: 5px;
                }

                #llm-progress::-webkit-progress-value {
                    background-color: #0a84ff;
                    border-radius: 5px;
                }

                #llm-progress::-moz-progress-bar {
                    background-color: #0a84ff;
                    border-radius: 5px;
                }

                #llm-progress-text {
                    display: block;
                    margin-top: 5px;
                    font-size: 0.9em;
                    color: #bbb;
                }

                .log-panel {
                    margin-top: 30px;
                }

                #log-container {
                    height: 150px;
                    overflow-y: auto;
                    background-color: #1c1c1e;
                    border: 1px solid #444;
                    border-radius: 8px;
                    padding: 10px;
                    font-family: 'Menlo', 'Courier New', monospace;
                    font-size: 0.85em;
                    user-select: text;
                    -webkit-user-select: text;
                }

                #log-container p {
                    margin: 0 0 5px;
                    word-break: break-all;
                }

                #log-container .info {
                    color: #50e3c2;
                }

                #log-container .error {
                    color: #ff453a;
                }

                #log-container .log {
                    color: #ccc;
                }

                .saved-stories-panel {
                    margin-top: 30px;
                }

                #saved-stories-list {
                    background-color: #1c1c1e;
                    border: 1px solid #444;
                    border-radius: 8px;
                    padding: 10px;
                    min-height: 80px;
                    max-height: 300px;
                    overflow-y: auto;
                }

                .saved-story-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 0;
                    border-bottom: 1px solid #333;
                }

                .saved-story-item:last-child {
                    border-bottom: none;
                }

                .saved-story-info {
                    flex-grow: 1;
                    cursor: pointer;
                    padding-right: 10px;
                }

                .saved-story-info:hover {
                    color: #0a84ff;
                }

                .saved-story-info h4 {
                    margin: 0;
                    font-size: 1.1em;
                }

                .saved-story-info p {
                    margin: 2px 0 0;
                    font-size: 0.8em;
                    color: #888;
                }

                .saved-story-actions button {
                    background-color: #ff453a;
                    color: white;
                    border: none;
                    padding: 5px 10px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 0.8em;
                    transition: background-color 0.2s;
                    margin-left: 5px;
                }

                .saved-story-actions button:hover {
                    background-color: #ff3b30;
                }

                #audio-story-container {
                    display: none;
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    width: 400px;
                    max-height: 50vh;
                    background-color: #2c2c2e;
                    border: 1px solid #444;
                    border-radius: 12px;
                    z-index: 9999;
                    flex-direction: column;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                }

                #audio-story-container h2 {
                    padding: 15px 20px;
                    margin: 0;
                    font-size: 18px;
                    background-color: #3a3a3c;
                    border-bottom: 1px solid #444;
                }

                .story-config {
                    padding: 10px 20px;
                    border-bottom: 1px solid #444;
                    background-color: #3a3a3c;
                    display: flex;
                    align-items: center;
                }

                .story-config label {
                    margin-right: 10px;
                    font-size: 0.9em;
                }

                #voice-select {
                    flex-grow: 1;
                    padding: 5px;
                    border-radius: 6px;
                    border: 1px solid #555;
                    background-color: #1c1c1e;
                    color: white;
                    font-size: 0.9em;
                }

                #story-display {
                    padding: 20px;
                    overflow-y: auto;
                    flex-grow: 1;
                    line-height: 1.6;
                    font-size: 16px;
                }

                #story-display span.highlight {
                    background-color: #007aff;
                    color: white;
                    border-radius: 3px;
                    padding: 0 2px;
                }

                #story-controls {
                    display: flex;
                    justify-content: center;
                    flex-wrap: wrap;
                    padding: 15px;
                    background-color: #3a3a3c;
                    border-top: 1px solid #444;
                    align-items: center;
                }

                #story-controls button {
                    background-color: #007aff;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    margin: 5px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 14px;
                    transition: background-color 0.2s;
                }

                #story-controls button:hover:not(:disabled) {
                    background-color: #0a84ff;
                }

                #story-controls button:disabled {
                    background-color: #555;
                    cursor: not-allowed;
                    opacity: 0.6;
                }

                #story-controls #record-btn {
                    background-color: #34c759;
                }

                #story-controls #record-btn:hover:not(:disabled) {
                    background-color: #30d158;
                }

                #story-controls #record-btn.recording-active {
                    animation: pulse 1.5s infinite;
                }

                @keyframes pulse {
                    0% {
                        box-shadow: 0 0 0 0 rgba(52, 199, 89, 0.7);
                    }
                    70% {
                        box-shadow: 0 0 0 10px rgba(52, 199, 89, 0);
                    }
                    100% {
                        box-shadow: 0 0 0 0 rgba(52, 199, 89, 0);
                    }
                }

                .record-status {
                    margin-left: 10px;
                    font-size: 0.9em;
                    color: #a2d6a6;
                }

                #story-controls #save-story-btn {
                    background-color: #ff9f0a;
                }

                #story-controls #save-story-btn:hover:not(:disabled) {
                    background-color: #ffb100;
                }

                #download-container {
                    padding: 10px 20px;
                    background-color: #1c1c1e;
                    text-align: center;
                    border-top: 1px solid #444;
                }

                .download-link {
                    display: inline-block;
                    padding: 10px 20px;
                    background-color: #0a84ff;
                    color: white;
                    text-decoration: none;
                    border-radius: 8px;
                    font-weight: bold;
                    transition: background-color 0.2s, transform 0.2s;
                }

                .download-link:hover {
                    background-color: #3395ff;
                    transform: translateY(-2px);
                }

                #stg-loading-dialog-zl {
                    border: 1px solid #ccc;
                    border-radius: 8px;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                    padding: 2em;
                    max-width: 500px;
                    opacity: 0;
                    transform: scaleY(0);
                    transition:
                        opacity 0.5s ease-out,
                        transform 0.5s ease-out,
                        overlay 0.5s ease-out allow-discrete,
                        display 0.5s ease-out allow-discrete;
                }

                #stg-loading-dialog-zl[open] {
                    opacity: 1;
                    transform: scaleY(1);
                }

                @starting-style {
                    #stg-loading-dialog-zl[open] {
                        opacity: 0;
                        transform: scaleY(0);
                    }
                }

                #stg-loading-dialog-zl::backdrop {
                    background-color: transparent;
                    transition: all 0.5s allow-discrete;
                }

                #stg-loading-dialog-zl[open]::backdrop {
                    background-color: rgb(0 0 0 / 25%);
                }

                @starting-style {
                    #stg-loading-dialog-zl[open]::backdrop {
                        background-color: transparent;
                    }
                }

                #stg-progress-bar-zl.pulsing-progress::-webkit-progress-value,
                #stg-progress-bar-zl.pulsing-progress::-moz-progress-bar {
                    background-color: #ff9f0a;
                }

                progress:not([value])::-webkit-progress-value {
                    background-color: #ff9f0a;
                    animation: pulse-bg 2s infinite;
                }

                progress:not([value])::-moz-progress-bar {
                    background-color: #ff9f0a;
                    animation: pulse-bg 2s infinite;
                }
            `;

            const styleSheet = document.createElement("style");
            styleSheet.id = "podcastor-styles"; // Add an ID for easy inspection
            styleSheet.innerText = styles;
            document.head.appendChild(styleSheet);

            GenericLogger.info("Native CSS styles injected into document head.", "System");
        }

        setupEventListeners() {
            this.DOM.generateBtn.addEventListener('click', () => this.handleGenerateClick());
        }

        async handleGenerateClick() {
            const wordList = this.DOM.wordListInput.value.trim();
            if (!wordList) {
                GenericLogger.error("Word list cannot be empty.", "System");
                return;
            }
            if (!this.storyGenerator.isInitialized) {
                GenericLogger.error("Generator is not ready.", "System");
                alert("The AI generator is still initializing. Please wait for the main button to say 'Generate Story'.");
                return;
            }

            this.DOM.generateBtn.disabled = true;
            this.DOM.generateBtn.textContent = 'Generating...';
            const story = await this.storyGenerator.generateStory(wordList);
            this.DOM.generateBtn.disabled = false;
            this.DOM.generateBtn.textContent = 'Generate Story';

            if (story) {
                this.audioPlayer.loadStory(story);
            } else {
                GenericLogger.error("Story generation returned no result. The modal may show an error.", "System");
            }
        }

        async refreshSavedStoriesUI() {
             this.DOM.savedStoriesList.innerHTML = '<p>Loading saved stories...</p>';
             try {
                 const stories = await this.storyStorage.getStories();
                 if (stories.length === 0) {
                     this.DOM.savedStoriesList.innerHTML = '<p>No stories saved yet.</p>';
                 } else {
                     this.DOM.savedStoriesList.innerHTML = '';
                     stories.forEach(story => {
                         const storyItem = document.createElement('div');
                         storyItem.className = 'saved-story-item';
                         storyItem.innerHTML = `<div class="saved-story-info"><h4>${story.title}</h4><p>Saved: ${new Date(story.timestamp).toLocaleString()}</p></div><div class="saved-story-actions"><button class="load-story-btn" data-id="${story.id}">Load</button><button class="delete-story-btn" data-id="${story.id}">Delete</button></div>`;
                         this.DOM.savedStoriesList.appendChild(storyItem);
                     });
                     this.DOM.savedStoriesList.querySelectorAll('.load-story-btn').forEach(button => {
                         button.addEventListener('click', async (e) => {
                             const id = parseInt(e.target.dataset.id);
                             const story = await this.storyStorage.getStory(id);
                             if (story) { this.audioPlayer.loadSavedStory(story); }
                         });
                     });
                     this.DOM.savedStoriesList.querySelectorAll('.delete-story-btn').forEach(button => {
                         button.addEventListener('click', async (e) => {
                             const id = parseInt(e.target.dataset.id);
                             if (confirm('Are you sure you want to delete this story?')) {
                                 await this.storyStorage.deleteStory(id);
                                 GenericLogger.info(`Story with ID ${id} deleted.`, "System");
                                 this.refreshSavedStoriesUI();
                             }
                         });
                     });
                 }
             } catch (error) {
                 GenericLogger.error(`Failed to load saved stories: ${error.message}`, "System");
                 this.DOM.savedStoriesList.innerHTML = '<p class="error">Error loading saved stories.</p>';
             }
        }
    }

    // --- APPLICATION ENTRY POINT ---
    window.addEventListener('load', () => {
        document.body.innerHTML = "";
        const app = new PodCastorApp();
        app.init();
    });

})();
