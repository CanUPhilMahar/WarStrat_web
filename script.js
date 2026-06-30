(function() {
    'use strict';

    // --- state ---
    let cp = 0;
    let dp = 0;
    let startingDp = 0;
    let doubleTap = false;
    let stratagems = [];
    let coreStratagems = [];
    let isLoading = true;
    let selectedFactionId = null;
    let selectedDetachments = [];
    let detachmentsData = [];
    let allDetachmentsData = [];

    // --- DOM refs ---
    const cpValueEl = document.getElementById('cpValue');
    const btnAddCp = document.getElementById('btnAddCp');
    const chkDoubleCp = document.getElementById('chkDoubleCp');
    const btnResetCp = document.getElementById('btnResetCp');
    const container = document.getElementById('stratagemsContainer');
    const toastContainer = document.getElementById('toastContainer');
    const stratCountEl = document.getElementById('stratCount');
    const pointsGroup = document.getElementById('pointsGroup');
    const cpInfo = document.getElementById('cpInfo');
    const factionSelect = document.getElementById('factionSelect');
    const detachmentList = document.getElementById('detachmentList');
    const loadBtn = document.getElementById('loadStratagemsBtn');
    const detachmentNameEl = document.getElementById('detachmentName');
    const detachmentDescEl = document.getElementById('detachmentDesc');
    const detachmentInfoEl = document.getElementById('detachmentInfo');
    const detachmentCostDisplay = document.getElementById('detachmentCostDisplay');

    // --- helpers ---
    function formatPhase(phase) {
        const map = {
            'always': 'Command',
            'command': 'Command',
            'movement': 'Movement',
            'shooting': 'Shooting',
            'charge': 'Charge',
            'fight': 'Fight'
        };
        return map[phase] || phase;
    }
    function formatWho(who) {
        const map = {
            'y': 'Your turn',
            'e': 'Enemy turn',
            'a': 'Any'
        };
        return map[who] || who;
    }
    function whoClass(who) { return 'who-' + who; }

    // --- toast ---
    function showToast(msg, type) {
        const el = document.createElement('div');
        el.className = 'toast' + (type === 'error' ? ' error' : type === 'success' ? ' success' : '');
        el.textContent = msg;
        toastContainer.appendChild(el);
        setTimeout(() => { if (el.parentNode) el.remove(); }, 3000);
    }

    // --- update display (only CP) ---
    function updateCpDisplay() {
        cpValueEl.textContent = cp;
        document.querySelectorAll('.btn-use').forEach(btn => {
            const cost = parseInt(btn.dataset.cost, 10);
            if (!isNaN(cost)) btn.disabled = (cp < cost);
        });
    }

    // --- update DP info ---
    function updateDpInfo() {
        const totalCost = selectedDetachments.reduce((sum, d) => sum + (d.cost || 0), 0);
        const remaining = startingDp - totalCost;
        cpInfo.textContent = `DP: ${dp} | Selected: ${totalCost} | Remaining: ${remaining}`;
    }

    // --- update detachment info display ---
    function updateDetachmentInfo() {
        if (selectedDetachments.length === 0) {
            detachmentNameEl.textContent = '—';
            detachmentDescEl.innerHTML = '';
            if (detachmentCostDisplay) detachmentCostDisplay.textContent = '';
            detachmentInfoEl.classList.add('empty');
            return;
        }

        const names = selectedDetachments.map(d => d.name).join(', ');
        detachmentNameEl.textContent = `Selected: ${names}`;

        let descHtml = '';
        selectedDetachments.forEach(d => {
            descHtml += `
                <div class="detachment-item">
                    <strong>${d.name}</strong> (${d.cost || 0} DP):
                    <span class="detachment-rule">${d.description || 'No description'}</span>
                </div>
            `;
        });
        detachmentDescEl.innerHTML = descHtml;

        const totalCost = selectedDetachments.reduce((sum, d) => sum + (d.cost || 0), 0);
        const remaining = startingDp - totalCost;
        if (detachmentCostDisplay) {
            detachmentCostDisplay.textContent = `Total cost: ${totalCost} DP | Remaining: ${remaining} DP`;
        }

        detachmentInfoEl.classList.remove('empty');
    }

    // --- actions (work only with cp) ---
    function addCp() {
        cp += doubleTap ? 2 : 1;
        updateCpDisplay();
        showToast(`+${doubleTap ? 2 : 1} CP`, 'success');
    }
    function resetCp() {
        cp = 0;
        updateCpDisplay();
        showToast('CP reset to 0', 'info');
    }
    function useStratagem(cost, name) {
        if (cp < cost) {
            showToast(`Not enough CP! Need ${cost}, have ${cp}`, 'error');
            return;
        }
        cp -= cost;
        updateCpDisplay();
        showToast(`✅ ${name} (${cost} CP)`, 'success');
    }

    // --- grouping ---
    function groupByPhase(list) {
        const phases = ['command', 'movement', 'shooting', 'charge', 'fight'];
        const grouped = {};
        phases.forEach(p => grouped[p] = []);

        list.forEach(s => {
            if (s.whe === 'always') {
                phases.forEach(p => grouped[p].push(s));
            } else if (s.whe === 'command') {
                if (grouped['command']) grouped['command'].push(s);
            } else {
                if (grouped[s.whe]) grouped[s.whe].push(s);
            }
        });

        const result = {};
        phases.forEach(p => {
            if (grouped[p].length) result[p] = grouped[p];
        });
        return result;
    }

    function groupStratagems(items) {
        const yourTurn = items.filter(s => s.who === 'y' || s.who === 'a');
        const enemyTurn = items.filter(s => s.who === 'e' || s.who === 'a');
        return {
            yourTurn: groupByPhase(yourTurn),
            enemyTurn: groupByPhase(enemyTurn)
        };
    }

    // --- render ---
    function render() {
        if (isLoading) {
            container.innerHTML = `<div class="loader"></div><div class="loader"></div>`;
            return;
        }
        if (!stratagems.length) {
            container.innerHTML = `
                <div class="category">
                    <div class="category-header"><h2>📜 Stratagems</h2></div>
                    <div class="empty-state">No stratagems loaded for this selection.</div>
                </div>
            `;
            stratCountEl.textContent = '0';
            return;
        }

        stratCountEl.textContent = stratagems.length;
        const grouped = groupStratagems(stratagems);

        function renderCategory(title, phaseGroups) {
            const phaseKeys = Object.keys(phaseGroups);
            if (!phaseKeys.length) {
                return `
                    <div class="category">
                        <div class="category-header"><h2>${title}</h2><span class="badge">0</span></div>
                        <div class="empty-state">No stratagems</div>
                    </div>
                `;
            }
            let total = 0;
            phaseKeys.forEach(p => total += phaseGroups[p].length);
            let html = `<div class="category"><div class="category-header"><h2>${title}</h2><span class="badge">${total}</span></div><div class="category-body">`;
            const phaseOrder = ['command', 'movement', 'shooting', 'charge', 'fight'];
            phaseOrder.forEach(phase => {
                const items = phaseGroups[phase];
                if (!items || !items.length) return;
                html += `<div class="phase-group" data-phase="${phase}">`;
                html += `<div class="phase-title">▸ ${formatPhase(phase)}</div>`;
                html += `<div class="phase-content">`;
                items.forEach(s => {
                    html += `
                        <div class="strat-card">
                            <div class="strat-info">
                                <div class="strat-name">${s.name} <span class="cost-badge">${s.cost} CP</span></div>
                                <div class="strat-desc">${s.description || ''}</div>
                                <div class="strat-meta">
                                    <span class="tag">${formatPhase(s.whe)}</span>
                                    <span class="tag ${whoClass(s.who)}">${formatWho(s.who)}</span>
                                </div>
                            </div>
                            <div class="strat-action">
                                <button class="btn btn-use" data-cost="${s.cost}" data-name="${s.name}" ${cp < s.cost ? 'disabled' : ''}>
                                    Use <span class="cp-cost">${s.cost} CP</span>
                                </button>
                            </div>
                        </div>
                    `;
                });
                html += `</div></div>`;
            });
            html += `</div></div>`;
            return html;
        }

        container.innerHTML =
            renderCategory('⚔️ Your Turn', grouped.yourTurn) +
            renderCategory('👹 Enemy Turn', grouped.enemyTurn);

        // attach events
        container.querySelectorAll('.btn-use').forEach(btn => {
            btn.addEventListener('click', function() {
                const cost = parseInt(this.dataset.cost, 10);
                const name = this.dataset.name;
                if (!isNaN(cost) && name) useStratagem(cost, name);
            });
        });

        container.querySelectorAll('.phase-title').forEach(title => {
            title.addEventListener('click', function(e) {
                e.stopPropagation();
                const group = this.parentElement;
                group.classList.toggle('collapsed');
            });
        });

        container.querySelectorAll('.category-header').forEach(header => {
            header.addEventListener('click', function() {
                const category = this.parentElement;
                category.classList.toggle('collapsed');
            });
        });

        updateCpDisplay();
    }

    // --- load stratagems from asset files for multiple detachments ---
    function loadStrategemsForDetachments(detachmentIds) {
        if (!detachmentIds || detachmentIds.length === 0) {
            showToast('No detachments selected', 'error');
            return;
        }

        isLoading = true;
        render();

        const fetchPromises = detachmentIds.map(id => {
            const url = `assets/${id}.json`;
            console.log('[DEBUG] Fetching stratagems from:', url);
            return fetch(url)
                .then(res => {
                    if (!res.ok) throw new Error(`HTTP ${res.status} for ${id}`);
                    return res.json();
                })
                .then(data => {
                    if (!Array.isArray(data)) {
                        throw new Error(`Invalid JSON format for ${id}`);
                    }
                    return data;
                });
        });

        Promise.all(fetchPromises)
            .then(results => {
                let allStratagems = [];
                results.forEach(data => {
                    allStratagems = allStratagems.concat(data);
                });
                stratagems = [...coreStratagems, ...allStratagems];

                const totalCost = selectedDetachments.reduce((sum, d) => sum + (d.cost || 0), 0);
                dp = Math.max(0, startingDp - totalCost);
                updateDpInfo();
                updateDetachmentInfo();

                isLoading = false;
                updateCpDisplay();
                render();
                showToast(`Loaded ${stratagems.length} stratagems (${coreStratagems.length} core + ${allStratagems.length} from ${detachmentIds.length} detachment(s))`, 'success');
            })
            .catch(err => {
                console.warn('[DEBUG] Failed to load stratagems:', err.message);
                stratagems = [...coreStratagems];
                isLoading = false;
                render();
                showToast('❌ Failed to load stratagems for one or more detachments', 'error');
            });
    }

    // --- render detachment list ---
    function renderDetachmentList(data) {
        detachmentList.innerHTML = '';
        if (!data || data.length === 0) {
            detachmentList.innerHTML = '<div class="detachment-empty">No detachments available</div>';
            return;
        }

        data.forEach(item => {
            const div = document.createElement('div');
            div.className = 'detachment-item';
            if (startingDp < (item.cost || 0)) {
                div.classList.add('disabled');
            }
            div.dataset.id = item.id;
            div.innerHTML = `
                <span class="detachment-name">${item.name}</span>
                <span class="detachment-cost">${item.cost || 0} DP</span>
            `;
            div.addEventListener('click', function(e) {
                e.stopPropagation();
                if (this.classList.contains('disabled')) return;
                this.classList.toggle('selected');
                updateSelectedDetachments();
            });
            detachmentList.appendChild(div);
        });
    }

    // --- load detachments for selected faction (factions/[id].json) ---
    function loadDetachments(factionId) {
        console.log('[DEBUG] loadDetachments called for faction:', factionId);
        detachmentList.innerHTML = '<div class="detachment-empty">Loading...</div>';
        loadBtn.disabled = true;
        selectedDetachments = [];
        detachmentsData = [];
        allDetachmentsData = [];
        stratagems = [...coreStratagems];
        detachmentNameEl.textContent = '—';
        detachmentDescEl.innerHTML = '';
        if (detachmentCostDisplay) detachmentCostDisplay.textContent = '';
        detachmentInfoEl.classList.add('empty');
        render();

        if (!factionId) {
            detachmentList.innerHTML = '<div class="detachment-empty">Select a faction first</div>';
            loadBtn.disabled = true;
            return Promise.resolve();
        }

        const url = `factions/${factionId}.json`;
        console.log('[DEBUG] Fetching detachments from:', url);
        return fetch(url)
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then(data => {
                console.log('[DEBUG] Detachments loaded:', data);
                if (Array.isArray(data) && data.length) {
                    allDetachmentsData = data;
                    detachmentsData = data;
                    renderDetachmentList(data);
                    loadBtn.disabled = true;
                } else {
                    throw new Error('Invalid detachments data');
                }
            })
            .catch(err => {
                console.warn('[DEBUG] Failed to load detachments:', err.message);
                showToast('❌ Failed to load detachments for this faction', 'error');
                detachmentList.innerHTML = '<div class="detachment-empty">Error loading detachments</div>';
                loadBtn.disabled = true;
                throw err;
            });
    }

    // --- load factions list from core/list.json ---
    function loadFactions() {
        console.log('[DEBUG] loadFactions called');
        return fetch('core/list.json')
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then(data => {
                console.log('[DEBUG] Factions loaded:', data);
                if (Array.isArray(data) && data.length) {
                    data.forEach(item => {
                        const opt = document.createElement('option');
                        opt.value = item.id;
                        opt.textContent = item.name;
                        factionSelect.appendChild(opt);
                    });
                    console.log('[DEBUG] Faction options added:', factionSelect.options.length);
                } else {
                    throw new Error('Invalid factions list');
                }
            })
            .catch(err => {
                console.warn('[DEBUG] Failed to load factions:', err.message);
                showToast('❌ Failed to load factions list', 'error');
            });
    }

    // --- load core stratagems from core/core.json ---
    function loadCoreData() {
        console.log('[DEBUG] loadCoreData called');
        return fetch('core/core.json')
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then(data => {
                console.log('[DEBUG] Core stratagems loaded:', data.length);
                if (Array.isArray(data) && data.length) {
                    coreStratagems = data;
                    stratagems = [...coreStratagems];
                    isLoading = false;
                    render();
                    showToast(`Loaded ${coreStratagems.length} core stratagems`, 'success');
                } else {
                    throw new Error('Invalid core.json');
                }
            })
            .catch(err => {
                console.warn('[DEBUG] Failed to load core.json:', err.message);
                showToast('⚠️ Core stratagems not loaded', 'info');
                coreStratagems = [];
                stratagems = [];
                isLoading = false;
                render();
            });
    }

    // --- update selected detachments ---
    function updateSelectedDetachments() {
        const selectedElements = detachmentList.querySelectorAll('.detachment-item.selected');
        const selectedIds = Array.from(selectedElements).map(el => el.dataset.id);
        selectedDetachments = detachmentsData.filter(d => selectedIds.includes(d.id));

        const totalCost = selectedDetachments.reduce((sum, d) => sum + (d.cost || 0), 0);
        if (totalCost > startingDp) {
            showToast(`Total cost (${totalCost}) exceeds available DP (${startingDp})!`, 'error');
            // Снимаем последний выбранный
            const lastSelected = selectedElements[selectedElements.length - 1];
            if (lastSelected) {
                lastSelected.classList.remove('selected');
            }
            // Пересчитываем заново
            const newSelected = detachmentList.querySelectorAll('.detachment-item.selected');
            const newIds = Array.from(newSelected).map(el => el.dataset.id);
            selectedDetachments = detachmentsData.filter(d => newIds.includes(d.id));
        }

        const totalCostFinal = selectedDetachments.reduce((sum, d) => sum + (d.cost || 0), 0);
        dp = Math.max(0, startingDp - totalCostFinal);
        updateDpInfo();
        updateDetachmentInfo();
        loadBtn.disabled = (selectedDetachments.length === 0);
        console.log('[DEBUG] Selected detachments:', selectedDetachments.map(d => d.name));
    }

    // --- update starting DP based on points ---
    function updatestartingDp(points) {
        if (points === 500 || points === 1000) {
            startingDp = 2;
        } else if (points === 2000 || points === 3000) {
            startingDp = 3;
        } else {
            startingDp = 0;
        }

        // Обновляем доступность элементов
        const items = detachmentList.querySelectorAll('.detachment-item');
        items.forEach(el => {
            const id = el.dataset.id;
            const det = detachmentsData.find(d => d.id === id);
            if (det) {
                const cost = det.cost || 0;
                if (startingDp < cost) {
                    el.classList.add('disabled');
                } else {
                    el.classList.remove('disabled');
                }
            }
        });

        // Снимаем выбор с недоступных
        const selected = detachmentList.querySelectorAll('.detachment-item.selected');
        selected.forEach(el => {
            if (el.classList.contains('disabled')) {
                el.classList.remove('selected');
            }
        });

        updateSelectedDetachments();
        // cp НЕ ТРОГАЕМ!
    }

    // --- event handlers ---
    function onPointsChange(points) {
        document.querySelectorAll('.points-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.points) === points);
        });
        updatestartingDp(points);
    }

    function onFactionChange() {
        const factionId = factionSelect.value;
        console.log('[DEBUG] onFactionChange called, factionId:', factionId);
        selectedFactionId = factionId;
        selectedDetachments = [];
        detachmentsData = [];
        allDetachmentsData = [];
        stratagems = [...coreStratagems];
        render();
        detachmentNameEl.textContent = '—';
        detachmentDescEl.innerHTML = '';
        if (detachmentCostDisplay) detachmentCostDisplay.textContent = '';
        detachmentInfoEl.classList.add('empty');
        loadBtn.disabled = true;

        if (factionId) {
            loadDetachments(factionId).catch(err => {
                console.error('[DEBUG] Error in loadDetachments:', err);
                showToast('Error loading detachments for this faction', 'error');
                detachmentList.innerHTML = '<div class="detachment-empty">Error loading</div>';
                loadBtn.disabled = true;
            });
        } else {
            detachmentList.innerHTML = '<div class="detachment-empty">Select a faction first</div>';
            loadBtn.disabled = true;
        }
    }

    function onLoadClick() {
        if (selectedFactionId && selectedDetachments.length > 0) {
            const ids = selectedDetachments.map(d => d.id);
            loadStrategemsForDetachments(ids);
        } else {
            showToast('Please select faction and at least one detachment', 'error');
        }
    }

    // --- init ---
    function init() {
        // Делегированный обработчик клика на список детачментов
        detachmentList.addEventListener('click', function(e) {
            const item = e.target.closest('.detachment-item');
            if (!item) return;                 // клик не по элементу
            if (item.classList.contains('disabled')) return; // недоступен
            item.classList.toggle('selected'); // переключаем выбор
            updateSelectedDetachments();       // обновляем состояние
        });
        console.log('[DEBUG] init started');
        pointsGroup.querySelectorAll('.points-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const points = parseInt(this.dataset.points);
                onPointsChange(points);
            });
        });

        factionSelect.addEventListener('change', onFactionChange);
        
        // Проверяем наличие loadBtn
        if (loadBtn) {
            loadBtn.addEventListener('click', onLoadClick);
        } else {
            console.warn('[DEBUG] loadBtn not found!');
        }

        chkDoubleCp.addEventListener('change', function() { doubleTap = this.checked; });
        btnAddCp.addEventListener('click', addCp);
        btnResetCp.addEventListener('click', resetCp);

        // Делегированный обработчик для списка детачментов
        detachmentList.addEventListener('click', function(e) {
            const item = e.target.closest('.detachment-item');
            if (!item) return;
            if (item.classList.contains('disabled')) return;
            item.classList.toggle('selected');
            updateSelectedDetachments();
        });

        Promise.all([loadFactions(), loadCoreData()]).then(() => {
            console.log('[DEBUG] Both factions and core loaded');
        });

        cp = 0;
        dp = 0;
        startingDp = 0;
        updateCpDisplay();
        updateDpInfo();
        loadBtn.disabled = true;
        detachmentList.innerHTML = '<div class="detachment-empty">Select a faction first</div>';
        detachmentInfoEl.classList.add('empty');
        detachmentNameEl.textContent = '—';
        detachmentDescEl.innerHTML = '';
        if (detachmentCostDisplay) detachmentCostDisplay.textContent = '';
        console.log('[DEBUG] init finished');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();