// ==UserScript==
// @name         Advanced Website Update Monitor with worker
// @namespace    http://your.namespace.com
// @version      2.8
// @description  Monitors updates with iframe refresh, partial DOM injection, and secure messaging with parent-defined observer, iframe mode only
// @author       Grok
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==
(function() {
    'use strict';
    const DEFAULTS = {
        targetElements: 'body',
        structureRules: '',
        maxRecursionDepth: 3,
        logDetails: true,
        playSound: true,
        iframeRefreshInterval: 600000
    };
    // Load settings
    let settings = {
        targetElements: GM_getValue('targetElements', DEFAULTS.targetElements),
        structureRules: GM_getValue('structureRules', DEFAULTS.structureRules),
        maxRecursionDepth: GM_getValue('maxRecursionDepth', DEFAULTS.maxRecursionDepth),
        logDetails: GM_getValue('logDetails', DEFAULTS.logDetails),
        playSound: GM_getValue('playSound', DEFAULTS.playSound),
        iframeRefreshInterval: GM_getValue('iframeRefreshInterval', DEFAULTS.iframeRefreshInterval)
    };
    // State
    let isMonitoring = true;
    let iframe = null;
    let iframeRefreshId = null;
    
    const UI_ID = 'update-monitor-ui';
    const NOTIFIER_ID = 'update-monitor-notifier';
    const IFRAME_ID = 'monitor-iframe';
    const MESSAGE_ORIGIN = window.location.origin;

// Partial observer iframe passed
function partialObserverFunction(settings) {
        const targets = settings.targetElements.split(',').map(s => s.trim());
        const observedElements = new Set();
        targets.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => observedElements.add(el));
        });

        const observer = new MutationObserver((mutations) => {
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
                    }, window.location.origin);
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
        return observer;
};

// Monitoring logic for iframe
function monitorInIframe() {
        let settings = ${JSON.stringify(settings)};
        let observer = null;
        let worker = null;

        function serializeElement(element) {
            return new XMLSerializer().serializeToString(element);
        }

        function postUpdate(key, element, isPartial = false) {
            const serialized = serializeElement(element);
            window.parent.postMessage({ 
                type: 'update', 
                key, 
                html: serialized,
                isPartial
            }, MESSAGE_ORIGIN);
        }

        function setupWorker() {
            if (worker) worker.terminate();
            const workerBlob = new Blob([`(${workerCode.toString()})()`], { type: 'application/javascript' });
            worker = new Worker(URL.createObjectURL(workerBlob));
            worker.onmessage = (e) => {
                const { type, key } = e.data;
                if (type === 'update') {
                    const selector = key.split('-')[0];
                    const index = parseInt(key.split('-')[1]) || 0;
                    const element = document.querySelectorAll(selector)[index];
                    if (element) postUpdate(key, element);
                }
            };
            worker.postMessage({ type: 'updateRules', rules: settings.structureRules, maxDepth: settings.maxRecursionDepth });

            // Initial check of all target elements
            const selectors = settings.targetElements.split(',').map(s => s.trim());
            selectors.forEach(selector => {
                document.querySelectorAll(selector).forEach((element, index) => {
                    const key = `${selector}-${element.id || index}`;
                    const structure = serializeElement(element);
                    worker.postMessage({ type: 'check', key, structure });
                });
            });
        }

        function startMonitoring() {
            setupWorker();
        }

        window.addEventListener('message', (e) => {
            if (e.origin !== MESSAGE_ORIGIN) return;
            if (e.data.type === 'updateSettings') {
                settings = e.data.settings;
                console.log('Iframe received updated settings:', settings);
                startMonitoring();
            } else if (e.data.type === 'updateObserverFunction') {
                if (observer) observer.disconnect();
                const observerFunction = new Function('return ' + e.data.observerFunction)();
                observer = observerFunction(settings);
                console.log('Iframe set up parent-defined observer');
            }
        });

        startMonitoring();

        window.addEventListener('unload', () => {
            if (observer) observer.disconnect();
            if (worker) worker.terminate();
        });
}
    
// Worker code
function workerCode() {
    let rules = {};
    let maxDepth = 3;

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
        if (depth > maxDepth) return false;

        for (let tag in rules) {
            if (matchesStructure(element, rules[tag], depth)) {
                return true;
            }
        }
        if (element.children) {
            for (let child of element.children) {
                if (checkElement(child, depth + 1)) return true;
            }
        }
        return false;
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
            if (checkElement(structure)) {
                self.postMessage({ type: 'update', key });
            }
        }
    };
};   };
};