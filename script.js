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
    let selectedDetachments = []; // массив выбранных детачментов (объекты)
    let detachmentsData = [];
    let allDetachmentsData = []; // все детачменты для текущей фракции

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
    const detachmentSelect = document.getElementById('detachmentSelect');
    const loadBtn = document.getElementById('loadStratagemsBtn');
    const detachmentNameEl = document.getElementById('detachmentName');
    const detachmentDescEl = document.getElementById('detachmentDesc');
    const detachmentInfoEl = document.getElementById('detachmentInfo');

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
        // Показываем общую стоимость выбранных детачментов и остаток DP
        const totalCost = selectedDetachments.reduce((sum, d) => sum + (d.cost || 0), 0);
        const remaining = startingDp - totalCost;
        cpInfo.textContent = `DP: ${dp} | Selected: ${totalCost} | Remaining: ${remaining}`;
    }

    // --- update detachment info display ---
    function updateDetachmentInfo() {
        if (selectedDetachments.length === 0) {
            detachmentNameEl.textContent = '—';
            detachmentDescEl.textContent = 'No detachments selected';
            detachmentInfoEl.classList.add('empty');
            return;
        }
        // Показываем все выбранные детачменты с их описаниями
        let html = '';
        selectedDetachments.forEach(d => {
            html += `<div><strong>${d.name}</strong> (${d.cost || 0} DP): ${d.description || 'No description'}</div>`;
        });
        const totalCost = selectedDetachments.reduce((sum, d) => sum + (d.cost || 0), 0);
        detachmentNameEl.innerHTML = `Selected: ${selectedDetachments.map(d => d.name).join(', ')}`;
        detachmentDescEl.innerHTML = html;
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
                // Объединяем все стратегемы
                let allStratagems = [];
                results.forEach(data => {
                    allStratagems = allStratagems.concat(data);
                });
                stratagems = [...coreStratagems, ...allStratagems];

                // Обновляем информацию о детачментах
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

    // --- load detachments for selected faction (factions/[id].json) ---
    function loadDetachments(factionId) {
        console.log('[DEBUG] loadDetachments called for faction:', factionId);
        detachmentSelect.disabled = true;
        loadBtn.disabled = true;
        selectedDetachments = [];
        detachmentsData = [];
        allDetachmentsData = [];
        stratagems = [...coreStratagems];
        detachmentNameEl.textContent = '—';
        detachmentDescEl.textContent = '';
        detachmentInfoEl.classList.add('empty');
        render();

        if (!factionId) {
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
                    data.forEach(item => {
                        const opt = document.createElement('option');
                        opt.value = item.id;
                        opt.textContent = item.name;
                        // Если DP не хватает для этого детачмента, делаем опцию недоступной
                        if (startingDp < (item.cost || 0)) {
                            opt.disabled = true;
                            opt.style.color = '#5a4a3a';
                            opt.style.backgroundColor = '#1a1614';
                        }
                        detachmentSelect.appendChild(opt);
                    });
                    detachmentSelect.disabled = false;
                    console.log('[DEBUG] Detachment select is now enabled. Options:', detachmentSelect.options.length);

                    // Сбрасываем выбор
                    detachmentSelect.value = '';
                    selectedDetachments = [];
                    updateDetachmentInfo();
                    updateDpInfo();
                    loadBtn.disabled = true;
                } else {
                    throw new Error('Invalid detachments data');
                }
            })
            .catch(err => {
                console.warn('[DEBUG] Failed to load detachments:', err.message);
                showToast('❌ Failed to load detachments for this faction', 'error');
                detachmentSelect.disabled = true;
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

    // --- load core stratagems from core/core.json (ВСЕГДА ПРИ ЗАПУСКЕ) ---
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

    // --- update starting DP based on points ---
    function updatestartingDp(points) {
        if (points === 500 || points === 1000) {
            startingDp = 2;
        } else if (points === 2000 || points === 3000) {
            startingDp = 3;
        } else {
            startingDp = 0;
        }

        // Пересчитываем dp с учётом выбранных детачментов
        const totalCost = selectedDetachments.reduce((sum, d) => sum + (d.cost || 0), 0);
        dp = Math.max(0, startingDp - totalCost);
        updateDpInfo();

        // Обновляем доступность опций в select
        if (detachmentsData.length) {
            const options = detachmentSelect.querySelectorAll('option');
            options.forEach(opt => {
                if (opt.value === '') return;
                const det = detachmentsData.find(d => d.id === opt.value);
                if (det) {
                    const cost = det.cost || 0;
                    if (startingDp < cost) {
                        opt.disabled = true;
                        opt.style.color = '#5a4a3a';
                    } else {
                        opt.disabled = false;
                        opt.style.color = '';
                    }
                }
            });
            // Если выбранный детачмент стал недоступен, снимаем выбор
            const selectedValues = Array.from(detachmentSelect.selectedOptions).map(o => o.value).filter(v => v !== '');
            let changed = false;
            selectedValues.forEach(val => {
                const opt = detachmentSelect.querySelector(`option[value="${val}"]`);
                if (opt && opt.disabled) {
                    opt.selected = false;
                    changed = true;
                }
            });
            if (changed) {
                // Пересчитываем выбранные
                updateSelectedDetachments();
            }
        }
        // cp НЕ ТРОГАЕМ!
    }

    // --- обновление списка выбранных детачментов ---
    function updateSelectedDetachments() {
        const selectedOptions = detachmentSelect.selectedOptions;
        const selectedIds = Array.from(selectedOptions).map(opt => opt.value).filter(v => v !== '');
        selectedDetachments = detachmentsData.filter(d => selectedIds.includes(d.id));

        // Проверка DP
        const totalCost = selectedDetachments.reduce((sum, d) => sum + (d.cost || 0), 0);
        if (totalCost > startingDp) {
            showToast(`Total detachment cost (${totalCost}) exceeds available DP (${startingDp})!`, 'error');
            // Снимаем последний выбранный
            const lastSelected = selectedIds[selectedIds.length - 1];
            if (lastSelected) {
                const opt = detachmentSelect.querySelector(`option[value="${lastSelected}"]`);
                if (opt) opt.selected = false;
            }
            // Пересчитываем заново
            const newSelectedOptions = detachmentSelect.selectedOptions;
            const newSelectedIds = Array.from(newSelectedOptions).map(opt => opt.value).filter(v => v !== '');
            selectedDetachments = detachmentsData.filter(d => newSelectedIds.includes(d.id));
        }

        const totalCostFinal = selectedDetachments.reduce((sum, d) => sum + (d.cost || 0), 0);
        dp = Math.max(0, startingDp - totalCostFinal);
        updateDpInfo();
        updateDetachmentInfo();
        loadBtn.disabled = (selectedDetachments.length === 0);
        console.log('[DEBUG] Selected detachments:', selectedDetachments.map(d => d.name));
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
        detachmentDescEl.textContent = '';
        detachmentInfoEl.classList.add('empty');
        loadBtn.disabled = true;

        if (factionId) {
            loadDetachments(factionId).catch(err => {
                console.error('[DEBUG] Error in loadDetachments:', err);
                showToast('Error loading detachments for this faction', 'error');
                detachmentSelect.disabled = true;
                loadBtn.disabled = true;
            });
        } else {
            detachmentSelect.innerHTML = '<option value="">-- Select Detachment --</option>';
            detachmentSelect.disabled = true;
            loadBtn.disabled = true;
        }
    }

    function onDetachmentChange() {
        updateSelectedDetachments();
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
        console.log('[DEBUG] init started');
        pointsGroup.querySelectorAll('.points-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const points = parseInt(this.dataset.points);
                onPointsChange(points);
            });
        });

        factionSelect.addEventListener('change', onFactionChange);
        detachmentSelect.addEventListener('change', onDetachmentChange);
        loadBtn.addEventListener('click', onLoadClick);

        chkDoubleCp.addEventListener('change', function() { doubleTap = this.checked; });
        btnAddCp.addEventListener('click', addCp);
        btnResetCp.addEventListener('click', resetCp);

        // Загружаем только factions и core, без авто-выбора
        Promise.all([loadFactions(), loadCoreData()]).then(() => {
            console.log('[DEBUG] Both factions and core loaded');
        });

        cp = 0;
        dp = 0;
        startingDp = 0;
        updateCpDisplay();
        updateDpInfo();
        detachmentSelect.disabled = true;
        loadBtn.disabled = true;
        detachmentInfoEl.classList.add('empty');
        detachmentNameEl.textContent = '—';
        detachmentDescEl.textContent = '';
        console.log('[DEBUG] init finished');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();