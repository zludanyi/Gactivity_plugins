// ==UserScript==
// @name        Gactivity assistant
// @namespace   Violentmonkey Scripts
// @match       https://myactivity.google.com/product/assistant*
// @run-at      document-end
// @grant        GM_setValue
// @grant        GM_getValue
// @author       ZLudany
// @version      2.2.1
// @description  25/03/2025, 01:54:34 Monitors updates with iframe refresh, partial DOM injection.
// ==/UserScript==
window.addEventListener('load', function onload(){
    const main = new (function main() {
      this.hasTouch           = false;
      this.hasClick           = false;
      this.touchEvent         = "touchstart";
      this.clickEvent         = "click";
      this.evt;
      this.evtName;
      this.isTrusted          = false;
      this.clickAble          = [];
      this.lastLogTextContent = "";
      this.lastElement;
      this.checkTouchable     = function checkTouchable(){
        this.touchHandler = function(e){
          document.body.removeEventListener(
            this.touchEvent,this.touchHandler
          );
          if(e.isTrusted){
             this.isTrusted = true;
          }
          this.hasTouch = true;
          this.evtName  = this.touchEvent;
        }.bind(this);
        try{
          document.body.addEventListener(
             this.touchEvent,
             this.touchHandler
          );
          this.evt = document.createEvent("TouchEvent");
          this.evt.initEvent(this.touchEvent,true,true);
          document.body.dispatchEvent(this.evt);
        }
        catch(exception){
          alert(exception.message);
          this.touchHandler({});
        }
        return this;
      };
      this.checkClickable  = function checkClickable(){
        this.clickHandler = function(e){
          document.body.removeEventListener(
            this.clickEvent,this.clickHandler
          );
          if(e.isTrusted){
             this.isTrusted = true;
          }
          this.hasClick = true;
          this.evtName  = this.clickEvent;
        }.bind(this);
        try{
          document.body.addEventListener(
             this.clickEvent,
             this.clickHandler
          );
          this.evt = document.createEvent("HTMLEvents");
          this.evt.initEvent(this.clickEvent,true,true);
          document.body.dispatchEvent(this.evt);
        }
        catch(exception){
          alert(exception.message);
          this.clickHandler({});
        }
        return this;
      };
      this.getTrace        = function getTrace(logBefore){
        var callerFunc=logBefore?
            arguments.callee.caller.caller:
            arguments.callee.caller;
        if(!callerFunc){
           return null;
        }
        let s=[zu.getFunc(callerFunc)];
        try{
          while(callerFunc && callerFunc.hasOwnProperty("caller")) {
                callerFunc=callerFunc.caller;
                if(zu.getFunc(callerFunc)=="anonymous"){
                   continue;
                }
                s.push(zu.getFunc(callerFunc));
          }
       }
       catch(e){
          alert(e.message);
       }
       return s;
      };
      this.getFunc         = function getFunc(f){
        if(typeof f!="function"){
           return null;
        }
        let returnable="anonymous";
        try{
          returnable=f.toString().
            match(/(function)(\s+)(\w+)(\()/)?
            f.toString().match(/(function)(\s+)([\w_]+)(\()/)[3]
            :
            "anonymous";
        }
        catch(e){
          alert(e.message);
        }
        return returnable;
      };
      this.reRun           = function reRun(execs){
        execs.forEach(function(val,i){
           typeof this[val]=="function"?this[val]():null;
        });
        return this;
      };
      //Document reload upon change utility;
      this.monitorChanges  = function monitorChanges(refreshable){
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
      };
      this.highlightChanges  = function highlightChanges(){
        // Add necessary styles
        const style = document.createElement('style');
        style.textContent = `
          @keyframes highlightFade {
            from {
              opacity: 1;
              transform: scale(1.05);
            }
            to {
              opacity: 0;
              transform: scale(1);
            }
          }
        `;
        document.head.appendChild(style);
       // Create highlight overlay
       const overlay = document.createElement('div');
       overlay.className = 'change-highlight';
       overlay.style.cssText = `
         position: absolute;
         pointer-events: none;
         /* background: rgba(255, 255, 0, 0.3); */
         border: 2px solid rgba(255, 165, 0, 0.5);
         border-radius: 3px;
         animation: highlightFade ${this.config.highlightDuration}ms ease-out;
         z-index: 10000;
       `;
       document.body.appendChild(overlay);
       // Highlight changes
      };
      this.getEventType      = function getEventType(){
        return this.hasTouch?
                    "TouchEvent":
                    (this.hasClick?"HTMLEvents":false);
      };
      this.setEventables     = function setEventables(){
        let parseAble = ["button","div","span","li","a"];
        let els = parseAble.map((val) => {
          return Array.from(
            document.body.getElementsByTagName(val)
          );
        }).filter((val) => val.length?val:null).flat(Infinity);
        let filter  = "\^details\$";
        let filters = new RegExp(filter,"gi");
        els.forEach(function(val,i){
            if(
               filters.test(val.textContent) &&
               !/script/i.test(val.nodeName)
            )
            {
               this.clickAble.push(val.parentNode);
            }
        }.bind(this));
        return this;
      };
      this.buildEvent        = function buildEvent(){
        this.evt=document.createEvent(this.getEventType());
        this.evt.initEvent(this.evtName,true,true);
        return this;
      };
      this.bindEvents        = function bindEvents(all){
        this.clickAble.forEach(function(val,i){
             all?val.dispatchEvent(this.evt):()=>{};
             val.addEventListener(this.evtName,function(e){
               this.lastLog="";
             }.bind(this));
        }.bind(this));
        return this;
      };
      this.getChanges        = function getChanges(records){
        for(const record of records){
            let mutatedNode  = (
                                record.addedNodes &&
                                record.addedNodes[0] &&
                                record.addedNodes[0].parentNode
                               )
                               ?
                               record.addedNodes[0]
                               :
                               null;
            let lastActivity = mutatedNode && mutatedNode.
                getElementsByTagName("a")[0].parentNode.
                textContent;
            if(this.lastLogTextContent && mutatedNode)
            {
               mutatedNode.parentNode.removeChild(mutatedNode);
            }
            else if(mutatedNode && lastActivity &&
                    /Said\s(.*)/i.test(lastActivity)
            )
            {
               this.lastElement=mutatedNode.cloneNode(true);
               this.lastLogTextContent=lastActivity.
                    replace(/Said\s(.*)/i,
                    function(s,c){
                        return c;
                    }
               );
               alert("Last activity:\n"+this.lastLogTextContent);
            }
        }
      };
      this.changeLog       = function changeLog(fun){
        new MutationObserver(
            typeof fun=="function"?fun.bind(this):function(){}
            ).
            observe(document.body,{ childList: true });
        return this;
      };
      this.getLastLog      = function getLastLog(clickable){
        if(this.getEventType()){
           this.buildEvent();
        }
        else{
           return alert("no interface found..");
        }
        return this.bindEvents(clickable=="clickable"?
                               clickable:"");
      };
    })();
    let Gactivity =
           main.checkTouchable().
                checkClickable().
                setEventables().
                changeLog(function(records){
                    this.getChanges(records)
                }).
                // need to click to get the log as mutation
                getLastLog("clickable").
                // do check for new activity in the background
                // monitorChanges("checkForNewActivity");
                monitorChanges(false);
 });
 