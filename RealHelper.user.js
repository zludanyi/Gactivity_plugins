// ==UserScript==
// @name         Renovision - P2P real helper
// @namespace    http://renovision.app/
// @version      1.2
// @description  Anonymous p2p real estate validation network for ingatlan.com
// @author       Renovision
// @match        https://ingatlan.com/*
// @grant        none
// @run-at       document-end
// ==/UserScript==
(function() {
    'use strict';
    // ==========================================
    // CONFIGURATION
    // ==========================================
    const STRIPE_PUBLISHABLE_KEY = 'pk_test_YOUR_KEY'; // REPLACE WITH YOUR KEY
    const FIREBASE_CONFIG = {
        apiKey: "your-api-key",                  // REPLACE WITH YOUR KEY
        authDomain: "renovision-prod.firebaseapp.com",
        projectId: "renovision-prod",
        databaseURL: "https://renovision-prod-default-rtdb.europe-west1.firebasedatabase.app"
    };
    const BACKEND_URL = 'https://YOUR-VERCEL-DOMAIN.vercel.app'; // REPLACE WITH YOUR VERCEL URL

    let currentUser = null;
    let currentPropertyId = null;
    let db = null;
    let auth = null;
    let stripeInstance = null;

    // ==========================================
    // LOGGER & APP CONFIG
    // ==========================================
    const CONFIG = {
        devMode: false // Toggled via UI
    };

    class Logger {
        static info(context, message, data = '') {
            if (!CONFIG.devMode) return;
            console.log(`%c[Renovision][${context}]%c ${message}`, 'color: #667eea; font-weight: bold;', 'color: inherit;', data);
        }
        
        static warn(context, message, data = '') {
            if (!CONFIG.devMode) return;
            console.warn(`[Renovision][${context}] ${message}`, data);
        }
        
        static error(context, message, error = '') {
            if (!CONFIG.devMode) return;
            console.error(`[Renovision][${context}] ${message}`, error);
        }
        
        static trace(context, message) {
            if (!CONFIG.devMode) return;
            console.trace(`[Renovision][${context}] ${message}`);
        }
    }

    // ==========================================
    // UTILITIES
    // ==========================================
    function getPropertyId() {
        const match = window.location.href.match(//(d+)/);
        return match ? match[1] : null;
    }

    // Dynamic script loader for WebView & Userscript compatibility
    function loadScript(src, globalVarName) {
        return new Promise((resolve, reject) => {
            if (window[globalVarName]) {
                resolve(window[globalVarName]);
                return;
            }
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => resolve(window[globalVarName]);
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    // ==========================================
    // UI & CSS INJECTION
    // ==========================================
    const styles = `
        /* Stamp & Bubble */
        #renovision-stamp{position:fixed;bottom:20px;right:20px;z-index:2147483647;cursor:pointer;font-size:24px;user-select:none;-webkit-tap-highlight-color:transparent;}
        #renovision-stamp:hover .rv-bubble, #renovision-stamp:active .rv-bubble{opacity:1;transform:scale(1);}
        .rv-bubble{position:absolute;bottom:60px;right:0;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);border-radius:20px;padding:16px;min-width:180px;opacity:0;transform:scale(0.9);transition:all .3s cubic-bezier(.175,.885,.32,1.275);box-shadow:0 10px 30px rgba(0,0,0,.3);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.2);font-family:-apple-system,system-ui,sans-serif;}
        .rv-stats{font-size:14px;color:#fff;margin-bottom:8px;font-weight:600;text-align:center;}
        .rv-hands{display:flex;gap:12px;justify-content:center;margin-bottom:8px;}
        .rv-hands button{width:48px;height:48px;border-radius:50%;border:none;background:rgba(255,255,255,.2);color:#fff;font-size:20px;cursor:pointer;transition:all .2s;}
        .rv-hands button:active{background:rgba(255,255,255,.4);transform:scale(1.1);}
        .rv-hands button:disabled{opacity:.5;cursor:not-allowed;}
        #signin-btn,.rv-status{font-size:12px;color:rgba(255,255,255,.9);background:none;border:none;cursor:pointer;width:100%;text-align:center;}
        .rv-status{margin-top:4px;font-size:11px;}
        
        /* Modal Overlay */
        .rv-modal-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:2147483647;opacity:0;pointer-events:none;transition:opacity .2s ease-in-out;}
        .rv-modal-overlay.rv-active{opacity:1;pointer-events:auto;}
        .rv-modal{background:#fff;border-radius:12px;padding:24px;width:90%;max-width:320px;box-shadow:0 10px 30px rgba(0,0,0,0.5);transform:translateY(20px);transition:transform .2s ease-in-out;font-family:-apple-system,system-ui,sans-serif;}
        .rv-modal-overlay.rv-active .rv-modal{transform:translateY(0);}
        .rv-modal h3{margin:0 0 12px 0;font-size:18px;color:#333;}
        .rv-modal p{margin:0 0 16px 0;font-size:14px;color:#666;}
        .rv-modal input{width:100%;box-sizing:border-box;padding:10px;margin-bottom:20px;border:1px solid #ccc;border-radius:6px;font-size:16px;outline:none;}
        .rv-modal input:focus{border-color:#667eea;}
        .rv-modal-actions{display:flex;justify-content:flex-end;gap:10px;}
        .rv-modal button{padding:8px 16px;border:none;border-radius:6px;font-size:14px;cursor:pointer;font-weight:600;}
        .rv-modal-cancel{background:#eee;color:#555;}
        .rv-modal-submit{background:#667eea;color:#fff;}
    `;

    function injectCSS() {
        if (document.getElementById('rv-styles')) return;
        const style = document.createElement('style');
        style.id = 'rv-styles';
        style.textContent = styles;
        document.head.appendChild(style);
    }

    function createUI() {
        const stamp = document.createElement('div');
        stamp.id = 'renovision-stamp';
        stamp.innerHTML = `
            <div class="rv-bubble">
                <div class="rv-stats">
                    <span id="requests-count">0</span> 🫱 &nbsp; 🫲 <span id="scouts-count">0</span>
                </div>
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

        // Dev Toggle Listener
        document.getElementById('rv-dev-toggle').addEventListener('change', (e) => {
            CONFIG.devMode = e.target.checked;
            if (CONFIG.devMode) {
                console.log("%c[Renovision] Developer Mode ENABLED", "color: #28a745; font-weight: bold;");
                Logger.info('Core', 'Logging started.');
            }
        });

        return stamp;
    }

    // ==========================================
    // ASYNC MODAL DIALOGS
    // ==========================================
    function promptAsync(title, description, defaultValue = '', placeholder = '') {
        return new Promise((resolve) => {
            Logger.info('Modal', `Opening modal: ${title}`);
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

            // Prevent event bubbling to stamp
            overlay.addEventListener('click', (e) => e.stopPropagation());

            requestAnimationFrame(() => overlay.classList.add('rv-active'));
            input.focus();

            const closeAndResolve = (value) => {
                Logger.info('Modal', `Closing modal: ${title}, resolving with:`, value);
                overlay.classList.remove('rv-active');
                setTimeout(() => overlay.remove(), 200);
                resolve(value);
            };

            btnCancel.onclick = () => closeAndResolve(null);
            btnSubmit.onclick = () => closeAndResolve(input.value);
            
            input.onkeydown = (e) => {
                if (e.key === 'Enter') closeAndResolve(input.value);
                if (e.key === 'Escape') closeAndResolve(null);
            };
        });
    }

    // ==========================================
    // FIREBASE & STRIPE INITIALIZATION
    // ==========================================
    async function initDependencies() {
        try {
            Logger.info('Boot', 'Loading dependencies...');
            document.getElementById('status').textContent = 'Loading...';

            await loadScript('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js', 'firebase');
            await loadScript('https://www.gstatic.com/firebasejs/8.10.1/firebase-auth.js', 'firebase');
            await loadScript('https://www.gstatic.com/firebasejs/8.10.1/firebase-database.js', 'firebase');

            if (!window.firebase.apps.length) {
                window.firebase.initializeApp(FIREBASE_CONFIG);
            }
            auth = window.firebase.auth();
            db = window.firebase.database();

            await loadScript('https://js.stripe.com/v3/', 'Stripe');
            stripeInstance = window.Stripe(STRIPE_PUBLISHABLE_KEY);

            Logger.info('Boot', 'Dependencies loaded successfully.');
            document.getElementById('status').textContent = 'Ready';
            
            auth.onAuthStateChanged(user => {
                currentUser = user;
                if (user) {
                    Logger.info('Auth', 'User logged in', user.uid);
                    const name = user.displayName ? user.displayName.split(' ')[0] : 'User';
                    document.getElementById('signin-btn').textContent = `Hi, ${name}`;
                    initRealtime();
                } else {
                    Logger.info('Auth', 'User logged out');
                    document.getElementById('signin-btn').textContent = 'Sign in via Google';
                }
            });
        } catch (error) {
            Logger.error('Boot', 'Dependency Injection Failed', error);
            document.getElementById('status').textContent = 'Init Failed';
        }
    }

    // ==========================================
    // CORE LOGIC
    // ==========================================
    function initAuth() {
        Logger.info('Auth', 'Initiating Google Sign-In...');
        const provider = new window.firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(err => {
            Logger.error('Auth', 'Sign-in failed', err);
            alert('Sign in failed: ' + err.message);
        });
    }

    function initRealtime() {
        if (!currentUser || !currentPropertyId) return;
        Logger.info('Realtime', `Initializing listeners for property: ${currentPropertyId}`);

        db.ref(`requests/${currentUser.uid}/${currentPropertyId}`).on('value', snap => {
            const count = snap.exists() ? Object.keys(snap.val()).length : 0;
            document.getElementById('requests-count').textContent = count;
            Logger.info('Realtime', 'Requests count updated', count);
        });

        db.ref(`scouts/${currentUser.uid}/${currentPropertyId}`).on('value', snap => {
            const count = snap.exists() ? Object.keys(snap.val()).length : 0;
            document.getElementById('scouts-count').textContent = count;
            Logger.info('Realtime', 'Scouts count updated', count);
        });
    }

    async function requestBounty() {
        Logger.info('Bounty', 'User initiated bounty request.');
        
        if (!currentUser) {
            Logger.warn('Bounty', 'User not signed in. Aborting.');
            return alert('Please sign in first');
        }

        try {
            Logger.info('Bounty', 'Awaiting bid modal...');
            const bidStr = await promptAsync(
                'Request Address Validation', 
                'Enter your bounty bid in HUF:', 
                '80000', 
                'Amount in HUF (e.g., 80000)'
            );
            
            if (bidStr === null) {
                Logger.info('Bounty', 'User cancelled the bid modal.');
                return; 
            }

            const bid = parseInt(bidStr);
            if (!bid || isNaN(bid)) {
                Logger.warn('Bounty', 'Invalid bid amount entered.', bidStr);
                alert('Invalid bid amount. Please enter a number.');
                return;
            }
            
            Logger.info('Bounty', `Bid accepted: ${bid} HUF. Initiating API call...`);
            document.getElementById('status').textContent = 'Starting checkout...';

            const response = await fetch(`${BACKEND_URL}/api/create-checkout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bid, propertyId: currentPropertyId, userId: currentUser.uid })
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const data = await response.json();
            Logger.info('Bounty', 'Received session ID from backend.', data.sessionId);
            
            if (data.sessionId) {
                Logger.info('Bounty', 'Redirecting to Stripe Checkout...');
                stripeInstance.redirectToCheckout({ sessionId: data.sessionId });
            } else {
                throw new Error('No session ID returned from server.');
            }
        } catch (error) {
            Logger.error('Bounty', 'Failed during bounty request process.', error);
            alert('Payment setup error: ' + error.message);
            document.getElementById('status').textContent = 'Error';
        }
    }

    async function submitScout() {
        Logger.info('Scout', 'User initiated scouting process.');

        if (!currentUser) {
            Logger.warn('Scout', 'User not signed in. Aborting.');
            return alert('Please sign in first');
        }

        try {
            Logger.info('Scout', 'Checking Stripe Connect onboarding status...');
            const snap = await db.ref(`scouts_meta/${currentUser.uid}/stripeAccountId`).once('value');
            
            if (!snap.exists()) {
                Logger.info('Scout', 'User not onboarded. Prompting for Stripe Connect.');
                const proceed = confirm("You need a Stripe Connect account to receive payouts. Set it up now?");
                if (proceed) {
                    document.getElementById('status').textContent = 'Redirecting...';
                    Logger.info('Scout', 'Fetching onboarding URL from backend...');
                    
                    const response = await fetch(`${BACKEND_URL}/api/onboard-scout`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: currentUser.uid })
                    });
                    
                    if (!response.ok) throw new Error('Failed to generate onboarding link');
                    
                    const { url } = await response.json();
                    Logger.info('Scout', 'Redirecting to Stripe onboarding...', url);
                    window.location.href = url; 
                } else {
                    Logger.info('Scout', 'User declined Stripe onboarding.');
                }
                return;
            }

            Logger.info('Scout', 'User is onboarded. Awaiting address modal...');
            const address = await promptAsync(
                'Submit Scouted Address', 
                'Enter the validated exact address (Street and Number):', 
                '', 
                'e.g., Kérő utca 12.'
            );
            
            if (!address) {
                Logger.info('Scout', 'User cancelled address input modal.');
                return; 
            }
            
            Logger.info('Scout', `Address provided: ${address}. Pushing to Firebase...`);
            document.getElementById('scout-btn').disabled = true;
            document.getElementById('status').textContent = 'Submitting...';

            await db.ref(`scouts/${currentUser.uid}/${currentPropertyId}`).push({
                address: address,
                userId: currentUser.uid,
                timestamp: window.firebase.database.ServerValue.TIMESTAMP,
                status: 'pending'
            });

            Logger.info('Scout', 'Successfully pushed address to Firebase.');
            document.getElementById('status').textContent = '✅ Submitted!';
            
            if (window.ReactNativeWebView) {
                Logger.info('Scout', 'Sending SCOUT_SUBMITTED message to React Native bridge.');
                window.ReactNativeWebView.postMessage(JSON.stringify({ event: 'SCOUT_SUBMITTED', propertyId: currentPropertyId }));
            }
        } catch (error) {
            Logger.error('Scout', 'Failed during scouting process.', error);
            alert('Error submitting: ' + (error.message || 'Unknown error'));
            document.getElementById('scout-btn').disabled = false;
            document.getElementById('status').textContent = 'Error';
        }
    }

    // ==========================================
    // BOOTSTRAP
    // ==========================================
    function boot() {
        currentPropertyId = getPropertyId();
        if (!currentPropertyId) {
            Logger.info('Boot', 'Not on a property page. Aborting initialization.');
            return; 
        }
        
        Logger.info('Boot', `Initializing Renovision on property ID: ${currentPropertyId}`);
        injectCSS();
        createUI();
        
        document.getElementById('signin-btn').onclick = () => {
            if (!currentUser) initAuth();
        };
        document.getElementById('request-btn').onclick = requestBounty;
        document.getElementById('scout-btn').onclick = submitScout;

        initDependencies();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

})();