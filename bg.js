// bg.js - TURBOFLOW BLUEPRINT OPTIMIZED ENGINE
const MAX_CONCURRENT_WORKERS = 2;

// --- SNIFFER LOGIC ---
chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
        if (details.method === "POST" && details.requestBody && details.requestBody.raw) {
            try {
                const decoder = new TextDecoder("utf-8");
                const rawData = details.requestBody.raw[0].bytes;
                const jsonString = decoder.decode(rawData);
                if (details.url.includes("flowMedia:batchGenerateImages")) {
                    chrome.storage.local.set({ apiPayloadRaw: jsonString });
                }
            } catch (e) { }
        }
    },
    { urls: ["*://aisandbox-pa.googleapis.com/*"] },
    ["requestBody"]
);

// --- KOMANDO PUSAT ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "IDENTITY_CAPTURED") {
        console.log("Identity Captured from Spy.js");

        let workspaceId = null;
        let projectMatch = request.url.match(/projects\/([^\/]+)/);
        if (projectMatch) {
            workspaceId = projectMatch[1];
        } else if (request.pageUrl) {
            // Fallback: Cari di URL Tab (e.g. .../flow/id/XYZ)
            let tabMatch = request.pageUrl.match(/\/flow\/id\/([^\/\?]+)/) || request.pageUrl.match(/\/projects\/([^\/\?]+)/);
            if (tabMatch) workspaceId = tabMatch[1];
        }

        let updateData = { apiHeaders: request.headers };
        if (workspaceId) {
            updateData.workspaceId = workspaceId;
            console.log("Workspace ID Captured:", workspaceId);
        }

        chrome.storage.local.set(updateData, () => {
            startHeartbeat();
            checkAndResume();
        });
    }

    if (request.action === "WORKFLOW_CAPTURED") {
        chrome.storage.local.set({ workflowId: request.workflowId, workspaceId: request.workspaceId });
        checkAndResume();
    }

    if (request.action === "START_QUEUE") {
        chrome.storage.local.set({ brkhQueue: request.prompts, isRunning: true, currentIndex: 0 }, () => {
            for (let i = 0; i < MAX_CONCURRENT_WORKERS; i++) startWorker(i);
        });
        sendResponse({ success: true });
    }

    if (request.action === "STOP_QUEUE") {
        chrome.storage.local.set({ isRunning: false });
        sendResponse({ success: true });
    }
    return true;
});

async function checkAndResume() {
    const data = await chrome.storage.local.get(['isRunning', 'brkhQueue', 'currentIndex', 'apiHeaders', 'workflowId']);
    if (data.isRunning && data.brkhQueue && data.currentIndex < data.brkhQueue.length && data.apiHeaders && data.workflowId) {
        for (let i = 0; i < MAX_CONCURRENT_WORKERS; i++) startWorker(i);
    }
}

async function startWorker(workerId) {
    let retryCount = 0;
    while (true) {
        const data = await chrome.storage.local.get(['isRunning', 'brkhQueue', 'currentIndex', 'apiHeaders', 'workspaceId', 'workflowId', 'apiPayloadRaw', 'brkhSettings']);
        if (!data.isRunning || !data.brkhQueue || data.currentIndex >= data.brkhQueue.length) break;

        const taskIdx = data.currentIndex;
        const task = data.brkhQueue[taskIdx];
        await chrome.storage.local.set({ currentIndex: taskIdx + 1 });

        if (!task || task.status === 'DONE') continue;

        try {
            updateTaskStatus(taskIdx, 'RUN');
            const result = await processTask(task.text, data);
            if (result.success) {
                updateTaskStatus(taskIdx, 'DONE');
                retryCount = 0; // Reset retry on success
                const delay = Math.floor(Math.random() * (15000 - 10000 + 1) + 10000);
                await new Promise(r => setTimeout(r, delay));
            } else { throw new Error(result.error); }
        } catch (err) {
            console.error(`Worker ${workerId} Error:`, err.message);
            if (err.message.includes("429") || err.message.includes("Too Many Requests")) {
                retryCount++;
                const backoff = Math.min(retryCount * 30000, 300000); // Max 5 mins
                const current = await chrome.storage.local.get(['currentIndex']);
                await chrome.storage.local.set({ currentIndex: Math.max(0, current.currentIndex - 1) });
                updateTaskStatus(taskIdx, 'WAIT', `Rate limited. Retrying in ${backoff / 1000}s...`);
                await new Promise(r => setTimeout(r, backoff));
            } else if (err.message.includes("AUTH_MISSING")) {
                const current = await chrome.storage.local.get(['currentIndex']);
                await chrome.storage.local.set({ currentIndex: Math.max(0, current.currentIndex - 1) });
                updateTaskStatus(taskIdx, 'WAIT', "Waiting for session (Refresh Flow Tab)");
                return;
            } else {
                updateTaskStatus(taskIdx, 'FAIL', err.message);
            }
        }
    }
}

async function processTask(prompt, data) {
    if (!data.apiHeaders) throw new Error("AUTH_MISSING: Headers empty");
    if (!data.workspaceId) throw new Error("AUTH_MISSING: Workspace ID empty");

    const commonHeaders = Object.assign({
        'Content-Type': 'application/json',
        'Origin': 'https://labs.google',
        'Referer': 'https://labs.google/'
    }, data.apiHeaders);

    // BLUEPRINT STEP: PATCH Workflow (Simulate User Typing)
    if (data.workflowId) {
        await fetch(`https://aisandbox-pa.googleapis.com/v1/projects/${data.workspaceId}/locations/us/flowworkflows/${data.workflowId}`, {
            method: 'PATCH',
            headers: commonHeaders,
            body: JSON.stringify({ updateMask: "canvasState", canvasState: { prompt: prompt } })
        }).catch(() => { });
    }

    // BLUEPRINT STEP: Inject Prompt into Payload
    const payload = JSON.parse(data.apiPayloadRaw || "{}");
    function inject(obj) {
        for (let k in obj) {
            if (typeof obj[k] === 'string' && obj[k].length > 10) { obj[k] = prompt; return true; }
            if (typeof obj[k] === 'object' && obj[k] !== null) if (inject(obj[k])) return true;
        }
    }
    inject(payload);

    const res = await fetch(`https://aisandbox-pa.googleapis.com/v1/projects/${data.workspaceId}/locations/us/flowMedia:batchGenerateImages`, {
        method: 'POST',
        headers: commonHeaders,
        body: JSON.stringify(payload)
    });

    if (res.status === 429) throw new Error("429: Too Many Requests");
    if (res.status === 401 || res.status === 403) throw new Error("AUTH_MISSING: Session expired");

    const text = await res.text();
    // BLUEPRINT STEP: Strip Prefix )]}'
    const json = safeParse(text);
    const mediaId = findMediaId(json);
    if (!mediaId) return { success: false, error: "Failed to get Media ID from Google" };

    // BLUEPRINT STEP: Redirect Polling
    return await pollForImageUrl(mediaId, commonHeaders, data.brkhSettings);
}

async function pollForImageUrl(mediaId, headers, settings) {
    for (let i = 0; i < 25; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const res = await fetch(`https://labs.google/fx/api/trpc/media.getMediaUrlRedirect?name=${mediaId}`, {
            headers: headers,
            redirect: 'follow'
        });
        if (res.ok && res.url.includes('googleusercontent.com')) {
            const sizeSuffix = (settings?.quality === '4k') ? '=s4096' : '=s2048';
            const finalUrl = res.url.split('=')[0] + sizeSuffix;
            await chrome.downloads.download({ url: finalUrl, filename: `BRKH_${Date.now()}.png` });
            return { success: true };
        }
    }
    return { success: false, error: "Image Resolution Timeout (Polling failed)" };
}

function safeParse(text) {
    let clean = text;
    if (text.startsWith(")]}'")) clean = text.substring(text.indexOf('\n') + 1);
    try { return JSON.parse(clean); } catch (e) { return {}; }
}

function findMediaId(obj) {
    let found = null;
    function walk(o) {
        for (let k in o) {
            if (typeof o[k] === 'string' && o[k].includes('/media/')) { found = o[k]; return; }
            if (typeof o[k] === 'object' && o[k] !== null) walk(o[k]);
        }
    }
    walk(obj);
    return found;
}

function updateTaskStatus(idx, status, error = "") {
    chrome.storage.local.get(['brkhQueue'], (res) => {
        let q = res.brkhQueue || [];
        if (q[idx]) {
            q[idx].status = status;
            q[idx].errorMsg = error;
            chrome.storage.local.set({ brkhQueue: q });
        }
    });
}

function startHeartbeat() {
    setInterval(async () => {
        const data = await chrome.storage.local.get(['apiHeaders', 'workspaceId']);
        if (!data.apiHeaders || !data.workspaceId) return;
        fetch(`https://aisandbox-pa.googleapis.com/v1/projects/${data.workspaceId}/locations/us/flow:batchLogFrontendEvents`, {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json', 'Origin': 'https://labs.google', 'Referer': 'https://labs.google/' }, data.apiHeaders),
            body: JSON.stringify({ events: [{ eventTime: new Date().toISOString(), eventType: "HEARTBEAT" }] })
        }).catch(() => { });
    }, 120000);
}

checkAndResume();