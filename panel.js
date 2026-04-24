document.addEventListener('DOMContentLoaded', () => {
    // --- UI ELEMENTS ---
    const btnOpenFlow = document.getElementById('btn-open-flow');
    const dropZone = document.getElementById('drop-zone');
    const dropText = document.getElementById('drop-text');
    const fileInput = document.getElementById('file-input');
    const textInput = document.getElementById('text-input');
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const queueList = document.getElementById('queue-list');
    const qCount = document.getElementById('q-count');
    const btnClear = document.getElementById('btn-clear-queue');

    const stylePills = document.querySelectorAll('.style-pill');
    stylePills.forEach(p => p.addEventListener('click', () => p.classList.toggle('active')));

    let queue = [];
    let isRunning = false;
    let filePrompts = [];

    if (btnOpenFlow) btnOpenFlow.addEventListener('click', () => chrome.tabs.create({ url: "https://labs.google/fx/id/tools/flow/" }));

    if (dropZone && fileInput) {
        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                filePrompts = ev.target.result.split('\n').filter(l => l.trim() !== "");
                dropText.innerText = `${filePrompts.length} Prompts Loaded`;
            };
            reader.readAsText(file);
        });
    }

    if (btnClear) {
        btnClear.addEventListener('click', () => {
            if (!isRunning) { queue = []; renderQueue(); }
            else alert("Robot lagi jalan bro!");
        });
    }

    function renderQueue() {
        if (!queueList) return;
        let completed = queue.filter(t => t.status === 'DONE').length;
        if (qCount) qCount.innerText = `${completed}/${queue.length} completed`;
        const progressFill = document.getElementById('main-progress');
        if (progressFill) progressFill.style.width = queue.length === 0 ? '0%' : `${(completed / queue.length) * 100}%`;

        queueList.innerHTML = queue.map((t, idx) => {
            let iconSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">';
            if (t.status === 'RUN') iconSvg += '<path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"></path>';
            else if (t.status === 'DONE') iconSvg += '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>';
            else if (t.status === 'FAIL') iconSvg += '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>';
            else iconSvg += '<circle cx="12" cy="12" r="10"></circle>';
            iconSvg += '</svg>';

            const statusClass = t.status === 'RUN' ? 'running' : t.status === 'DONE' ? 'done' : t.status === 'FAIL' ? 'fail' : '';
            const statusText = t.status === 'RUN' ? 'Sedang Diproses' : t.status === 'DONE' ? 'Selesai' : t.status === 'FAIL' ? 'Gagal' : 'Dalam Antrean';

            return `
            <div class="task-item ${statusClass}">
                <div class="task-status-icon">${iconSvg}</div>
                <div class="task-content">
                    <div class="task-text">${t.text}</div>
                    <div class="task-sub">Task #${idx + 1} • ${statusText}</div>
                </div>
            </div>`;
        }).join('');
    }

    if (startBtn) {
        startBtn.addEventListener('click', () => {
            const manual = textInput ? textInput.value.split('\n').filter(l => l.trim() !== "") : [];
            const combined = [...filePrompts, ...manual];
            if (combined.length === 0 && queue.length === 0) return alert("Prompt kosong!");
            combined.forEach(p => queue.push({ text: p, status: 'WAIT' }));
            if (textInput) textInput.value = "";
            filePrompts = [];
            isRunning = true; renderQueue(); processQueue();
        });
    }

    if (stopBtn) stopBtn.addEventListener('click', () => { isRunning = false; alert("Autopilot Berhenti"); });

    async function processQueue() {
        for (let i = 0; i < queue.length; i++) {
            if (!isRunning) break;
            if (queue[i].status !== 'WAIT') continue;
            queue[i].status = 'RUN'; renderQueue();

            const activeStyles = Array.from(document.querySelectorAll('.style-pill.active')).map(p => p.dataset.style);
            const manualStyle = document.getElementById('manual-style-input')?.value.trim();
            let modifier = activeStyles.join(', ');
            if (manualStyle) modifier = modifier ? `${modifier}, ${manualStyle}` : manualStyle;
            let finalPrompt = modifier ? `${queue[i].text}, ${modifier}` : queue[i].text;

            const delayVal = parseInt(document.getElementById('delay-val')?.value || '0', 10);
            const settings = {
                dl: document.getElementById('set-dl')?.checked ?? true,
                stealth: document.getElementById('set-stealth')?.checked ?? true,
                model: document.getElementById('set-model')?.value || 'imagen4',
                ratio: document.getElementById('set-ratio')?.value || '16:9',
                quality: document.getElementById('set-quality')?.value || '2k'
            };

            try {
                const tabs = await chrome.tabs.query({ url: "*://labs.google/*" });
                if (tabs.length === 0) { alert("Buka tab Google Labs dulu!"); isRunning = false; queue[i].status = 'WAIT'; renderQueue(); break; }
                const isLast = (i === queue.length - 1);

                // Inject the automation function and wait for the in-page Promise to settle
                // by using a wrapper that awaits the async function and returns a JSON result.
                const results = await chrome.scripting.executeScript({
                    target: { tabId: tabs[0].id },
                    world: "MAIN",
                    func: injectAutomationTurbo,
                    args: [finalPrompt, settings, isLast]
                });

                // Check the result returned by the injected function
                const result = results?.[0]?.result;
                if (!result || !result.success) {
                    throw new Error(result?.error || 'Injected script reported failure');
                }

            } catch (err) {
                console.error('Task failed:', err);
                queue[i].status = 'FAIL';
                renderQueue();
                // Continue to next task instead of stopping everything
                continue;
            }

            if (!isRunning) { queue[i].status = 'WAIT'; renderQueue(); break; }
            queue[i].status = 'DONE'; renderQueue();

            // Apply user-configured delay between tasks (random up to the slider value)
            if (!isLast && isRunning && delayVal > 0) {
                const randomDelay = Math.floor(Math.random() * delayVal * 1000);
                await new Promise(r => setTimeout(r, randomDelay));
            }
        }
        isRunning = false;
    }
});

// ==============================================================================
// 🚀 INJECTOR ENGINE (FIBER BYPASS + SMART DOWNLOAD IMAGE BARU)
// ==============================================================================
async function injectAutomationTurbo(prompt, s, isLastTask) {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    function showOverlay(msg) {
        let o = document.getElementById('brkh-overlay');
        if (!o) {
            o = document.createElement('div'); o.id = 'brkh-overlay';
            o.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);backdrop-filter:blur(10px);z-index:9999999;display:flex;align-items:center;justify-content:center;color:white;font-family:sans-serif;text-align:center;";
            o.innerHTML = `<div style=\"background:#0f172a;border:1px solid #38bdf8;padding:30px;border-radius:24px;box-shadow:0 0 30px rgba(56,189,248,0.2);\"><h2 style=\"color:#38bdf8;margin:0 0 10px;text-transform:uppercase;\">BRKH Auto Flow</h2><p id=\"brkh-msg\"></p></div>`;
            document.body.appendChild(o);
        }
        document.getElementById('brkh-msg').textContent = msg;
    }

    async function setDropdown(targets) {
        let menu = document.querySelector('[data-radix-menu-content][data-state=\"open\"]');
        if (!menu) {
            const btn = document.querySelector('button[aria-haspopup=\"menu\"]') || Array.from(document.querySelectorAll('button')).find(b => b.querySelector('i')?.textContent.trim() === 'tune');
            if (btn) { btn.click(); await sleep(700); }
            menu = document.querySelector('[data-radix-menu-content][data-state=\"open\"]');
        }
        if (menu) {
            const items = Array.from(menu.querySelectorAll('[role=\"menuitem\"], button, div[role=\"menuitem\"]'));
            const target = items.find(el => targets.some(t => el.textContent.toLowerCase().includes(t)));
            if (target) { target.click(); await sleep(500); }
        }
    }

    try {
        showOverlay("⚙️ Menyiapkan Workspace...");
        const imgTab = Array.from(document.querySelectorAll('button[role=\"tab\"]')).find(b => b.textContent.toLowerCase().includes('image'));
        if (imgTab && imgTab.getAttribute('data-state') !== 'active') { imgTab.click(); await sleep(600); }

        await setDropdown(s.ratio === "16:9" ? ["landscape", "16:9"] : s.ratio === "1:1" ? ["square", "1:1"] : ["portrait", "9:16"]);
        await setDropdown(s.model === "imagen4" ? ["imagen 4"] : ["nano banana"]);
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(400);

        showOverlay("✍️ Injecting Prompt via React Fiber...");
        const editor = document.querySelector('[data-slate-editor=\"true\"]');
        if (!editor) {
            throw new Error("Slate editor not found — pastikan sudah buka project di Flow workspace.");
        }
        const fiberKey = Object.keys(editor).find(k => k.startsWith('__reactFiber'));
        if (!fiberKey) {
            throw new Error("React Fiber key not found on editor element.");
        }
        let slate = editor[fiberKey];
        let injected = false;
        while (slate) {
            if (slate.memoizedProps?.editor?.children) {
                const sl = slate.memoizedProps.editor;
                const txt = sl.children[0]?.children[0]?.text || '';
                if (txt.length > 0) sl.apply({ type: 'remove_text', path: [0, 0], offset: 0, text: txt });
                sl.apply({ type: 'insert_text', path: [0, 0], offset: 0, text: prompt });
                injected = true;
                break;
            }
            slate = slate.return;
        }
        if (!injected) {
            throw new Error("Could not find Slate editor instance in React Fiber tree.");
        }
        await sleep(400);

        // 🎯 TRACKER ID KOTAK SEBELUM GENERATE
        const initialIds = Array.from(document.querySelectorAll('[data-tile-id]')).map(t => t.getAttribute('data-tile-id'));
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.querySelector('i')?.textContent.trim() === 'arrow_forward' && b.innerText.trim() !== "");
        if (btn) btn.click();

        if (s.dl) {
            showOverlay("⌛ Menunggu Render Selesai...");
            let elapsed = 0;
            let downloaded = false;
            while (elapsed < 120000) {
                await sleep(1000); elapsed += 1000;
                const allTiles = Array.from(document.querySelectorAll('[data-tile-id]'));
                // Cari kotak yang baru (ID-nya nggak ada di daftar lama)
                const newTile = allTiles.find(t => !initialIds.includes(t.getAttribute('data-tile-id')));

                if (newTile) {
                    const media = newTile.querySelector('img[src*="media"], video[src*="media"]');
                    if (media) {
                        showOverlay(`💾 Mendownload Hasil Baru...`);
                        const rect = media.getBoundingClientRect();
                        media.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, button: 2 }));
                        await sleep(800);
                        const m = document.querySelector('[data-radix-menu-content][data-state=\"open\"]');
                        if (m) {
                            const d = Array.from(m.querySelectorAll('[role=\"menuitem\"], button')).find(a => a.textContent.toLowerCase().includes("download"));
                            if (d) {
                                d.click(); await sleep(800);
                                const resMenus = Array.from(document.querySelectorAll('[data-radix-menu-content][data-state=\"open\"]'));
                                const resM = resMenus[resMenus.length - 1];
                                if (resM) {
                                    const resBtn = Array.from(resM.querySelectorAll('button, [role=\"menuitem\"]')).find(b => b.textContent.toLowerCase().includes(s.quality.toLowerCase()));
                                    if (resBtn) resBtn.click();
                                }
                            }
                        }
                        downloaded = true;
                        break;
                    }
                }
            }
            if (!downloaded) {
                showOverlay("⚠️ Timeout: render tidak selesai dalam 2 menit.");
                await sleep(2000);
            }
        }
        if (!isLastTask) { showOverlay("⏳ Cooling-down 15 detik..."); await sleep(15000); }
        document.getElementById('brkh-overlay')?.remove();
        return { success: true };
    } catch (e) {
        document.getElementById('brkh-overlay')?.remove();
        return { success: false, error: e.message || String(e) };
    }
}