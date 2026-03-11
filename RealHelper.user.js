// ==UserScript==
// @name         Renovision - P2P Address Validation
// @namespace    http://renovision.app/
// @version      1.1
// @description  Anonymous address validation network for ingatlan.com
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
    const STRIPE_PUBLISHABLE_KEY = 'pk_test_YOUR_KEY';
    const FIREBASE_CONFIG = {
        apiKey: "your-api-key",
        authDomain: "renovision-prod.firebaseapp.com",
        projectId: "renovision-prod",
        databaseURL: "https://renovision-prod-default-rtdb.europe-west1.firebasedatabase.app"
    };
    const BACKEND_URL = 'https://YOUR-VERCEL-DOMAIN.vercel.app'; // Update this!

    let currentUser = null;
    let currentPropertyId = null;
    let db = null;
    let auth = null;
    let stripeInstance = null;

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
        #renovision-stamp{position:fixed;bottom:20px;right:20px;z-index:2147483647;cursor:pointer;font-size:24px;user-select:none;-webkit-tap-highlight-color:transparent;}
        #renovision-stamp:hover .rv-bubble, #renovision-stamp:active .rv-bubble{opacity:1;transform:scale(1);}
        .rv-bubble{position:absolute;bottom:60px;right:0;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);border-radius:20px;padding:16px;min-width:180px;opacity:0;transform:scale(0.9);transition:all .3s cubic-bezier(.175,.885,.32,1.275);box-shadow:0 10px 30px rgba(0,0,0,.3);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.2);}
        .rv-stats{font-size:14px;color:#fff;margin-bottom:8px;font-weight:600;text-align:center;}
        .rv-hands{display:flex;gap:12px;justify-content:center;margin-bottom:8px;}
        .rv-hands button{width:48px;height:48px;border-radius:50%;border:none;background:rgba(255,255,255,.2);color:#fff;font-size:20px;cursor:pointer;transition:all .2s;}
        .rv-hands button:active{background:rgba(255,255,255,.4);transform:scale(1.1);}
        .rv-hands button:disabled{opacity:.5;cursor:not-allowed;}
        #signin-btn,.rv-status{font-size:12px;color:rgba(255,255,255,.9);background:none;border:none;cursor:pointer;width:100%;text-align:center;}
        .rv-status{margin-top:4px;font-size:11px;}
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
            </div>
        `;
        document.body.appendChild(stamp);
        return stamp;
    }

    // ==========================================
    // FIREBASE & STRIPE INITIALIZATION
    // ==========================================
    async function initDependencies() {
        try {
            document.getElementById('status').textContent = 'Loading...';

            // 1. Load Firebase (v8 UMD)
            await loadScript('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js', 'firebase');
            await loadScript('https://www.gstatic.com/firebasejs/8.10.1/firebase-auth.js', 'firebase');
            await loadScript('https://www.gstatic.com/firebasejs/8.10.1/firebase-database.js', 'firebase');

            if (!window.firebase.apps.length) {
                window.firebase.initializeApp(FIREBASE_CONFIG);
            }
            auth = window.firebase.auth();
            db = window.firebase.database();

            // 2. Load Stripe JS (Global)
            await loadScript('https://js.stripe.com/v3/', 'Stripe');
            stripeInstance = window.Stripe(STRIPE_PUBLISHABLE_KEY);

            document.getElementById('status').textContent = 'Ready';
            
            // 3. Listen for Auth
            auth.onAuthStateChanged(user => {
                currentUser = user;
                if (user) {
                    const name = user.displayName ? user.displayName.split(' ')[0] : 'User';
                    document.getElementById('signin-btn').textContent = `Hi, ${name}`;
                    initRealtime();
                } else {
                    document.getElementById('signin-btn').textContent = 'Sign in via Google';
                }
            });
        } catch (error) {
            console.error('Renovision Dep Error:', error);
            document.getElementById('status').textContent = 'Init Failed';
        }
    }

    // ==========================================
    // CORE LOGIC
    // ==========================================
    function initAuth() {
        const provider = new window.firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(err => {
            alert('Sign in failed: ' + err.message);
        });
    }

    function initRealtime() {
        if (!currentUser || !currentPropertyId) return;

        db.ref(`requests/${currentUser.uid}/${currentPropertyId}`).on('value', snap => {
            const count = snap.exists() ? Object.keys(snap.val()).length : 0;
            document.getElementById('requests-count').textContent = count;
        });

        db.ref(`scouts/${currentUser.uid}/${currentPropertyId}`).on('value', snap => {
            const count = snap.exists() ? Object.keys(snap.val()).length : 0;
            document.getElementById('scouts-count').textContent = count;
        });
    }

    async function requestBounty() {
        if (!currentUser) return alert('Please sign in first');
        
        const bidStr = prompt('Enter your bounty bid in HUF:', '80000');
        const bid = parseInt(bidStr);
        if (!bid || isNaN(bid)) return;
        
        document.getElementById('status').textContent = 'Starting checkout...';

        try {
            const response = await fetch(`${BACKEND_URL}/api/create-checkout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bid, propertyId: currentPropertyId, userId: currentUser.uid })
            });
            const data = await response.json();
            
            if (data.sessionId) {
                // This works universally across Desktop Tampermonkey and Mobile WebViews
                stripeInstance.redirectToCheckout({ sessionId: data.sessionId });
            }
        } catch (error) {
            alert('Payment setup error: ' + error.message);
            document.getElementById('status').textContent = 'Error';
        }
    }

    async function submitScout() {
        if (!currentUser) return alert('Please sign in first');

        // Check if scout is onboarded with Stripe Connect
        db.ref(`scouts_meta/${currentUser.uid}/stripeAccountId`).once('value', async (snap) => {
            if (!snap.exists()) {
                const proceed = confirm("You need a Stripe Connect account to receive payouts. Set it up now?");
                if (proceed) {
                    document.getElementById('status').textContent = 'Redirecting to Stripe...';
                    const response = await fetch(`${BACKEND_URL}/api/onboard-scout`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: currentUser.uid })
                    });
                    const { url } = await response.json();
                    window.location.href = url; // Redirects WebView/Browser to Stripe onboarding
                }
                return;
            }

            // If onboarded, submit the address
            const address = prompt('Enter the validated address (e.g., Kérő utca 12):');
            if (!address) return;
            
            document.getElementById('scout-btn').disabled = true;
            document.getElementById('status').textContent = 'Submitting...';

            db.ref(`scouts/${currentUser.uid}/${currentPropertyId}`).push({
                address: address,
                userId: currentUser.uid,
                timestamp: window.firebase.database.ServerValue.TIMESTAMP,
                status: 'pending'
            }).then(() => {
                document.getElementById('status').textContent = '✅ Submitted!';
                if (window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ event: 'SCOUT_SUBMITTED', propertyId: currentPropertyId }));
                }
            }).catch(err => {
                alert('Error submitting: ' + err.message);
                document.getElementById('scout-btn').disabled = false;
            });
        });
    }

    // ==========================================
    // BOOTSTRAP
    // ==========================================
    function boot() {
        currentPropertyId = getPropertyId();
        if (!currentPropertyId) return;
        
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