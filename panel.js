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

    // --- SYNC STATUS ---
    function updateIdentityUI(data) {
        const isConnected = data.apiHeaders && data.workflowId;
        if (isConnected) {
            if (statusText) { statusText.innerText = "Connected"; statusText.style.color = "#4ade80"; }
            if (statusDot) { statusDot.style.background = "#4ade80"; statusDot.style.boxShadow = "0 0 8px #4ade80"; }
            if (wfStatus) { wfStatus.innerText = "Status: READY TO INJECT"; wfStatus.style.color = "#4ade80"; }
        } else {
            if (statusText) { statusText.innerText = "Disconnected"; statusText.style.color = "#94a3b8"; }
            if (statusDot) { statusDot.style.background = "#ef4444"; statusDot.style.boxShadow = "0 0 8px #ef4444"; }
            if (wfStatus) { wfStatus.innerText = "Status: Waiting for Identity..."; wfStatus.style.color = "#f59e0b"; }
        }
    }

    if (connBtn) {
        connBtn.addEventListener('click', () => {
            chrome.tabs.create({ url: 'https://labs.google/fx/tools/flow' });
        });
    }

    // Load initial data
    chrome.storage.local.get(['brkhQueue', 'apiHeaders', 'workflowId'], (data) => {
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
        if (changes.apiHeaders || changes.workflowId) {
            chrome.storage.local.get(['apiHeaders', 'workflowId'], (data) => updateIdentityUI(data));
        }
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
});