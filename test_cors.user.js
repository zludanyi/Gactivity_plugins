// ==UserScript==
// @name         test CORS
// @version      0.1
// @description  testing CORS 
// @author       ZLudany
// @match        *://*.ingatlan.com/*
// @run-at       document-start
// ==/UserScript==
(function() {
      // Override iframe restrictions 
      // by injecting into parent context
      const _open = window.open;
      window.open = function(url) {
        const iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.style = 'width:100%; height:100%; border:none';
        document.body.innerHTML = '';
        document.body.appendChild(iframe);
        // Tampermonkey-like injection
        const observer = new MutationObserver(() => {
          const frames = document.
          getElementsByTagName('iframe');
          for (const frame of frames) {
            try {
              const script = frame.contentDocument.createElement('script');
              script.textContent = `
              window.addEventListener(
                  'DOMContentLoaded', function() {
                  // Call native trained LLM validator
                  /* 
                  window.postMessage({type: 
                                      'analyze', 
                                       html: document.
                                       body.innerHTML
                  }, '*');
                  */
                  alert("success..");
              });
              `;
              frame.contentDocument.head.
                    appendChild(script);
            } catch (e) {
                alert("failed: "+e.message);
            }
          }
        });
        observer.observe(document.body, { 
            childList:true, 
            subtree: true 
        });
        return iframe;
      };
      window.open("instantstreetview.com");
    })();
