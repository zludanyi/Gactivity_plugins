// ==UserScript==
// @name         P2P real estate validator
// @namespace    http://renovision.app/
// @version      1.6
// @description  Anonymous p2p real estate validation network for ingatlan.com
// @author       ZLudany
// @match        https://ingatlan.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

/**
 * Initializes the defensive security and spoofing kernel before the DOM loads.
 * @returns {void}
 */
(function initRenovisionKernel() {
    'use strict';
    
    if (window.__RENOVISION_KERNEL_ACTIVE__) return;
    window.__RENOVISION_KERNEL_ACTIVE__ = true;

    const nativeLog = console.log;
    const nativeError = console.error;

    // ==========================================
    // BEGIN TO-STRING EVASION
    // ==========================================
    const originalToString = Function.prototype.toString;
    const spoofedFunctions = new WeakMap();

    const toStringProxy = new Proxy(originalToString, {
        /**
         * Intercepts Function.prototype.toString to hide hooked proxies.
         * @param {Function} target The original toString function.
         * @param {Object} thisArg The function being stringified.
         * @param {Array} args Arguments passed to toString.
         * @returns {string} The native code string or the original result.
         */
        apply: function applyToString(target, thisArg, args) {
            if (spoofedFunctions.has(thisArg)) {
                return spoofedFunctions.get(thisArg);
            }
            if (thisArg === toStringProxy) {
                return 'function toString() { [native code] }';
            }
            return Reflect.apply(target, thisArg, args);
        }
    });
    Function.prototype.toString = toStringProxy;

    /**
     * Replaces a target object's method with a Proxy and maps its toString output.
     * @param {Object} targetObject The object containing the function.
     * @param {string} functionName The name of the function to hook.
     * @param {Object} handler The Proxy handler object.
     * @returns {void}
     */
    function hookFunction(targetObject, functionName, handler) {
        const originalFn = targetObject[functionName];
        const hookedFn = new Proxy(originalFn, handler);
        spoofedFunctions.set(hookedFn, 'function ' + functionName + '() { [native code] }');
        targetObject[functionName] = hookedFn;
    }
    // ==========================================
    // END TO-STRING EVASION
    // ==========================================

    // ==========================================
    // BEGIN EVENT & NETWORK SPOOFING
    // ==========================================
    const addEventListenerHandler = {
        /**
         * Intercepts addEventListener.
         * @param {Function} target Original addEventListener.
         * @param {Object} thisArg Context (Window or EventTarget).
         * @param {Array} argumentsList Arguments passed to addEventListener.
         * @returns {void}
         */
        apply: function applyAddEventListener(target, thisArg, argumentsList) {
            return Reflect.apply(target, thisArg, argumentsList);
        }
    };
    hookFunction(window, 'addEventListener', addEventListenerHandler);
    hookFunction(EventTarget.prototype, 'addEventListener', addEventListenerHandler);

    const fetchHandler = {
        /**
         * Intercepts fetch to inject spoofed headers.
         * @param {Function} target Original fetch function.
         * @param {Object} thisArg Context.
         * @param {Array} argumentsList Arguments passed to fetch.
         * @returns {Promise<Response>}
         */
        apply: function applyFetch(target, thisArg, argumentsList) {
            let resource = argumentsList[0];
            let config = argumentsList[1] || {};
            let headers = config.headers || {};
            
            if (headers instanceof Headers) {
                headers.set('Sec-CH-UA', '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"');
                headers.set('Sec-CH-UA-Mobile', '?1');
                headers.set('Sec-CH-UA-Platform', '"Android"');
                if (headers.has('X-Requested-With')) headers.delete('X-Requested-With');
            } else {
                headers['Sec-CH-UA'] = '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"';
                headers['Sec-CH-UA-Mobile'] = '?1';
                headers['Sec-CH-UA-Platform'] = '"Android"';
                delete headers['X-Requested-With'];
            }
            
            config.headers = headers;
            argumentsList[1] = config;
            return Reflect.apply(target, thisArg, argumentsList);
        }
    };
    hookFunction(window, 'fetch', fetchHandler);

    const xhrSendHandler = {
        /**
         * Intercepts XMLHttpRequest.send to inject spoofed headers.
         * @param {Function} target Original send function.
         * @param {Object} thisArg XMLHttpRequest instance.
         * @param {Array} argumentsList Arguments passed to send.
         * @returns {void}
         */
        apply: function applyXhrSend(target, thisArg, argumentsList) {
            thisArg.setRequestHeader('Sec-CH-UA', '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"');
            thisArg.setRequestHeader('Sec-CH-UA-Mobile', '?1');
            thisArg.setRequestHeader('Sec-CH-UA-Platform', '"Android"');
            return Reflect.apply(target, thisArg, argumentsList);
        }
    };
    hookFunction(XMLHttpRequest.prototype, 'send', xhrSendHandler);
    // ==========================================
    // END EVENT & NETWORK SPOOFING
    // ==========================================

    // ==========================================
    // BEGIN NAVIGATOR & ENVIRONMENT SPOOFING
    // ==========================================
    Object.defineProperty(navigator, 'webdriver', {
        /** @returns {boolean} */ get: function getWebdriver() { return false; },
        configurable: true, enumerable: true
    });
    Object.defineProperty(navigator, 'userAgent', {
        /** @returns {string} */ get: function getUserAgent() { return "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"; },
        configurable: true, enumerable: true
    });
    Object.defineProperty(navigator, 'platform', {
        /** @returns {string} */ get: function getPlatform() { return "Linux armv8l"; },
        configurable: true, enumerable: true
    });
    Object.defineProperty(navigator, 'hardwareConcurrency', {
        /** @returns {number} */ get: function getHardwareConcurrency() { return 8; },
        configurable: true, enumerable: true
    });
    Object.defineProperty(navigator, 'deviceMemory', {
        /** @returns {number} */ get: function getDeviceMemory() { return 8; },
        configurable: true, enumerable: true
    });
    Object.defineProperty(navigator, 'maxTouchPoints', {
        /** @returns {number} */ get: function getMaxTouchPoints() { return 5; },
        configurable: true, enumerable: true
    });
    if (!window.chrome) { window.chrome = { runtime: {} }; }
    // ==========================================
    // END NAVIGATOR & ENVIRONMENT SPOOFING
    // ==========================================

// --- END OF PART 1. PASTE PART 2 BELOW THIS LINE ---

// --- START OF PART 2 ---

    // ==========================================
    // BEGIN RENOVISION TRACE & SECURITY CORE
    // ==========================================
    const RenovisionCore = {
        cachedArgs: [],
        protectedFuns: {
            'bootRenovision': 'public',
            'injectCSS': 'bootRenovision',
            'createUI': 'bootRenovision',
            'initDependencies': 'bootRenovision',
            'initAuth': 'public', 
            'initRealtime': ['onAuthStateChangedHandler', 'initDependencies'],
            'requestBounty': 'public', 
            'submitScout': 'public', 
            'processRenovisionState': ['bootRenovision', 'onHashChangeHandler', 'onHydrateMessageHandler', 'onDOMLoadedHandler'],
            'promptAsync': ['requestBounty', 'submitScout'],
            '_logToUI': ['info', 'warn', 'error'],
            '_trace': ['info', 'warn', 'error'],
            'info': 'public',
            'warn': 'public',
            'error': 'public',
            'postRenovisionMessage': ['_logToUI', 'bootRenovision', 'requestBounty', 'submitScout', 'onAuthStateChangedHandler'] 
        },

        /**
         * Extracts and parses the current execution stack trace.
         * @returns {Array<string>} List of caller function names.
         */
        getStackTrace: function getStackTrace() {
            try { throw new Error(); } catch(e) {
                if (!e.stack) return [];
                return e.stack.split('
').map(
                    /**
                     * Parses a single line of the stack trace.
                     * @param {string} line 
                     * @returns {string|null} Function name or null.
                     */
                    function parseStackLine(line) {
                        let match = line.match(/ats+(.*?)s+(/) || line.match(/^(.*?)@/);
                        if (match && match[1]) {
                            let fn = match[1].replace('AsyncFunction.', '').replace('Promise.', '');
                            return (fn === 'anonymous' || fn === 'eval' || fn === '') ? 'anonymous' : fn;
                        }
                        return null;
                    }
                ).filter(Boolean);
            }
        },

        /**
         * Validates if the current execution stack is authorized to call the function.
         * @param {string} funcName Name of the function requesting access.
         * @returns {boolean} True if accessible, throws an Error otherwise.
         */
        isAccessible: function isAccessible(funcName) {
            const allowed = this.protectedFuns[funcName] || 'public';
            if (allowed === 'public') return true;

            const stack = this.getStackTrace();
            const allowedList = Array.isArray(allowed) ? allowed : allowed.split(',').map(
                /**
                 * Trims string whitespace.
                 * @param {string} s 
                 * @returns {string}
                 */
                function trimStr(s) { return s.trim(); }
            );
            
            const isAuthorized = allowedList.some(
                /**
                 * Checks if a specific caller exists in the stack.
                 * @param {string} caller 
                 * @returns {boolean}
                 */
                function checkCaller(caller) { return stack.includes(caller); }
            );

            if (!isAuthorized) {
                nativeError('[SECURITY BREACH] Unauthorized execution of: ' + funcName + '. Stack: ' + stack.join(' <- '));
                throw new Error('Renovision Security Exception: Access Denied to ' + funcName);
            }
            return true;
        },

        /**
         * Caches the arguments and scope of a function call for the trace logger.
         * @param {string} funcName 
         * @param {Object} argsObj The `arguments` object.
         * @param {Object} scopeObj The `this` context.
         * @returns {void}
         */
        argsCache: function argsCache(funcName, argsObj, scopeObj) {
            const parsedArgs = Array.from(argsObj).map(
                /**
                 * Stringifies a single argument safely.
                 * @param {*} arg 
                 * @returns {string}
                 */
                function stringifyArg(arg) {
                    if (arg instanceof Event) return '[Event:' + arg.type + ']';
                    if (typeof arg === 'function') return '[Function]';
                    try { return typeof arg === 'object' ? JSON.stringify(arg) : String(arg); }
                    catch(e) { return '[Complex Object]'; }
                }
            );
            let parsedScope = 'Window';
            if (scopeObj && scopeObj !== window) {
                parsedScope = scopeObj.id ? '#' + scopeObj.id : (scopeObj.tagName || typeof scopeObj);
            }
            this.cachedArgs.push({ name: funcName, argsString: parsedArgs.join(', '), scopeString: parsedScope });
        }
    };

    Object.defineProperty(window, '__RENOVISION__', {
        value: Object.freeze(RenovisionCore),
        writable: false, configurable: false
    });
    // ==========================================
    // END RENOVISION TRACE & SECURITY CORE
    // ==========================================

    // ==========================================
    // BEGIN REACT NATIVE BRIDGE CLOAKING
    // ==========================================
    /**
     * Masks the React Native global bridge objects behind secure getters.
     * @returns {void}
     */
    function hideReactNativeGlobals() {
        const globalsToHide = ['ReactNativeWebView', 'webkit', 'Android'];
        
        globalsToHide.forEach(
            /**
             * Applies a secure getter proxy to a specific global variable.
             * @param {string} varName 
             * @returns {void}
             */
            function hideGlobalVariable(varName) {
                const originalObj = window[varName];
                if (originalObj !== undefined) {
                    try { delete window[varName]; } catch (e) {}

                    Object.defineProperty(window, varName, {
                        /**
                         * Secures read access to the bridge.
                         * @returns {Object|undefined} Bridge object or undefined.
                         */
                        get: function secureGlobalGetter() {
                            const stack = window.__RENOVISION__.getStackTrace();
                            const isAuthorized = stack.some(
                                /**
                                 * Checks if stack caller is authorized to use the bridge.
                                 * @param {string} caller 
                                 * @returns {boolean}
                                 */
                                function checkBridgeAccess(caller) {
                                    return window.__RENOVISION__.protectedFuns[caller] !== undefined;
                                }
                            );
                            
                            if (isAuthorized) return originalObj;
                            return undefined; 
                        },
                        /** @returns {void} */ set: function secureGlobalSetter() {}, 
                        configurable: false,
                        enumerable: false
                    });
                }
            }
        );
    }

    hideReactNativeGlobals();
    nativeLog('[Renovision] Kernel Active.');
    // ==========================================
    // END REACT NATIVE BRIDGE CLOAKING
    // ==========================================

})();
// --- END OF PART 2. PASTE PART 3 BELOW THIS LINE ---

// --- START OF PART 3 ---
/**
 * Main application initialization logic running post DOM content load.
 * @returns {void}
 */
(function initRenovisionApp() {
    'use strict';

    // ==========================================
    // BEGIN CONFIGURATION
    // ==========================================
    const STRIPE_PUBLISHABLE_KEY = 'pk_test_YOUR_KEY';
    const FIREBASE_CONFIG = {
        apiKey: "your-api-key",
        authDomain: "renovision-prod.firebaseapp.com",
        projectId: "renovision-prod",
        databaseURL: "https://renovision-prod-default-rtdb.europe-west1.firebasedatabase.app"
    };
    const BACKEND_URL = 'https://YOUR-VERCEL-DOMAIN.vercel.app';
    
    let currentUser = null;
    let currentPropertyId = null;
    let db = null;
    let auth = null;
    let stripeInstance = null;
    
    const CONFIG = { devMode: false };
    // ==========================================
    // END CONFIGURATION
    // ==========================================

    // ==========================================
    // BEGIN REACT NATIVE CLOAKED BRIDGE
    // ==========================================
    /**
     * Securely sends a payload message to the React Native WebView host.
     * @param {Object} payload The data payload to send.
     * @returns {void}
     */
    function postRenovisionMessage(payload) {
        window.__RENOVISION__.isAccessible('postRenovisionMessage');
        window.__RENOVISION__.argsCache('postRenovisionMessage', arguments, this);
        
        try {
            const messageStr = JSON.stringify(payload);
            if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
                window.ReactNativeWebView.postMessage(messageStr);
            } else if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ReactNativeWebView) {
                window.webkit.messageHandlers.ReactNativeWebView.postMessage(messageStr);
            } else if (window.Android && window.Android.postMessage) {
                window.Android.postMessage(messageStr);
            }
        } catch (error) {}
    }
    // ==========================================
    // END REACT NATIVE CLOAKED BRIDGE
    // ==========================================

    // ==========================================
    // BEGIN LOGGER CLASS WITH DYNAMIC TRACING
    // ==========================================
    class Logger {
        /**
         * Parses and logs a message to the React Native Bridge and UI Console.
         * @param {string} level Log severity ('info', 'warn', 'error').
         * @param {string} context Category or tag for the log.
         * @param {string} message Log message including trace.
         * @param {*} [data=''] Additional data object.
         * @returns {void}
         */
        static _logToUI(level, context, message, data = '') {
            window.__RENOVISION__.isAccessible('_logToUI');
            window.__RENOVISION__.argsCache('_logToUI', arguments, this);

            let dataStr = '';
            if (data) {
                try { dataStr = typeof data === 'object' ? JSON.stringify(data) : String(data); } 
                catch (e) { dataStr = '[Unserializable]'; }
            }

            postRenovisionMessage({ type: 'RV_LOG', level: level, context: context, message: message, data: dataStr });

            if (!CONFIG.devMode) return;
            const consoleLogs = document.getElementById('rv-console-logs');
            if (!consoleLogs) return;

            const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: "numeric", minute: "numeric", second: "numeric" });
            const line = document.createElement('div');
            line.className = 'rv-log-line rv-log-' + level;
            const htmlMessage = message.replace(/
/g, '<br>');
            line.innerHTML = '<span class="rv-log-time">[' + time + ']</span><span class="rv-log-context">[' + context + ']</span> ' + htmlMessage + ' <span class="rv-log-data">' + dataStr + '</span>';
            consoleLogs.appendChild(line);
            consoleLogs.scrollTop = consoleLogs.scrollHeight;
        }

        /**
         * Aggregates the cached arguments into a readable stack trace string.
         * @returns {string} Formatted trace string.
         */
        static _trace() {
            window.__RENOVISION__.isAccessible('_trace');
            window.__RENOVISION__.argsCache('_trace', arguments, this);

            const stack = window.__RENOVISION__.getStackTrace();
            const cleanStack = stack.filter(
                /**
                 * Filters out internal logger calls from the trace.
                 * @param {string} n 
                 * @returns {boolean}
                 */
                function filterInternal(n) {
                    return !n.includes('Logger') && n !== '_trace' && n !== 'isAccessible' && n !== 'argsCache' && n !== 'getStackTrace';
                }
            );
            cleanStack.reverse(); 

            const formattedTrace = cleanStack.map(
                /**
                 * Maps a function name to its cached arguments and scope.
                 * @param {string} funcName 
                 * @returns {string}
                 */
                function mapArgsToStack(funcName) {
                    const cacheEntry = window.__RENOVISION__.cachedArgs.find(
                        /**
                         * Finds cache entry by name.
                         * @param {Object} c 
                         * @returns {boolean}
                         */
                        function findCache(c) { return c.name === funcName; }
                    );
                    if (cacheEntry) {
                        return funcName + '(' + cacheEntry.argsString + ') {Scope: ' + cacheEntry.scopeString + '}';
                    }
                    return funcName + '()';
                }
            ).join('
   => ');

            window.__RENOVISION__.cachedArgs = [];
            return formattedTrace;
        }

        /**
         * Logs an informational message.
         * @param {string} context 
         * @param {string} message 
         * @param {*} [data=''] 
         * @returns {void}
         */
        static info(context, message, data = '') {
            window.__RENOVISION__.isAccessible('info');
            window.__RENOVISION__.argsCache('info', arguments, this);
            const traceStr = this._trace();
            this._logToUI('info', context, message + '
[TRACE]
   => ' + traceStr, data);
        }
        
        /**
         * Logs a warning message.
         * @param {string} context 
         * @param {string} message 
         * @param {*} [data=''] 
         * @returns {void}
         */
        static warn(context, message, data = '') {
            window.__RENOVISION__.isAccessible('warn');
            window.__RENOVISION__.argsCache('warn', arguments, this);
            const traceStr = this._trace();
            this._logToUI('warn', context, message + '
[TRACE]
   => ' + traceStr, data);
        }
        
        /**
         * Logs an error message.
         * @param {string} context 
         * @param {string} message 
         * @param {*} [data=''] 
         * @returns {void}
         */
        static error(context, message, data = '') {
            window.__RENOVISION__.isAccessible('error');
            window.__RENOVISION__.argsCache('error', arguments, this);
            const traceStr = this._trace();
            this._logToUI('error', context, message + '
[TRACE]
   => ' + traceStr, data);
        }
    }
    // ==========================================
    // END LOGGER CLASS WITH DYNAMIC TRACING
    // ==========================================

    // ==========================================
    // BEGIN UTILITIES
    // ==========================================
    /**
     * Extracts the property ID from the current window location.
     * @returns {string|null} The parsed property ID.
     */
    function getPropertyId() {
        window.__RENOVISION__.isAccessible('getPropertyId');
        window.__RENOVISION__.argsCache('getPropertyId', arguments, this);
        const match = window.location.href.match(//(d+)/);
        return match ? match[1] : null;
    }

    /**
     * Asynchronously loads a script tag into the DOM.
     * @param {string} src The URL of the script.
     * @param {string} globalVarName The expected global variable attached by the script.
     * @returns {Promise<Object>} Resolves with the global variable reference.
     */
    function loadScript(src, globalVarName) {
        window.__RENOVISION__.isAccessible('loadScript');
        window.__RENOVISION__.argsCache('loadScript', arguments, this);
        return new Promise(
            /**
             * Promise executor for script loading.
             * @param {Function} resolve 
             * @param {Function} reject 
             * @returns {void}
             */
            function loadScriptExecutor(resolve, reject) {
                window.__RENOVISION__.isAccessible('loadScriptExecutor');
                window.__RENOVISION__.argsCache('loadScriptExecutor', arguments, this);
                if (window[globalVarName]) { resolve(window[globalVarName]); return; }
                const script = document.createElement('script');
                script.src = src;
                
                /** @returns {void} */
                script.onload = function onScriptLoad() {
                    window.__RENOVISION__.isAccessible('onScriptLoad');
                    window.__RENOVISION__.argsCache('onScriptLoad', arguments, this);
                    resolve(window[globalVarName]);
                };
                
                /** @param {Event} error @returns {void} */
                script.onerror = function onScriptError(error) {
                    window.__RENOVISION__.isAccessible('onScriptError');
                    window.__RENOVISION__.argsCache('onScriptError', arguments, this);
                    reject(error);
                };
                document.head.appendChild(script);
            }
        );
    }
    // ==========================================
    // END UTILITIES
    // ==========================================

    // ==========================================
    // BEGIN UI & CSS INJECTION
    // ==========================================
    const styles = `
        #renovision-stamp {
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 2147483647;
            cursor: pointer;
            font-size: 24px;
            user-select: none;
            -webkit-tap-highlight-color: transparent;
        }

        #renovision-stamp:hover .rv-bubble,
        #renovision-stamp:active .rv-bubble {
            opacity: 1;
            transform: scale(1);
        }

        .rv-bubble {
            position: absolute;
            bottom: 60px;
            right: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 20px;
            padding: 16px;
            min-width: 180px;
            opacity: 0;
            transform: scale(0.9);
            transition: all .3s cubic-bezier(.175, .885, .32, 1.275);
            box-shadow: 0 10px 30px rgba(0,0,0,.3);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,.2);
            font-family: -apple-system, system-ui, sans-serif;
        }

        .rv-stats {
            font-size: 14px;
            color: #fff;
            margin-bottom: 8px;
            font-weight: 600;
            text-align: center;
        }

        .rv-hands {
            display: flex;
            gap: 12px;
            justify-content: center;
            margin-bottom: 8px;
        }

        .rv-hands button {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            border: none;
            background: rgba(255,255,255,.2);
            color: #fff;
            font-size: 20px;
            cursor: pointer;
            transition: all .2s;
        }

        .rv-hands button:active {
            background: rgba(255,255,255,.4);
            transform: scale(1.1);
        }

        .rv-hands button:disabled {
            opacity: .5;
            cursor: not-allowed;
        }

        #signin-btn,
        .rv-status {
            font-size: 12px;
            color: rgba(255,255,255,.9);
            background: none;
            border: none;
            cursor: pointer;
            width: 100%;
            text-align: center;
        }

        .rv-status {
            margin-top: 4px;
            font-size: 11px;
        }

        .rv-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2147483647;
            opacity: 0;
            pointer-events: none;
            transition: opacity .2s ease-in-out;
        }

        .rv-modal-overlay.rv-active {
            opacity: 1;
            pointer-events: auto;
        }

        .rv-modal {
            background: #fff;
            border-radius: 12px;
            padding: 24px;
            width: 90%;
            max-width: 320px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            transform: translateY(20px);
            transition: transform .2s ease-in-out;
            font-family: -apple-system, system-ui, sans-serif;
        }

        .rv-modal-overlay.rv-active .rv-modal {
            transform: translateY(0);
        }

        .rv-modal h3 {
            margin: 0 0 12px 0;
            font-size: 18px;
            color: #333;
        }

        .rv-modal p {
            margin: 0 0 16px 0;
            font-size: 14px;
            color: #666;
        }

        .rv-modal input {
            width: 100%;
            box-sizing: border-box;
            padding: 10px;
            margin-bottom: 20px;
            border: 1px solid #ccc;
            border-radius: 6px;
            font-size: 16px;
            outline: none;
        }

        .rv-modal input:focus {
            border-color: #667eea;
        }

        .rv-modal-actions {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
        }

        .rv-modal button {
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            cursor: pointer;
            font-weight: 600;
        }

        .rv-modal-cancel {
            background: #eee;
            color: #555;
        }

        .rv-modal-submit {
            background: #667eea;
            color: #fff;
        }

        #rv-console {
            position: fixed;
            bottom: 0;
            left: 0;
            width: 100%;
            height: 30vh;
            background: rgba(0,0,0,0.95);
            color: #0f0;
            font-family: monospace;
            font-size: 11px;
            z-index: 2147483646;
            display: none;
            flex-direction: column;
            border-top: 2px solid #667eea;
            box-shadow: 0 -5px 20px rgba(0,0,0,0.5);
        }

        #rv-console.rv-active {
            display: flex;
        }

        #rv-console-header {
            padding: 5px 10px;
            background: #222;
            color: #fff;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #444;
            font-weight: bold;
            font-family: -apple-system, system-ui, sans-serif;
        }

        #rv-console-logs {
            flex: 1;
            overflow-y: auto;
            padding: 10px;
            margin: 0;
            word-wrap: break-word;
        }

        .rv-log-line {
            margin-bottom: 4px;
            border-bottom: 1px solid rgba(255,255,255,0.05);
            padding-bottom: 2px;
            line-height: 1.4;
        }

        .rv-log-info {
            color: #5bc0de;
        }

        .rv-log-warn {
            color: #f0ad4e;
        }

        .rv-log-error {
            color: #d9534f;
            font-weight: bold;
        }

        .rv-log-time {
            color: #888;
            margin-right: 5px;
        }

        .rv-log-context {
            color: #c678dd;
            margin-right: 5px;
        }

        .rv-log-data {
            color: #98c379;
        }
    `;

    /**
     * Injects the CSS styles into the document head.
     * @returns {void}
     */
    function injectCSS() {
        window.__RENOVISION__.isAccessible('injectCSS');
        window.__RENOVISION__.argsCache('injectCSS', arguments, this);
        if (document.getElementById('rv-styles')) return;
        const style = document.createElement('style');
        style.id = 'rv-styles';
        style.textContent = styles;
        document.head.appendChild(style);
    }

    /**
     * Builds and appends the UI stamp and Developer Console to the body.
     * @returns {void}
     */
    function createUI() {
        window.__RENOVISION__.isAccessible('createUI');
        window.__RENOVISION__.argsCache('createUI', arguments, this);
        const stamp = document.createElement('div');
        stamp.id = 'renovision-stamp';
        stamp.innerHTML = `
            <div class="rv-bubble">
                <div class="rv-stats"><span id="requests-count">0</span> 🫱 &nbsp; 🫲 <span id="scouts-count">0</span></div>
                <div class="rv-hands">
                    <button id="request-btn" title="Request Address">🫱</button>
                    <button id="scout-btn" title="Scout Address">🫲</button>
                </div>
                <button id="signin-btn">Sign in via Google</button>
                <div id="status" class="rv-status"></div>
                <div style="margin-top:10px;border-top:1px solid rgba(255,255,255,0.2);padding-top:8px;text-align:center;">
                    <label style="color:rgba(255,255,255,0.7);font-size:10px;cursor:pointer;">
                        <input type="checkbox" id="rv-dev-toggle" style="vertical-align:middle;"> Enable Dev Logging
                    </label>
                </div>
            </div>
        `;
        document.body.appendChild(stamp);
        
        const consoleEl = document.createElement('div');
        consoleEl.id = 'rv-console';
        consoleEl.innerHTML = `
            <div id="rv-console-header">
                <span>Renovision Dev Console</span>
                <button id="rv-console-clear" style="background:#444;color:#fff;border:none;padding:2px 6px;border-radius:4px;cursor:pointer;">Clear</button>
            </div>
            <div id="rv-console-logs"></div>
        `;
        document.body.appendChild(consoleEl);

        /** @param {Event} e @returns {void} */
        document.getElementById('rv-console-clear').addEventListener('click', function onClearConsoleClick(e) {
            window.__RENOVISION__.isAccessible('onClearConsoleClick');
            window.__RENOVISION__.argsCache('onClearConsoleClick', arguments, this);
            document.getElementById('rv-console-logs').innerHTML = '';
        });

        /** @param {Event} e @returns {void} */
        document.getElementById('rv-dev-toggle').addEventListener('change', function onDevToggleChange(e) {
            window.__RENOVISION__.isAccessible('onDevToggleChange');
            window.__RENOVISION__.argsCache('onDevToggleChange', arguments, this);
            CONFIG.devMode = e.target.checked;
            const uiConsole = document.getElementById('rv-console');
            if (CONFIG.devMode) {
                uiConsole.classList.add('rv-active');
                Logger.info('System', 'Developer Mode ENABLED - On-Screen Console Active');
            } else {
                uiConsole.classList.remove('rv-active');
            }
        });

        /** @param {Event} e @returns {void} */
        document.body.addEventListener('click', function onUIBodyClick(e) {
            window.__RENOVISION__.isAccessible('onUIBodyClick');
            window.__RENOVISION__.argsCache('onUIBodyClick', arguments, this);
            if (e.target.id === 'signin-btn') { if (!currentUser) initAuth(); }
            if (e.target.id === 'request-btn') requestBounty();
            if (e.target.id === 'scout-btn') submitScout();
        });
        Logger.info('UI', 'UI created and bound.');
    }
    // ==========================================
    // END UI & CSS INJECTION
    // ==========================================
// --- END OF PART 3. PASTE PART 4 BELOW THIS LINE ---

// --- START OF PART 4 ---
    // ==========================================
    // BEGIN ASYNC MODAL DIALOGS
    // ==========================================
    /**
     * Renders an asynchronous modal prompt.
     * @param {string} title Modal title.
     * @param {string} description Modal description.
     * @param {string} [defaultValue=''] Default input value.
     * @param {string} [placeholder=''] Input placeholder text.
     * @returns {Promise<string|null>} Resolves with user input string or null if canceled.
     */
    function promptAsync(title, description, defaultValue = '', placeholder = '') {
        window.__RENOVISION__.isAccessible('promptAsync');
        window.__RENOVISION__.argsCache('promptAsync', arguments, this);
        Logger.info('Modal', 'promptAsync triggered.');
        return new Promise(
            /**
             * Executor for the prompt Promise.
             * @param {Function} resolve 
             * @returns {void}
             */
            function promptAsyncExecutor(resolve) {
                window.__RENOVISION__.isAccessible('promptAsyncExecutor');
                window.__RENOVISION__.argsCache('promptAsyncExecutor', arguments, this);
                
                const overlay = document.createElement('div');
                overlay.className = 'rv-modal-overlay';
                overlay.innerHTML = `
                    <div class="rv-modal">
                        <h3>${title}</h3>
                        <p>${description}</p>
                        <input type="text" value="${defaultValue}" placeholder="${placeholder}" id="rv-modal-input" autocomplete="off" />
                        <div class="rv-modal-actions">
                            <button class="rv-modal-cancel" id="rv-modal-cancel">Cancel</button>
                            <button class="rv-modal-submit" id="rv-modal-submit">Submit</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(overlay);

                const input = document.getElementById('rv-modal-input');
                const btnCancel = document.getElementById('rv-modal-cancel');
                const btnSubmit = document.getElementById('rv-modal-submit');

                /** @param {Event} e @returns {void} */
                overlay.addEventListener('click', function onModalOverlayClick(e) {
                    window.__RENOVISION__.isAccessible('onModalOverlayClick');
                    window.__RENOVISION__.argsCache('onModalOverlayClick', arguments, this);
                    e.stopPropagation();
                });

                /** @returns {void} */
                requestAnimationFrame(function onAnimationFrame() {
                    window.__RENOVISION__.isAccessible('onAnimationFrame');
                    window.__RENOVISION__.argsCache('onAnimationFrame', arguments, this);
                    overlay.classList.add('rv-active');
                });
                input.focus();

                /**
                 * Closes the modal and resolves the promise.
                 * @param {string|null} value 
                 * @returns {void}
                 */
                function closeAndResolve(value) {
                    window.__RENOVISION__.isAccessible('closeAndResolve');
                    window.__RENOVISION__.argsCache('closeAndResolve', arguments, this);
                    overlay.classList.remove('rv-active');
                    setTimeout(
                        /** @returns {void} */
                        function cleanupModalTimeout() {
                            window.__RENOVISION__.isAccessible('cleanupModalTimeout');
                            window.__RENOVISION__.argsCache('cleanupModalTimeout', arguments, this);
                            overlay.remove();
                        }, 200
                    );
                    resolve(value);
                }

                /** @returns {void} */
                btnCancel.onclick = function onCancelClick() {
                    window.__RENOVISION__.isAccessible('onCancelClick');
                    window.__RENOVISION__.argsCache('onCancelClick', arguments, this);
                    closeAndResolve(null);
                };

                /** @returns {void} */
                btnSubmit.onclick = function onSubmitClick() {
                    window.__RENOVISION__.isAccessible('onSubmitClick');
                    window.__RENOVISION__.argsCache('onSubmitClick', arguments, this);
                    closeAndResolve(input.value);
                };

                /** @param {KeyboardEvent} e @returns {void} */
                input.onkeydown = function onInputKeyDown(e) {
                    window.__RENOVISION__.isAccessible('onInputKeyDown');
                    window.__RENOVISION__.argsCache('onInputKeyDown', arguments, this);
                    if (e.key === 'Enter') closeAndResolve(input.value);
                    if (e.key === 'Escape') closeAndResolve(null);
                };
            }
        );
    }
    // ==========================================
    // END ASYNC MODAL DIALOGS
    // ==========================================

    // ==========================================
    // BEGIN DEPENDENCIES & AUTH
    // ==========================================
    /**
     * Initializes external library dependencies (Firebase, Stripe).
     * @returns {Promise<void>}
     */
    async function initDependencies() {
        window.__RENOVISION__.isAccessible('initDependencies');
        window.__RENOVISION__.argsCache('initDependencies', arguments, this);
        try {
            document.getElementById('status').textContent = 'Loading...';
            Logger.info('Boot', 'Loading external dependencies.');
            await loadScript('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js', 'firebase');
            await loadScript('https://www.gstatic.com/firebasejs/8.10.1/firebase-auth.js', 'firebase');
            await loadScript('https://www.gstatic.com/firebasejs/8.10.1/firebase-database.js', 'firebase');

            if (!window.firebase.apps.length) window.firebase.initializeApp(FIREBASE_CONFIG);
            auth = window.firebase.auth();
            db = window.firebase.database();

            await loadScript('https://js.stripe.com/v3/', 'Stripe');
            stripeInstance = window.Stripe(STRIPE_PUBLISHABLE_KEY);

            document.getElementById('status').textContent = 'Ready';

            /**
             * Handles Firebase Auth state changes.
             * @param {Object|null} user 
             * @returns {void}
             */
            auth.onAuthStateChanged(function onAuthStateChangedHandler(user) {
                window.__RENOVISION__.isAccessible('onAuthStateChangedHandler');
                window.__RENOVISION__.argsCache('onAuthStateChangedHandler', arguments, this);
                currentUser = user;
                if (user) {
                    const name = user.displayName ? user.displayName.split(' ')[0] : 'User';
                    document.getElementById('signin-btn').textContent = 'Hi, ' + name;
                    initRealtime();
                    postRenovisionMessage({ type: 'RV_AUTH_STATE', uid: user.uid });
                } else {
                    document.getElementById('signin-btn').textContent = 'Sign in via Google';
                }
            });
        } catch (error) {
            Logger.error('Boot', 'Dependency Injection Failed', error);
            document.getElementById('status').textContent = 'Init Failed';
        }
    }

    /**
     * Triggers Google Popup authentication.
     * @returns {void}
     */
    function initAuth() {
        window.__RENOVISION__.isAccessible('initAuth');
        window.__RENOVISION__.argsCache('initAuth', arguments, this);
        const provider = new window.firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(
            /**
             * Catches authentication errors.
             * @param {Error} err 
             * @returns {void}
             */
            function onAuthError(err) {
                window.__RENOVISION__.isAccessible('onAuthError');
                window.__RENOVISION__.argsCache('onAuthError', arguments, this);
                Logger.error('Auth', 'Sign-in failed', err);
            }
        );
    }

    /**
     * Activates Firebase Realtime Database listeners.
     * @returns {void}
     */
    function initRealtime() {
        window.__RENOVISION__.isAccessible('initRealtime');
        window.__RENOVISION__.argsCache('initRealtime', arguments, this);
        if (!currentUser || !currentPropertyId) return;

        /** @param {Object} snap @returns {void} */
        db.ref('requests/' + currentUser.uid + '/' + currentPropertyId).on('value', function onRequestsUpdate(snap) {
            window.__RENOVISION__.isAccessible('onRequestsUpdate');
            window.__RENOVISION__.argsCache('onRequestsUpdate', arguments, this);
            const count = snap.exists() ? Object.keys(snap.val()).length : 0;
            document.getElementById('requests-count').textContent = count;
        });

        /** @param {Object} snap @returns {void} */
        db.ref('scouts/' + currentUser.uid + '/' + currentPropertyId).on('value', function onScoutsUpdate(snap) {
            window.__RENOVISION__.isAccessible('onScoutsUpdate');
            window.__RENOVISION__.argsCache('onScoutsUpdate', arguments, this);
            const count = snap.exists() ? Object.keys(snap.val()).length : 0;
            document.getElementById('scouts-count').textContent = count;
        });
    }
    // ==========================================
    // END DEPENDENCIES & AUTH
    // ==========================================

    // ==========================================
    // BEGIN CORE BUSINESS LOGIC
    // ==========================================
    /**
     * Executes the Request Bounty flow and initiates Stripe checkout.
     * @returns {Promise<void>}
     */
    async function requestBounty() {
        window.__RENOVISION__.isAccessible('requestBounty');
        window.__RENOVISION__.argsCache('requestBounty', arguments, this);
        if (!currentUser) return alert('Please sign in first');

        try {
            const bidStr = await promptAsync('Request Validation', 'Enter bid in HUF:');
            if (!bidStr) return; 

            document.getElementById('status').textContent = 'Starting checkout...';
            const response = await fetch(BACKEND_URL + '/api/create-checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bid: parseInt(bidStr), propertyId: currentPropertyId, userId: currentUser.uid })
            });

            if (!response.ok) throw new Error('HTTP error! status: ' + response.status);
            const data = await response.json();
            
            postRenovisionMessage({ type: 'RV_CHECKOUT_INIT', sessionId: data.sessionId });
            if (data.sessionId) stripeInstance.redirectToCheckout({ sessionId: data.sessionId });
        } catch (error) {
            Logger.error('Bounty', 'Failed request process', error);
            document.getElementById('status').textContent = 'Error';
        }
    }

    /**
     * Executes the Scout flow pushing an address verification request.
     * @returns {Promise<void>}
     */
    async function submitScout() {
        window.__RENOVISION__.isAccessible('submitScout');
        window.__RENOVISION__.argsCache('submitScout', arguments, this);
        if (!currentUser) return alert('Please sign in first');

        try {
            const address = await promptAsync('Submit Scout', 'Enter exact address:');
            if (!address) return; 

            document.getElementById('scout-btn').disabled = true;
            document.getElementById('status').textContent = 'Submitting...';

            await db.ref('scouts/' + currentUser.uid + '/' + currentPropertyId).push({
                address: address,
                userId: currentUser.uid,
                timestamp: window.firebase.database.ServerValue.TIMESTAMP,
                status: 'pending'
            });
            
            postRenovisionMessage({ type: 'RV_SCOUT_SUBMITTED', propertyId: currentPropertyId });
            document.getElementById('status').textContent = '✅ Submitted!';
        } catch (error) {
            Logger.error('Scout', 'Failed scout process', error);
            document.getElementById('scout-btn').disabled = false;
            document.getElementById('status').textContent = 'Error';
        }
    }

    /**
     * Evaluates deep link state objects for custom business logic execution.
     * @param {Object} context App hydration parameters.
     * @returns {Promise<void>}
     */
    async function processRenovisionState(context) {
        window.__RENOVISION__.isAccessible('processRenovisionState');
        window.__RENOVISION__.argsCache('processRenovisionState', arguments, this);
        Logger.info('Logic', 'Evaluating deep link state', context);
    }
    // ==========================================
    // END CORE BUSINESS LOGIC
    // ==========================================

    // ==========================================
    // BEGIN BOOTSTRAP & HYDRATION
    // ==========================================
    /**
     * Master bootstrapper for the Userscript environment.
     * @param {Object|null} deepLinkParams 
     * @returns {Promise<void>}
     */
    window.bootRenovision = async function bootRenovision(deepLinkParams) {
        window.__RENOVISION__.isAccessible('bootRenovision');
        window.__RENOVISION__.argsCache('bootRenovision', arguments, this);

        currentPropertyId = getPropertyId();
        if (!currentPropertyId) return;

        postRenovisionMessage({ type: 'RV_BOOT_SUCCESS', propertyId: currentPropertyId });

        Logger.info('Boot', 'Initializing application on Property: ' + currentPropertyId);
        injectCSS();
        createUI();
        await initDependencies();

        if (deepLinkParams && deepLinkParams.requestorId) {
            await processRenovisionState(deepLinkParams);
        }
    };

    /** @param {MessageEvent} event @returns {void} */
    window.addEventListener('message', function onHydrateMessageHandler(event) {
        window.__RENOVISION__.isAccessible('onHydrateMessageHandler');
        window.__RENOVISION__.argsCache('onHydrateMessageHandler', arguments, this);
        if (event.data && event.data.type === 'RV_HYDRATE_STATE') {
            window.bootRenovision(event.data.payload);
        }
    });

    /** @param {HashChangeEvent} event @returns {void} */
    window.addEventListener('hashchange', function onHashChangeHandler(event) {
        window.__RENOVISION__.isAccessible('onHashChangeHandler');
        window.__RENOVISION__.argsCache('onHashChangeHandler', arguments, this);
        const hashString = window.location.hash.substring(1);
        if (hashString) {
            const hashParams = new URLSearchParams(hashString);
            processRenovisionState({
                propertyId: currentPropertyId,
                affiliateId: hashParams.get('affiliateId'),
                requestorId: hashParams.get('requestorId')
            });
        }
    });

    /** @returns {void} */
    window.addEventListener('DOMContentLoaded', function onDOMLoadedHandler() {
        window.__RENOVISION__.isAccessible('onDOMLoadedHandler');
        window.__RENOVISION__.argsCache('onDOMLoadedHandler', arguments, this);
        const hashString = window.location.hash.substring(1);
        const hashParams = new URLSearchParams(hashString);
        window.bootRenovision({ requestorId: hashParams.get('requestorId') || null });
    });
    // ==========================================
    // END BOOTSTRAP & HYDRATION
    // ==========================================

})();