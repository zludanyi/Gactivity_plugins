// ==UserScript==
// @name         Advanced Website Update Monitor with Auto-Hide UI
// @namespace    http://your.namespace.com
// @version      2.14
// @description  Monitors updates with iframe refresh, partial DOM injection, auto-hiding UI, and more
// @author       Grok
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==
(function() {
    'use strict';
    // Default settings
    const DEFAULTS = {
        targetElements: 'body',
        logDetails: true,
        playSound: true,
        iframeRefreshInterval: 600000,
        autoHideUI: false
    };
    // Load initial settings
    const initialSettings = {
        targetElements: GM_getValue('targetElements', DEFAULTS.targetElements),
        logDetails: GM_getValue('logDetails', DEFAULTS.logDetails),
        playSound: GM_getValue('playSound', DEFAULTS.playSound),
        iframeRefreshInterval: GM_getValue('iframeRefreshInterval', DEFAULTS.iframeRefreshInterval),
        autoHideUI: GM_getValue('autoHideUI', DEFAULTS.autoHideUI)
    };
    // Proxy handler for automatic updates
    const handler = {
        set(target, property, value) {
            if (target[property] === value) {
                return true;
            }
            target[property] = value;
            if (!saving) {
                updateSaveButtonState();
            }
            return true;
        }
    };
    // Proxy for settings to detect changes
    const settings = new Proxy(initialSettings, handler);
    // State variables
    let saving = false;
    let isMonitoring = true;
    let iframe = null;
    let iframeRefreshId = null;
    let isInitialized = false;
    let isUIHidden = false;
    // IDs for elements
    const UI_ID = 'updatemonitorui';
    const NOTIFIER_ID = 'updatemonitornotifier';
    const IFRAME_ID = 'monitor-iframe';
    const MESSAGE_ORIGIN = window.location.origin;
    // Sound alert function
    function playAlertSound() {
        if (!settings.playSound) return;
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
        oscillator.connect(audioCtx.destination);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.2);
    }
    // Notifier creation and notification function
    function createNotifier() {
        let notifier = document.getElementById(NOTIFIER_ID);
        if (!notifier) {
            notifier = document.createElement('div');
            notifier.id = NOTIFIER_ID;
            notifier.style.cssText = `
                position: fixed;
                bottom: 10px;
                right: 10px;
                padding: 10px;
                background: #333;
                color: #fff;
                border-radius: 5px;
                z-index: 9999;
                display: none;
            `;
            notifier.addEventListener('click', function() {
                playAlertSound();
                if (!settings.autoHideUI && isUIHidden) {
                    showUI();
                }
            });
            document.body.appendChild(notifier);
        }
        return notifier;
    }
    function showNotification(message) {
        const notifier = createNotifier();
        notifier.textContent = message;
        notifier.style.display = 'block';
        notifier.dispatchEvent(new Event('click'));
        setTimeout(() => notifier.style.display = 'none', 3000);
    }
    // Functions to show and hide the UI
    function showUI() {
        document.getElementById(UI_ID).style.display = 'block';
        isUIHidden = false;
    }
    function hideUI() {
        document.getElementById(UI_ID).style.display = 'none';
        isUIHidden = true;
    }
    function handleAutoHideUI() {
        if (settings.autoHideUI && isInitialized) {
            hideUI();
        } else {
            showUI();
        }
    }
    // Create UI and handle saving settings
    function createUI() {
        let ui = document.getElementById(UI_ID);
        if (!ui) {
            ui = document.createElement('div');
            ui.id = UI_ID;
            ui.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                padding: 10px;
                background: #fff;
                border: 1px solid #ccc;
                border-radius: 5px;
                z-index: 9999;
                font-family: Arial, sans-serif;
                box-shadow: 0 0 5px rgba(0,0,0,0.3);
            `;
            ui.innerHTML = `
                <h3 style="margin: 0 0 10px; font-size: 14px;">Update Monitor</h3>
                <label>Target Elements: <input type="text" id="targetElements" value="${initialSettings.targetElements}" title="Comma-separated selectors"></label><br>
                <label>Iframe Refresh (ms): <input type="number" id="iframeRefreshInterval" value="${initialSettings.iframeRefreshInterval}" min="60000" step="60000" title="Set to 0 to disable"></label><br>
                <label><input type="checkbox" id="logDetails" ${initialSettings.logDetails ? 'checked' : ''}> Log Details</label><br>
                <label><input type="checkbox" id="playSound" ${initialSettings.playSound ? 'checked' : ''}> Play Sound</label><br>
                <label><input type="checkbox" id="autoHideUI" ${initialSettings.autoHideUI ? 'checked' : ''}> Auto Hide UI</label><br>
                <button id="toggleMonitor">${isMonitoring ? 'Pause' : 'Resume'}</button>
                <button id="saveSettings" disabled>Save</button>
                <button id="closeUI">Close</button>
            `;
            document.body.appendChild(ui);
            // Event listeners for input fields to update settings and button state
            document.getElementById('targetElements').addEventListener('input', function() {
                settings.targetElements = this.value;
                updateSaveButtonState();
            });
            document.getElementById('iframeRefreshInterval').addEventListener('input', function() {
                settings.iframeRefreshInterval = parseInt(this.value);
                updateSaveButtonState();
            });
            document.getElementById('logDetails').addEventListener('change', function() {
                settings.logDetails = this.checked;
                updateSaveButtonState();
            });
            document.getElementById('playSound').addEventListener('change', function() {
                settings.playSound = this.checked;
                updateSaveButtonState();
            });
            document.getElementById('autoHideUI').addEventListener('change', function() {
                settings.autoHideUI = this.checked;
                updateSaveButtonState();
            });
            // Close button event listener
            document.getElementById('closeUI').addEventListener('click', hideUI);
            // Initialize save button state
            updateSaveButtonState();
        }
        return ui;
    }
    // Function to update the save button state based on changes
    function updateSaveButtonState() {
        const saveButton = document.getElementById('saveSettings');
        const hasChanges = (
            settings.targetElements !== initialSettings.targetElements ||
            settings.iframeRefreshInterval !== initialSettings.iframeRefreshInterval ||
            settings.logDetails !== initialSettings.logDetails ||
            settings.playSound !== initialSettings.playSound ||
            settings.autoHideUI !== initialSettings.autoHideUI
        );
        saveButton.disabled = !hasChanges;
    }
    // Function to save settings and sync with iframe
    function saveSettings() {
        saving = true;
        // Update initialSettings to current settings values
        initialSettings.targetElements = settings.targetElements;
        initialSettings.iframeRefreshInterval = settings.iframeRefreshInterval;
        initialSettings.logDetails = settings.logDetails;
        initialSettings.playSound = settings.playSound;
        initialSettings.autoHideUI = settings.autoHideUI;
        // Update GM storage
        GM_setValue('targetElements', settings.targetElements);
        GM_setValue('iframeRefreshInterval', settings.iframeRefreshInterval);
        GM_setValue('logDetails', settings.logDetails);
        GM_setValue('playSound', settings.playSound);
        GM_setValue('autoHideUI', settings.autoHideUI);
        // Sync with iframe
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({ type: 'updateSettings', settings: settings }, MESSAGE_ORIGIN);
        }
        // Restart monitoring
        restartMonitoring();
        // Update notifier and UI visibility
        handleAutoHideUI();
        // Show notification
        showNotification('Settings saved!');
        // Update save button state
        updateSaveButtonState();
        saving = false;
    }
    // partialObserverFunction to set up MutationObserver in the iframe
    function monitorInIframe() {
        let settings = initialSettings;
        let observer = null;
        function partialObserverFunction(settings) {
            const targets = settings.targetElements.split(',').map(s => s.trim());
            const observedElements = new Set();
            targets.forEach(selector => {
                document.querySelectorAll(selector).forEach(el => observedElements.add(el));
            });
            const obs = new MutationObserver((mutations) => {
                mutations.forEach(mutation => {
                    let target = mutation.target;
                    let key = null;
                    observedElements.forEach((el, index) => {
                        if (el.contains(target) || el === target) {
                            const selector = targets.find(s => el.matches(s));
                            key = `${selector}-${el.id || index}`;
                        }
                    });
                    if (key) {
                        console.log(`Iframe partial update in ${key}:`, new Date().toLocaleString());
                        window.parent.postMessage({
                            type: 'update',
                            key,
                            html: new XMLSerializer().serializeToString(target),
                            isPartial: true
                        }, MESSAGE_ORIGIN);
                    }
                });
            });
            observedElements.forEach(target => {
                obs.observe(target, {
                    childList: true,
                    subtree: true,
                    characterData: true,
                    attributes: true
                });
            });
            return obs;
        }
        function startMonitoring() {
            if (observer) observer.disconnect();
            observer = partialObserverFunction(settings);
        }
        window.addEventListener('message', (e) => {
            if (e.origin !== MESSAGE_ORIGIN) return;
            if (e.data.type === 'updateSettings') {
                Object.assign(settings, e.data.settings);
                console.log('Iframe received updated settings:', settings);
                startMonitoring();
            }
        });
        startMonitoring();
        window.addEventListener('unload', () => {
            if (observer) observer.disconnect();
        });
    }
    // Function to manage the iframe's lifecycle
    function runInIframe() {
        if (window.self !== window.top) {
            console.log('Already in iframe, running monitor logic');
            monitorInIframe();
            return;
        }
        function refreshIframe() {
            stopIframe();
            iframe = document.createElement('iframe');
            iframe.id = IFRAME_ID;
            iframe.style.cssText = `
                position: absolute;
                top: -9999px;
                left: -9999px;
                width: 1px;
                height: 1px;
                border: none;
            `;
            iframe.src = window.location.href;
            document.body.appendChild(iframe);
            iframe.onload = () => {
                const script = iframe.contentDocument.createElement('script');
                script.textContent = `
                    (${monitorInIframe.toString()})();
                `;
                iframe.contentDocument.head.appendChild(script);
                isInitialized = true;
                handleAutoHideUI();
            };
            window.addEventListener('message', (e) => {
                if (e.origin !== MESSAGE_ORIGIN) return;
                if (e.source === iframe.contentWindow) {
                    if (e.data.type === 'update') {
                        const { key, html } = e.data;
                        handleUpdate('Iframe', key, html);
                    }
                }
            });
            console.log('Iframe refreshed:', new Date().toLocaleString());
        }
        refreshIframe();
        if (iframeRefreshId) clearInterval(iframeRefreshId);
        if (settings.iframeRefreshInterval > 0) {
            iframeRefreshId = setInterval(refreshIframe, settings.iframeRefreshInterval);
        }
    }
    // Function to handle updates from the iframe in the parent
    function handleUpdate(source, key, html = null) {
        const isPartial = arguments[arguments.length - 1];
        if (isPartial && html) {
            const selector = key.split('-')[0];
            const index = parseInt(key.split('-')[1]) || 0;
            const targetElements = document.querySelectorAll(selector);
            const targetElement = targetElements[index];
            if (targetElement) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const newElement = doc.body.firstChild;
                if (newElement) {
                    targetElement.parentElement.replaceChild(newElement, targetElement);
                    console.log(`Injected partial update from ${source} into ${key}:`, new Date().toLocaleString());
                    if (settings.logDetails) console.log('Injected HTML:', html);
                    showNotification(`Partial update injected in ${key}!`);
                }
            }
            return;
        }
        console.log(`${source} update in ${key}:`, new Date().toLocaleString());
        showNotification(`${source} update in ${key}!`);
    }
    // Functions to start, stop, restart, and toggle monitoring
    function startMonitoring() {
        if (!isMonitoring) return;
        runInIframe();
    }
    function stopMonitoring() {
        stopIframe();
    }
    function restartMonitoring() {
        stopMonitoring();
        if (isMonitoring) startMonitoring();
    }
    function toggleMonitoring() {
        isMonitoring = !isMonitoring;
        document.getElementById('toggleMonitor').textContent = isMonitoring ? 'Pause' : 'Resume';
        isMonitoring ? startMonitoring() : stopMonitoring();
        showNotification(isMonitoring ? 'Monitoring resumed' : 'Monitoring paused');
    }
    // Function to stop and remove the iframe
    function stopIframe() {
        if (iframe) iframe.remove();
        iframe = null;
        if (iframeRefreshId) clearInterval(iframeRefreshId);
        iframeRefreshId = null;
    }
    // Initial UI creation and handling
    createUI();
    handleAutoHideUI();
    if (document.readyState === 'complete') {
        startMonitoring();
    } else {
        window.addEventListener('load', startMonitoring);
    }
    window.addEventListener('unload', stopMonitoring);
})();