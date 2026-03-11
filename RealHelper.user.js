(function() {
    'use strict';

    // Configuration (update these)
    const STRIPE_PUBLISHABLE_KEY = 'pk_test_YOUR_KEY';
    const FIREBASE_CONFIG = {
        apiKey: "your-api-key",
        authDomain: "renovision-prod.firebaseapp.com",
        projectId: "renovision-prod",
        databaseURL: "https://renovision-prod-default-rtdb.europe-west1.firebasedatabase.app"
    };

    let currentUser = null;
    let currentPropertyId = null;
    let firebaseModules = {};
    let stripe = null;
    let ws = null;

    // Extract property ID from URL
    function getPropertyId() {
        const match = window.location.href.match(//(d+)/);
        return match ? match[1] : null;
    }

    // CSS (minified, inline)
    const styles = `
        #renovision-stamp{position:fixed;bottom:20px;right:20px;z-index:999999;cursor:pointer;font-size:24px;user-select:none;}
        #renovision-stamp:hover .rv-bubble{opacity:1;transform:scale(1);}
        .rv-bubble{position:absolute;bottom:60px;right:0;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);border-radius:20px;padding:16px;min-width:180px;opacity:0;transform:scale(0.9);transition:all .3s cubic-bezier(.175,.885,.32,1.275);box-shadow:0 10px 30px rgba(0,0,0,.3);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.2);}
        .rv-stats{font-size:14px;color:#fff;margin-bottom:8px;font-weight:600;}
        .rv-hands{display:flex;gap:12px;justify-content:center;margin-bottom:8px;}
        .rv-hands button{width:48px;height:48px;border-radius:50%;border:none;background:rgba(255,255,255,.2);color:#fff;font-size:20px;cursor:pointer;transition:all .2s;backdrop-filter:blur(5px);}
        .rv-hands button:hover{background:rgba(255,255,255,.4);transform:scale(1.1);}
        .rv-hands button:disabled{opacity:.5;cursor:not-allowed;transform:none;}
        #signin-btn,.rv-status{font-size:12px;color:rgba(255,255,255,.9);background:none;border:none;cursor:pointer;}
        .rv-status{margin-top:4px;font-size:11px;}
        .rv-scouting{animation:pulse 1.5s infinite;}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5;}}
    `;

    // Inject CSS once
    function injectCSS() {
        if (document.getElementById('rv-styles')) return;
        const style = document.createElement('style');
        style.id = 'rv-styles';
        style.textContent = styles;
        document.head.appendChild(style);
    }

    // Create UI
    function createUI() {
        const stamp = document.createElement('div');
        stamp.id = 'renovision-stamp';
        stamp.innerHTML = `
            <div class="rv-bubble">
                <div class="rv-stats">
                    <span id="requests-count">0</span> 🫱 
                    <span id="scouts-count">0</span> 🫲
                </div>
                <div class="rv-hands">
                    <button id="request-btn" title="Request address">🫱</button>
                    <button id="scout-btn" title="Scout address">🫲</button>
                </div>
                <button id="signin-btn">Sign in</button>
                <div id="status" class="rv-status"></div>
            </div>
        `;
        document.body.appendChild(stamp);
        return stamp;
    }

    // Debounce utility
    function debounce(fn, ms) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), ms);
        };
    }

    // Load Firebase modules dynamically
    async function loadFirebase() {
        if (firebaseModules.auth) return firebaseModules;
        
        const appModule = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
        const authModule = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
        const dbModule = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');
        
        const app = appModule.initializeApp(FIREBASE_CONFIG);
        firebaseModules = {
            app,
            auth: authModule.getAuth(app),
            db: dbModule.getDatabase(app),
            ...authModule,
            ...dbModule
        };
        return firebaseModules;
    }

    // Load Stripe
    async function loadStripe() {
        if (stripe) return stripe;
        const Stripe = await import('https://js.stripe.com/v3/');
        stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
        return stripe;
    }

    // Google Auth
    async function initAuth(auth) {
        const provider = new firebaseModules.GoogleAuthProvider();
        
        document.getElementById('signin-btn').onclick = async () => {
            try {
                const result = await firebaseModules.signInWithPopup(auth, provider);
                currentUser = result.user;
                document.getElementById('signin-btn').textContent = `Hi ${currentUser.displayName?.split(' ')[0] || 'User'}`;
                initRealtime();
            } catch (error) {
                console.error('Auth error:', error);
            }
        };
    }

    // Real-time stats
    async function initRealtime() {
        const { db } = firebaseModules;
        const propertyRef = firebaseModules.ref(db, `requests/${currentUser.uid}/${currentPropertyId}`);
        const scoutRef = firebaseModules.ref(db, `scouts/${currentUser.uid}/${currentPropertyId}`);
        
        firebaseModules.onValue(propertyRef, (snap) => {
            const count = snap.val() ? Object.keys(snap.val()).length : 0;
            document.getElementById('requests-count').textContent = count;
        });
        
        firebaseModules.onValue(scoutRef, (snap) => {
            const count = snap.val() ? Object.keys(snap.val()).length : 0;
            document.getElementById('scouts-count').textContent = count;
        });
    }

    // Bounty request
    async function requestBounty() {
        const stripe = await loadStripe();
        const bid = parseInt(prompt('Bid (HUF):', '80000'));
        if (!bid || isNaN(bid)) return;
        
        try {
            const response = await fetch('/api/create-checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    bid, 
                    propertyId: currentPropertyId, 
                    userId: currentUser.uid 
                })
            });
            const { sessionId } = await response.json();
            stripe.redirectToCheckout({ sessionId });
        } catch (error) {
            alert('Payment error: ' + error.message);
        }
    }

    // Scout submission
    async function submitScout() {
        const address = prompt('Validated address:');
        if (!address) return;
        
        const { db } = firebaseModules;
        const scoutRef = firebaseModules.ref(db, `scouts/${currentUser.uid}/${currentPropertyId}`);
        await firebaseModules.push(scoutRef, {
            address,
            userId: currentUser.uid,
            timestamp: firebaseModules.serverTimestamp(),
            status: 'pending'
        });
        
        document.getElementById('status').textContent = '✅ Submitted!';
        document.getElementById('scout-btn').disabled = true;
    }

    // Notifications
    async function initNotifications() {
        if (Notification.permission === 'default') {
            Notification.requestPermission();
        }
        
        const { db } = firebaseModules;
        const notificationsRef = firebaseModules.ref(db, `notifications/${currentUser.uid}/${currentPropertyId}`);
        firebaseModules.onValue(notificationsRef, (snap) => {
            if (snap.val()) {
                new Notification('Renovision', { 
                    body: 'New address validation available!' 
                });
            }
        });
    }

    // Main initialization
    async function init() {
        currentPropertyId = getPropertyId();
        if (!currentPropertyId) return;
        
        injectCSS();
        const stamp = createUI();
        
        const { auth } = await loadFirebase();
        initAuth(auth);
        initNotifications();
        
        // Event listeners
        document.getElementById('request-btn').onclick = currentUser ? requestBounty : () => alert('Sign in first');
        document.getElementById('scout-btn').onclick = currentUser ? submitScout : () => alert('Sign in first');
        
        // Auto‑position stamp
        const resizeObserver = new ResizeObserver(() => {
            stamp.style.right = '20px';
            stamp.style.bottom = '20px';
        });
        resizeObserver.observe(document.body);
    }

    // Cleanup
    window.addEventListener('pagehide', () => {
        if (ws) ws.close();
    });

    // Start when ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Global API exposure
    window.Renovision = {
        init,
        getPropertyId,
        currentUser: () => currentUser
    };

})();