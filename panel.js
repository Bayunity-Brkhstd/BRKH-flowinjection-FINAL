// panel.js - THE MODERN API CONTROLLER
document.addEventListener('DOMContentLoaded', () => {
    // --- TABS LOGIC ---
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const targetId = btn.getAttribute('data-tab');
            tabContents.forEach(content => {
                content.style.display = content.id === targetId ? 'block' : 'none';
            });
        });
    });

    // --- UI ELEMENTS ---
    const textInput = document.getElementById('text-input');
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const queueList = document.getElementById('queue-list');
    const qCount = document.getElementById('q-count');
    const btnClear = document.getElementById('btn-clear-queue');
    const mainProgress = document.getElementById('main-progress');
    const connBtn = document.getElementById('conn-status');
    const statusText = document.getElementById('status-text');
    const statusDot = document.getElementById('status-dot');
    const wfStatus = document.getElementById('wf-status');

    let queue = [];

    // --- SENSOR CHECKLIST ---
    function updateChecklist(data) {
        const cHeaders = document.getElementById('check-headers');
        const cWorkflow = document.getElementById('check-workflow');
        const cProject = document.getElementById('check-project');
        const cPayload = document.getElementById('check-payload');

        if (data.apiHeaders) cHeaders.classList.add('active'); else cHeaders.classList.remove('active');
        if (data.workflowId) cWorkflow.classList.add('active'); else cWorkflow.classList.remove('active');
        if (data.workspaceId) cProject.classList.add('active'); else cProject.classList.remove('active');
        if (data.apiPayloadRaw) cPayload.classList.add('active'); else cPayload.classList.remove('active');
    }

    // --- SYNC STATUS ---
    function updateIdentityUI(data) {
        updateChecklist(data);
        const isConnected = data.apiHeaders && data.workflowId && data.workspaceId && data.apiPayloadRaw;
        
        if (isConnected) {
            if (statusText) { statusText.innerText = "Connected"; statusText.style.color = "#4ade80"; }
            if (statusDot) { statusDot.style.background = "#4ade80"; statusDot.style.boxShadow = "0 0 8px #4ade80"; }
            if (wfStatus) { wfStatus.innerText = "READY TO INJECT"; wfStatus.style.color = "#4ade80"; }
        } else {
            if (statusText) { statusText.innerText = "Incomplete"; statusText.style.color = "#f59e0b"; }
            if (statusDot) { statusDot.style.background = "#f59e0b"; statusDot.style.boxShadow = "0 0 8px #f59e0b"; }
            if (wfStatus) { wfStatus.innerText = "Waiting for Identity..."; wfStatus.style.color = "#f59e0b"; }
        }
    }

    if (connBtn) {
        connBtn.addEventListener('click', () => {
            chrome.tabs.create({ url: 'https://labs.google/fx/tools/flow' });
        });
    }

    // Load initial data
    chrome.storage.local.get(['brkhQueue', 'apiHeaders', 'workflowId', 'workspaceId', 'apiPayloadRaw'], (data) => {
        if (data.brkhQueue) {
            queue = data.brkhQueue;
            renderQueue();
        }
        updateIdentityUI(data);
    });

    // Listen for changes
    chrome.storage.onChanged.addListener((changes) => {
        if (changes.brkhQueue) {
            queue = changes.brkhQueue.newValue;
            renderQueue();
        }
        chrome.storage.local.get(['apiHeaders', 'workflowId', 'workspaceId', 'apiPayloadRaw'], (data) => updateIdentityUI(data));
    });

    function renderQueue() {
        if (!queueList) return;
        let completed = queue.filter(t => t.status === 'DONE').length;
        if (qCount) qCount.innerText = `${completed}/${queue.length} completed`;
        if (mainProgress) mainProgress.style.width = queue.length === 0 ? '0%' : `${(completed / queue.length) * 100}%`;

        queueList.innerHTML = queue.map((t, idx) => {
            const statusClass = t.status === 'RUN' ? 'running' : t.status === 'DONE' ? 'done' : t.status === 'FAIL' ? 'fail' : '';
            const statusMsg = t.errorMsg || (t.status === 'WAIT' ? 'Antrean' : t.status);
            return `
            <div class="task-item ${statusClass}" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 10px; margin-bottom: 8px;">
                <div style="font-size: 11px; font-weight: bold; color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${t.text}</div>
                <div style="font-size: 9px; color: ${t.status === 'FAIL' ? '#fca5a5' : '#94a3b8'}; margin-top: 4px;">Task #${idx + 1} • ${statusMsg}</div>
            </div>`;
        }).join('');
    }

    // --- COMMANDS ---
    startBtn.addEventListener('click', () => {
        const lines = textInput.value.split('\n').filter(l => l.trim() !== "");
        if (lines.length === 0 && queue.length === 0) return alert("Prompt kosong!");

        const newItems = lines.map(p => ({ text: p, status: 'WAIT' }));
        queue = [...queue, ...newItems];
        
        chrome.storage.local.set({ brkhQueue: queue }, () => {
            chrome.runtime.sendMessage({ action: "START_QUEUE", prompts: queue });
            textInput.value = "";
            renderQueue();
            document.querySelector('.tab-btn[data-tab="tab-queue"]').click();
        });
    });

    stopBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: "STOP_QUEUE" });
    });

    if (btnClear) {
        btnClear.addEventListener('click', () => {
            queue = [];
            chrome.storage.local.set({ brkhQueue: [] }, () => renderQueue());
        });
    }

    const resetBtn = document.getElementById('btn-reset-project');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            resetBtn.innerText = "RESETTING...";
            resetBtn.disabled = true;
            chrome.runtime.sendMessage({ action: "FORCE_RESET" }, (res) => {
                setTimeout(() => {
                    resetBtn.innerText = "🔄 FORCE PROJECT RESET (DE)";
                    resetBtn.disabled = false;
                }, 3000);
            });
        });
    }
});