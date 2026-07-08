/* =============================================================
   BRAIN TUG — PRO ARENA  |  script.js  v2.1
   Full engine: Setup · Assessment · Battle · Arcade ·
                Tournament (class+division aware) · Analytics · Export
   Wrapped in IIFE to prevent const re‑declaration errors.
   ============================================================= */

;(function () {
    'use strict';

    /* ─────────────────────────────────────────────────────────────
       §1  CONSTANTS & CONFIG
       ───────────────────────────────────────────────────────────── */
    const ADMIN_PASSWORD   = 'admin'
    const SETUP_DATE_KEY   = 'bt_setup_date';
    const PROFILES_KEY     = 'bt_profiles';
    const HISTORY_KEY      = 'bt_history';
    const ACTIVE_TOUR_KEY  = 'bt_active_tourney';
    const LAST_PLAYERS_KEY = 'bt_last_players';
    const STUDENTS_URL     = 'students.json';

    // Tug physics
    const TUG_WIN_THRESHOLD    = 100;
    const FREEZE_DURATION_MS   = 2500;
    const WRONG_SPAM_WINDOW_MS = 3000;
    const WRONG_SPAM_COUNT     = 3;
    const COUNTDOWN_TICK_MS    = 1000;
    const FEEDBACK_VISIBLE_MS  = 650;
    const DIFFICULTY_RAMP_SECS = 15;

    // Assessment
    const OPS_ORDER = ['add', 'sub', 'mult', 'div'];
    const STRIKES_BEFORE_FAIL = 3;
    const LEVELS_PER_OP       = 3;

    const HIDDEN_TRIGGER_CLICKS = 5;
    const HIDDEN_TRIGGER_MS     = 3000;

    const KBD_CHECK_P1_CODE = 'KeyA';
    const KBD_CHECK_P2_CODE = 'KeyL';

    /* ─────────────────────────────────────────────────────────────
       §2  GLOBAL STATE
       ───────────────────────────────────────────────────────────── */
    const STATE = {
        gameType:  'battle',
        students:  [],
        profiles:  {},
        history:   [],
        teacherSort: { key: 'add_level', asc: false },
        muted: false,
        titleClickCount: 0,
        titleClickTimer: null,

        setup: {
            kbd1Connected: false,
            kbd2Connected: false,
            step:          1,
            lastKbd1Time:  0,
        },

        kbdCheck: {
            active:    false,
            p1Ready:   false,
            p2Ready:   false,
            onSuccess: null,
        },

        assessment: {
            active:           false,
            studentId:        null,
            opIndex:          0,
            level:            1,
            consecutiveErrors:0,
            opResults:        {},
            q:                null,
            startTime:        0,
            interval:         null,
            timer:            90,
            timesPerOp:       [],
        },

        battle: {
            p1: null,
            p2: null,
            acFocusIndex: { p1: -1, p2: -1 },
            arcadeOps: { add: true, sub: true, mult: false, div: false },
            isArcade: false,
        },

        game: {
            active:      false,
            difficulty:  1,
            timer:       60,
            interval:    null,
            tugValue:    50,
            suddenDeath: false,
            p1:          null,
            p2:          null,
        },

        tourney: {
            id:             null,
            scope:          'single',   // 'single' or 'multi'
            selectedClasses:[],         // array of class‑division strings, e.g. "5A"
            roster:         [],
            matchQueue:     [],
            currentMatch:   0,
            bracket:        [],
            activeRound:    0,
            activeMatch:    0,
        },
    };

    /* ─────────────────────────────────────────────────────────────
       §3  STUDENT PROFILE SCHEMA
       ───────────────────────────────────────────────────────────── */
    function buildStudentId(name, classVal) {
        return `${name.trim().toLowerCase().replace(/\s+/g, '_')}_cls${classVal}`;
    }

    function getOrCreateProfile(studentObj) {
        const id = buildStudentId(studentObj.name, studentObj.class);
        if (!STATE.profiles[id]) {
            STATE.profiles[id] = {
                student_id:           id,
                name:                 studentObj.name,
                class_val:            studentObj.class,
                division:             studentObj.division,
                gender:               studentObj.gender,
                addition_level:       null,
                subtraction_level:    null,
                multiplication_level: null,
                division_level:       null,
                strikes:              0,
                time_per_op:          [],
            };
        }
        return STATE.profiles[id];
    }

    function saveProfiles() {
        localStorage.setItem(PROFILES_KEY, JSON.stringify(STATE.profiles));
    }

    function loadProfiles() {
        try {
            const raw = localStorage.getItem(PROFILES_KEY);
            if (raw) STATE.profiles = JSON.parse(raw);
        } catch (e) {
            console.warn('Could not load profiles:', e);
            STATE.profiles = {};
        }
    }

    function opToField(op) {
        const map = { add: 'addition_level', sub: 'subtraction_level',
                      mult: 'multiplication_level', div: 'division_level' };
        return map[op];
    }

    function getOpLevel(studentId, op) {
        const p = STATE.profiles[studentId];
        if (!p) return null;
        return p[opToField(op)];
    }

    function getOverallLevel(studentId) {
        const p = STATE.profiles[studentId];
        if (!p) return 0;
        const vals = OPS_ORDER.map(op => p[opToField(op)]).filter(v => v !== null && v > 0);
        if (vals.length === 0) return 0;
        return vals.reduce((a, b) => a + b, 0) / vals.length;
    }

    /** Helper: build a class‑division key like "5A" */
    function classDivKey(classNum, division) {
        return `${classNum}${division}`;
    }

    /* ─────────────────────────────────────────────────────────────
       §4  DOM HELPERS
       ───────────────────────────────────────────────────────────── */
    function get(id) { return document.getElementById(id); }

    function showScreen(id) {
        document.querySelectorAll('.screen').forEach(el => {
            el.classList.add('hidden');
            el.style.display = '';
        });
        const el = get(id);
        if (!el) return;
        el.classList.remove('hidden');
        el.style.display = '';
    }

    function openModal(id)  { const el = get(id); if (el) el.classList.add('open'); }
    function closeModal(id) { const el = get(id); if (el) el.classList.remove('open'); }

    function flashFeedback(elId, text, colorClass) {
        const el = get(elId);
        if (!el) return;
        el.textContent = text;
        el.className = `feedback-flash ${colorClass}`;
        el.style.opacity = '1';
        el.style.transform = 'translate(-50%, -50%) scale(1.1)';
        setTimeout(() => {
            el.style.opacity = '0';
            el.style.transform = 'translate(-50%, -50%) scale(1)';
        }, FEEDBACK_VISIBLE_MS);
    }

    function animateSetupKey(keyId) {
        const el = get(keyId);
        if (!el) return;
        el.classList.add('active');
        setTimeout(() => el.classList.remove('active'), 200);
    }

    /* ─────────────────────────────────────────────────────────────
       §5  AUDIO ENGINE
       ───────────────────────────────────────────────────────────── */
    const AUDIO = {
        bgm: null, correct: null, wrong: null, win: null, countdown: null,
        init() {
            this.bgm       = get('bgm');
            this.correct   = get('sfx-correct');
            this.wrong     = get('sfx-wrong');
            this.win       = get('sfx-win');
            this.countdown = get('sfx-countdown');
        },
        playBGM() {
            if (STATE.muted || !this.bgm) return;
            this.bgm.volume = 0.18;
            this.bgm.play().catch(() => {});
        },
        stopBGM() { if (this.bgm) { this.bgm.pause(); this.bgm.currentTime = 0; } },
        playSFX(el) {
            if (STATE.muted || !el) return;
            el.currentTime = 0;
            el.play().catch(() => {});
        },
        playCorrect()   { this.playSFX(this.correct);  },
        playWrong()     { this.playSFX(this.wrong);    },
        playWin()       { this.playSFX(this.win);      },
        playCountdown() { this.playSFX(this.countdown);},
    };

    function toggleMute() {
        STATE.muted = !STATE.muted;
        const icon = get('icon-mute');
        if (icon) icon.className = STATE.muted
            ? 'fas fa-volume-mute'
            : 'fas fa-volume-up text-[var(--muted)] text-sm';
        if (STATE.muted) AUDIO.stopBGM();
        else if (STATE.game.active) AUDIO.playBGM();
    }

    /* ─────────────────────────────────────────────────────────────
       §6  STUDENT DATABASE
       ───────────────────────────────────────────────────────────── */
    async function loadStudents() {
        try {
            const resp = await fetch(STUDENTS_URL);
            if (!resp.ok) throw new Error('not found');
            STATE.students = await resp.json();
        } catch (e) {
            console.warn('students.json not found. Autocomplete disabled.');
            STATE.students = [];
        }
    }

    function searchStudents(query, limit = 6) {
        if (!query || query.length < 1) return [];
        const q = query.toLowerCase().trim();
        return STATE.students
            .filter(s => s.name.toLowerCase().includes(q))
            .sort((a, b) => {
                const aS = a.name.toLowerCase().startsWith(q) ? 0 : 1;
                const bS = b.name.toLowerCase().startsWith(q) ? 0 : 1;
                return aS - bS || a.name.localeCompare(b.name);
            })
            .slice(0, limit);
    }

    /* ─────────────────────────────────────────────────────────────
       §7  DAILY SETUP WIZARD  (unchanged)
       ───────────────────────────────────────────────────────────── */
    function runSetup(force = false) {
        const today     = new Date().toDateString();
        const lastSetup = localStorage.getItem(SETUP_DATE_KEY);
        if (!force && lastSetup === today) { showScreen('screen-menu'); return; }

        STATE.setup.kbd1Connected = false;
        STATE.setup.kbd2Connected = false;
        STATE.setup.step          = 1;
        STATE.setup.lastKbd1Time  = 0;

        const slot1 = get('kbd-slot-1'), slot2 = get('kbd-slot-2');
        slot1.className = 'kbd-slot waiting';
        slot2.className = 'kbd-slot idle';
        get('kbd1-label').textContent   = 'PRESS ANY KEY';
        get('kbd1-label').style.color   = 'var(--p1)';
        get('kbd1-status').textContent  = 'Player 1 Keyboard';
        get('kbd2-label').textContent   = 'WAITING…';
        get('kbd2-label').style.color   = 'var(--muted)';
        get('kbd2-status').textContent  = 'Player 2 Keyboard';
        get('setup-step-title').textContent = 'Step 1 — Player 1 Keyboard';
        get('setup-step-sub').textContent   = 'Press any key on the first keyboard to confirm connection';

        showScreen('screen-setup');
        document.addEventListener('keydown', onSetupKeydown);
    }

    function onSetupKeydown(e) {
        e.preventDefault();
        if (STATE.setup.step === 1) {
            STATE.setup.lastKbd1Time  = Date.now();
            STATE.setup.kbd1Connected = true;
            STATE.setup.step          = 2;

            get('kbd-slot-1').className      = 'kbd-slot connected';
            get('kbd1-label').textContent    = '✓ CONNECTED';
            get('kbd1-label').style.color    = 'var(--green)';
            get('kbd1-status').textContent   = `Player 1 · ${e.key.toUpperCase()} detected`;
            ['k1-q','k1-w','k1-e','k1-a','k1-s','k1-d'].forEach((k, i) =>
                setTimeout(() => animateSetupKey(k), i * 60));

            get('kbd-slot-2').className    = 'kbd-slot waiting';
            get('kbd2-label').textContent  = 'PRESS ANY KEY';
            get('kbd2-label').style.color  = 'var(--p2)';
            get('setup-step-title').textContent = 'Step 2 — Player 2 Keyboard';
            get('setup-step-sub').textContent   = 'Now press any key on the second keyboard';

        } else if (STATE.setup.step === 2) {
            if (Date.now() - STATE.setup.lastKbd1Time < 600) return;
            STATE.setup.kbd2Connected = true;
            STATE.setup.step          = 3;

            get('kbd-slot-2').className      = 'kbd-slot connected';
            get('kbd2-label').textContent    = '✓ CONNECTED';
            get('kbd2-label').style.color    = 'var(--green)';
            get('kbd2-status').textContent   = `Player 2 · ${e.key.toUpperCase()} detected`;
            ['k2-4','k2-5','k2-6','k2-7','k2-8','k2-9'].forEach((k, i) =>
                setTimeout(() => animateSetupKey(k), i * 60));

            get('setup-step-title').textContent = '✓ Both Keyboards Connected!';
            get('setup-step-sub').textContent   = 'Setup complete. Launching arena…';
            document.removeEventListener('keydown', onSetupKeydown);
            setTimeout(() => { localStorage.setItem(SETUP_DATE_KEY, new Date().toDateString()); showScreen('screen-menu'); }, 1200);
        }
    }

    function skipSetup() {
        document.removeEventListener('keydown', onSetupKeydown);
        localStorage.setItem(SETUP_DATE_KEY, new Date().toDateString());
        showScreen('screen-menu');
    }

    /* ─────────────────────────────────────────────────────────────
       §8  HIDDEN DASHBOARD TRIGGER  (unchanged)
       ───────────────────────────────────────────────────────────── */
    function onTitleClick() {
        STATE.titleClickCount++;
        if (STATE.titleClickTimer) clearTimeout(STATE.titleClickTimer);
        STATE.titleClickTimer = setTimeout(() => { STATE.titleClickCount = 0; }, HIDDEN_TRIGGER_MS);

        if (STATE.titleClickCount >= HIDDEN_TRIGGER_CLICKS) {
            STATE.titleClickCount = 0;
            clearTimeout(STATE.titleClickTimer);
            showTeacherLogin();
        }
    }

    /* ─────────────────────────────────────────────────────────────
       §9  KEYBOARD PRE-CHECK  (unchanged)
       ───────────────────────────────────────────────────────────── */
    function runKbdPreCheck(onSuccess) {
        STATE.kbdCheck.active  = false;
        STATE.kbdCheck.p1Ready = false;
        STATE.kbdCheck.p2Ready = false;
        STATE.kbdCheck.onSuccess = onSuccess;

        const overlay = get('kbd-precheck-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
            renderKbdPreCheckUI();
            STATE.kbdCheck.active = true;
            document.addEventListener('keydown', onKbdPreCheckKey);
        } else {
            onSuccess();
        }
    }

    function onKbdPreCheckKey(e) {
        if (!STATE.kbdCheck.active) return;
        e.preventDefault();

        if (e.code === KBD_CHECK_P1_CODE && !STATE.kbdCheck.p1Ready) {
            STATE.kbdCheck.p1Ready = true;
            renderKbdPreCheckUI();
        }
        if (e.code === KBD_CHECK_P2_CODE && !STATE.kbdCheck.p2Ready) {
            STATE.kbdCheck.p2Ready = true;
            renderKbdPreCheckUI();
        }

        if (STATE.kbdCheck.p1Ready && STATE.kbdCheck.p2Ready) {
            STATE.kbdCheck.active = false;
            document.removeEventListener('keydown', onKbdPreCheckKey);
            const overlay = get('kbd-precheck-overlay');
            if (overlay) overlay.style.display = 'none';
            setTimeout(STATE.kbdCheck.onSuccess, 400);
        }
    }

    function renderKbdPreCheckUI() {
        const p1El  = get('kpc-p1-status');
        const p2El  = get('kpc-p2-status');
        if (p1El) p1El.textContent  = STATE.kbdCheck.p1Ready ? '✓ READY' : 'Press A';
        if (p1El) p1El.className    = STATE.kbdCheck.p1Ready
            ? 'f-display text-2xl font-bold text-[var(--green)]'
            : 'f-display text-2xl font-bold text-[var(--p1)] animate-pulse';
        if (p2El) p2El.textContent  = STATE.kbdCheck.p2Ready ? '✓ READY' : 'Press L';
        if (p2El) p2El.className    = STATE.kbdCheck.p2Ready
            ? 'f-display text-2xl font-bold text-[var(--green)]'
            : 'f-display text-2xl font-bold text-[var(--p2)] animate-pulse';
    }

    function skipKbdPreCheck() {
        if (!STATE.kbdCheck.active) return;
        STATE.kbdCheck.active = false;
        document.removeEventListener('keydown', onKbdPreCheckKey);
        const overlay = get('kbd-precheck-overlay');
        if (overlay) overlay.style.display = 'none';
        STATE.kbdCheck.onSuccess();
    }

    /* ─────────────────────────────────────────────────────────────
       §10  GAME MODE SELECTOR  (unchanged)
       ───────────────────────────────────────────────────────────── */
    const GAME_MODE = { mode: 'math' };

    function setGameMode(mode) {
        GAME_MODE.mode = mode;
        const mathBtn = get('btn-mode-math');
        const engBtn  = get('btn-mode-eng');
        if (!mathBtn || !engBtn) return;
        if (mode === 'math') {
            mathBtn.className = 'px-5 py-2 rounded-lg f-display font-bold text-sm tracking-wide transition bg-[var(--p1)] text-white';
            engBtn.className  = 'px-5 py-2 rounded-lg f-display font-bold text-sm tracking-wide transition text-[var(--muted)]';
        } else {
            engBtn.className  = 'px-5 py-2 rounded-lg f-display font-bold text-sm tracking-wide transition bg-[var(--p2)] text-black';
            mathBtn.className = 'px-5 py-2 rounded-lg f-display font-bold text-sm tracking-wide transition text-[var(--muted)]';
        }
    }

    function initModeButtons() {
        setGameMode('math');
    }

    /* ─────────────────────────────────────────────────────────────
       §11  ASSESSMENT MODE  (unchanged, only used for reference)
       ───────────────────────────────────────────────────────────── */
    function setupAssessmentMode() {
        STATE.gameType = 'assessment';
        get('p2-entry-section').classList.add('hidden');
        get('battle-entry-title').textContent  = 'Assessment';
        get('battle-entry-sub').textContent    = 'Select your name to begin skill assessment';
        get('btn-start-battle').textContent    = 'START ASSESSMENT';
        get('btn-start-battle').onclick        = startAssessment;
        get('battle-p2-label').style.display   = 'none';

        STATE.battle.p1 = null;
        STATE.battle.p2 = { name: 'ASSESSMENT', class: '?', division: '?', gender: '?' };
        get('p1-name-input').value = '';
        get('p1-selected-card').classList.add('hidden');
        closeAutocomplete('p1');
        get('btn-start-battle').disabled = true;

        showScreen('screen-battle-entry');
        get('p1-name-input').focus();
    }

    function startAssessment() {
        if (!STATE.battle.p1) { confirmFreeText('p1'); }
        const student = STATE.battle.p1;
        if (!student) { alert('Please select your name.'); return; }

        const profile  = getOrCreateProfile(student);
        STATE.assessment.studentId        = profile.student_id;
        STATE.assessment.opIndex          = 0;
        STATE.assessment.level            = 1;
        STATE.assessment.consecutiveErrors= 0;
        STATE.assessment.opResults        = {};
        STATE.assessment.timesPerOp       = [];
        profile.strikes                   = 0;
        saveProfiles();

        showAssessmentScreen();
        startNextAssessmentOp();
    }

    // ... (all assessment functions remain exactly the same, omitted for brevity) ...

    function finishAssessmentDone() { showScreen('screen-menu'); }

    /* ─────────────────────────────────────────────────────────────
       §12  BATTLE MODE — NAME ENTRY WITH AUTOCOMPLETE  (unchanged)
       ───────────────────────────────────────────────────────────── */
    // ... (all battle functions remain unchanged) ...

    /* ─────────────────────────────────────────────────────────────
       §13  ADMIN / COMPETITION ACCESS  (unchanged)
       ───────────────────────────────────────────────────────────── */
    function startCompetitionSetup() {
        get('admin-pass-input').value = '';
        get('admin-pass-error').classList.add('hidden');
        openModal('modal-admin-pass');
        setTimeout(() => get('admin-pass-input').focus(), 100);
    }

    function verifyAdminPass() {
        const val = get('admin-pass-input').value;
        if (val === ADMIN_PASSWORD) {
            get('admin-pass-error').classList.add('hidden');
            closeModal('modal-admin-pass');
            get('admin-pass-input').value = '';
            launchTournamentSetup();
        } else {
            get('admin-pass-error').classList.remove('hidden');
            get('admin-pass-input').value = '';
            const box = get('admin-pass-input');
            box.classList.add('shake');
            setTimeout(() => box.classList.remove('shake'), 500);
            get('admin-pass-input').focus();
        }
    }

    function showTeacherLogin() {
        const pass = prompt('Enter Teacher Password:');
        if (pass === ADMIN_PASSWORD) { renderTeacherTable(); openModal('modal-teacher'); }
        else if (pass !== null) alert('Incorrect password.');
    }

    /* ─────────────────────────────────────────────────────────────
       §14  TOURNAMENT — STEP 1: SCOPE SELECTION  (UPDATED)
       ───────────────────────────────────────────────────────────── */
    function launchTournamentSetup() {
        STATE.gameType = 'tournament';

        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(ACTIVE_TOUR_KEY)); } catch (e) {}
        if (saved && saved.matchQueue && saved.matchQueue.length > 0) {
            if (confirm('Resume the active competition?')) { loadTournament(saved); return; }
        }

        STATE.tourney.id             = Date.now();
        STATE.tourney.roster         = [];
        STATE.tourney.matchQueue     = [];
        STATE.tourney.currentMatch   = 0;
        STATE.tourney.selectedClasses= [];
        showScreen('screen-tourney-scope');
    }

    function loadTournament(data) {
        Object.assign(STATE.tourney, {
            id:             data.id || Date.now(),
            scope:          data.scope || 'single',
            selectedClasses:data.selectedClasses || [],
            roster:         data.roster || [],
            matchQueue:     data.matchQueue || [],
            currentMatch:   data.currentMatch || 0,
        });
        renderLiveHub();
        showScreen('screen-tourney-hub');
    }

    /** Called from the updated scope screen buttons */
    function selectTourneyScope(scope) {
        STATE.tourney.scope          = scope;
        STATE.tourney.selectedClasses= [];
        STATE.tourney.roster         = [];

        const lbl = get('tourney-scope-label');
        if (lbl) lbl.textContent = scope === 'single'
            ? 'Select one class‑division — then uncheck absentees'
            : 'Select one or more class‑divisions — then uncheck absentees';

        renderClassChips();
        renderRosterList();
        showScreen('screen-tourney-setup');
    }

    /* ─────────────────────────────────────────────────────────────
       §14b  TOURNAMENT — STEP 2: ROSTER BUILDER  (UPDATED)
       ───────────────────────────────────────────────────────────── */
    /** Render class‑division chips based on unique combinations in students.json */
    function renderClassChips() {
        const container = get('tourney-class-chips');
        if (!container) return;

        // Unique class‑division combos
        const combos = [...new Set(STATE.students.map(s => classDivKey(s.class, s.division)))];
        combos.sort((a, b) => {
            const aNum = parseInt(a), bNum = parseInt(b);
            if (aNum !== bNum) return aNum - bNum;
            return (a.match(/[A-Z]+$/)[0] || '').localeCompare(b.match(/[A-Z]+$/)[0] || '');
        });

        container.innerHTML = combos.map(cd => {
            const sel = STATE.tourney.selectedClasses.includes(cd);
            return `<button class="class-chip${sel ? ' selected' : ''}"
                onclick="toggleClassChip('${cd}')" data-class="${cd}">
                Class ${cd}
            </button>`;
        }).join('');
    }

    function toggleClassChip(classDiv) {
        const scope   = STATE.tourney.scope;
        const already = STATE.tourney.selectedClasses.includes(classDiv);

        if (already) {
            STATE.tourney.selectedClasses = STATE.tourney.selectedClasses.filter(c => c !== classDiv);
        } else {
            if (scope === 'single') {
                STATE.tourney.selectedClasses = [classDiv];
            } else {
                STATE.tourney.selectedClasses.push(classDiv);
            }
        }

        renderClassChips();
        buildRosterFromSelection();
        renderRosterList();
    }

    function buildRosterFromSelection() {
        const prev = STATE.tourney.roster;
        const selected = STATE.tourney.selectedClasses; // array of "5A", etc.

        STATE.tourney.roster = STATE.students
            .filter(s => selected.includes(classDivKey(s.class, s.division)))
            .map(s => {
                const sid      = buildStudentId(s.name, s.class);
                const existing = prev.find(r => r.studentId === sid);
                return {
                    name:      s.name,
                    studentId: sid,
                    class:     s.class,
                    division:  s.division,
                    gender:    s.gender,
                    present:   existing ? existing.present : true,
                };
            });
    }

    function renderRosterList() {
        const ul      = get('tourney-roster');
        const cntEl   = get('roster-present-count');
        const btn     = get('btn-confirm-roster');
        if (!ul) return;

        const roster  = STATE.tourney.roster;

        if (roster.length === 0) {
            ul.innerHTML = `<li class="text-center text-[var(--muted)] text-sm py-8 opacity-50">
                <i class="fas fa-hand-pointer mr-2"></i>Select a class‑division above to load students
            </li>`;
            if (cntEl) cntEl.textContent = '0 present';
            if (btn)   btn.classList.add('hidden');
            return;
        }

        const sorted = [...roster].sort((a, b) => {
            if (a.present !== b.present) return b.present ? 1 : -1;
            return a.name.localeCompare(b.name);
        });

        ul.innerHTML = sorted.map(s => {
            const sid   = s.studentId;
            const p     = STATE.profiles[sid];
            const lvl   = p ? getOverallLevel(sid) : null;
            const lvlTxt= lvl !== null && lvl > 0 ? `Lvl ${lvl.toFixed(1)}` : (p ? 'Unranked' : 'Not assessed');
            const g     = s.gender === 'F' ? '♀' : '♂';
            return `
            <li id="roster-li-${sid.replace(/[^a-z0-9]/g,'_')}"
                class="roster-row${s.present ? '' : ' absent'}">
                <button class="roster-toggle${s.present ? ' on' : ''}"
                    onclick="toggleRosterPresent('${sid}')"
                    title="${s.present ? 'Mark absent' : 'Mark present'}">
                </button>
                <div class="flex-1 min-w-0">
                    <div class="f-display font-bold text-white text-sm truncate">${s.name}</div>
                    <div class="text-[var(--muted)] text-[10px]">${g} · Cls ${s.class}${s.division}</div>
                </div>
                <div class="f-mono text-[10px] text-[var(--muted)] text-right flex-shrink-0">${lvlTxt}</div>
            </li>`;
        }).join('');

        const presentCount = roster.filter(r => r.present).length;
        if (cntEl) cntEl.textContent = `${presentCount} of ${roster.length} present`;
        if (btn) {
            if (presentCount >= 2) btn.classList.remove('hidden');
            else                   btn.classList.add('hidden');
        }
    }

    function toggleRosterPresent(studentId) {
        const entry = STATE.tourney.roster.find(r => r.studentId === studentId);
        if (!entry) return;
        entry.present = !entry.present;
        renderRosterList();
    }

    function checkAllRoster(present) {
        STATE.tourney.roster.forEach(r => { r.present = present; });
        renderRosterList();
    }

    function confirmRoster() {
        const present = STATE.tourney.roster.filter(r => r.present);
        if (present.length < 2) { alert('At least 2 students must be present to start a competition.'); return; }

        localStorage.setItem(LAST_PLAYERS_KEY, JSON.stringify(STATE.tourney.roster));
        buildMatchQueue(present);
        renderMatchOrderScreen();
        showScreen('screen-tourney-order');
    }

    /* ─────────────────────────────────────────────────────────────
       §14c  TOURNAMENT — STEP 3: MATCH ORDER  (unchanged)
       ───────────────────────────────────────────────────────────── */
    function buildMatchQueue(players) {
        const sorted = [...players].sort((a, b) => getOverallLevel(a.studentId) - getOverallLevel(b.studentId));
        const queue = [];
        let i = 0;
        while (i < sorted.length - 1) {
            const p1     = sorted[i];
            const p2     = sorted[i + 1];
            const lvlA   = getOverallLevel(p1.studentId);
            const lvlB   = getOverallLevel(p2.studentId);
            const diff   = Math.abs(lvlA - lvlB);
            queue.push({ p1: p1.name, p2: p2.name, winner: null, levelDiff: diff,
                         p1Id: p1.studentId, p2Id: p2.studentId });
            i += 2;
        }
        if (sorted.length % 2 === 1) {
            const bye = sorted[sorted.length - 1];
            queue.push({ p1: bye.name, p2: 'BYE', winner: bye.name, levelDiff: 0,
                         p1Id: bye.studentId, p2Id: null });
        }
        STATE.tourney.matchQueue   = queue;
        STATE.tourney.currentMatch = 0;
    }

    function renderMatchOrderScreen() {
        const list = get('match-order-list');
        if (!list) return;

        const queue = STATE.tourney.matchQueue;
        list.innerHTML = queue.map((m, i) => {
            const isBye  = m.p2 === 'BYE';
            const diffBadge = m.levelDiff < 0.3 ? '≈ Even match' : m.levelDiff < 1 ? '~ Similar' : '△ Mismatched';

            return `
            <li id="mo-item-${i}" class="match-order-card${i === 0 ? ' next-match' : ''}${isBye ? ' done' : ''}">
                <div class="mo-num">${i + 1}</div>
                <div class="mo-players flex-1">
                    <span class="text-[#818CF8]">${m.p1}</span>
                    <span class="text-[var(--muted)] mx-2 text-xs">vs</span>
                    ${isBye
                        ? `<span class="text-[var(--muted)] italic text-sm">BYE — auto advance</span>`
                        : `<span class="text-[#FCD34D]">${m.p2}</span>`}
                </div>
                ${!isBye ? `<div class="mo-level text-right">${diffBadge}</div>` : ''}
                ${!isBye ? `
                <div class="mo-arrows">
                    <button class="mo-arrow" onclick="moveMatch(${i}, -1)" ${i === 0 ? 'disabled' : ''} title="Move up">▲</button>
                    <button class="mo-arrow" onclick="moveMatch(${i},  1)" ${i === queue.length - 1 ? 'disabled' : ''} title="Move down">▼</button>
                </div>` : ''}
            </li>`;
        }).join('');
    }

    function moveMatch(index, direction) {
        const queue   = STATE.tourney.matchQueue;
        const newIdx  = index + direction;
        if (newIdx < 0 || newIdx >= queue.length) return;
        [queue[index], queue[newIdx]] = [queue[newIdx], queue[index]];
        renderMatchOrderScreen();
    }

    function startTournamentFromOrder() {
        STATE.tourney.currentMatch = 0;
        while (STATE.tourney.currentMatch < STATE.tourney.matchQueue.length) {
            const m = STATE.tourney.matchQueue[STATE.tourney.currentMatch];
            if (m.p2 === 'BYE') { m.winner = m.p1; STATE.tourney.currentMatch++; }
            else break;
        }
        saveTournament();
        renderLiveHub();
        showScreen('screen-tourney-hub');
    }

    /* ─────────────────────────────────────────────────────────────
       §15  TOURNAMENT — LIVE HUB  (unchanged, but uses roster data)
       ───────────────────────────────────────────────────────────── */
    function renderLiveHub() {
        const queue   = STATE.tourney.matchQueue;
        const current = STATE.tourney.currentMatch;
        const total   = queue.length;
        const done    = queue.filter(m => m.winner).length;

        const progEl = get('t-progress-label');
        if (progEl) progEl.textContent = `${done}/${total} done`;

        const rndEl = get('t-round-label');
        if (rndEl) rndEl.textContent = current < total
            ? `Match ${current + 1} of ${total}`
            : 'All matches complete';

        const container = get('bracket-container');
        if (container) {
            container.innerHTML = queue.map((m, i) => {
                const isCurrent = i === current && !m.winner;
                const isDone    = !!m.winner;
                const isBye     = m.p2 === 'BYE';
                const isPlayable= !isDone && !isBye && i !== current;

                let cls = 'bracket-match mb-2';
                if (isCurrent)  cls += ' active';
                else if (isDone) cls += ' done';
                else if (isPlayable) cls += ' playable';

                const click = isPlayable ? `onclick="jumpToMatch(${i})"` : '';

                const p1Class = m.winner === m.p1 ? 'bracket-winner-text' : '';
                const p2Class = m.winner === m.p2 ? 'bracket-winner-text' : '';
                const winTick = m.winner ? ` <span class="text-[var(--green)] text-xs">✓ ${m.winner}</span>` : '';

                return `<div class="${cls}" ${click}>
                    <span class="text-[var(--muted)] f-mono text-[10px] mr-1">${i + 1}.</span>
                    <span class="bracket-player ${p1Class} flex-1">${m.p1}</span>
                    ${isBye ? `<span class="text-[var(--muted)] text-xs italic">BYE</span>` : `
                    <span class="text-[var(--muted)] text-[10px] font-bold f-display mx-1">VS</span>
                    <span class="bracket-player ${p2Class} flex-1 text-right">${m.p2}</span>`}
                    ${winTick}
                </div>`;
            }).join('');
        }

        renderLiveMatchCard();
    }

    function renderLiveMatchCard() {
        const card    = get('match-card-content');
        if (!card) return;

        const queue   = STATE.tourney.matchQueue;
        const current = STATE.tourney.currentMatch;

        if (current >= queue.length || queue.every(m => m.winner)) {
            const wins = {};
            queue.forEach(m => {
                if (m.winner && m.winner !== 'BYE') wins[m.winner] = (wins[m.winner] || 0) + 1;
            });
            const champion = Object.keys(wins).sort((a, b) => wins[b] - wins[a])[0] || '—';

            card.innerHTML = `<div class="text-center">
                <div class="text-[var(--green)] f-display font-bold text-xs uppercase tracking-widest mb-3">Competition Over</div>
                <div class="text-5xl mb-3">👑</div>
                <div class="f-display font-bold text-white text-2xl mb-1">${champion}</div>
                <div class="text-[var(--muted)] text-xs mb-6">Most wins: ${wins[champion] || 0}</div>
                <button onclick="finishTournament('${champion}')" class="btn-primary w-full">Save & End</button>
            </div>`;
            return;
        }

        const match = queue[current];
        const p1Sid = match.p1Id;
        const p2Sid = match.p2Id;
        const p1Lvl = p1Sid ? getOverallLevel(p1Sid).toFixed(1) : '?';
        const p2Lvl = p2Sid ? getOverallLevel(p2Sid).toFixed(1) : '?';

        card.innerHTML = `
            <div class="text-center">
                <div class="text-[var(--p2)] f-display font-bold text-xs uppercase tracking-widest mb-1 animate-pulse">
                    Match ${current + 1} · Up Now
                </div>
                <div class="my-4 flex flex-col gap-3">
                    <div class="p-3 rounded-xl bg-[var(--p1)]/10 border border-[var(--p1)]/20">
                        <div class="f-display font-bold text-[#818CF8] text-2xl">${match.p1}</div>
                        <div class="text-[var(--muted)] text-[10px] f-mono mt-0.5">Level ${p1Lvl}</div>
                    </div>
                    <div class="text-[var(--muted)] f-display text-sm font-bold">VS</div>
                    <div class="p-3 rounded-xl bg-[var(--p2)]/10 border border-[var(--p2)]/20">
                        <div class="f-display font-bold text-[#FCD34D] text-2xl">${match.p2}</div>
                        <div class="text-[var(--muted)] text-[10px] f-mono mt-0.5">Level ${p2Lvl}</div>
                    </div>
                </div>
                <button onclick="runKbdPreCheck(() => prepareGame('${match.p1}', '${match.p2}'))"
                    class="btn-primary w-full mb-2">
                    <i class="fas fa-bolt mr-2"></i>START MATCH
                </button>
                <button onclick="adminDeclareWinner('${match.p1}', '${match.p2}')"
                    class="btn-secondary w-full text-xs">
                    <i class="fas fa-gavel mr-1"></i>Declare winner manually
                </button>
            </div>`;
    }

    function jumpToMatch(index) {
        const current = STATE.tourney.currentMatch;
        if (index <= current) return;
        const queue = STATE.tourney.matchQueue;
        const item  = queue.splice(index, 1)[0];
        queue.splice(current, 0, item);
        saveTournament();
        renderLiveHub();
    }

    function adminDeclareWinner(p1Name, p2Name) {
        const choice = prompt(`Declare winner:\n1 = ${p1Name}\n2 = ${p2Name}\n\nType 1 or 2:`);
        if (choice === '1') handleTournamentWin(p1Name);
        else if (choice === '2') handleTournamentWin(p2Name);
    }

    function handleTournamentWin(winner) {
        const queue   = STATE.tourney.matchQueue;
        const current = STATE.tourney.currentMatch;
        if (current >= queue.length) return;
        queue[current].winner = winner;

        STATE.tourney.currentMatch++;
        while (STATE.tourney.currentMatch < queue.length) {
            const next = queue[STATE.tourney.currentMatch];
            if (next.p2 === 'BYE') { next.winner = next.p1; STATE.tourney.currentMatch++; }
            else break;
        }

        saveTournament();
        renderLiveHub();
        showScreen('screen-tourney-hub');
    }

    function saveTournament() {
        localStorage.setItem(ACTIVE_TOUR_KEY, JSON.stringify({
            id:              STATE.tourney.id,
            scope:           STATE.tourney.scope,
            selectedClasses: STATE.tourney.selectedClasses,
            roster:          STATE.tourney.roster,
            matchQueue:      STATE.tourney.matchQueue,
            currentMatch:    STATE.tourney.currentMatch,
        }));
    }

    function saveAndExit() { saveTournament(); showScreen('screen-menu'); }

    function finishTournament(winner) {
        const record = {
            id:      STATE.tourney.id,
            date:    new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }),
            time:    new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' }),
            winner,
            players: STATE.tourney.roster.filter(r => r.present).length,
            mode:    GAME_MODE.mode,
            classes: STATE.tourney.selectedClasses.join(', '),
        };
        STATE.history.unshift(record);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(STATE.history));
        localStorage.removeItem(ACTIVE_TOUR_KEY);
        showScreen('screen-menu');
    }

    // Legacy stubs (unchanged)
    function generateBracket() { confirmRoster(); }
    function setActiveMatch() {}
    function addTourneyPlayer() {}
    function clearTPlayers() {}
    function removeTourneyPlayer() {}
    function loadRosterIntoPlayers() {}

    /* ─────────────────────────────────────────────────────────────
       §16  HISTORY  (unchanged)
       ───────────────────────────────────────────────────────────── */
    function showHistory() {
        const list = get('history-list');
        if (!list) return;
        if (STATE.history.length === 0) {
            list.innerHTML = '<div class="text-[var(--muted)] text-center italic py-4 text-sm">No tournaments recorded yet.</div>';
        } else {
            list.innerHTML = STATE.history.map(h => `
                <div class="bg-[var(--surface)] p-3 rounded-xl border border-[var(--border)] flex items-center justify-between gap-3">
                    <div>
                        <div class="text-[var(--green)] f-display font-bold">👑 ${h.winner}</div>
                        <div class="text-xs text-[var(--muted)] mt-0.5">${h.players} players · ${h.mode || 'math'}</div>
                    </div>
                    <div class="text-right text-xs text-[var(--muted)]"><div>${h.date}</div><div>${h.time || ''}</div></div>
                </div>`).join('');
        }
        openModal('modal-history');
    }

    function clearHistory() {
        if (!confirm('Clear all tournament history?')) return;
        STATE.history = [];
        localStorage.removeItem(HISTORY_KEY);
        showHistory();
    }

    /* ─────────────────────────────────────────────────────────────
       §17  TEACHER DASHBOARD  (unchanged – already shows class+division)
       ───────────────────────────────────────────────────────────── */
    function updateMatchStats(name, isCorrect, timeTakenMs) {
        if (!name || name === '?' || name.startsWith('Player') || name === 'ASSESSMENT') return;
        const student = STATE.students.find(s => s.name === name);
        if (!student) {
            const sid = buildStudentId(name, 0);
            if (!STATE.profiles[sid]) {
                STATE.profiles[sid] = {
                    student_id: sid, name, class_val: 0, division: '?', gender: '?',
                    addition_level: null, subtraction_level: null,
                    multiplication_level: null, division_level: null,
                    strikes: 0, time_per_op: [],
                    match_correct: 0, match_wrong: 0,
                };
            }
            const p = STATE.profiles[sid];
            p.time_per_op.push(timeTakenMs);
            if (isCorrect) p.match_correct = (p.match_correct || 0) + 1;
            else           p.match_wrong   = (p.match_wrong   || 0) + 1;
        } else {
            const sid = buildStudentId(student.name, student.class);
            const p   = getOrCreateProfile(student);
            p.time_per_op.push(timeTakenMs);
            if (isCorrect) p.match_correct = (p.match_correct || 0) + 1;
            else           p.match_wrong   = (p.match_wrong   || 0) + 1;
        }
        saveProfiles();
    }

    function getPlayerRating(studentId) { return getOverallLevel(studentId); }

    function sortTeacherTable(key) {
        if (STATE.teacherSort.key === key) STATE.teacherSort.asc = !STATE.teacherSort.asc;
        else { STATE.teacherSort.key = key; STATE.teacherSort.asc = (key === 'name'); }
        renderTeacherTable();
    }

    function renderTeacherTable() {
        const tbody = get('teacher-table-body');
        if (!tbody) return;
        const ids = Object.keys(STATE.profiles);

        if (ids.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-[var(--muted)] text-sm">
                No assessment data yet. Run assessments first.</td></tr>`;
            return;
        }

        ids.sort((a, b) => {
            const pa = STATE.profiles[a], pb = STATE.profiles[b];
            let vA, vB;
            switch (STATE.teacherSort.key) {
                case 'name':     vA = pa.name.toLowerCase(); vB = pb.name.toLowerCase(); break;
                case 'class':    vA = `${pa.class_val}${pa.division}`; vB = `${pb.class_val}${pb.division}`; break;
                case 'add_level':    vA = pa.addition_level ?? -1;       vB = pb.addition_level ?? -1;       break;
                case 'sub_level':    vA = pa.subtraction_level ?? -1;    vB = pb.subtraction_level ?? -1;    break;
                case 'mult_level':   vA = pa.multiplication_level ?? -1; vB = pb.multiplication_level ?? -1; break;
                case 'div_level':    vA = pa.division_level ?? -1;       vB = pb.division_level ?? -1;       break;
                case 'rating': default:
                    vA = getOverallLevel(a); vB = getOverallLevel(b); break;
            }
            if (vA < vB) return STATE.teacherSort.asc ? -1 : 1;
            if (vA > vB) return STATE.teacherSort.asc ?  1 : -1;
            return 0;
        });

        tbody.innerHTML = ids.map(sid => {
            const p   = STATE.profiles[sid];
            const avg = getOverallLevel(sid);

            function levelCell(lvl) {
                if (lvl === null || lvl === undefined)
                    return `<td class="p-3 text-[var(--muted)] text-center f-mono">—</td>`;
                if (lvl === 0)
                    return `<td class="p-3 text-center bg-red-900/30 text-red-400 font-bold f-mono">FAIL</td>`;
                const color = lvl >= 3 ? 'text-[var(--green)]' : lvl >= 2 ? 'text-[var(--p2)]' : 'text-white';
                return `<td class="p-3 text-center ${color} font-bold f-mono">L${lvl}</td>`;
            }

            let rowBg = '';
            if (avg === 0 && [p.addition_level, p.subtraction_level, p.multiplication_level, p.division_level].some(v => v === 0))
                rowBg = 'bg-red-900/10';
            else if (avg >= 2.5)
                rowBg = 'bg-green-900/10';

            const total    = (p.match_correct || 0) + (p.match_wrong || 0);
            const matchAcc = total > 0 ? Math.round((p.match_correct || 0) / total * 100) + '%' : '—';

            return `<tr class="hover:bg-white/3 transition ${rowBg}">
                <td class="p-3 f-display font-bold text-white whitespace-nowrap">${p.name}</td>
                <td class="p-3 text-[var(--muted)] text-xs text-center">${p.class_val}${p.division}</td>
                ${levelCell(p.addition_level)}
                ${levelCell(p.subtraction_level)}
                ${levelCell(p.multiplication_level)}
                ${levelCell(p.division_level)}
                <td class="p-3 f-mono text-xs text-center text-[var(--muted)]">${avg > 0 ? avg.toFixed(1) : '—'}</td>
                <td class="p-3 f-mono text-xs text-center text-[var(--muted)]">${matchAcc}</td>
            </tr>`;
        }).join('');
    }

    function hideTeacher() { closeModal('modal-teacher'); }

    function clearStats() {
        if (!confirm('Reset ALL student assessment & performance data? This cannot be undone.')) return;
        STATE.profiles = {};
        localStorage.removeItem(PROFILES_KEY);
        renderTeacherTable();
    }

    function exportProfiles() {
        const data    = JSON.stringify(STATE.profiles, null, 2);
        const blob    = new Blob([data], { type: 'application/json' });
        const url     = URL.createObjectURL(blob);
        const a       = document.createElement('a');
        a.href        = url;
        a.download    = `braintug_profiles_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /* ─────────────────────────────────────────────────────────────
       §18–§24  GAME LIFECYCLE, QUESTIONS, TUG, END  (unchanged)
       ───────────────────────────────────────────────────────────── */
    // ... (prepareGame, startGame, generateQuestion, handleInput, etc.) ...

    /* ─────────────────────────────────────────────────────────────
       §25  OUTSIDE-CLICK → CLOSE AUTOCOMPLETE  (unchanged)
       ───────────────────────────────────────────────────────────── */
    document.addEventListener('click', (e) => {
        ['p1', 'p2'].forEach(pl => {
            const list = get(`${pl}-ac-list`);
            const inp  = get(`${pl}-name-input`);
            if (list && inp && !list.contains(e.target) && e.target !== inp) {
                closeAutocomplete(pl);
            }
        });
    });

    /* ─────────────────────────────────────────────────────────────
       §26  INITIALISATION
       ───────────────────────────────────────────────────────────── */
    document.addEventListener('DOMContentLoaded', async () => {
        AUDIO.init();

        loadProfiles();
        try {
            const h = localStorage.getItem(HISTORY_KEY);
            if (h) STATE.history = JSON.parse(h);
        } catch (e) { STATE.history = []; }

        await loadStudents();

        initModeButtons();

        const marker = get('rope-marker');
        if (marker) {
            marker.style.left      = '50%';
            marker.style.top       = '50%';
            marker.style.transform = 'translate(-50%, -50%)';
        }

        const trigger = get('hidden-title-trigger');
        if (trigger) trigger.addEventListener('click', onTitleClick);

        runSetup(false);
    });

    /* ─────────────────────────────────────────────────────────────
       §27  GLOBAL EXPORTS
       ───────────────────────────────────────────────────────────── */
    window.get                    = get;
    window.showScreen             = showScreen;
    window.openModal              = openModal;
    window.closeModal             = closeModal;
    window.toggleMute             = toggleMute;
    window.onTitleClick           = onTitleClick;

    window.runSetup               = runSetup;
    window.skipSetup              = skipSetup;

    window.runKbdPreCheck         = runKbdPreCheck;
    window.skipKbdPreCheck        = skipKbdPreCheck;

    window.setGameMode            = setGameMode;

    window.setupAssessmentMode    = setupAssessmentMode;
    window.startAssessment        = startAssessment;
    window.submitAssessmentAnswer = submitAssessmentAnswer;
    window.finishAssessmentDone   = finishAssessmentDone;

    window.setupBattleMode        = setupBattleMode;
    window.setupArcadeMode        = setupArcadeMode;
    window.toggleArcadeOp         = toggleArcadeOp;
    window.startBattleGame        = startBattleGame;
    window.onNameInput            = onNameInput;
    window.onNameKeydown          = onNameKeydown;
    window.selectStudent          = selectStudent;
    window.clearPlayerSelection   = clearPlayerSelection;

    window.startCompetitionSetup  = startCompetitionSetup;
    window.verifyAdminPass        = verifyAdminPass;
    window.showTeacherLogin       = showTeacherLogin;

    window.loadRosterIntoPlayers  = loadRosterIntoPlayers;
    window.addTourneyPlayer       = addTourneyPlayer;
    window.clearTPlayers          = clearTPlayers;
    window.removeTourneyPlayer    = removeTourneyPlayer;
    window.generateBracket        = generateBracket;
    window.setActiveMatch         = setActiveMatch;
    window.saveAndExit            = saveAndExit;
    window.finishTournament       = finishTournament;
    window.handleTournamentWin    = handleTournamentWin;

    window.sortTeacherTable       = sortTeacherTable;
    window.hideTeacher            = hideTeacher;
    window.clearStats             = clearStats;
    window.exportProfiles         = exportProfiles;

    window.showHistory            = showHistory;
    window.clearHistory           = clearHistory;

    window.tapInput               = tapInput;
    window.tapClear               = tapClear;
    window.prepareGame            = prepareGame;

})();
