(function() {
    'use strict';

    // --- state ---
    let cp = 0;
    let doubleTap = false;
    let stratagems = [];
    let isLoading = true;

    // --- DOM refs ---
    const cpValueEl = document.getElementById('cpValue');
    const btnAddCp = document.getElementById('btnAddCp');
    const chkDoubleCp = document.getElementById('chkDoubleCp');
    const btnResetCp = document.getElementById('btnResetCp');
    const container = document.getElementById('stratagemsContainer');
    const toastContainer = document.getElementById('toastContainer');
    const stratCountEl = document.getElementById('stratCount');

    // --- inject minimal styles for collapsing ---
    (function injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .category.collapsed .category-body {
                display: none;
            }
            .category-header {
                cursor: pointer;
                user-select: none;
            }
            .category-header:hover {
                background: #2a221c;
            }
            .phase-group .phase-content {
                transition: max-height 0.25s ease, opacity 0.2s ease;
                overflow: hidden;
                max-height: 2000px;
                opacity: 1;
            }
            .phase-group.collapsed .phase-content {
                max-height: 0;
                opacity: 0;
                padding: 0;
            }
            .phase-title {
                cursor: pointer;
                user-select: none;
                transition: background 0.1s;
            }
            .phase-title:hover {
                background: #2a221c;
            }
            .phase-title::before {
                content: "▼ ";
                font-size: 0.7rem;
                display: inline-block;
                transition: transform 0.2s;
            }
            .phase-group.collapsed .phase-title::before {
                content: "▶ ";
            }
        `;
        document.head.appendChild(style);
    })();

    // --- helpers (English, with "Command" for always and command) ---
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

    // --- update CP UI ---
    function updateCpDisplay(animate) {
        cpValueEl.textContent = cp;
        document.querySelectorAll('.btn-use').forEach(btn => {
            const cost = parseInt(btn.dataset.cost, 10);
            if (!isNaN(cost)) btn.disabled = (cp < cost);
        });
    }

    // --- actions ---
    function addCp() {
        cp += doubleTap ? 2 : 1;
        updateCpDisplay(true);
    }
    function resetCp() {
        cp = 0;
        updateCpDisplay(true);
        showToast('CP reset to 0', 'info');
    }
    function useStratagem(cost, name) {
        if (cp < cost) {
            showToast(`Not enough CP! Need ${cost}, have ${cp}`, 'error');
            return;
        }
        cp -= cost;
        updateCpDisplay(true);
        showToast(`✅ ${name} (${cost} CP)`, 'success');
    }

    // --- grouping: now command phase includes always + command ---
    function groupByPhase(list) {
        const phases = ['command', 'movement', 'shooting', 'charge', 'fight'];
        const grouped = {};
        phases.forEach(p => grouped[p] = []);

        list.forEach(s => {
            if (s.whe === 'always') {
                // add to every phase
                phases.forEach(p => grouped[p].push(s));
            } else if (s.whe === 'command') {
                // add only to command phase
                if (grouped['command']) grouped['command'].push(s);
            } else {
                // add only to its own phase if it exists in phases
                if (grouped[s.whe]) {
                    grouped[s.whe].push(s);
                }
                // else ignore (should not happen with valid data)
            }
        });

        // remove empty phases
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
                    <div class="empty-state">No stratagems loaded.<br />Place <code>assets/core.json</code></div>
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

        // --- attach events ---
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

        updateCpDisplay(false);
    }

    // --- load data ---
    function loadData() {
        isLoading = true;
        render();
        fetch('assets/core.json')
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then(data => {
                if (Array.isArray(data) && data.length) {
                    stratagems = data;
                } else {
                    throw new Error('Invalid JSON format');
                }
                isLoading = false;
                render();
                showToast(`Loaded ${stratagems.length} stratagems`, 'success');
            })
            .catch(err => {
                console.warn('Failed to load core.json:', err.message);
                stratagems = [];
                isLoading = false;
                render();
                showToast('❌ Failed to load stratagems. Check assets/core.json', 'error');
            });
    }

    // --- init ---
    function init() {
        chkDoubleCp.addEventListener('change', function() { doubleTap = this.checked; });
        btnAddCp.addEventListener('click', addCp);
        btnResetCp.addEventListener('click', resetCp);
        loadData();
        updateCpDisplay(false);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();