// spy.js - THE TOTAL INTERCEPTOR
console.log("🕵️‍♂️ TurboFlow Total Interceptor Active!");

function serializeHeaders(headers) {
    if (!headers) return {};
    if (headers instanceof Headers) {
        const obj = {};
        headers.forEach((v, k) => obj[k] = v);
        return obj;
    }
    return headers;
}

// 1. BAJAK FETCH
const originalFetch = window.fetch;
window.fetch = async (...args) => {
    const url = args[0];
    const options = args[1] || {};
    if (typeof url === 'string' && url.includes('aisandbox-pa.googleapis.com')) {
        const cleanHeaders = serializeHeaders(options.headers);
        if (cleanHeaders['Authorization'] || cleanHeaders['authorization']) {
            chrome.runtime.sendMessage({ action: "IDENTITY_CAPTURED", headers: cleanHeaders, url: url, pageUrl: location.href });
        }
    }
    return originalFetch(...args);
};

// 2. BAJAK XMLHTTPREQUEST (XHR)
const originalOpen = XMLHttpRequest.prototype.open;
const originalSetHeader = XMLHttpRequest.prototype.setRequestHeader;

XMLHttpRequest.prototype.open = function(method, url) {
    this._url = url;
    this._headers = {};
    return originalOpen.apply(this, arguments);
};

XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
    this._headers[header] = value;
    return originalSetHeader.apply(this, arguments);
};

const originalSend = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.send = function() {
    if (this._url && this._url.includes('aisandbox-pa.googleapis.com')) {
        if (this._headers['Authorization'] || this._headers['authorization']) {
            chrome.runtime.sendMessage({ action: "IDENTITY_CAPTURED", headers: this._headers, url: this._url, pageUrl: location.href });
        }
    }
    return originalSend.apply(this, arguments);
};

// 3. TRACK WORKFLOW ID
let lastUrl = location.href;
setInterval(() => {
    if (location.href !== lastUrl) {
        lastUrl = location.href;
        const workflowMatch = lastUrl.match(/flow\/project\/([^\/\?]+)/);
        if (workflowMatch) {
            chrome.runtime.sendMessage({ action: "WORKFLOW_CAPTURED", workflowId: workflowMatch[1], workspaceId: workflowMatch[1] });
        }
    }
}, 2000);
