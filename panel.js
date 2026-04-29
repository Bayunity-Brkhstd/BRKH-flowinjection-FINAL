document.addEventListener('DOMContentLoaded', () => {
    // --- UI ELEMENTS ---
    const modal = document.getElementById('welcome-modal');
    const closeBtn = document.getElementById('close-modal-btn');
    if (modal) modal.style.display = 'flex';
    if (closeBtn) closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });

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
            else alert("Robot lagi jalan bos!");
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
            const statusText = t.status === 'RUN' ? 'Sedang Diproses' : t.status === 'DONE' ? 'Selesai' : t.status === 'FAIL' ? `Gagal: ${t.errorMsg || 'Error'}` : 'Dalam Antrean';

            return `
            <div class="task-item ${statusClass}" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 10px; margin-bottom: 8px; display: flex; align-items: center; gap: 10px;">
                <div class="${statusClass === 'running' ? 'text-blue-400' : statusClass === 'done' ? 'text-green-400' : 'text-gray-400'}">${iconSvg}</div>
                <div style="flex-grow: 1; overflow: hidden;">
                    <div style="font-size: 11px; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: white;">${t.text}</div>
                    <div style="font-size: 9px; color: ${t.status === 'FAIL' ? '#fca5a5' : '#94a3b8'}; margin-top: 4px;">Task #${idx + 1} • ${statusText}</div>
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

            // PENGGABUNGAN PROMPT HYBRID
            const visualStyle = document.getElementById('set-visual-style')?.value || "";
            const activeStyles = Array.from(document.querySelectorAll('.style-pill.active')).map(p => p.dataset.style);
            const manualStyle = document.getElementById('manual-style-input')?.value.trim();
            
            let modifierArr = [];
            if (visualStyle) modifierArr.push(visualStyle);
            if (activeStyles.length > 0) modifierArr.push(activeStyles.join(', '));
            if (manualStyle) modifierArr.push(manualStyle);

            let finalPrompt = queue[i].text;
            if (modifierArr.length > 0) {
                finalPrompt += ", " + modifierArr.join(', ');
            }

            const settings = {
                prompt: finalPrompt,
                dl: document.getElementById('set-dl')?.checked ?? true,
                expectedOutputs: document.getElementById('set-expected-output')?.value || '4', 
                quality: document.getElementById('set-quality')?.value || '2k',
                isLast: (i === queue.length - 1)
            };

            try {
                const tabs = await chrome.tabs.query({ url: "*://labs.google/*" });
                if (tabs.length === 0) { alert("Buka tab Google Labs dulu!"); isRunning = false; queue[i].status = 'WAIT'; renderQueue(); break; }

                const results = await chrome.scripting.executeScript({
                    target: { tabId: tabs[0].id },
                    world: "MAIN",
                    func: injectAutomationTurbo,
                    args: [settings]
                });

                const result = results?.[0]?.result;
                if (!result || !result.success) throw new Error(result?.error || 'Gagal eksekusi script');

            } catch (err) {
                console.error('Task failed:', err);
                queue[i].status = 'FAIL';
                queue[i].errorMsg = err.message;
                renderQueue();
                continue; 
            }

            if (!isRunning) { queue[i].status = 'WAIT'; renderQueue(); break; }
            queue[i].status = 'DONE'; renderQueue();

            const stealthCheckbox = document.getElementById('set-stealth');
            if (!settings.isLast && isRunning && stealthCheckbox && stealthCheckbox.checked) {
                 await new Promise(r => setTimeout(r, 2000));
            }
        }
        
        // =====================================================================
        // 🔥 FITUR BARU: PLAY SFX SAAT SEMUA TUGAS SELESAI 🔥
        // =====================================================================
        const isQueueFinished = queue.length > 0 && !queue.some(t => t.status === 'WAIT' || t.status === 'RUN');
        
        // Mastiin dia bunyi cuma kalau selesai normal (bukan karena dipencet STOP)
        if (isQueueFinished && isRunning) {
            try {
                const sfx = new Audio('fah.mp3');
                sfx.play();
            } catch (err) {
                console.log("SFX Gagal diputar:", err);
            }
        }
        
        isRunning = false;
    }
});

// ==============================================================================
// 🚀 DEEP CORE SCANNER INJECTOR (THE FINAL BOSS BYPASS)
// ==============================================================================
async function injectAutomationTurbo(s) {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    
    function showOverlay(msg) {
        let o = document.getElementById('brkh-overlay');
        if (!o) {
            o = document.createElement('div'); o.id = 'brkh-overlay';
            o.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);backdrop-filter:blur(10px);z-index:9999999;display:flex;align-items:center;justify-content:center;color:white;font-family:sans-serif;text-align:center;";
            o.innerHTML = `<div style="background:#0f172a;border:1px solid #38bdf8;padding:30px;border-radius:24px;box-shadow:0 0 30px rgba(56,189,248,0.2);"><h2 style="color:#38bdf8;margin:0 0 10px;text-transform:uppercase;">BRKH Hybrid Engine</h2><p id="brkh-msg" style="font-weight:bold;"></p></div>`;
            document.body.appendChild(o);
        }
        document.getElementById('brkh-msg').textContent = msg;
    }

    const getMediaElements = () => Array.from(document.querySelectorAll('img, video')).filter(el => el.src && !el.src.includes('avatar') && !el.src.includes('icon') && !el.src.includes('logo') && !el.src.startsWith('data:image/svg'));

    try {
        // =====================================================================
        // 1. DEEP SCANNER: MENCARI ENGINE ASLI GOOGLE (SLATE.JS)
        // =====================================================================
        showOverlay("✍️ Melakukan Deep Scan pada Editor...");
        let slateEditorObj = null;
        
        const allNodes = document.querySelectorAll('*');
        for (let el of allNodes) {
            const fKey = Object.keys(el).find(k => k.startsWith('__reactFiber'));
            if (fKey) {
                let node = el[fKey];
                while (node) {
                    if (node.memoizedProps && node.memoizedProps.editor && typeof node.memoizedProps.editor.insertText === 'function') {
                        slateEditorObj = node.memoizedProps.editor;
                        break;
                    }
                    node = node.return;
                }
            }
            if (slateEditorObj) break;
        }

        if (slateEditorObj) {
            showOverlay("✅ Engine ditemukan! Menyuntikkan prompt VIP...");
            if (typeof slateEditorObj.deleteBackward === 'function') {
                for(let i=0; i<50; i++) slateEditorObj.deleteBackward('character');
            }
            slateEditorObj.insertText(s.prompt);
            await sleep(500);
        } else {
            showOverlay("⚠️ Engine ngumpet, pakai metode Brutal DOM...");
            const box = document.querySelector('[contenteditable="true"]');
            if(!box) throw new Error("Area Prompt mati total, tidak bisa diinjeksi!");
            box.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('insertText', false, s.prompt);
            box.dispatchEvent(new Event('input', {bubbles: true}));
            await sleep(500);
        }

        const initialSrcs = getMediaElements().map(m => m.src);

        // =====================================================================
        // 2. MENCARI & KLIK TOMBOL GENERATE
        // =====================================================================
        showOverlay("🚀 Mencari Tombol Generate...");
        let btn = null;
        let btnAttempts = 0;
        
        while(!btn && btnAttempts < 6) {
             const allBtns = Array.from(document.querySelectorAll('button, div[role="button"]'));
             btn = allBtns.find(b => {
                 const text = b.textContent.trim().toLowerCase();
                 const aria = (b.getAttribute('aria-label') || '').toLowerCase();
                 const isGen = text.includes('arrow_forward') || text.includes('send') || text.includes('generate') || text.includes('buat') || aria.includes('generate') || aria.includes('submit');
                 const isDisabled = b.disabled || b.getAttribute('aria-disabled') === 'true';
                 return isGen && !isDisabled;
             });
             
             if(btn) break;
             await sleep(500);
             btnAttempts++;
        }

        if (btn) {
            btn.click();
        } else {
             showOverlay("⚠️ Tombol Generate dikunci! Maksa pakai tombol ENTER...");
             const box = document.querySelector('[contenteditable="true"]') || document.body;
             box.focus();
             box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
             await sleep(1500);
             
             const afterEnterSrcs = getMediaElements().map(m => m.src);
             if (initialSrcs.length === afterEnterSrcs.length && !document.querySelector('[data-tile-id]')) {
                 throw new Error("Ditolak Google: Tombol Generate mati & Enter diblokir.");
             }
        }

        // =====================================================================
        // 3. TUNGGU RENDER & DOWNLOAD
        // =====================================================================
        if (s.dl) {
            const targetDownloads = parseInt(s.expectedOutputs, 10) || 1; 
            let downloadedCount = 0;
            
            showOverlay(`⌛ Menunggu Render Selesai (Target: ${targetDownloads} Hasil)...`);
            let elapsed = 0;
            
            while(elapsed < 150000 && downloadedCount < targetDownloads) {
                await sleep(1500); elapsed += 1500;
                
                const currentMedia = getMediaElements();
                const newMediaList = currentMedia.filter(m => !initialSrcs.includes(m.src) && !m.dataset.downloaded);
                
                for (let newMedia of newMediaList) {
                    showOverlay(`💾 Mendownload (${downloadedCount + 1}/${targetDownloads}) Resolusi ${s.quality.toUpperCase()}...`);
                    const rect = newMedia.getBoundingClientRect();
                    newMedia.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, button: 2 }));
                    await sleep(1200); 
                    
                    const downloadMenu = document.querySelector('[data-radix-menu-content][data-state="open"], [role="menu"]');
                    if (downloadMenu) {
                        const dlBtn = Array.from(downloadMenu.querySelectorAll('[role="menuitem"], button')).find(a => a.textContent.toLowerCase().includes("download") || a.textContent.toLowerCase().includes("save") || a.textContent.toLowerCase().includes("simpan"));
                        
                        if (dlBtn) {
                            dlBtn.click(); 
                            await sleep(1000);
                            
                            const resMenus = Array.from(document.querySelectorAll('[data-radix-menu-content][data-state="open"], [role="menu"]'));
                            const resM = resMenus[resMenus.length - 1]; 
                            if (resM) {
                                const resBtn = Array.from(resM.querySelectorAll('button, [role="menuitem"]')).find(b => b.textContent.toLowerCase().includes(s.quality.toLowerCase()));
                                if (resBtn) resBtn.click();
                            }
                        }
                    }
                    
                    newMedia.dataset.downloaded = "true"; 
                    downloadedCount++;
                    
                    if (downloadedCount >= targetDownloads) break;
                    await sleep(1500); 
                }
            }
            if (downloadedCount === 0) {
                throw new Error("Gambar baru tidak muncul (Timeout 2.5 menit).");
            }
        }

        // =====================================================================
        // 4. JEDA AMAN
        // =====================================================================
        if (!s.isLast) { showOverlay("⏳ Cooling-down 15 detik (Anti-Ban)..."); await sleep(15000); }
        document.getElementById('brkh-overlay')?.remove();
        return { success: true };
    } catch (e) { 
        document.getElementById('brkh-overlay')?.remove(); 
        return { success: false, error: e.message }; 
    }
}