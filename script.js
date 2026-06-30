(function() {
    'use strict';

    // state
    let cp = 0,
        dp = 0,
        startingDp = 0,
        doubleTap = false,
        isLoading = true,
        selectedFactionId = null,
        stratagems = [],
        coreStratagems = [],
        selectedDetachments = [],
        detachmentsData = [],
        lastLoadedIds = [];

    // DOM refs
    const $ = id => document.getElementById(id);
    const cpValueEl = $('cpValue');
    const btnAddCp = $('btnAddCp');
    const chkDoubleCp = $('chkDoubleCp');
    const btnResetCp = $('btnResetCp');
    const container = $('stratagemsContainer');
    const toastContainer = $('toastContainer');
    const stratCountEl = $('stratCount');
    const pointsGroup = $('pointsGroup');
    const cpInfo = $('cpInfo');
    const factionSelect = $('factionSelect');
    const detachmentList = $('detachmentList');
    const detachmentNameEl = $('detachmentName');
    const detachmentDescEl = $('detachmentDesc');
    const detachmentInfoEl = $('detachmentInfo');
    const detachmentCostDisplay = $('detachmentCostDisplay');

    // helpers
    const phaseMap = { always: 'Command', command: 'Command', movement: 'Movement', shooting: 'Shooting', charge: 'Charge', fight: 'Fight' };
    const whoMap = { y: 'Your turn', e: 'Enemy turn', a: 'Any' };
    const formatPhase = p => phaseMap[p] || p;
    const formatWho = w => whoMap[w] || w;
    const whoClass = w => 'who-' + w;

    function showToast(msg, type) {
        const el = document.createElement('div');
        el.className = 'toast' + (type === 'error' ? ' error' : type === 'success' ? ' success' : '');
        el.textContent = msg;
        toastContainer.appendChild(el);
        setTimeout(() => el.remove(), 3000);
    }

    function updateCpDisplay() {
        cpValueEl.textContent = cp;
        document.querySelectorAll('.btn-use').forEach(btn => {
            const cost = parseInt(btn.dataset.cost, 10);
            if (!isNaN(cost)) btn.disabled = (cp < cost);
        });
    }

    function updateDpInfo() {
        const totalCost = selectedDetachments.reduce((s, d) => s + (d.cost || 0), 0);
        const remaining = startingDp - totalCost;
        cpInfo.textContent = `DP: ${dp} | Selected: ${totalCost} | Remaining: ${remaining}`;
    }

    function updateDetachmentInfo() {
        if (!selectedDetachments.length) {
            detachmentNameEl.textContent = '—';
            detachmentDescEl.innerHTML = '';
            if (detachmentCostDisplay) detachmentCostDisplay.textContent = '';
            detachmentInfoEl.classList.add('empty');
            return;
        }
        const names = selectedDetachments.map(d => d.name).join(', ');
        detachmentNameEl.textContent = 'Selected: ' + names;
        let descHtml = '';
        selectedDetachments.forEach(d => {
            descHtml += `<div class="detachment-item"><strong>${d.name}</strong> (${d.cost||0} DP): <span class="detachment-rule">${d.description||'No description'}</span></div>`;
        });
        detachmentDescEl.innerHTML = descHtml;
        const totalCost = selectedDetachments.reduce((s, d) => s + (d.cost || 0), 0);
        const remaining = startingDp - totalCost;
        if (detachmentCostDisplay) detachmentCostDisplay.textContent = `Total cost: ${totalCost} DP | Remaining: ${remaining} DP`;
        detachmentInfoEl.classList.remove('empty');
    }

    function addCp() {
        cp += doubleTap ? 2 : 1;
        updateCpDisplay();
        showToast('+' + (doubleTap ? 2 : 1) + ' CP', 'success');
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
        showToast(name + ' (' + cost + ' CP)', 'success');
    }

    function groupByPhase(list) {
        const phases = ['command', 'movement', 'shooting', 'charge', 'fight'];
        const grouped = {};
        phases.forEach(p => grouped[p] = []);
        list.forEach(s => {
            if (s.whe === 'always') {
                phases.forEach(p => grouped[p].push(s));
            } else if (s.whe === 'command') {
                if (grouped.command) grouped.command.push(s);
            } else {
                if (grouped[s.whe]) grouped[s.whe].push(s);
            }
        });
        const result = {};
        phases.forEach(p => { if (grouped[p].length) result[p] = grouped[p]; });
        return result;
    }

    function groupStratagems(items) {
        const yourTurn = items.filter(s => s.who === 'y' || s.who === 'a');
        const enemyTurn = items.filter(s => s.who === 'e' || s.who === 'a');
        return { yourTurn: groupByPhase(yourTurn), enemyTurn: groupByPhase(enemyTurn) };
    }

    function render() {
        if (isLoading) {
            container.innerHTML = '<div class="loader"></div><div class="loader"></div>';
            return;
        }
        if (!stratagems.length) {
            container.innerHTML = `
                <div class="category">
                    <div class="category-header"><h2>Stratagems</h2></div>
                    <div class="empty-state">No stratagems loaded for this selection.</div>
                </div>
            `;
            stratCountEl.textContent = '0';
            return;
        }

        stratCountEl.textContent = stratagems.length;
        const grouped = groupStratagems(stratagems);

        const renderCategory = (title, phaseGroups) => {
            const phaseKeys = Object.keys(phaseGroups);
            if (!phaseKeys.length) {
                return `<div class="category"><div class="category-header"><h2>${title}</h2><span class="badge">0</span></div><div class="empty-state">No stratagems</div></div>`;
            }
            let total = 0;
            phaseKeys.forEach(p => total += phaseGroups[p].length);
            let html = `<div class="category"><div class="category-header"><h2>${title}</h2><span class="badge">${total}</span></div><div class="category-body">`;
            const phaseOrder = ['command', 'movement', 'shooting', 'charge', 'fight'];
            phaseOrder.forEach(phase => {
                const items = phaseGroups[phase];
                if (!items || !items.length) return;
                html += `<div class="phase-group" data-phase="${phase}"><div class="phase-title">▸ ${formatPhase(phase)}</div><div class="phase-content">`;
                items.forEach(s => {
                    html += `
                        <div class="strat-card">
                            <div class="strat-info">
                                <div class="strat-name">${s.name} <span class="cost-badge">${s.cost} CP</span></div>
                                <div class="strat-desc">${s.description||''}</div>
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
        };

        container.innerHTML = renderCategory('Your Turn', grouped.yourTurn) + renderCategory('Enemy Turn', grouped.enemyTurn);

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

    function reloadStratagems() {
        const ids = selectedDetachments.map(d => d.id);
        if (JSON.stringify(ids) === JSON.stringify(lastLoadedIds)) return;
        lastLoadedIds = ids;

        if (!ids.length) {
            stratagems = [...coreStratagems];
            isLoading = false;
            render();
            updateDpInfo();
            updateDetachmentInfo();
            return;
        }

        isLoading = true;
        render();

        Promise.all(ids.map(id =>
            fetch(`assets/${id}.json`)
                .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status} for ${id}`); return res.json(); })
                .then(data => { if (!Array.isArray(data)) throw new Error(`Invalid JSON for ${id}`); return data; })
        )).then(results => {
            let allStratagems = [];
            results.forEach(data => allStratagems = allStratagems.concat(data));
            stratagems = [...coreStratagems, ...allStratagems];
            isLoading = false;
            render();
            const totalCost = selectedDetachments.reduce((s, d) => s + (d.cost || 0), 0);
            dp = Math.max(0, startingDp - totalCost);
            updateDpInfo();
            updateDetachmentInfo();
            showToast(`Loaded ${stratagems.length} stratagems (${coreStratagems.length} core + ${allStratagems.length} from ${ids.length} detachment(s))`, 'success');
        }).catch(err => {
            console.warn('Failed to load stratagems:', err.message);
            stratagems = [...coreStratagems];
            isLoading = false;
            render();
            showToast('Failed to load stratagems for one or more detachments', 'error');
        });
    }

    function renderDetachmentList(data) {
        detachmentList.innerHTML = '';
        if (!data || !data.length) {
            detachmentList.innerHTML = '<div class="detachment-empty">No detachments available</div>';
            return;
        }
        data.forEach(item => {
            const div = document.createElement('div');
            div.className = 'detachment-item';
            if (startingDp < (item.cost || 0)) div.classList.add('disabled');
            div.dataset.id = item.id;
            div.innerHTML = `<span class="detachment-name">${item.name}</span><span class="detachment-cost">${item.cost||0} DP</span>`;
            div.addEventListener('click', function() {
                if (this.classList.contains('disabled')) return;
                this.classList.toggle('selected');
                updateSelectedDetachments();
            });
            detachmentList.appendChild(div);
        });
    }

    function loadDetachments(factionId) {
        detachmentList.innerHTML = '<div class="detachment-empty">Loading...</div>';
        selectedDetachments = [];
        detachmentsData = [];
        stratagems = [...coreStratagems];
        lastLoadedIds = [];
        detachmentNameEl.textContent = '—';
        detachmentDescEl.innerHTML = '';
        if (detachmentCostDisplay) detachmentCostDisplay.textContent = '';
        detachmentInfoEl.classList.add('empty');
        render();

        if (!factionId) {
            detachmentList.innerHTML = '<div class="detachment-empty">Select a faction first</div>';
            return Promise.resolve();
        }

        return fetch(`factions/${factionId}.json`)
            .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
            .then(data => {
                if (Array.isArray(data) && data.length) {
                    detachmentsData = data;
                    renderDetachmentList(data);
                } else throw new Error('Invalid detachments data');
            })
            .catch(err => {
                console.warn('Failed to load detachments:', err.message);
                showToast('Failed to load detachments for this faction', 'error');
                detachmentList.innerHTML = '<div class="detachment-empty">Error loading detachments</div>';
                throw err;
            });
    }

    function loadFactions() {
        return fetch('core/list.json')
            .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
            .then(data => {
                if (Array.isArray(data) && data.length) {
                    data.forEach(item => {
                        const opt = document.createElement('option');
                        opt.value = item.id;
                        opt.textContent = item.name;
                        factionSelect.appendChild(opt);
                    });
                } else throw new Error('Invalid factions list');
            })
            .catch(err => {
                console.warn('Failed to load factions:', err.message);
                showToast('Failed to load factions list', 'error');
            });
    }

    function loadCoreData() {
        return fetch('core/core.json')
            .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
            .then(data => {
                if (Array.isArray(data) && data.length) {
                    coreStratagems = data;
                    stratagems = [...coreStratagems];
                    isLoading = false;
                    render();
                    showToast(`Loaded ${coreStratagems.length} core stratagems`, 'success');
                } else throw new Error('Invalid core.json');
            })
            .catch(err => {
                console.warn('Failed to load core.json:', err.message);
                showToast('Core stratagems not loaded', 'info');
                coreStratagems = [];
                stratagems = [];
                isLoading = false;
                render();
            });
    }

    function updateSelectedDetachments() {
        const selectedElements = detachmentList.querySelectorAll('.detachment-item.selected');
        const selectedIds = Array.from(selectedElements).map(el => el.dataset.id);
        selectedDetachments = detachmentsData.filter(d => selectedIds.includes(d.id));

        let totalCost = selectedDetachments.reduce((s, d) => s + (d.cost || 0), 0);
        if (totalCost > startingDp) {
            showToast(`Total cost (${totalCost}) exceeds available DP (${startingDp})!`, 'error');
            const last = selectedElements[selectedElements.length - 1];
            if (last) last.classList.remove('selected');
            const newSelected = detachmentList.querySelectorAll('.detachment-item.selected');
            const newIds = Array.from(newSelected).map(el => el.dataset.id);
            selectedDetachments = detachmentsData.filter(d => newIds.includes(d.id));
        }

        totalCost = selectedDetachments.reduce((s, d) => s + (d.cost || 0), 0);
        dp = Math.max(0, startingDp - totalCost);
        updateDpInfo();
        updateDetachmentInfo();
        reloadStratagems();
    }

    function updatestartingDp(points) {
        startingDp = (points === 500 || points === 1000) ? 2 : (points === 2000 || points === 3000) ? 3 : 0;

        detachmentList.querySelectorAll('.detachment-item').forEach(el => {
            const det = detachmentsData.find(d => d.id === el.dataset.id);
            if (det) {
                const cost = det.cost || 0;
                if (startingDp < cost) el.classList.add('disabled');
                else el.classList.remove('disabled');
            }
        });

        detachmentList.querySelectorAll('.detachment-item.selected').forEach(el => {
            if (el.classList.contains('disabled')) el.classList.remove('selected');
        });

        updateSelectedDetachments();
    }

    function onPointsChange(points) {
        document.querySelectorAll('.points-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.points) === points);
        });
        updatestartingDp(points);
    }

    function onFactionChange() {
        const factionId = factionSelect.value;
        selectedFactionId = factionId;
        selectedDetachments = [];
        detachmentsData = [];
        lastLoadedIds = [];
        stratagems = [...coreStratagems];
        render();
        detachmentNameEl.textContent = '—';
        detachmentDescEl.innerHTML = '';
        if (detachmentCostDisplay) detachmentCostDisplay.textContent = '';
        detachmentInfoEl.classList.add('empty');

        if (factionId) {
            loadDetachments(factionId).catch(err => {
                console.error(err);
                showToast('Error loading detachments for this faction', 'error');
                detachmentList.innerHTML = '<div class="detachment-empty">Error loading</div>';
            });
        } else {
            detachmentList.innerHTML = '<div class="detachment-empty">Select a faction first</div>';
        }
    }

    function init() {
        pointsGroup.querySelectorAll('.points-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                onPointsChange(parseInt(this.dataset.points));
            });
        });

        factionSelect.addEventListener('change', onFactionChange);

        chkDoubleCp.addEventListener('change', function() { doubleTap = this.checked; });
        btnAddCp.addEventListener('click', addCp);
        btnResetCp.addEventListener('click', resetCp);

        Promise.all([loadFactions(), loadCoreData()]);

        updateCpDisplay();
        updateDpInfo();
        detachmentList.innerHTML = '<div class="detachment-empty">Select a faction first</div>';
        detachmentInfoEl.classList.add('empty');
        detachmentNameEl.textContent = '—';
        detachmentDescEl.innerHTML = '';
        if (detachmentCostDisplay) detachmentCostDisplay.textContent = '';
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();