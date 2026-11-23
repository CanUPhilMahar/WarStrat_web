(function() {
    'use strict';

    const UI = window.WARSTRAT_UI || { en: {}, ru: {} };
    const PHASES = ['command', 'movement', 'shooting', 'charge', 'fight'];
    const PHASE_KEYS = {
        always: 'phaseAny',
        command: 'phaseCommand',
        movement: 'phaseMovement',
        shooting: 'phaseShooting',
        charge: 'phaseCharge',
        fight: 'phaseFight'
    };
    const WHO_KEYS = { y: 'whoYour', e: 'whoEnemy', a: 'whoAny' };

    // Bust the browser and GitHub Pages CDN cache so data edits (new detachments,
    // stratagems, translations) appear on the next reload instead of waiting for
    // the 10-minute cache TTL.
    const DATA_CACHE_BUST = String(Date.now());
    const fetchData = path => fetch(`${path}?v=${DATA_CACHE_BUST}`, { cache: 'no-store' });

    // state
    let cp = 0,
        doubleTap = false,
        isLoading = true,
        selectedFactionId = null,
        stratagems = [],
        coreStratagems = [],
        selectedDetachments = [],
        detachmentsData = [],
        factionsData = [],
        lastLoadedIds = [],
        ruData = null,
        glossary = [],
        glossaryMatcherCache = {},
        glossaryOpen = false,
        activeGlossaryId = null,
        isDetachmentsLoading = false,
        currentLang = getInitialLang();

    // DOM refs
    const $ = id => document.getElementById(id);
    const cpValueEl = $('cpValue');
    const btnAddCp = $('btnAddCp');
    const chkDoubleCp = $('chkDoubleCp');
    const btnResetCp = $('btnResetCp');
    const container = $('stratagemsContainer');
    const toastContainer = $('toastContainer');
    const footerTextEl = $('footerText');
    const factionSelect = $('factionSelect');
    const detachmentList = $('detachmentList');
    const detachmentNameEl = $('detachmentName');
    const detachmentDescEl = $('detachmentDesc');
    const detachmentInfoEl = $('detachmentInfo');
    const langSwitch = $('langSwitch');
    const glossaryToggle = $('glossaryToggle');
    const glossaryPanel = $('glossaryPanel');
    const glossaryClose = $('glossaryClose');
    const glossarySearch = $('glossarySearch');
    const glossaryList = $('glossaryList');
    const glossaryDetail = $('glossaryDetail');
    const glossaryBack = $('glossaryBack');
    const glossaryTerm = $('glossaryTerm');
    const glossaryDefinition = $('glossaryDefinition');

    // helpers
    const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    const escapeHtml = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ESCAPE_MAP[c]);
    const escapeAttr = escapeHtml;
    const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const WORD_CHAR = /[\p{L}\p{N}]/u;
    const isWordChar = ch => !!ch && WORD_CHAR.test(ch);

    function t(key, vars) {
        const dict = UI[currentLang] || UI.en || {};
        let value = dict[key];
        if (value == null) value = (UI.en && UI.en[key]) || key;
        return String(value).replace(/\{(\w+)\}/g, (match, name) => {
            return vars && vars[name] != null ? String(vars[name]) : match;
        });
    }

    function getInitialLang() {
        try {
            const saved = localStorage.getItem('warstrat_lang');
            if (saved === 'en' || saved === 'ru') return saved;
        } catch (e) { /* ignore */ }
        const nav = String(navigator.language || navigator.userLanguage || 'en').toLowerCase();
        return nav.indexOf('ru') === 0 ? 'ru' : 'en';
    }

    function footerKey(count) {
        if (currentLang !== 'ru') return count === 1 ? 'footerOne' : 'footerFew';
        const mod10 = count % 10,
            mod100 = count % 100;
        if (mod10 === 1 && mod100 !== 11) return 'footerOne';
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'footerFew';
        return 'footerMany';
    }

    function footerLabel(count) {
        return t(footerKey(count), { n: count });
    }

    function setDetachmentMessage(message) {
        detachmentList.innerHTML = `<div class="detachment-empty">${escapeHtml(message)}</div>`;
    }

    function showToast(msg, type) {
        const el = document.createElement('div');
        el.className = 'toast' + (type === 'error' ? ' error' : type === 'success' ? ' success' : '');
        el.textContent = msg;
        toastContainer.appendChild(el);
        setTimeout(() => el.remove(), 3000);
    }

    function localizedFactionName(item) {
        if (currentLang === 'ru' && ruData && ruData.factions && ruData.factions[item.id]) {
            return ruData.factions[item.id];
        }
        return item.name;
    }

    function localizedDetachment(detachment) {
        const tr = currentLang === 'ru' && ruData && ruData.detachments
            ? ruData.detachments[detachment.id]
            : null;
        return {
            name: (tr && tr.name) || detachment.name,
            description: (tr && tr.description) || detachment.description
        };
    }

    function localizedStratagem(stratagem) {
        const tr = currentLang === 'ru' && ruData && ruData.stratagems && ruData.stratagems[stratagem._sourceId]
            ? ruData.stratagems[stratagem._sourceId][stratagem.name]
            : null;
        return {
            name: (tr && tr.name) || stratagem.name,
            description: (tr && tr.description) || stratagem.description
        };
    }

    function formatPhase(phase) {
        return t(PHASE_KEYS[phase] || phase);
    }

    function formatWho(who) {
        return t(WHO_KEYS[who] || who);
    }

    function whoClass(who) {
        return 'who-' + who;
    }

    function applyUiText() {
        document.querySelectorAll('[data-ui]').forEach(el => {
            el.textContent = t(el.getAttribute('data-ui'));
        });
        if (glossarySearch) glossarySearch.placeholder = t('searchGlossary');
        if (glossaryClose) glossaryClose.setAttribute('aria-label', t('close'));
        if (langSwitch) langSwitch.setAttribute('aria-label', t('language'));
        document.title = t('pageTitle');
    }

    function updateLangButtons() {
        if (!langSwitch) return;
        langSwitch.querySelectorAll('.lang-btn').forEach(btn => {
            const active = btn.dataset.lang === currentLang;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', String(active));
        });
    }

    function setLanguage(lang, persist) {
        if (lang !== 'en' && lang !== 'ru') return;
        currentLang = lang;
        if (persist) {
            try { localStorage.setItem('warstrat_lang', lang); } catch (e) { /* ignore */ }
        }
        document.documentElement.lang = lang;
        applyUiText();
        updateLangButtons();
        renderFactionOptions();
        if (isDetachmentsLoading) {
            setDetachmentMessage(t('loading'));
        } else if (detachmentsData.length) {
            renderDetachmentList(detachmentsData);
        } else {
            setDetachmentMessage(selectedFactionId ? t('noDetachments') : t('selectFactionFirst'));
        }
        updateDetachmentInfo();
        render();
        if (glossaryOpen) {
            if (activeGlossaryId && !glossaryDetail.hidden) showGlossaryTerm(activeGlossaryId);
            else renderGlossaryList();
        }
    }

    function updateCpDisplay() {
        cpValueEl.textContent = cp;
        document.querySelectorAll('.btn-use').forEach(btn => {
            const cost = parseInt(btn.dataset.cost, 10);
            if (!isNaN(cost)) btn.disabled = (cp < cost);
        });
    }

    function updateDetachmentInfo() {
        const detachment = selectedDetachments[0];
        if (!detachment) {
            detachmentNameEl.textContent = '—';
            detachmentDescEl.innerHTML = '';
            detachmentInfoEl.classList.add('empty');
            return;
        }

        const tr = localizedDetachment(detachment);
        detachmentNameEl.textContent = t('selected', { names: tr.name });

        const description = tr.description || t('noDescription');
        detachmentDescEl.innerHTML = `<div class="detachment-item"><strong>${escapeHtml(tr.name)}</strong>: <span class="detachment-rule">${linkGlossaryTerms(description, currentLang)}</span></div>`;

        detachmentInfoEl.classList.remove('empty');
    }

    function addCp() {
        const amount = doubleTap ? 2 : 1;
        cp += amount;
        updateCpDisplay();
        showToast('+' + amount + ' CP', 'success');
    }

    function resetCp() {
        cp = 0;
        updateCpDisplay();
        showToast(t('toastCpReset'), 'info');
    }

    function useStratagem(cost, name) {
        if (cp < cost) {
            showToast(t('toastNotEnoughCp', { cost, cp }), 'error');
            return;
        }
        cp -= cost;
        updateCpDisplay();
        showToast(t('toastUse', { name, cost }), 'success');
    }

    function groupByPhase(list) {
        const grouped = {};
        PHASES.forEach(phase => grouped[phase] = []);
        list.forEach(stratagem => {
            if (stratagem.whe === 'always') {
                PHASES.forEach(phase => grouped[phase].push(stratagem));
            } else if (grouped[stratagem.whe]) {
                grouped[stratagem.whe].push(stratagem);
            }
        });
        const result = {};
        PHASES.forEach(phase => { if (grouped[phase].length) result[phase] = grouped[phase]; });
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
            footerTextEl.textContent = footerLabel(0);
            return;
        }
        if (!stratagems.length) {
            container.innerHTML = `
                <div class="category">
                    <div class="category-header"><h2>${escapeHtml(t('stratagems'))}</h2></div>
                    <div class="empty-state">${escapeHtml(t('noStratagemsLoaded'))}</div>
                </div>
            `;
            footerTextEl.textContent = footerLabel(0);
            return;
        }

        footerTextEl.textContent = footerLabel(stratagems.length);
        const grouped = groupStratagems(stratagems);

        const renderCategory = (title, phaseGroups) => {
            const phaseKeys = Object.keys(phaseGroups);
            if (!phaseKeys.length) {
                return `<div class="category"><div class="category-header"><h2>${escapeHtml(title)}</h2><span class="badge">0</span></div><div class="empty-state">${escapeHtml(t('noStratagems'))}</div></div>`;
            }
            let total = 0;
            phaseKeys.forEach(phase => total += phaseGroups[phase].length);
            let html = `<div class="category"><div class="category-header"><h2>${escapeHtml(title)}</h2><span class="badge">${total}</span></div><div class="category-body">`;
            PHASES.forEach(phase => {
                const items = phaseGroups[phase];
                if (!items || !items.length) return;
                html += `<div class="phase-group" data-phase="${phase}"><div class="phase-title">${escapeHtml(formatPhase(phase))}</div><div class="phase-content">`;
                items.forEach(stratagem => {
                    const tr = localizedStratagem(stratagem);
                    html += `
                        <div class="strat-card">
                            <div class="strat-info">
                                <div class="strat-name">${escapeHtml(tr.name)} <span class="cost-badge">${stratagem.cost} CP</span></div>
                                <div class="strat-desc">${linkGlossaryTerms(tr.description || '', currentLang)}</div>
                                <div class="strat-meta">
                                    <span class="tag">${escapeHtml(formatPhase(stratagem.whe))}</span>
                                    <span class="tag ${whoClass(stratagem.who)}">${escapeHtml(formatWho(stratagem.who))}</span>
                                </div>
                            </div>
                            <div class="strat-action">
                                <button class="btn btn-use" data-cost="${stratagem.cost}" data-name="${escapeAttr(tr.name)}" ${cp < stratagem.cost ? 'disabled' : ''}>
                                    ${escapeHtml(t('use'))} <span class="cp-cost">${stratagem.cost} CP</span>
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

        container.innerHTML = renderCategory(t('yourTurn'), grouped.yourTurn) + renderCategory(t('enemyTurn'), grouped.enemyTurn);

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
                this.parentElement.classList.toggle('collapsed');
            });
        });

        container.querySelectorAll('.category-header').forEach(header => {
            header.addEventListener('click', function() {
                this.parentElement.classList.toggle('collapsed');
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
            updateDetachmentInfo();
            return;
        }

        isLoading = true;
        render();

        Promise.all(ids.map(id =>
            fetchData(`assets/${id}.json`)
                .then(res => {
                    if (!res.ok) throw new Error(`HTTP ${res.status} for ${id}`);
                    return res.json();
                })
                .then(data => {
                    if (!Array.isArray(data)) throw new Error(`Invalid JSON for ${id}`);
                    return data.map(stratagem => Object.assign({}, stratagem, { _sourceId: id }));
                })
        )).then(results => {
            let allStratagems = [];
            results.forEach(data => allStratagems = allStratagems.concat(data));
            stratagems = [...coreStratagems, ...allStratagems];
            isLoading = false;
            render();
            updateDetachmentInfo();
            showToast(t('toastLoaded', {
                count: stratagems.length,
                core: coreStratagems.length,
                asset: allStratagems.length
            }), 'success');
        }).catch(err => {
            console.warn('Failed to load stratagems:', err.message);
            stratagems = [...coreStratagems];
            isLoading = false;
            render();
            showToast(t('toastLoadFailed'), 'error');
        });
    }

    function renderDetachmentList(data) {
        detachmentList.innerHTML = '';
        if (!data || !data.length) {
            setDetachmentMessage(t('noDetachments'));
            return;
        }
        const selectedIds = new Set(selectedDetachments.map(d => d.id));
        data.forEach(item => {
            const div = document.createElement('div');
            div.className = 'detachment-item';
            if (selectedIds.has(item.id)) div.classList.add('selected');
            div.dataset.id = item.id;
            const tr = localizedDetachment(item);
            div.innerHTML = `<span class="detachment-name">${escapeHtml(tr.name)}</span>`;
            div.addEventListener('click', function() {
                const wasSelected = this.classList.contains('selected');
                detachmentList.querySelectorAll('.detachment-item.selected').forEach(el => el.classList.remove('selected'));
                if (!wasSelected) this.classList.add('selected');
                updateSelectedDetachments();
            });
            detachmentList.appendChild(div);
        });
    }

    function loadDetachments(factionId) {
        isDetachmentsLoading = true;
        setDetachmentMessage(t('loading'));
        selectedDetachments = [];
        detachmentsData = [];
        stratagems = [...coreStratagems];
        lastLoadedIds = [];
        detachmentNameEl.textContent = '—';
        detachmentDescEl.innerHTML = '';
        detachmentInfoEl.classList.add('empty');
        render();

        if (!factionId) {
            isDetachmentsLoading = false;
            setDetachmentMessage(t('selectFactionFirst'));
            return Promise.resolve();
        }

        return fetchData(`factions/${factionId}.json`)
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then(data => {
                if (Array.isArray(data) && data.length) {
                    detachmentsData = data;
                    renderDetachmentList(data);
                } else {
                    throw new Error('Invalid detachments data');
                }
            })
            .catch(err => {
                console.warn('Failed to load detachments:', err.message);
                setDetachmentMessage(t('errorLoadingDetachments'));
                showToast(t('toastDetachmentLoadFailed'), 'error');
                throw err;
            })
            .finally(() => {
                isDetachmentsLoading = false;
            });
    }

    function renderFactionOptions() {
        if (!factionSelect) return;
        const wanted = selectedFactionId || '';
        factionSelect.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = t('selectFaction');
        factionSelect.appendChild(placeholder);
        factionsData.forEach(item => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = localizedFactionName(item);
            factionSelect.appendChild(option);
        });
        factionSelect.value = factionsData.some(f => f.id === wanted) ? wanted : '';
    }

    function loadFactions() {
        return fetchData('core/list.json')
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then(data => {
                if (Array.isArray(data) && data.length) {
                    factionsData = data;
                    renderFactionOptions();
                } else {
                    throw new Error('Invalid factions list');
                }
            })
            .catch(err => {
                console.warn('Failed to load factions:', err.message);
                showToast(t('toastFactionsLoadFailed'), 'error');
            });
    }

    function loadCoreData() {
        return fetchData('core/core.json')
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then(data => {
                if (Array.isArray(data) && data.length) {
                    coreStratagems = data.map(stratagem => Object.assign({}, stratagem, { _sourceId: 'core' }));
                    stratagems = [...coreStratagems];
                    isLoading = false;
                    render();
                    showToast(t('toastLoadedCore', { count: coreStratagems.length }), 'success');
                } else {
                    throw new Error('Invalid core.json');
                }
            })
            .catch(err => {
                console.warn('Failed to load core.json:', err.message);
                showToast(t('toastCoreNotLoaded'), 'info');
                coreStratagems = [];
                stratagems = [];
                isLoading = false;
                render();
            });
    }

    function updateSelectedDetachments() {
        const selectedEl = detachmentList.querySelector('.detachment-item.selected');
        const selectedId = selectedEl ? selectedEl.dataset.id : null;
        selectedDetachments = selectedId ? detachmentsData.filter(d => d.id === selectedId) : [];
        updateDetachmentInfo();
        reloadStratagems();
    }

    function onFactionChange() {
        selectedFactionId = factionSelect.value;
        selectedDetachments = [];
        detachmentsData = [];
        lastLoadedIds = [];
        stratagems = [...coreStratagems];
        render();
        loadDetachments(selectedFactionId).catch(err => console.error(err));
    }

    function getGlossaryMatchers(lang) {
        if (glossaryMatcherCache[lang]) return glossaryMatcherCache[lang];
        const matchers = [];
        glossary.forEach(entry => {
            if (!entry.autoLink) return;
            const base = lang === 'ru'
                ? [entry.term_ru].concat(entry.aliases_ru || [])
                : [entry.term].concat(entry.aliases || []);
            const seen = new Set();
            base.forEach(form => {
                if (!form || form.length < 2 || seen.has(form)) return;
                if (/[()[\]\/]/.test(form)) return;
                seen.add(form);
                matchers.push({
                    entry,
                    form,
                    regex: new RegExp(escapeRegExp(form), 'giu')
                });
            });
        });
        matchers.sort((a, b) => b.form.length - a.form.length);
        glossaryMatcherCache[lang] = matchers;
        return matchers;
    }

    function linkGlossaryTerms(text, lang) {
        const source = String(text == null ? '' : text);
        if (!source || !glossary.length) return escapeHtml(source);
        const ranges = [];
        getGlossaryMatchers(lang).forEach(matcher => {
            if (ranges.some(range => range.id === matcher.entry.id)) return;
            matcher.regex.lastIndex = 0;
            for (const match of source.matchAll(matcher.regex)) {
                const start = match.index;
                const end = start + match[0].length;
                if (start > 0 && isWordChar(source[start - 1]) && isWordChar(match[0][0])) continue;
                if (end < source.length && isWordChar(source[end]) && isWordChar(match[0][match[0].length - 1])) continue;
                if (ranges.some(range => start < range.end && end > range.start)) continue;
                ranges.push({ start, end, id: matcher.entry.id, label: match[0] });
                break;
            }
        });
        ranges.sort((a, b) => a.start - b.start);
        let html = '';
        let position = 0;
        ranges.forEach(range => {
            html += escapeHtml(source.slice(position, range.start));
            const title = t('glossaryLinkTitle', { term: range.label });
            html += `<a href="#" class="glossary-link" data-glossary="${escapeAttr(range.id)}" title="${escapeAttr(title)}">${escapeHtml(range.label)}</a>`;
            position = range.end;
        });
        html += escapeHtml(source.slice(position));
        return html;
    }

    function glossaryDisplayTerm(entry) {
        return currentLang === 'ru' ? entry.term_ru : entry.term;
    }

    function glossaryDisplayDefinition(entry) {
        return currentLang === 'ru' ? entry.definition_ru : entry.definition;
    }

    function renderGlossaryList() {
        if (!glossary.length) {
            glossaryList.innerHTML = `<div class="glossary-empty">${escapeHtml(t('glossaryUnavailable'))}</div>`;
            return;
        }
        const query = glossarySearch.value.trim().toLocaleLowerCase(currentLang);
        const items = glossary.filter(entry => {
            if (!query) return true;
            const haystack = [entry.term, entry.term_ru, entry.definition, entry.definition_ru]
                .concat(entry.aliases || [], entry.aliases_ru || [])
                .join(' ')
                .toLocaleLowerCase(currentLang);
            return haystack.indexOf(query) !== -1;
        });
        items.sort((a, b) => glossaryDisplayTerm(a).localeCompare(glossaryDisplayTerm(b), currentLang));
        if (!items.length) {
            glossaryList.innerHTML = `<div class="glossary-empty">${escapeHtml(t('noGlossaryResults'))}</div>`;
            return;
        }
        glossaryList.innerHTML = items.map(entry => (
            `<button type="button" class="glossary-item" data-term="${escapeAttr(entry.id)}">${escapeHtml(glossaryDisplayTerm(entry))}</button>`
        )).join('');
    }

    function showGlossaryTerm(termId) {
        const entry = glossary.find(item => item.id === termId);
        if (!entry) return;
        activeGlossaryId = termId;
        glossaryList.hidden = true;
        glossaryDetail.hidden = false;
        glossaryTerm.textContent = glossaryDisplayTerm(entry);
        glossaryDefinition.textContent = glossaryDisplayDefinition(entry);
    }

    function showGlossaryList() {
        activeGlossaryId = null;
        glossaryDetail.hidden = true;
        glossaryList.hidden = false;
        renderGlossaryList();
        glossarySearch.focus();
    }

    function openGlossary(termId) {
        glossaryOpen = true;
        glossaryPanel.hidden = false;
        glossaryToggle.setAttribute('aria-expanded', 'true');
        if (termId) {
            showGlossaryTerm(termId);
            glossaryPanel.focus();
        } else {
            glossarySearch.value = '';
            showGlossaryList();
        }
    }

    function closeGlossary(returnFocus) {
        glossaryOpen = false;
        activeGlossaryId = null;
        glossaryPanel.hidden = true;
        glossaryToggle.setAttribute('aria-expanded', 'false');
        if (returnFocus) glossaryToggle.focus();
    }

    function loadRuData() {
        return fetchData('lang/ru.json')
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then(data => {
                ruData = data;
            })
            .catch(err => {
                console.warn('Failed to load Russian translations:', err.message);
                if (currentLang === 'ru') showToast(t('toastTranslationsFailed'), 'error');
            });
    }

    function loadGlossary() {
        return fetchData('core/glossary.json')
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then(data => {
                if (!Array.isArray(data)) throw new Error('Invalid glossary data');
                glossary = data;
                glossaryMatcherCache = {};
            })
            .catch(err => {
                console.warn('Failed to load glossary:', err.message);
                glossary = [];
                glossaryMatcherCache = {};
            });
    }

    function bindUi() {
        factionSelect.addEventListener('change', onFactionChange);

        chkDoubleCp.addEventListener('change', function() { doubleTap = this.checked; });
        btnAddCp.addEventListener('click', addCp);
        btnResetCp.addEventListener('click', resetCp);

        langSwitch.querySelectorAll('.lang-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                if (this.dataset.lang !== currentLang) setLanguage(this.dataset.lang, true);
            });
        });

        glossaryToggle.addEventListener('click', function() {
            if (glossaryOpen) closeGlossary(true);
            else openGlossary(null);
        });
        glossaryClose.addEventListener('click', function() { closeGlossary(true); });
        glossaryBack.addEventListener('click', showGlossaryList);
        glossarySearch.addEventListener('input', function() {
            activeGlossaryId = null;
            glossaryDetail.hidden = true;
            glossaryList.hidden = false;
            renderGlossaryList();
        });
        glossaryList.addEventListener('click', function(e) {
            const btn = e.target.closest('.glossary-item');
            if (btn) showGlossaryTerm(btn.dataset.term);
        });

        document.addEventListener('click', function(e) {
            const link = e.target.closest('.glossary-link');
            if (link) {
                e.preventDefault();
                openGlossary(link.dataset.glossary);
                return;
            }
            if (glossaryOpen && !e.target.closest('#glossaryPanel') && !e.target.closest('#glossaryToggle')) {
                closeGlossary(false);
            }
        });

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && glossaryOpen) closeGlossary(true);
        });
    }

    function init() {
        setLanguage(getInitialLang(), false);
        bindUi();
        updateCpDisplay();

        Promise.all([loadRuData(), loadGlossary()])
            .then(() => {
                setLanguage(currentLang, false);
                return Promise.all([loadFactions(), loadCoreData()]);
            })
            .catch(err => console.error(err));
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
