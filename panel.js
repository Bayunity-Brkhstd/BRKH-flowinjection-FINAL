document.addEventListener('DOMContentLoaded', () => {
    // --- TABS LOGIC ---
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => {
                b.classList.remove('active');
                b.style.color = '#888';
                b.style.borderBottomColor = 'transparent';
            });
            btn.classList.add('active');
            btn.style.color = '#fff';
            btn.style.borderBottomColor = '#38bdf8';
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

    let queue = [];

    // --- INITIAL LOAD ---
    chrome.storage.local.get(['brkhQueue', 'lastStatus'], (data) => {
        if (data.brkhQueue) {
            queue = data.brkhQueue;
            renderQueue();
        }
    });

    // --- SYNC UI DENGAN BACKGROUND ---
    const wfStatus = document.getElementById('wf-status');
    const tokenCheck = document.getElementById('token-check');
    const statusText = document.getElementById('status-text');
    const statusDot = document.getElementById('status-dot');
    const connBtn = document.getElementById('conn-status');

    function updateIdentityUI(data) {
        if (data.apiHeaders && data.workflowId) {
            if (wfStatus) { wfStatus.innerText = "READY TO INJECT"; wfStatus.style.color = "#4ade80"; }
            if (tokenCheck) { tokenCheck.style.filter = "grayscale(0%) drop-shadow(0 0 5px #4ade80)"; }
            if (statusText) { statusText.innerText = "Connected"; statusText.style.color = "#4ade80"; }
            if (statusDot) { statusDot.style.background = "#4ade80"; statusDot.style.boxShadow = "0 0 8px #4ade80"; }
        } else {
            if (wfStatus) { wfStatus.innerText = "Waiting for Identity..."; wfStatus.style.color = "#f59e0b"; }
            if (tokenCheck) { tokenCheck.style.filter = "grayscale(100%)"; }
            if (statusText) { statusText.innerText = "Disconnected"; statusText.style.color = "#94a3b8"; }
            if (statusDot) { statusDot.style.background = "#ef4444"; statusDot.style.boxShadow = "0 0 8px #ef4444"; }
        }
    }

    if (connBtn) {
        connBtn.addEventListener('click', () => {
            window.open('https://labs.google/fx/flow', '_blank');
        });
    }

    chrome.storage.local.get(['brkhQueue', 'lastStatus', 'apiHeaders', 'workflowId'], (data) => {
        if (data.brkhQueue) {
            queue = data.brkhQueue;
            renderQueue();
        }
        updateIdentityUI(data);
    });

    chrome.storage.onChanged.addListener((changes) => {
        if (changes.brkhQueue) {
            queue = changes.brkhQueue.newValue;
            renderQueue();
        }
        if (changes.apiHeaders || changes.workflowId) {
            chrome.storage.local.get(['apiHeaders', 'workflowId'], (data) => updateIdentityUI(data));
        }
        if (changes.lastStatus) {
            console.log("BG Status:", changes.lastStatus.newValue);
        }
    });

    function renderQueue() {
        if (!queueList) return;
        let completed = queue.filter(t => t.status === 'DONE').length;
        if (qCount) qCount.innerText = `${completed}/${queue.length} completed`;
        if (mainProgress) mainProgress.style.width = queue.length === 0 ? '0%' : `${(completed / queue.length) * 100}%`;

        queueList.innerHTML = queue.map((t, idx) => {
            const statusClass = t.status === 'RUN' ? 'running' : t.status === 'DONE' ? 'done' : t.status === 'FAIL' ? 'fail' : '';
            return `
            <div class="task-item ${statusClass}" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 10px; margin-bottom: 8px; display: flex; align-items: center; gap: 10px;">
                <div style="flex-grow: 1; overflow: hidden;">
                    <div style="font-size: 11px; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: white;">${t.text}</div>
                    <div style="font-size: 9px; color: ${t.status === 'FAIL' ? '#fca5a5' : '#94a3b8'};">Task #${idx + 1} • ${t.status}</div>
                </div>
            </div>`;
        }).join('');
    }

    // --- COMMANDS ---
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            const lines = textInput.value.split('\n').filter(l => l.trim() !== "");
            const settings = {
                quality: document.getElementById('set-quality')?.value || '2k',
                expectedOutputs: document.getElementById('set-expected-output')?.value || '4'
            };

            if (lines.length === 0 && queue.length === 0) return alert("Prompt kosong!");

            // Tambah ke antrean & simpan settings
            lines.forEach(p => queue.push({ text: p, status: 'WAIT' }));
            chrome.storage.local.set({ brkhQueue: queue, brkhSettings: settings }, () => {
                chrome.runtime.sendMessage({ action: "START_QUEUE", prompts: queue });
                textInput.value = "";
                renderQueue();
                document.querySelector('.tab-btn[data-tab="tab-queue"]').click();
            });
        });
    }

    if (stopBtn) {
        stopBtn.addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: "STOP_QUEUE" });
            alert("Autopilot Berhenti");
        });
    }

    if (btnClear) {
        btnClear.addEventListener('click', () => {
            queue = [];
            chrome.storage.local.set({ brkhQueue: [] }, () => renderQueue());
        });
    }

    // --- STYLE PILLS LOGIC ---
    const stylePills = document.querySelectorAll('.style-pill');
    stylePills.forEach(pill => {
        pill.addEventListener('click', () => {
            const style = pill.getAttribute('data-style');
            pill.classList.toggle('active');

            if (pill.classList.contains('active')) {
                // Tambahkan style ke textarea
                if (textInput.value.length > 0 && !textInput.value.endsWith(' ')) textInput.value += ', ';
                textInput.value += style;
            } else {
                // Hapus style dari textarea (sederhana)
                textInput.value = textInput.value.replace(', ' + style, '').replace(style, '');
            }
        });
    });
});