
// ==UserScript==
// @name         Advanced Website Update Monitor with Partial Updates
// @namespace    http://your.namespace.com
// @version      2.2
// @description  Monitors updates with synced updates, iframe refresh, and partial DOM injection
// @author       Grok
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    // Default settings
    const DEFAULTS = {
        serverInterval: 30000,
        targetElements: 'body',
        structureRules: '',
        maxRecursionDepth: 3,
        maxServerChecksPerHour: 120,
        logDetails: true,
        playSound: true,
        monitorMode: 'Iframe',
        iframeRefreshInterval: 600000
    };

    // Load settings
    const settings = {
        serverInterval: GM_getValue('serverInterval', DEFAULTS.serverInterval),
        targetElements: GM_getValue('targetElements', DEFAULTS.targetElements),
        structureRules: GM_getValue('structureRules', DEFAULTS.structureRules),
        maxRecursionDepth: GM_getValue('maxRecursionDepth', DEFAULTS.maxRecursionDepth),
        maxServerChecksPerHour: GM_getValue('maxServerChecksPerHour', DEFAULTS.maxServerChecksPerHour),
        logDetails: GM_getValue('logDetails', DEFAULTS.logDetails),
        playSound: GM_getValue('playSound', DEFAULTS.playSound),
        monitorMode: GM_getValue('monitorMode', DEFAULTS.monitorMode),
        iframeRefreshInterval: GM_getValue('iframeRefreshInterval', DEFAULTS.iframeRefreshInterval)
    };

    // State
    let isMonitoring = true;
    let iframe = null;
    let parentIntervalId = null;
    let parentObserver = null;
    let parentWorker = null;
    let syncedStates = new Map();
    let iframeRefreshId = null;

    const UI_ID = 'update-monitor-ui';
    const NOTIFIER_ID = 'update-monitor-notifier';
    const IFRAME_ID = 'monitor-iframe';

    // Sound alert
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

    // Notifier
    function createNotifier() {
        let notifier = document.createElement('div');
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
        notifier.addEventListener('click', playAlertSound); // Added click event listener
        document.body.appendChild(notifier);
        return notifier;
    }

    function showNotification(message) {
        const notifier = document.getElementById(NOTIFIER_ID) || createNotifier();
        notifier.textContent = message;
        notifier.style.display = 'block';
        notifier.dispatchEvent(new Event('click')); // Dispatch click event to play sound
        setTimeout(() => notifier.style.display = 'none', 3000);
    }

    // UI
    function createUI() {
        let ui = document.createElement('div');
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
            <label>Server Interval (ms): <input type="number" id="serverInterval" value="${settings.serverInterval}" min="5000" step="5000"></label><br>
            <label>Target Elements: <input type="text" id="targetElements" value="${settings.targetElements}" title="Comma-separated selectors"></label><br>
            <label>Structure Rules: <input type="text" id="structureRules" value="${settings.structureRules}" title='JSON e.g. {"div": {"class": "post", "text": "/^urgent/i", "children": {"span": {"class": "title"}}}}'></label><br>
            <label>Max Depth: <input type="number" id="maxRecursionDepth" value="${settings.maxRecursionDepth}" min="1" max="10" title="Recursion depth limit"></label><br>
            <label>Max Checks/Hour: <input type="number" id="maxChecks" value="${settings.maxServerChecksPerHour}" min="1"></label><br>
            <label>Monitor Mode:
                <select id="monitorMode">
                    <option value="Parent" ${settings.monitorMode === 'Parent' ? 'selected' : ''}>Parent</option>
                    <option value="Iframe" ${settings.monitorMode === 'Iframe' ? 'selected' : ''}>Iframe</option>
                    <option value="Both" ${settings.monitorMode === 'Both' ? 'selected' : ''}>Both</option>
                </select>
            </label><br>
            <label>Iframe Refresh (ms): <input type="number" id="iframeRefreshInterval" value="${settings.iframeRefreshInterval}" min="60000" step="60000" title="Set to 0 to disable"></label><br>
            <label><input type="checkbox" id="logDetails" ${settings.logDetails ? 'checked' : ''}> Log Details</label><br>
            <label><input type="checkbox" id="playSound" ${settings.playSound ? 'checked' : ''}> Play Sound</label><br>
            <button id="toggleMonitor">${isMonitoring ? 'Pause' : 'Resume'}</button>
            <button id="saveSettings">Save</button>
        `;
        document.body.appendChild(ui);

        ui.querySelector('#saveSettings').addEventListener('click', saveSettings);
        ui.querySelector('#toggleMonitor').addEventListener('click', toggleMonitoring);
    }

    function saveSettings() {
        settings.serverInterval = parseInt(document.getElementById('serverInterval').value);
        settings.targetElements = document.getElementById('targetElements').value;
        settings.structureRules = document.getElementById('structureRules').value;
        settings.maxRecursionDepth = parseInt(document.getElementById('maxRecursionDepth').value);
        settings.maxServerChecksPerHour = parseInt(document.getElementById('maxChecks').value);
        settings.monitorMode = document.getElementById('monitorMode').value;
        settings.iframeRefreshInterval = parseInt(document.getElementById('iframeRefreshInterval').value);
        settings.logDetails = document.getElementById('logDetails').checked;
        settings.playSound = document.getElementById('playSound').checked;

        GM_setValue('serverInterval', settings.serverInterval);
        GM_setValue('targetElements', settings.targetElements);
        GM_setValue('structureRules', settings.structureRules);
        GM_setValue('maxRecursionDepth', settings.maxRecursionDepth);
        GM_setValue('maxServerChecksPerHour', settings.maxServerChecksPerHour);
        GM_setValue('monitorMode', settings.monitorMode);
        GM_setValue('iframeRefreshInterval', settings.iframeRefreshInterval);
        GM_setValue('logDetails', settings.logDetails);
        GM_setValue('playSound', settings.playSound);

        if (iframe && iframe.contentWindow && (settings.monitorMode === 'Iframe' || settings.monitorMode === 'Both')) {
            iframe.contentWindow.postMessage({ type: 'updateSettings', settings }, '*');
        }

        restartMonitoring();
        showNotification('Settings saved!');
    }

    // Iframe execution and refresh function
    function runInIframe() {
        if (window.self !== window.top) {
            console.log('Already in iframe, running monitor logic');
            monitorInIframe();
            return;
        }

        if (settings.monitorMode !== 'Iframe' && settings.monitorMode !== 'Both') {
            if (iframe) stopIframe();
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
            };

            window.addEventListener('message', (e) => {
                if (e.source === iframe.contentWindow) {
                    if (e.data.type === 'update') {
                        const { key, hash, html } = e.data;
                        handleUpdate('Iframe', key, hash, html);
                    } else if (e.data.type === 'syncState' && settings.monitorMode === 'Both') {
                        syncedStates.set(e.data.key, e.data.hash);
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

    // Monitoring logic for iframe
    function monitorInIframe() {
        let settings = ${JSON.stringify(settings)};
        let lastServerHash = null;
        let intervalId = null;
        let observer = null;
        let worker = null;
        let serverCheckCount = 0;
        let lastResetHour = new Date().getHours();

        function generateHash(str) {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                hash = ((hash << 5) - hash) + str.charCodeAt(i);
                hash |= 0;
            }
            return hash;
        }

        function serializeElement(element) {
            return new XMLSerializer().serializeToString(element);
        }

        function postUpdate(key, element, hash, isPartial = false) {
            const serialized = serializeElement(element);
            window.parent.postMessage({
                type: 'update',
                key,
                hash,
                html: serialized,
                isPartial
            }, '*');
            if (settings.monitorMode === 'Both' && !isPartial) {
                window.parent.postMessage({ type: 'syncState', key, hash }, '*');
            }
        }

        async function checkServerUpdate() {
            const now = new Date();
            if (now.getHours() !== lastResetHour) {
                serverCheckCount = 0;
                lastResetHour = now.getHours();
            }

            if (serverCheckCount >= settings.maxServerChecksPerHour) return;

            try {
                const response = await fetch(window.location.href, { cache: 'no-store' });
                const text = await response.text();
                const hash = generateHash(text);

                if (lastServerHash !== null && lastServerHash !== hash) {
                    console.log('Iframe server update:', now.toLocaleString());
                    postUpdate('server', document.documentElement, hash);
                }
                lastServerHash = hash;
                serverCheckCount++;
            } catch (error) {
                console.error('Iframe server error:', error);
            }
        }

        function setupWorker() {
            if (worker) worker.terminate();
            const workerBlob = new Blob([`(${workerCode.toString()})()`], { type: 'application/javascript' });
            worker = new Worker(URL.createObjectURL(workerBlob));
            worker.onmessage = (e) => {
                const { type, key, hash } = e.data;
                if (type === 'update') {
                    const selector = key.split('-')[0];
                    const index = parseInt(key.split('-')[1]) || 0;
                    const element = document.querySelectorAll(selector)[index];
                    if (element) postUpdate(key, element, hash);
                }
            };
            worker.postMessage({ type: 'updateRules', rules: settings.structureRules, maxDepth: settings.maxRecursionDepth });
        }

        function setupPartialObserver() {
            if (observer) observer.disconnect();

            const targets = settings.targetElements.split(',').map(s => s.trim());
            const observedElements = new Set();
            targets.forEach(selector => {
                document.querySelectorAll(selector).forEach(el => observedElements.add(el));
            });

            observer = new MutationObserver((mutations) => {
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
                        const hash = generateHash(serializeElement(target));
                        console.log(`Iframe partial update in ${key}:`, new Date().toLocaleString());
                        postUpdate(key, target, hash, true);
                    }
                });
            });

            observedElements.forEach(target => {
                observer.observe(target, {
                    childList: true,
                    subtree: true,
                    characterData: true,
                    attributes: true
                });
            });
        }

        function startMonitoring() {
            if (intervalId) clearInterval(intervalId);
            checkServerUpdate();
            intervalId = setInterval(checkServerUpdate, settings.serverInterval);
            setupPartialObserver();
            setupWorker();
        }

        window.addEventListener('message', (e) => {
            if (e.data.type === 'updateSettings') {
                settings = e.data.settings;
                console.log('Iframe received updated settings:', settings);
                startMonitoring();
            } else if (e.data.type === 'syncState' && settings.monitorMode === 'Both') {
                lastServerHash = e.data.key === 'server' ? e.data.hash : lastServerHash;
            }
        });

        startMonitoring();

        window.addEventListener('unload', () => {
            if (intervalId) clearInterval(intervalId);
            if (observer) observer.disconnect();
            if (worker) worker.terminate();
        });
    }

    // Parent monitoring functions
    function generateHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return hash;
    }

    let parentLastServerHash = null;
    let parentServerCheckCount = 0;
    let parentLastResetHour = new Date().getHours();

    async function checkParentServerUpdate() {
        const now = new Date();
        if (now.getHours() !== parentLastResetHour) {
            parentServerCheckCount = 0;
            parentLastResetHour = now.getHours();
        }

        if (parentServerCheckCount >= settings.maxServerChecksPerHour) return;

        try {
            const response = await fetch(window.location.href, { cache: 'no-store' });
            const text = await response.text();
            const hash = generateHash(text);

            if (parentLastServerHash !== null && parentLastServerHash !== hash) {
                console.log('Parent server update:', now.toLocaleString());
                handleUpdate('Parent', 'server', hash);
            }
            parentLastServerHash = hash;
            parentServerCheckCount++;
        } catch (error) {
            console.error('Parent server error:', error);
        }
    }

    function setupParentWorker() {
        if (parentWorker) parentWorker.terminate();
        const workerBlob = new Blob([`(${workerCode.toString()})()`], { type: 'application/javascript' });
        parentWorker = new Worker(URL.createObjectURL(workerBlob));
        parentWorker.onmessage = (e) => {
            const { type, key, hash } = e.data;
            if (type === 'update') {
                handleUpdate('Parent', key, hash);
            }
        };
        parentWorker.postMessage({ type: 'updateRules', rules: settings.structureRules, maxDepth: settings.maxRecursionDepth });
    }

    function checkParentClientUpdate(mutations) {
        const selectors = settings.targetElements.split(',').map(s => s.trim());
        selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach((element, index) => {
                const key = `${selector}-${element.id || index}`;
                const structure = serializeElement(element);
                parentWorker.postMessage({ type: 'check', key, structure });
            });
        });
    }

    function serializeElement(element) {
        return new XMLSerializer().serializeToString(element);
    }

    function setupParentObserver() {
        if (parentObserver) parentObserver.disconnect();

        const targets = settings.targetElements.split(',').map(s => s.trim());
        const observedElements = new Set();
        targets.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => observedElements.add(el));
        });

        parentObserver = new MutationObserver((mutations) => {
            if (isMonitoring) checkParentClientUpdate(mutations);
        });
        observedElements.forEach(target => {
            parentObserver.observe(target, { childList: true, subtree: true, characterData: true });
        });
    }

    // Sync and handle updates with injection
    function handleUpdate(source, key, hash, html = null) {
        if (settings.monitorMode !== 'Both' || source !== 'Iframe' || !html) {
            if (syncedStates.has(key) && syncedStates.get(key) === hash) return;

            console.log(`${source} update in ${key}:`, new Date().toLocaleString());
            if (settings.logDetails) console.log(`${source} hash for ${key}:`, hash);
            showNotification(`${source} update in ${key}!`);
            syncedStates.set(key, hash);

            if (source === 'Parent' && iframe && iframe.contentWindow) {
                iframe.contentWindow.postMessage({ type: 'syncState', key, hash }, '*');
            } else if (source === 'Iframe' && window.self === window.top) {
                parentLastServerHash = key === 'server' ? hash : parentLastServerHash;
            }
            return;
        }

        const isPartial = arguments[arguments.length - 1];
        if (isPartial) {
            const selector = key.split('-')[0];
            const index = parseInt(key.split('-')[1]) || 0;
            const targetElements = document.querySelectorAll(selector);
            const targetElement = targetElements[index];

            if (targetElement) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const newElement = doc.body.firstChild;

                if (newElement) {
                    targetElement.parentNode.replaceChild(newElement, targetElement);
                    console.log(`Injected partial update from iframe into ${key}:`, new Date().toLocaleString());
                    if (settings.logDetails) console.log('Injected HTML:', html);
                    showNotification(`Partial update injected in ${key}!`);
                }
            }
            return;
        }

        if (syncedStates.has(key) && syncedStates.get(key) === hash) return;

        console.log(`${source} update in ${key}:`, new Date().toLocaleString());
        if (settings.logDetails) console.log(`${source} hash for ${key}:`, hash);
        showNotification(`Update in ${key}!`);
        syncedStates.set(key, hash);

        if (source === 'Parent' && iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({ type: 'syncState', key, hash }, '*');
        } else if (source === 'Iframe' && window.self === window.top) {
            parentLastServerHash = key === 'server' ? hash : parentLastServerHash;
        }
    }

    // Start/stop parent monitoring
    function startParentMonitoring() {
        if (parentIntervalId) clearInterval(parentIntervalId);
        checkParentServerUpdate();
        parentIntervalId = setInterval(checkParentServerUpdate, settings.serverInterval);
        setupParentObserver();
        setupParentWorker();
    }

    function stopParentMonitoring() {
        if (parentIntervalId) clearInterval(parentIntervalId);
        if (parentObserver) parentObserver.disconnect();
        if (parentWorker) parentWorker.terminate();
        parentIntervalId = null;
        parentObserver = null;
        parentWorker = null;
    }

    // Stop iframe
    function stopIframe() {
        if (iframe) iframe.remove();
        iframe = null;
        if (iframeRefreshId) clearInterval(iframeRefreshId);
        iframeRefreshId = null;
    }

    // Start monitoring
    function startMonitoring() {
        if (!isMonitoring) return;

        if (settings.monitorMode === 'Parent' || settings.monitorMode === 'Both') {
            startParentMonitoring();
        } else {
            stopParentMonitoring();
        }

        if (settings.monitorMode === 'Iframe' || settings.monitorMode === 'Both') {
            runInIframe();
        } else {
            stopIframe();
        }

        console.log(`Monitor started in ${settings.monitorMode} mode:`, new Date().toLocaleString());
    }

    function stopMonitoring() {
        stopParentMonitoring();
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

    if (document.readyState === 'complete') {
        createUI();
        startMonitoring();
    } else {
        window.addEventListener('load', () => {
            createUI();
            startMonitoring();
        });
    }

    window.addEventListener('unload', stopMonitoring);
})();

// Worker code
function workerCode() {
    let rules = {};
    let maxDepth = 3;

    function generateHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return hash;
    }

    function matchesStructure(element, rule, depth = 0) {
        if (depth > maxDepth) return false;

        if (!rule) return true;
        if (element.tag !== rule.tag) return false;

        if (rule.attributes) {
            for (let attr in rule.attributes) {
                if (element.attributes[attr] !== rule.attributes[attr]) return false;
            }
        }

        if (rule.text) {
            let regex;
            if (typeof rule.text === 'string' && rule.text.startsWith('/') && rule.text.includes('/')) {
                try {
                    const [_, pattern, flags] = rule.text.match(/^\/(.*)\/([a-z]*)$/i) || [null, rule.text, ''];
                    regex = new RegExp(pattern, flags);
                } catch (e) {
                    console.error('Invalid regex in rule:', rule.text, e);
                    return false;
                }
            } else {
                regex = new RegExp(rule.text);
            }
            if (!regex.test(element.text)) return false;
        }

        if (rule.children) {
            return element.children && element.children.some(child =>
                rule.children.some(childRule => matchesStructure(child, childRule, depth + 1))
            );
        }
        return true;
    }

    function checkElement(element, depth = 0) {
        if (depth > maxDepth) return null;

        let content = JSON.stringify(element);
        for (let tag in rules) {
            if (matchesStructure(element, rules[tag], depth)) {
                return generateHash(content);
            }
        }
        if (element.children) {
            for (let child of element.children) {
                const childHash = checkElement(child, depth + 1);
                if (childHash !== null) return childHash;
            }
        }
        return null;
    }

    function serializeElement(element) {
        const attrs = {};
        for (let attr of element.attributes) {
            attrs[attr.name] = attr.value;
        }
        const children = Array.from(element.children).map(child => serializeElement(child));
        return {
            tag: element.tagName.toLowerCase(),
            attributes: attrs,
            text: element.textContent.trim(),
            children: children.length ? children : undefined
        };
    }

    self.onmessage = (e) => {
        const { type, key, structure, rules: newRules, maxDepth: newMaxDepth } = e.data;
        if (type === 'updateRules') {
            try {
                rules = newRules ? JSON.parse(newRules) : {};
                maxDepth = newMaxDepth || 3;
            } catch (err) {
                console.error('Invalid rules JSON:', err);
                rules = {};
            }
        } else if (type === 'check') {
            const hash = checkElement(structure);
            if (hash !== null) {
                self.postMessage({ type: 'update', key, hash });
            }
        }
    };
};
