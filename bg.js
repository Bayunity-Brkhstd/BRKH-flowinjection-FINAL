// bg.js - THE CORE ENGINE
let isRunning = false;
let retryCount = 0;
let workerActive = false;

// --- HEARTBEAT ---
function startHeartbeat() {
    setInterval(() => {
        chrome.storage.local.get(['isRunning'], (data) => {
            if (data.isRunning) console.log("💓 Bot Heartbeat: Active");
        });
    }, 120000);
}

// --- KONFIGURASI SIDE PANEL ---
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel
        .setPanelBehavior({ openPanelOnActionClick: true })
        .catch((error) => console.error(error));
}

// Fallback: Buka side panel saat icon diklik (jika behavior di atas gagal)
chrome.action.onClicked.addListener((tab) => {
    if (chrome.sidePanel && chrome.sidePanel.open) {
        chrome.sidePanel.open({ windowId: tab.windowId });
    }
});

// --- KOMANDO PUSAT ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "IDENTITY_CAPTURED") {
        let workspaceId = null;
        let projectMatch = request.url.match(/projects\/([^\/:\?]+)/);
        if (projectMatch && !projectMatch[1].includes("aisandbox-pa")) {
            workspaceId = projectMatch[1];
        } else if (request.pageUrl) {
            let tabMatch = request.pageUrl.match(/\/id\/([a-zA-Z0-0\-_]{10,})/) || request.pageUrl.match(/\/project\/([^\/\?]+)/);
            if (tabMatch) workspaceId = tabMatch[1];
        }

        let updateData = { apiHeaders: request.headers || {} };
        if (workspaceId) updateData.workspaceId = workspaceId;

        chrome.storage.local.set(updateData, () => checkAndResume());
    }

    if (request.action === "WORKFLOW_CAPTURED") {
        chrome.storage.local.set({
            workspaceId: request.workspaceId,
            workflowId: request.workflowId
        }, () => checkAndResume());
    }

    if (request.action === "START_QUEUE") {
        isRunning = true;
        chrome.storage.local.set({ isRunning: true, currentIndex: 0 }, () => startWorker(1));
    }

    if (request.action === "STOP_QUEUE") {
        isRunning = false;
        chrome.storage.local.set({ isRunning: false });
    }

    if (request.action === "FORCE_RESET") {
        executeProjectReset();
        sendResponse({ success: true });
    }
});

async function checkAndResume() {
    const data = await chrome.storage.local.get(['isRunning', 'brkhQueue']);
    if (data.isRunning && data.brkhQueue && data.brkhQueue.length > 0) {
        startWorker(1);
    }
}

async function startWorker(workerId) {
    if (workerActive) return;
    workerActive = true;

    try {
        while (true) {
            const data = await chrome.storage.local.get(['isRunning', 'brkhQueue', 'currentIndex', 'apiHeaders', 'workspaceId', 'workflowId', 'apiPayloadRaw']);
            if (!data.isRunning) break;

            const queue = data.brkhQueue || [];
            const taskIdx = data.currentIndex || 0;
            if (taskIdx >= queue.length) {
                chrome.storage.local.set({ isRunning: false });
                break;
            }

            if (queue[taskIdx].status === 'DONE' || queue[taskIdx].status === 'FAIL') {
                await chrome.storage.local.set({ currentIndex: taskIdx + 1 });
                continue;
            }

            try {
                updateTaskStatus(taskIdx, 'RUN');
                const result = await processTask(queue[taskIdx].text, data);

                if (result.success) {
                    updateTaskStatus(taskIdx, 'DONE');
                    retryCount = 0;
                    await chrome.storage.local.set({ currentIndex: taskIdx + 1 });
                    await new Promise(r => setTimeout(r, 10000));
                } else { throw new Error(result.error); }
            } catch (err) {
                console.error(`Worker ${workerId} Error:`, err.message);

                if (err.message.includes("429")) {
                    const waitTime = 3000 * Math.pow(2, retryCount);
                    updateTaskStatus(taskIdx, 'WAIT', `Rate Limited: Waiting ${waitTime / 1000}s...`);
                    await new Promise(r => setTimeout(r, waitTime));
                    retryCount++;
                    continue;
                }

                if (err.message.includes("AUTH_MISSING") || err.message.includes("expired") || err.message.includes("401")) {
                    await executeRecoveryManager(taskIdx);
                    return;
                } else {
                    updateTaskStatus(taskIdx, 'FAIL', err.message);
                    await chrome.storage.local.set({ currentIndex: taskIdx + 1 });
                }
            }
        }
    } finally {
        workerActive = false;
    }
}

// --- FUNGSI UE: RECOVERY MANAGER ---
async function executeRecoveryManager(taskIdx) {
    retryCount++;
    if (retryCount <= 2) {
        updateTaskStatus(taskIdx, 'WAIT', `Auto-Reload (Ne): Attempt ${retryCount}...`);
        await executeAutoReload();
    } else {
        updateTaskStatus(taskIdx, 'WAIT', `Project Reset (De): Cleaning Session...`);
        await executeProjectReset();
        retryCount = 0; // Reset after drastic measure
    }
}

// --- FUNGSI NE: AUTO RELOAD ---
async function executeAutoReload() {
    const tabs = await chrome.tabs.query({ url: "*://labs.google/fx/tools/flow*" });
    if (tabs.length > 0) {
        const url = new URL(tabs[0].url);
        url.searchParams.set('t', Date.now());
        await chrome.tabs.update(tabs[0].id, { url: url.toString() });
    }
}

// --- FUNGSI DE: PROJECT RESET ---
async function executeProjectReset() {
    try {
        const tabs = await chrome.tabs.query({ url: "*://labs.google/fx/tools/flow*" });
        if (tabs.length === 0) {
            console.error("Project Reset: No Google Flow tab found");
            return;
        }

        const targetTab = tabs[0];

        // 1. Eksekusi Script di Tab Flow (Fungsi De)
        const resetResult = await chrome.scripting.executeScript({
            target: { tabId: targetTab.id },
            func: async () => {
                try {
                    const response = await fetch("/fx/api/trpc/project.createProject", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({
                            json: {
                                projectTitle: "TurboFlow Reset " + new Date().toLocaleString(),
                                toolName: "PINHOLE"
                            }
                        })
                    });
                    const data = await response.json();
                    const projectId = data[0]?.result?.data?.json?.id || data?.result?.data?.json?.id;
                    return { success: !!projectId, projectId };
                } catch (e) {
                    return { success: false, error: e.message };
                }
            }
        });

        const result = resetResult[0].result;
        if (result && result.success && result.projectId) {
            console.log("Project Reset: Success, Project ID:", result.projectId);

            // 3. Auto-Redirect
            const newUrl = `https://labs.google/fx/tools/flow/project/${result.projectId}`;
            await chrome.tabs.update(targetTab.id, { url: newUrl, active: true });

            // 4. Re-Validation (Fungsi Ge atau Ke)
            // Menunggu halaman dimuat dan memicu deteksi identitas ulang
            console.log("Project Reset: Waiting for re-validation...");
        } else {
            throw new Error(result?.error || "Failed to get Project ID");
        }
    } catch (err) {
        console.error("Project Reset Error:", err.message);
    }
}


async function processTask(prompt, data) {
    if (!data.workspaceId) throw new Error("AUTH_MISSING: Project ID missing");
    if (!data.workflowId) throw new Error("AUTH_MISSING: Workflow ID missing");
    if (!data.apiPayloadRaw) throw new Error("AUTH_MISSING: Payload Template missing (Click Generate manual 1x)");

    // CAPTURE ALL GOOGLE COOKIES
    const c1 = await chrome.cookies.getAll({ domain: "google.com" });
    const c2 = await chrome.cookies.getAll({ domain: "labs.google" });
    const cookieStr = [...c1, ...c2].map(c => `${c.name}=${c.value}`).join('; ');

    const commonHeaders = Object.assign({
        'Content-Type': 'application/json',
        'Origin': 'https://labs.google',
        'Referer': 'https://labs.google/',
        'Cookie': cookieStr
    }, data.apiHeaders);

    // 1. PATCH WORKFLOW
    await fetch(`https://aisandbox-pa.googleapis.com/v1/projects/${data.workspaceId}/locations/us/flowworkflows/${data.workflowId}`, {
        method: 'PATCH',
        headers: commonHeaders,
        body: JSON.stringify({ updateMask: "canvasState", canvasState: { prompt: prompt } })
    }).catch(() => { });

    // 2. GENERATE IMAGES
    const url = `https://aisandbox-pa.googleapis.com/v1/projects/${data.workspaceId}/flowworkflows/${data.workflowId}:batchGenerateImages?alt=json`;
    const payload = JSON.parse(data.apiPayloadRaw);

    function inject(obj) {
        if (typeof obj !== 'object' || obj === null) return;
        for (let k in obj) {
            if (typeof obj[k] === 'string' && (obj[k].length > 5 || obj[k] === "")) {
                obj[k] = prompt;
            } else inject(obj[k]);
        }
    }
    inject(payload);

    const res = await fetch(url, { method: 'POST', headers: commonHeaders, body: JSON.stringify(payload) });
    if (res.status === 429) throw new Error("Rate Limited (429)");
    if (res.status === 401 || res.status === 403) throw new Error("AUTH_MISSING: Session expired/Unauthorized");

    const text = await res.text();
    const json = safeParse(text);
    const mediaId = findMediaId(json);
    if (!mediaId) throw new Error("Gagal mendapatkan Media ID");

    // MEMORY MANAGEMENT: Revoke if blob used (placeholder for future blob handling)
    // URL.revokeObjectURL(lastBlobUrl); 

    return { success: true };
}

// --- UTILITY: SMART NAMING & CLEANING ---
function cleanFileName(name) {
    return name.replace(/[\\/:*?"<>|]/g, "_").substring(0, 50);
}

function updateTaskStatus(idx, status, msg = "") {
    chrome.storage.local.get(['brkhQueue'], (data) => {
        let q = data.brkhQueue || [];
        if (q[idx]) {
            q[idx].status = status;
            if (msg) q[idx].errorMsg = msg;
            chrome.storage.local.set({ brkhQueue: q });
        }
    });
}

function safeParse(text) {
    let clean = text;
    if (text.startsWith(")]}'")) clean = text.substring(text.indexOf('\n') + 1);
    try { return JSON.parse(clean); } catch (e) { return {}; }
}

function findMediaId(obj) {
    let id = null;
    function search(o) {
        if (id || typeof o !== 'object' || o === null) return;
        if (o.mediaId) { id = o.mediaId; return; }
        for (let k in o) search(o[k]);
    }
    search(obj);
    return id;
}