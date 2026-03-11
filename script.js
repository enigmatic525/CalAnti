// My Tracker App Logic
document.addEventListener('DOMContentLoaded', () => {
    // ---- State & Migration ----
    let oldState = JSON.parse(localStorage.getItem('calorieTrackerStateV2') || '{}');
    let appState = JSON.parse(localStorage.getItem('myTrackerAppState') || 'null');
    
    if (!appState) {
        appState = {
            calories: {
                goal: oldState.goal || 2000,
                maintenance: oldState.maintenance || 2500,
                history: oldState.history || {}
            },
            weight: { history: {} },
            lifts: {
                exercises: [
                    { id: '1', name: 'Bench', group: 'push' },
                    { id: '2', name: 'Incline Smith', group: 'push' },
                    { id: '3', name: 'Cable Pushdown', group: 'push' },
                    { id: '4', name: 'Lateral Raise', group: 'push' },
                    { id: '5', name: 'Pull Ups', group: 'pull' },
                    { id: '6', name: 'Low Row', group: 'pull' },
                    { id: '7', name: 'Dumbbell Curl', group: 'pull' },
                    { id: '8', name: 'Squat', group: 'legs' },
                    { id: '9', name: 'Deadlift', group: 'legs' }
                ],
                history: {}
            },
            settings: { tutorialShown: false }
        };
        saveState();
    }

    let presets = JSON.parse(localStorage.getItem('calorieTrackerPresets') || 'null') || [
        { id: 1, name: 'Apple', calories: 95 },
        { id: 2, name: 'Banana', calories: 105 },
        { id: 3, name: 'Coffee', calories: 5 },
        { id: 4, name: 'Protein Shake', calories: 150 }
    ];

    function saveState() {
        localStorage.setItem('myTrackerAppState', JSON.stringify(appState));
        localStorage.setItem('calorieTrackerPresets', JSON.stringify(presets));
    }

    function getDateString(d) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    let currentDateString = getDateString(new Date());
    let viewingDateString = currentDateString;

    // Default missing current dates to maintenance
    if (appState.calories.history[currentDateString] === undefined) {
        appState.calories.history[currentDateString] = appState.calories.maintenance;
        saveState();
    }

    // ---- DOM Elements ----
    const q = sel => document.querySelector(sel);
    const qAll = sel => document.querySelectorAll(sel);
    const getId = id => document.getElementById(id);

    const updateDateElements = () => {
        const d = new Date(viewingDateString + 'T12:00:00');
        getId('current-date').textContent = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

        if (viewingDateString === currentDateString) {
            getId('day-label').textContent = 'Today';
            getId('btn-next-day').disabled = true;
        } else {
            const currentD = new Date(currentDateString + 'T12:00:00');
            const diffDays = Math.round((currentD - d) / (1000 * 3600 * 24));
            getId('day-label').textContent = diffDays === 1 ? 'Yesterday' : `${diffDays} days ago`;
            getId('btn-next-day').disabled = false;
        }
    };

    getId('btn-prev-day').addEventListener('click', () => {
        const d = new Date(viewingDateString + 'T12:00:00');
        d.setDate(d.getDate() - 1);
        viewingDateString = getDateString(d);
        if (appState.calories.history[viewingDateString] === undefined) {
            appState.calories.history[viewingDateString] = appState.calories.maintenance;
            saveState();
        }
        updateDateElements();
        updateCaloriesUI();
    });

    getId('btn-next-day').addEventListener('click', () => {
        if (getId('btn-next-day').disabled) return;
        const d = new Date(viewingDateString + 'T12:00:00');
        d.setDate(d.getDate() + 1);
        viewingDateString = getDateString(d);
        if (appState.calories.history[viewingDateString] === undefined) {
            appState.calories.history[viewingDateString] = appState.calories.maintenance;
            saveState();
        }
        updateDateElements();
        updateCaloriesUI();
    });

    // ---- Tabs Logic ----
    qAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.getAttribute('data-target');
            qAll('.nav-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            qAll('.tab-pane').forEach(p => p.classList.remove('active'));
            getId(target).classList.add('active');
            if(target === 'tab-calories') updateCaloriesUI();
            if(target === 'tab-weight') updateWeightUI();
            if(target === 'tab-lifts') renderLiftsList();
        });
    });

    // ---- SVG Mapping ----
    function mapLinePath(dataPointsList, svgPathId) {
        const pathEl = getId(svgPathId);
        if (!dataPointsList || dataPointsList.length < 2) {
            if(dataPointsList && dataPointsList.length === 1) pathEl.setAttribute('d', `M 0 50 L 100 50`);
            else pathEl.setAttribute('d', '');
            return;
        }
        const yVals = dataPointsList.map(d => d.y);
        const minZ = Math.min(...yVals) * 0.98;
        const maxZ = Math.max(...yVals) * 1.02;
        const yDiff = maxZ - minZ || 1; 

        const times = dataPointsList.map(d => d.time);
        const minT = Math.min(...times);
        const maxT = Math.max(...times);
        const tDiff = maxT - minT || 1;

        let getX = t => ((t - minT) / tDiff) * 100;
        let getY = val => 100 - ((val - minZ) / yDiff * 100);

        let path = `M ${getX(times[0])} ${getY(yVals[0])}`;
        for(let i=1; i<dataPointsList.length; i++) {
            path += ` L ${getX(times[i])} ${getY(yVals[i])}`;
        }
        pathEl.setAttribute('d', path);
    }

    // ---- Calories Logic ----
    function renderChart() {
        const barsEl = getId('chart-bars');
        const labelsEl = getId('chart-labels-row');
        barsEl.innerHTML = ''; labelsEl.innerHTML = '';
        const goalLine = getId('chart-goal-line');
        const maintLine = getId('chart-maintenance-line');
        const diffLabel = getId('weekly-difference-label');

        let viewD = new Date(viewingDateString + 'T12:00:00');
        let maxCals = Math.max(appState.calories.goal, appState.calories.maintenance);
        let historyData = [];
        let weeklyDiff = 0;

        for (let i = 6; i >= 0; i--) {
            let tempD = new Date(viewD.getTime() - i * 86400000);
            let dStr = getDateString(tempD);
            let c = appState.calories.history[dStr] !== undefined ? appState.calories.history[dStr] : appState.calories.maintenance;
            if (c > maxCals) maxCals = c;
            if (c > 0) weeklyDiff += (c - appState.calories.maintenance);
            historyData.push({ dateStr: dStr, cals: c, label: tempD.toLocaleDateString('en-US', { weekday: 'narrow' }) });
        }

        let lbsDiff = (weeklyDiff / 3500).toFixed(2);
        let lbsSign = weeklyDiff > 0 ? '+' : '';
        diffLabel.textContent = `This Week: ${weeklyDiff > 0 ? '+' : ''}${weeklyDiff} Calories, ${lbsSign}${lbsDiff} lbs`;
        const chartMax = maxCals * 1.2;
        goalLine.style.bottom = `${Math.min((appState.calories.goal / chartMax) * 100, 100)}%`;
        maintLine.style.bottom = `${Math.min((appState.calories.maintenance / chartMax) * 100, 100)}%`;

        historyData.forEach(item => {
            const isViewingDay = item.dateStr === viewingDateString;
            const hPct = Math.min((item.cals / chartMax) * 100, 100);
            const col = document.createElement('div');
            col.className = `chart-col ${isViewingDay ? 'active' : ''}`;
            
            const diffFromMaint = item.cals - appState.calories.maintenance;
            const diffText = diffFromMaint === 0 ? '0' : `${diffFromMaint > 0 ? '+' : ''}${diffFromMaint}`;
            
            col.innerHTML = `
                <div class="chart-bar-wrapper">
                    <div class="bar-diff-text">${diffText}</div>
                    <div class="chart-bar ${isViewingDay ? 'active' : ''}" style="height: ${Math.max(hPct, 2)}%;"></div>
                </div>
            `;
            barsEl.appendChild(col);

            const labelEl = document.createElement('div');
            labelEl.className = 'chart-label';
            if (isViewingDay) { labelEl.style.color = 'var(--text-primary)'; labelEl.style.fontWeight = '600'; }
            labelEl.textContent = item.label;
            labelsEl.appendChild(labelEl);
        });
    }

    function updateCaloriesUI() {
        let cals = appState.calories.history[viewingDateString] ?? appState.calories.maintenance;
        getId('calories-current').textContent = cals;
        getId('metric-goal-val').textContent = appState.calories.goal;
        getId('metric-maint-val').textContent = appState.calories.maintenance;

        let diff = appState.calories.goal - cals;
        getId('calories-left').textContent = diff >= 0 ? `${diff} remaining` : `${Math.abs(diff)} over`;

        let pb = getId('progress-bar-fill');
        pb.style.width = `${Math.min((cals / appState.calories.goal) * 100, 100)}%`;
        pb.style.background = cals > appState.calories.goal ? 'var(--danger)' : 'var(--accent-primary)';
        pb.style.boxShadow = cals > appState.calories.goal ? '0 0 10px rgba(239, 68, 68, 0.3)' : '0 0 10px rgba(139, 92, 246, 0.3)';

        renderChart();
        renderPresets();
    }

    function adjustCalories(amount) {
        let current = appState.calories.history[viewingDateString] ?? appState.calories.maintenance;
        current = Math.max(0, current + amount);
        appState.calories.history[viewingDateString] = current;
        getId('calories-current').style.transform = 'scale(1.1)';
        setTimeout(() => getId('calories-current').style.transform = 'scale(1)', 150);
        saveState();
        updateCaloriesUI();
    }

    getId('btn-minus-100').addEventListener('click', () => adjustCalories(-100));
    getId('btn-minus-50').addEventListener('click', () => adjustCalories(-50));
    getId('btn-plus-50').addEventListener('click', () => adjustCalories(50));
    getId('btn-plus-100').addEventListener('click', () => adjustCalories(100));

    // ---- Presets ----
    function renderPresets() {
        const grid = getId('presets-grid');
        grid.innerHTML = '';
        presets.forEach(p => {
            let el = document.createElement('div');
            el.className = 'preset-card';
            el.innerHTML = `
                <div class="preset-info">
                    <div class="preset-name">${p.name}</div>
                    <div class="preset-cal">${p.calories > 0 ? '+' : ''}${p.calories}</div>
                </div>
                <button class="preset-delete" data-id="${p.id}" aria-label="Delete preset">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
            `;
            el.addEventListener('click', (e) => {
                if(e.target.closest('.preset-delete')) return;
                adjustCalories(p.calories);
            });
            el.querySelector('.preset-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                presets = presets.filter(pr => pr.id !== p.id);
                saveState();
                renderPresets();
            });
            grid.appendChild(el);
        });
    }

    // ---- Weight Logic ----
    let weightRange = 'month';
    qAll('#weight-chart-toggles .chart-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            qAll('#weight-chart-toggles .chart-toggle').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            weightRange = btn.getAttribute('data-range');
            updateWeightUI();
        });
    });

    function updateWeightUI() {
        let points = [];
        let now = new Date();
        let past = new Date();
        if (weightRange === 'week') past.setDate(now.getDate() - 7);
        if (weightRange === 'month') past.setMonth(now.getMonth() - 1);
        if (weightRange === 'year') past.setFullYear(now.getFullYear() - 1);
        
        for (let dStr in appState.weight.history) {
            let dDate = new Date(dStr + 'T12:00:00');
            if (dDate >= past && dDate <= now) {
                points.push({ time: dDate.getTime(), y: appState.weight.history[dStr] });
            }
        }
        points.sort((a,b) => a.time - b.time);
        mapLinePath(points, 'weight-chart-line');
        getId('weight-input').value = appState.weight.history[currentDateString] || 0.0;
    }

    getId('btn-weight-minus').addEventListener('click', () => {
        let v = parseFloat(getId('weight-input').value) || 0;
        getId('weight-input').value = Math.max(0, v - 1.0).toFixed(1);
    });
    getId('btn-weight-plus').addEventListener('click', () => {
        let v = parseFloat(getId('weight-input').value) || 0;
        getId('weight-input').value = (v + 1.0).toFixed(1);
    });
    getId('btn-save-weight').addEventListener('click', () => {
        let v = parseFloat(getId('weight-input').value);
        if(!isNaN(v) && v > 0) {
            appState.weight.history[currentDateString] = v;
            saveState();
            updateWeightUI();
        }
    });

    // ---- Lifts Logic ----
    let currentPpl = 'push';
    let activeLiftId = null;

    qAll('.ppl-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            currentPpl = btn.getAttribute('data-ppl');
            renderLiftsList();
        });
    });

    getId('btn-back-lifts').addEventListener('click', renderLiftsList);

    function renderLiftsList() {
        getId('lifts-main-view').style.display = 'block';
        getId('lift-detail-view').style.display = 'none';

        qAll('.ppl-toggle').forEach(btn => {
            if(btn.getAttribute('data-ppl') === currentPpl) {
                btn.className = 'btn btn-primary ppl-toggle active';
            } else {
                btn.className = 'btn btn-secondary ppl-toggle';
            }
        });

        const listEl = getId('lifts-list');
        listEl.innerHTML = '';
        appState.lifts.exercises.filter(e => e.group === currentPpl).forEach(ex => {
            let item = document.createElement('div');
            item.className = 'lift-item';
            let recentErm = 0;
            if(appState.lifts.history[ex.id]) {
                const dates = Object.keys(appState.lifts.history[ex.id]).sort().reverse();
                if(dates.length > 0) {
                    const sets = appState.lifts.history[ex.id][dates[0]];
                    recentErm = Math.max(...sets.map(s => s.weight * (1 + s.reps/30)));
                }
            }
            item.innerHTML = `<span class="lift-name">${ex.name}</span><div style="display:flex;align-items:center;gap:8px;"><span class="lift-stats">${recentErm > 0 ? Math.round(recentErm)+'lbs 1RM' : ''}</span><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></div>`;
            item.addEventListener('click', () => openLiftDetail(ex.id));
            listEl.appendChild(item);
        });
    }

    function openLiftDetail(id) {
        activeLiftId = id;
        const ex = appState.lifts.exercises.find(e => e.id === id);
        getId('lift-detail-title').textContent = ex.name;
        getId('lifts-main-view').style.display = 'none';
        getId('lift-detail-view').style.display = 'flex';
        updateLiftDetailUI();
    }

    function updateLiftDetailUI() {
        let history = appState.lifts.history[activeLiftId] || {};
        let points = [];
        for(let dStr in history) {
            let max1RM = Math.max(...history[dStr].map(s => s.weight * (1 + s.reps/30)));
            if(max1RM > 0) points.push({ time: new Date(dStr + 'T12:00:00').getTime(), y: max1RM });
        }
        points.sort((a,b) => a.time - b.time);
        mapLinePath(points, 'lift-chart-line');

        const setsList = getId('lift-history-list');
        setsList.innerHTML = '';
        let todaySets = history[currentDateString] || [];
        if(todaySets.length === 0) {
            setsList.innerHTML = '<span style="color:var(--text-secondary); font-size: 13px;">No sets logged today.</span>';
        } else {
            todaySets.forEach((s, idx) => {
                let el = document.createElement('div');
                el.style = `display: flex; justify-content: space-between; background: var(--surface-hover); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);`;
                el.innerHTML = `<span style="font-size: 14px; color: var(--text-secondary);">Set ${idx + 1}</span><span style="font-size: 14px; font-weight: var(--font-weight-medium);">${s.weight} lbs × ${s.reps}</span>`;
                setsList.appendChild(el);
            });
        }
    }

    getId('btn-save-lift-set').addEventListener('click', () => {
        const w = parseFloat(getId('lift-weight-input').value);
        const r = parseInt(getId('lift-reps-input').value);
        if(!isNaN(w) && !isNaN(r) && w > 0 && r > 0) {
            if(!appState.lifts.history[activeLiftId]) appState.lifts.history[activeLiftId] = {};
            if(!appState.lifts.history[activeLiftId][currentDateString]) appState.lifts.history[activeLiftId][currentDateString] = [];
            appState.lifts.history[activeLiftId][currentDateString].push({ weight: w, reps: r });
            saveState();
            updateLiftDetailUI();
            getId('lift-weight-input').value = w; 
            getId('lift-reps-input').value = '';
        }
    });

    getId('btn-delete-lift').addEventListener('click', () => {
       if(confirm('Are you sure you want to delete this exercise?')) {
           appState.lifts.exercises = appState.lifts.exercises.filter(e => e.id !== activeLiftId);
           delete appState.lifts.history[activeLiftId];
           saveState();
           renderLiftsList();
       }
    });

    // ---- Modals ----
    const openModal = (id, setupFn) => {
        getId(id).classList.add('active');
        if(setupFn) setupFn();
    };
    const closeModal = id => getId(id).classList.remove('active');

    getId('calories-current').addEventListener('click', () => {
        openModal('calories-modal', () => {
            getId('calories-input').value = appState.calories.history[viewingDateString] ?? appState.calories.maintenance;
            getId('calories-input').focus();
        });
    });
    getId('btn-save-calories').addEventListener('click', () => {
        let v = parseInt(getId('calories-input').value);
        if(!isNaN(v) && v >= 0) {
            appState.calories.history[viewingDateString] = v;
            saveState(); updateCaloriesUI();
        }
        closeModal('calories-modal');
    });

    getId('metric-goal').addEventListener('click', () => {
        openModal('goal-modal', () => { getId('goal-input').value = appState.calories.goal; getId('goal-input').focus(); });
    });
    getId('btn-save-goal').addEventListener('click', () => {
        let v = parseInt(getId('goal-input').value);
        if(!isNaN(v) && v > 0) { appState.calories.goal = v; saveState(); updateCaloriesUI(); }
        closeModal('goal-modal');
    });

    getId('metric-maint').addEventListener('click', () => {
        openModal('maint-modal', () => { getId('maint-input').value = appState.calories.maintenance; getId('maint-input').focus(); });
    });
    getId('btn-save-maint').addEventListener('click', () => {
        let v = parseInt(getId('maint-input').value);
        if(!isNaN(v) && v > 0) { appState.calories.maintenance = v; saveState(); updateCaloriesUI(); }
        closeModal('maint-modal');
    });

    getId('btn-add-preset').addEventListener('click', () => {
        openModal('preset-modal', () => { getId('preset-name-input').value = ''; getId('preset-cal-input').value = ''; getId('preset-name-input').focus(); });
    });
    getId('btn-save-preset').addEventListener('click', () => {
        if (presets.length >= 4) return alert('Maximum of 4 presets allowed.');
        let n = getId('preset-name-input').value.trim(), c = parseInt(getId('preset-cal-input').value);
        if(n && !isNaN(c) && c !== 0) {
            presets.push({ id: Date.now(), name: n, calories: c });
            saveState(); renderPresets();
        }
        closeModal('preset-modal');
    });

    getId('btn-add-lift').addEventListener('click', () => {
        openModal('lift-modal', () => {
            getId('lift-name-input').value = '';
            getId('lift-group-input').value = currentPpl;
            getId('lift-name-input').focus();
        });
    });
    getId('btn-save-lift').addEventListener('click', () => {
        let n = getId('lift-name-input').value.trim();
        let g = getId('lift-group-input').value;
        if(n) {
            appState.lifts.exercises.push({ id: Date.now().toString(), name: n, group: g });
            currentPpl = g;
            saveState(); renderLiftsList();
        }
        closeModal('lift-modal');
    });

    qAll('[id^=btn-cancel-]').forEach(btn => {
        btn.addEventListener('click', () => qAll('.modal-overlay').forEach(m => m.classList.remove('active')));
    });

    // Click outside to close models
    qAll('.modal-overlay').forEach(mod => {
        mod.addEventListener('click', e => { if (e.target === mod) mod.classList.remove('active'); });
    });

    // ---- Tutorial Setup ----
    if (!appState.settings.tutorialShown) {
        openModal('tutorial-overlay');
    }
    getId('btn-tutorial-close').addEventListener('click', () => {
        appState.settings.tutorialShown = true;
        saveState();
        closeModal('tutorial-overlay');
    });

    // Startup
    updateDateElements();
    updateCaloriesUI();
});
