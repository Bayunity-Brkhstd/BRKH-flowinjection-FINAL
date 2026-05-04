// spy.js - THE SILENT INTERCEPTOR
(function () {
    console.log("BRKH Spy Active...");

    // 1. INTERCEPT XHR/FETCH (Jalur Utama Data)
    const script = document.createElement('script');
    script.textContent = `
        (function() {
            const originalXHR = window.XMLHttpRequest.prototype.open;
            window.XMLHttpRequest.prototype.open = function(method, url) {
                this.addEventListener('load', function() {
                    if (url.includes('googleapis.com')) {
                        window.postMessage({ type: 'BRKH_SPY_DATA', url: url, headers: {} }, '*');
                    }
                });
                return originalXHR.apply(this, arguments);
            };

            const originalFetch = window.fetch;
            window.fetch = async function(...args) {
                const res = await originalFetch(...args);
                const url = args[0] instanceof Request ? args[0].url : args[0];
                if (url.includes('googleapis.com')) {
                    window.postMessage({ type: 'BRKH_SPY_DATA', url: url, headers: {} }, '*');
                }
                return res;
            };

            // FUNGSI CE: CANVAS FINGERPRINTING SPOOFER (Robust Version)
            (function ce() {
                try {
                    if (window.WebGLRenderingContext) {
                        const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
                        WebGLRenderingContext.prototype.getParameter = function(parameter) {
                            if (parameter === 37446) return 'ANKA Engine (NVIDIA GeForce RTX 4090)';
                            if (parameter === 37445) return 'Google Inc. (NVIDIA Corporation)';
                            return originalGetParameter.apply(this, arguments);
                        };
                    }
                    
                    if (navigator.deviceMemory) {
                        Object.defineProperty(navigator, 'deviceMemory', { get: () => 32, configurable: true });
                    }
                    if (navigator.hardwareConcurrency) {
                        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 16, configurable: true });
                    }
                    console.log("🛡️ BRKH Fingerprint Active: Stealth Mode");
                } catch (e) {
                    console.warn("🛡️ BRKH Fingerprint: Failed to initialize", e);
                }
            })();
        })();
    `;
    (document.head || document.documentElement).appendChild(script);
    script.remove();

    // 2. LISTEN & FORWARD (Jalur ke Background)
    window.addEventListener("message", (event) => {
        if (event.data.type === 'BRKH_SPY_DATA') {
            try {
                if (chrome.runtime && chrome.runtime.id) {
                    chrome.runtime.sendMessage({
                        action: "IDENTITY_CAPTURED",
                        url: event.data.url,
                        headers: event.data.headers,
                        pageUrl: window.location.href
                    });
                }
            } catch (e) { }
        }
    });

    // 3. TRACK WORKFLOW ID DARI URL (Real-time)
    let lastUrl = location.href;
    setInterval(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            const wfMatch = lastUrl.match(/\/flow\/project\/([^\/\?]+)\/edit\/([^\/\?]+)/);
            if (wfMatch) {
                try {
                    if (chrome.runtime && chrome.runtime.id) {
                        chrome.runtime.sendMessage({
                            action: "WORKFLOW_CAPTURED",
                            workspaceId: wfMatch[1],
                            workflowId: wfMatch[2]
                        });
                    }
                } catch (e) { }
            }
        }
    }, 2000);
})();
