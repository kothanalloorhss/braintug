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
            selectedClasses:[],         // array of class‑division strings e.g. "5A"
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
       §7  DAILY SETUP WIZARD
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
       §8  HIDDEN DASHBOARD TRIGGER
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
       §9  KEYBOARD PRE-CHECK
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
        const btnEl = get('kpc-skip-btn');
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
       §10  GAME MODE SELECTOR
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
       §11  ASSESSMENT MODE
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

    function showAssessmentScreen() {
        showScreen('screen-assessment');
    }

    function startNextAssessmentOp() {
        const as = STATE.assessment;
        if (as.opIndex >= OPS_ORDER.length) {
            finishAssessment();
            return;
        }

        const op = OPS_ORDER[as.opIndex];
        as.level             = 1;
        as.consecutiveErrors = 0;
        as.timesPerOp        = [];
        as.timer             = 90;
        as.active            = true;

        if (STATE.profiles[as.studentId]) {
            STATE.profiles[as.studentId].strikes = 0;
        }

        const opNames = { add: 'Addition', sub: 'Subtraction', mult: 'Multiplication', div: 'Division' };
        get('assessment-op-name').textContent      = opNames[op];
        get('assessment-op-icon').textContent      = opIcon(op);
        get('assessment-level-label').textContent  = `Level ${as.level}`;
        get('assessment-timer-el').textContent     = as.timer;
        get('assessment-strikes-el').textContent   = '○○○';
        get('assessment-answer-input').value       = '';
        get('assessment-answer-input').focus();

        renderAssessmentProgress();

        generateAssessmentQuestion();

        if (as.interval) clearInterval(as.interval);
        as.interval = setInterval(assessmentTick, 1000);
    }

    function opIcon(op) {
        return { add: '+', sub: '−', mult: '×', div: '÷' }[op];
    }

    function assessmentTick() {
        const as = STATE.assessment;
        if (!as.active) return;
        as.timer--;
        get('assessment-timer-el').textContent = as.timer;
        if (as.timer <= 10) get('assessment-timer-el').classList.add('text-red-400');
        if (as.timer <= 0) {
            endAssessmentOp(as.level);
        }
    }

    function generateAssessmentQuestion() {
        const as  = STATE.assessment;
        const op  = OPS_ORDER[as.opIndex];
        const lvl = as.level;
        let a, b, ans, text;

        const single = () => Math.floor(Math.random() * 9) + 1;
        const double = () => Math.floor(Math.random() * 90) + 10;
        const triple = () => Math.floor(Math.random() * 900) + 100;

        if (op === 'add') {
            if (lvl === 1)      { a = single(); b = single(); }
            else if (lvl === 2) { a = double(); b = double(); }
            else                { a = triple(); b = double(); }
            ans = a + b; text = `${a} + ${b}`;
        } else if (op === 'sub') {
            if (lvl === 1)      { a = single() + 5; b = single(); }
            else if (lvl === 2) { a = double() + 10; b = single(); }
            else                { a = double(); b = single(); }
            if (a < b) [a, b] = [b, a];
            ans = a - b; text = `${a} − ${b}`;
        } else if (op === 'mult') {
            if (lvl === 1)      { a = single(); b = single(); }
            else if (lvl === 2) { a = double() % 20 + 2; b = single(); }
            else                { a = single() + 5; b = single() + 5; }
            ans = a * b; text = `${a} × ${b}`;
        } else {
            if (lvl === 1)      { b = single(); a = b * single(); }
            else if (lvl === 2) { b = single() + 1; a = b * (Math.floor(Math.random() * 9) + 2); }
            else                { b = single() + 2; a = b * (Math.floor(Math.random() * 11) + 3); }
            ans = a / b; text = `${a} ÷ ${b}`;
        }

        as.q = { text, ans: Math.round(ans) };
        as.startTime = Date.now();
        get('assessment-question-text').textContent = text;
        get('assessment-answer-input').value = '';
    }

    function submitAssessmentAnswer() {
        const as  = STATE.assessment;
        if (!as.active || !as.q) return;

        const raw     = get('assessment-answer-input').value.trim();
        const given   = parseInt(raw, 10);
        const correct = as.q.ans;
        const elapsed = Date.now() - as.startTime;

        as.timesPerOp.push(elapsed);

        if (given === correct) {
            as.consecutiveErrors = 0;
            flashAssessmentFeedback(true);

            as.level = Math.min(as.level + 0.5, LEVELS_PER_OP);
            const newLevel = Math.floor(as.level);
            get('assessment-level-label').textContent = `Level ${newLevel}`;

            if (as.level >= LEVELS_PER_OP) {
                endAssessmentOp(LEVELS_PER_OP);
                return;
            }
            generateAssessmentQuestion();

        } else {
            as.consecutiveErrors++;
            const profile = STATE.profiles[as.studentId];
            if (profile) profile.strikes++;
            flashAssessmentFeedback(false);
            renderAssessmentStrikes();

            if (as.consecutiveErrors >= STRIKES_BEFORE_FAIL) {
                endAssessmentOp(0);
                return;
            }
            generateAssessmentQuestion();
        }
    }

    function endAssessmentOp(levelAchieved) {
        const as  = STATE.assessment;
        as.active = false;
        if (as.interval) { clearInterval(as.interval); as.interval = null; }

        const op      = OPS_ORDER[as.opIndex];
        const field   = opToField(op);
        const profile = STATE.profiles[as.studentId];

        if (profile) {
            profile[field]       = levelAchieved;
            profile.strikes      = 0;
            profile.time_per_op  = [...(profile.time_per_op || []), ...as.timesPerOp];
            saveProfiles();
        }

        as.opResults[op] = levelAchieved;
        as.opIndex++;

        showAssessmentOpResult(op, levelAchieved, () => {
            startNextAssessmentOp();
        });
    }

    function showAssessmentOpResult(op, level, next) {
        const el = get('assessment-op-result');
        if (!el) { next(); return; }

        const opNames = { add: 'Addition', sub: 'Subtraction', mult: 'Multiplication', div: 'Division' };
        const levelText = level === 0 ? 'Auto-Failed' : `Level ${level} Cleared`;
        const colorCls  = level === 0 ? 'text-red-400' : 'text-[var(--green)]';
        el.innerHTML = `
            <div class="text-center py-6">
                <div class="text-4xl mb-2">${opIcon(op)}</div>
                <div class="f-display font-bold text-white text-2xl">${opNames[op]}</div>
                <div class="f-display font-bold ${colorCls} text-3xl mt-1">${levelText}</div>
            </div>`;
        el.style.display = 'flex';
        setTimeout(() => { el.style.display = 'none'; next(); }, 1800);
    }

    function flashAssessmentFeedback(correct) {
        const fb = get('assessment-feedback');
        if (!fb) return;
        fb.textContent = correct ? '+GOOD' : 'MISS';
        fb.className   = correct ? 'assessment-feedback text-[var(--green)]' : 'assessment-feedback text-[var(--red)]';
        fb.style.opacity = '1';
        setTimeout(() => { fb.style.opacity = '0'; }, 500);
    }

    function renderAssessmentStrikes() {
        const as = STATE.assessment;
        const el = get('assessment-strikes-el');
        if (!el) return;
        const filled = as.consecutiveErrors;
        el.textContent = '●'.repeat(filled) + '○'.repeat(STRIKES_BEFORE_FAIL - filled);
        el.className   = filled > 0 ? 'f-mono text-red-400 text-xl font-bold' : 'f-mono text-[var(--muted)] text-xl';
    }

    function renderAssessmentProgress() {
        const el = get('assessment-progress-dots');
        if (!el) return;
        const opNames = { add: '+', sub: '−', mult: '×', div: '÷' };
        el.innerHTML = OPS_ORDER.map((op, i) => {
            let cls = 'w-8 h-8 rounded-full border-2 flex items-center justify-center f-display font-bold text-sm ';
            if (i < STATE.assessment.opIndex)       cls += 'bg-[var(--green)] border-[var(--green)] text-black';
            else if (i === STATE.assessment.opIndex) cls += 'bg-[var(--p1)] border-[var(--p1)] text-white';
            else                                     cls += 'bg-transparent border-[var(--muted)] text-[var(--muted)]';
            return `<div class="${cls}">${opNames[op]}</div>`;
        }).join('');
    }

    function finishAssessment() {
        if (STATE.assessment.interval) clearInterval(STATE.assessment.interval);
        STATE.assessment.active = false;
        renderAssessmentSummary();
        showScreen('screen-assessment-done');
    }

    function renderAssessmentSummary() {
        const profile = STATE.profiles[STATE.assessment.studentId];
        const el      = get('assessment-summary-body');
        if (!el || !profile) return;

        const rows = OPS_ORDER.map(op => {
            const lvl     = profile[opToField(op)];
            const display = lvl === null ? '—' : lvl === 0 ? 'FAIL' : `L${lvl}`;
            const color   = lvl === 0 ? 'text-red-400' : lvl === null ? 'text-[var(--muted)]' : 'text-[var(--green)]';
            const opNames = { add: 'Addition', sub: 'Subtraction', mult: 'Multiplication', div: 'Division' };
            return `<tr>
                <td class="p-3 f-display text-white font-bold">${opIcon(op)} ${opNames[op]}</td>
                <td class="p-3 f-mono ${color} font-bold text-center">${display}</td>
            </tr>`;
        }).join('');

        el.innerHTML = rows;
        get('assessment-done-name').textContent = profile.name;

        const p2sec = get('p2-entry-section');
        if (p2sec) p2sec.classList.remove('hidden');
        const lbl = get('battle-p2-label');
        if (lbl) lbl.style.display = '';
    }

    function finishAssessmentDone() {
        showScreen('screen-menu');
    }

    /* ─────────────────────────────────────────────────────────────
       §12  BATTLE MODE — NAME ENTRY WITH AUTOCOMPLETE
       ───────────────────────────────────────────────────────────── */
    function setupBattleMode(isArcade = false) {
        STATE.gameType         = isArcade ? 'arcade' : 'battle';
        STATE.battle.isArcade  = isArcade;
        STATE.battle.p1        = null;
        STATE.battle.p2        = null;
        STATE.battle.acFocusIndex = { p1: -1, p2: -1 };

        const p2sec = get('p2-entry-section');
        if (p2sec) p2sec.classList.remove('hidden');
        const lbl = get('battle-p2-label');
        if (lbl) lbl.style.display = '';
        const titleEl = get('battle-entry-title');
        if (titleEl) titleEl.textContent = isArcade ? 'Arcade Mode' : 'Battle Mode';
        const subEl = get('battle-entry-sub');
        if (subEl) subEl.textContent = isArcade
            ? 'No data saved · Select operations below'
            : 'Enter your names to find your profiles';
        const startBtn = get('btn-start-battle');
        if (startBtn) { startBtn.textContent = isArcade ? 'PLAY!' : 'FIGHT!'; startBtn.onclick = startBattleGame; }

        const arcadeOpsEl = get('arcade-ops-selector');
        if (arcadeOpsEl) arcadeOpsEl.style.display = isArcade ? 'flex' : 'none';

        get('p1-name-input').value = '';
        get('p2-name-input').value = '';
        closeAutocomplete('p1');
        closeAutocomplete('p2');
        get('p1-selected-card').classList.add('hidden');
        get('p2-selected-card').classList.add('hidden');
        get('btn-start-battle').disabled = true;

        showScreen('screen-battle-entry');
        get('p1-name-input').focus();
    }

    function setupArcadeMode() { setupBattleMode(true); }

    function toggleArcadeOp(op) {
        STATE.battle.arcadeOps[op] = !STATE.battle.arcadeOps[op];
        const el = get(`arcade-op-${op}`);
        if (el) el.classList.toggle('op-active', STATE.battle.arcadeOps[op]);
        const anyOn = Object.values(STATE.battle.arcadeOps).some(Boolean);
        if (!anyOn) {
            STATE.battle.arcadeOps[op] = true;
            if (el) el.classList.add('op-active');
        }
    }

    function onNameInput(player) {
        const input = get(`${player}-name-input`);
        const query = input.value;
        if (STATE.battle[player]) {
            STATE.battle[player] = null;
            get(`${player}-selected-card`).classList.add('hidden');
            updateStartBattleButton();
        }
        if (query.length === 0) { closeAutocomplete(player); return; }
        renderAutocomplete(player, searchStudents(query), query);
    }

    function onNameKeydown(event, player) {
        const list  = get(`${player}-ac-list`);
        const items = list.querySelectorAll('.ac-item');
        let   idx   = STATE.battle.acFocusIndex[player];

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            idx = Math.min(idx + 1, items.length - 1);
            STATE.battle.acFocusIndex[player] = idx;
            highlightAcItem(items, idx);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            idx = Math.max(idx - 1, 0);
            STATE.battle.acFocusIndex[player] = idx;
            highlightAcItem(items, idx);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            if (idx >= 0 && items[idx]) items[idx].click();
            else confirmFreeText(player);
        } else if (event.key === 'Escape') {
            closeAutocomplete(player);
        } else if (event.key === 'Tab') {
            closeAutocomplete(player);
        }
    }

    function highlightAcItem(items, idx) {
        items.forEach(el => el.classList.remove('focused'));
        if (items[idx]) { items[idx].classList.add('focused'); items[idx].scrollIntoView({ block: 'nearest' }); }
    }

    function renderAutocomplete(player, results, query) {
        const list = get(`${player}-ac-list`);
        STATE.battle.acFocusIndex[player] = -1;
        if (results.length === 0) { closeAutocomplete(player); return; }

        const ql = query.toLowerCase();
        list.innerHTML = results.map((s, i) => {
            const nl  = s.name.toLowerCase();
            const ms  = nl.indexOf(ql);
            let   dn  = s.name;
            if (ms !== -1) dn = s.name.slice(0, ms)
                + `<span class="ac-highlight">${s.name.slice(ms, ms + query.length)}</span>`
                + s.name.slice(ms + query.length);
            const g = s.gender === 'F' ? '♀' : '♂';

            const sid = buildStudentId(s.name, s.class);
            const p   = STATE.profiles[sid];
            const levelBadge = p
                ? `<span class="ac-level-badge">${opIcon('add')}${p.addition_level ?? '?'} ${opIcon('sub')}${p.subtraction_level ?? '?'}</span>`
                : '';

            return `<div class="ac-item" onclick="selectStudent('${player}', ${STATE.students.indexOf(s)})">
                <span class="ac-name">${dn}</span>
                <span class="ac-meta">Cls ${s.class}${s.division} ${g} ${levelBadge}</span>
            </div>`;
        }).join('');
        list.classList.add('open');
    }

    function closeAutocomplete(player) {
        const list = get(`${player}-ac-list`);
        if (list) { list.classList.remove('open'); list.innerHTML = ''; }
        STATE.battle.acFocusIndex[player] = -1;
    }

    function selectStudent(player, studentIndex) {
        const student = STATE.students[studentIndex];
        if (!student) return;
        STATE.battle[player] = student;
        get(`${player}-name-input`).value = student.name;
        closeAutocomplete(player);

        const card = get(`${player}-selected-card`);
        get(`${player}-sc-init`).textContent = student.name.charAt(0).toUpperCase();
        get(`${player}-sc-name`).textContent = student.name;
        const g    = student.gender === 'F' ? '♀' : '♂';
        const sid  = buildStudentId(student.name, student.class);
        const p    = STATE.profiles[sid];
        const lvls = p ? `| +${p.addition_level ?? '?'} −${p.subtraction_level ?? '?'} ×${p.multiplication_level ?? '?'} ÷${p.division_level ?? '?'}` : '';
        get(`${player}-sc-meta`).textContent = `Class ${student.class} · Div ${student.division} · ${g} ${lvls}`;
        card.classList.remove('hidden');
        updateStartBattleButton();
    }

    function confirmFreeText(player) {
        const val = get(`${player}-name-input`).value.trim();
        if (!val) return;
        closeAutocomplete(player);
        const results = searchStudents(val);
        if (results.length === 1) { selectStudent(player, STATE.students.indexOf(results[0])); return; }
        STATE.battle[player] = { name: val, class: '?', division: '?', gender: '?' };
        get(`${player}-sc-init`).textContent = val.charAt(0).toUpperCase();
        get(`${player}-sc-name`).textContent = val;
        get(`${player}-sc-meta`).textContent = 'Guest Player';
        get(`${player}-selected-card`).classList.remove('hidden');
        updateStartBattleButton();
    }

    function clearPlayerSelection(player) {
        STATE.battle[player] = null;
        get(`${player}-name-input`).value = '';
        get(`${player}-selected-card`).classList.add('hidden');
        closeAutocomplete(player);
        updateStartBattleButton();
        get(`${player}-name-input`).focus();
    }

    function updateStartBattleButton() {
        const btn  = get('btn-start-battle');
        const p1ok = STATE.battle.p1 !== null || get('p1-name-input').value.trim().length > 0;
        const p2ok = STATE.gameType === 'assessment'
            ? true
            : (STATE.battle.p2 !== null || get('p2-name-input').value.trim().length > 0);
        if (btn) btn.disabled = !(p1ok && p2ok);
    }

    function startBattleGame() {
        if (!STATE.battle.p1) confirmFreeText('p1');
        if (STATE.gameType !== 'assessment' && !STATE.battle.p2) confirmFreeText('p2');

        const p1 = STATE.battle.p1;
        const p2 = STATE.battle.p2;
        if (!p1) { alert('Player 1 must enter a name.'); return; }
        if (STATE.gameType !== 'assessment' && !p2) { alert('Player 2 must enter a name.'); return; }
        if (STATE.gameType !== 'assessment' && p1.name === p2.name) {
            alert('Both players cannot have the same name.'); return;
        }

        runKbdPreCheck(() => prepareGame(p1.name, p2.name));
    }

    /* ─────────────────────────────────────────────────────────────
       §13  ADMIN / COMPETITION ACCESS
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
       §14  TOURNAMENT — STEP 1: SCOPE SELECTION
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
       §14b  TOURNAMENT — STEP 2: ROSTER BUILDER
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
       §14c  TOURNAMENT — STEP 3: MATCH ORDER
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
       §15  TOURNAMENT — LIVE HUB
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

    // Legacy stubs
    function generateBracket() { confirmRoster(); }
    function setActiveMatch() {}
    function addTourneyPlayer() {}
    function clearTPlayers() {}
    function removeTourneyPlayer() {}
    function loadRosterIntoPlayers() {}

    /* ─────────────────────────────────────────────────────────────
       §16  HISTORY
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
       §17  TEACHER DASHBOARD
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
       §18  GAME LIFECYCLE — PREPARE & COUNTDOWN
       ───────────────────────────────────────────────────────────── */
    function prepareGame(p1Name, p2Name) {
        if (STATE.game.interval) { clearInterval(STATE.game.interval); STATE.game.interval = null; }
        AUDIO.stopBGM();

        let difficulty = 1;
        if (STATE.gameType === 'tournament') {
            const roundsLeft = STATE.tourney.bracket.length - 1 - STATE.tourney.activeRound;
            if (roundsLeft <= 0)      difficulty = 4;
            else if (roundsLeft <= 1) difficulty = 3;
            else if (roundsLeft <= 2) difficulty = 2;
        }

        STATE.game.active      = false;
        STATE.game.timer       = 60;
        STATE.game.tugValue    = 50;
        STATE.game.suddenDeath = false;
        STATE.game.difficulty  = difficulty;
        STATE.game.p1          = createPlayerState(p1Name);
        STATE.game.p2          = createPlayerState(p2Name);

        layoutGameZones();
        resetGameUI();
        showScreen('screen-game');
        runCountdown();
    }

    function createPlayerState(name) {
        return {
            name, score: 0, streak: 0, frozen: false,
            processing: false, ans: '', q: null,
            wrongTimes: [], startTime: 0
        };
    }

    function layoutGameZones() {
        const isLandscape = window.innerWidth >= 1024;
        const zone1   = get('zone-p1');
        const zone2   = get('zone-p2');
        const divider = get('rope-divider');
        if (isLandscape) {
            if (zone1)   zone1.style.cssText   = 'position:absolute;top:0;left:0;bottom:0;right:50%;';
            if (zone2)   zone2.style.cssText   = 'position:absolute;top:0;left:50%;bottom:0;right:0;';
            if (divider) divider.className     = 'rope-divider v';
        } else {
            if (zone1)   zone1.style.cssText   = 'position:absolute;top:0;left:0;right:0;bottom:50%;';
            if (zone2)   zone2.style.cssText   = 'position:absolute;top:50%;left:0;right:0;bottom:0;';
            if (divider) divider.className     = 'rope-divider h';
        }
    }

    window.addEventListener('resize', () => {
        if (STATE.game.active) { layoutGameZones(); updateTugVisuals(); }
    });

    function resetGameUI() {
        const p1 = STATE.game.p1, p2 = STATE.game.p2;

        const p1name  = get('p1-name');    if (p1name)  p1name.textContent  = p1.name;
        const p1score = get('p1-score');   if (p1score) p1score.textContent = '0';
        const p1av    = get('p1-avatar-txt'); if (p1av) p1av.textContent    = p1.name.charAt(0).toUpperCase();

        const p2name  = get('p2-name');    if (p2name)  p2name.textContent  = p2.name;
        const p2score = get('p2-score');   if (p2score) p2score.textContent = '0';
        const p2av    = get('p2-avatar-txt'); if (p2av) p2av.textContent    = p2.name.charAt(0).toUpperCase();

        ['p1', 'p2'].forEach(pl => {
            const inp   = get(`${pl}-input`);    if (inp)   inp.textContent    = '';
            const combo = get(`${pl}-combo`);    if (combo) combo.style.display = 'none';
            const froz  = get(`${pl}-frozen`);   if (froz)  froz.style.display = 'none';
            const qtxt  = get(`${pl}-q-text`);   if (qtxt)  qtxt.textContent   = '…';
            const opts  = get(`${pl}-eng-opts`); if (opts)  opts.classList.add('hidden');
            clearFeedback(pl);
        });

        const pill = get('timer-pill');
        if (pill) pill.classList.remove('danger', 'sd');
        const timerEl = get('game-timer');
        if (timerEl) timerEl.textContent = '60';

        const ws = get('screen-winner');
        if (ws) ws.style.display = 'none';

        updateTugVisuals();
    }

    function clearFeedback(player) {
        const fb = get(`${player}-feedback`);
        if (fb) { fb.textContent = ''; fb.style.opacity = '0'; }
    }

    function runCountdown() {
        const overlay = get('countdown-overlay');
        const text    = get('countdown-text');
        if (overlay) overlay.style.display = 'flex';
        let count = 3;
        if (text) { text.textContent = count; text.className = 'countdown-num'; }
        AUDIO.playCountdown();

        const tick = setInterval(() => {
            count--;
            if (count > 0) {
                if (text) { text.textContent = count; text.className = 'countdown-num'; }
            } else if (count === 0) {
                if (text) { text.textContent = 'FIGHT!'; text.className = 'countdown-fight'; }
                AUDIO.playWin();
            } else {
                clearInterval(tick);
                if (overlay) overlay.style.display = 'none';
                startGame();
            }
        }, COUNTDOWN_TICK_MS);
    }

    /* ─────────────────────────────────────────────────────────────
       §19  GAME TICK & SUDDEN DEATH
       ───────────────────────────────────────────────────────────── */
    function startGame() {
        STATE.game.active = true;
        AUDIO.playBGM();
        generateQuestion('p1');
        generateQuestion('p2');
        STATE.game.interval = setInterval(gameTick, 1000);
    }

    function gameTick() {
        if (!STATE.game.active) return;
        STATE.game.timer--;
        const timerEl = get('game-timer');
        const pill    = get('timer-pill');

        if (STATE.game.suddenDeath) {
            if (timerEl) timerEl.textContent = 'SD!';
            if (pill)    pill.classList.add('sd');
        } else {
            if (timerEl) timerEl.textContent = STATE.game.timer;
            if (STATE.game.timer <= 10 && pill) pill.classList.add('danger');
            if (STATE.game.timer > 0
                && STATE.game.timer % DIFFICULTY_RAMP_SECS === 0
                && STATE.game.difficulty < 5) {
                STATE.game.difficulty++;
            }
            if (STATE.game.timer <= 0) {
                if (STATE.game.tugValue === 50) triggerSuddenDeath();
                else                            endGame('TIME_UP');
            }
        }
    }

    function triggerSuddenDeath() {
        STATE.game.suddenDeath = true;
        STATE.game.timer       = 9999;
        AUDIO.playWrong();
        const overlay = get('countdown-overlay');
        const text    = get('countdown-text');
        if (overlay) overlay.style.display = 'flex';
        if (text)    { text.textContent = 'SUDDEN DEATH!'; text.className = 'countdown-fight'; }
        setTimeout(() => { if (overlay) overlay.style.display = 'none'; }, 1800);
    }

    /* ─────────────────────────────────────────────────────────────
       §20  QUESTION ENGINE
       ───────────────────────────────────────────────────────────── */
    const ENG_WORDS = [
        { f:'APPLE',  m:'A_PLE',  a:2, o:['R','P','S'] }, { f:'TIGER',  m:'TI_ER',  a:3, o:['A','I','G'] },
        { f:'HOUSE',  m:'HO_SE',  a:1, o:['U','A','E'] }, { f:'WATER',  m:'WA_ER',  a:3, o:['P','D','T'] },
        { f:'ROBOT',  m:'ROB_T',  a:3, o:['A','I','O'] }, { f:'MUSIC',  m:'MUS_C',  a:2, o:['K','I','E'] },
        { f:'PHONE',  m:'PH_NE',  a:3, o:['A','U','O'] }, { f:'EARTH',  m:'E_RTH',  a:1, o:['A','O','U'] },
        { f:'MONEY',  m:'MON_Y',  a:2, o:['I','E','A'] }, { f:'RIVER',  m:'RIV_R',  a:2, o:['A','E','I'] },
        { f:'STONE',  m:'ST_NE',  a:2, o:['A','O','I'] }, { f:'HAPPY',  m:'HA_PY',  a:1, o:['P','B','D'] },
        { f:'GREEN',  m:'GR_EN',  a:3, o:['I','A','E'] }, { f:'NIGHT',  m:'NI_HT',  a:1, o:['G','F','H'] },
        { f:'PIZZA',  m:'PI_ZA',  a:2, o:['S','Z','X'] }, { f:'TRAIN',  m:'TR_IN',  a:2, o:['E','A','I'] },
        { f:'GHOST',  m:'GH_ST',  a:3, o:['A','I','O'] }, { f:'MOUSE',  m:'MO_SE',  a:2, o:['O','U','A'] },
        { f:'CLOCK',  m:'CL_CK',  a:2, o:['A','O','U'] }, { f:'SPACE',  m:'SP_CE',  a:3, o:['E','I','A'] },
        { f:'WORLD',  m:'WO_LD',  a:1, o:['R','L','D'] }, { f:'TABLE',  m:'TA_LE',  a:2, o:['P','B','D'] },
        { f:'FLOOR',  m:'FL_OR',  a:2, o:['A','O','U'] }, { f:'SHOES',  m:'SH_ES',  a:1, o:['O','A','I'] },
        { f:'FRUIT',  m:'FR_IT',  a:3, o:['O','I','U'] }, { f:'GRAPE',  m:'GR_PE',  a:3, o:['E','I','A'] },
        { f:'BREAD',  m:'BR_AD',  a:3, o:['E','I','O'] }, { f:'CLOUD',  m:'CL_UD',  a:3, o:['O','A','U'] },
        { f:'DREAM',  m:'DR_AM',  a:3, o:['E','A','I'] }, { f:'FLAME',  m:'FL_ME',  a:3, o:['A','O','I'] },
        { f:'GLOBE',  m:'GL_BE',  a:3, o:['O','A','I'] }, { f:'PLANT',  m:'PL_NT',  a:3, o:['A','O','I'] },
        { f:'SMILE',  m:'SM_LE',  a:2, o:['I','O','A'] }, { f:'STORM',  m:'ST_RM',  a:3, o:['O','A','U'] },
        { f:'SWORD',  m:'SW_RD',  a:3, o:['O','A','U'] }, { f:'TOWER',  m:'T_WER',  a:1, o:['O','A','E'] },
        { f:'TRIBE',  m:'TR_BE',  a:2, o:['I','A','O'] }, { f:'VOICE',  m:'VO_CE',  a:2, o:['I','A','O'] },
        { f:'WHEEL',  m:'WH_EL',  a:3, o:['E','A','O'] }, { f:'YOUTH',  m:'Y_UTH',  a:1, o:['O','A','U'] },
    ];

    function rand(n) { return Math.floor(Math.random() * n) + 1; }

    function generateQuestion(player) {
        const diff = STATE.game.difficulty;
        const q    = GAME_MODE.mode === 'math'
            ? generateMathQuestion(diff)
            : generateEnglishQuestion();
        STATE.game[player].q         = q;
        STATE.game[player].startTime = Date.now();
        STATE.game[player].ans       = '';
        renderQuestion(player, q);
    }

    function generateMathQuestion(diff) {
        const r          = Math.random();
        const isArcade   = STATE.gameType === 'arcade';
        const activeOps  = isArcade
            ? OPS_ORDER.filter(o => STATE.battle.arcadeOps[o])
            : null;

        let chosenOp;
        if (activeOps && activeOps.length > 0) {
            chosenOp = activeOps[Math.floor(Math.random() * activeOps.length)];
        } else {
            if (diff <= 1)      chosenOp = r > 0.5  ? 'add'  : 'sub';
            else if (diff <= 2) chosenOp = r > 0.55 ? 'mult' : 'add';
            else if (diff <= 3) chosenOp = r < 0.3  ? 'div'  : r < 0.6 ? 'mult' : 'sub';
            else if (diff <= 4) chosenOp = r < 0.35 ? 'div'  : r < 0.65 ? 'mult' : 'add';
            else                chosenOp = r < 0.4  ? 'mult' : 'add';
        }

        const single = () => Math.floor(Math.random() * 9) + 1;
        const double = () => Math.floor(Math.random() * 90) + 10;
        let a, b, op, ans;

        if (chosenOp === 'add') {
            if (diff <= 1)      { a = single(); b = single(); }
            else if (diff <= 3) { a = double(); b = double(); }
            else                { a = double() + 50; b = double(); }
            ans = a + b; op = '+';
        } else if (chosenOp === 'sub') {
            if (diff <= 1)      { a = single() + 5; b = single(); }
            else if (diff <= 3) { a = double() + 10; b = double() % 30 + 5; }
            else                { a = double() + 30; b = double(); }
            if (a < b) [a, b] = [b, a];
            ans = a - b; op = '−';
        } else if (chosenOp === 'mult') {
            if (diff <= 2)      { a = single(); b = single(); }
            else if (diff <= 4) { a = single() + 2; b = single() + 2; }
            else                { a = rand(15) + 5; b = rand(15) + 5; }
            ans = a * b; op = '×';
        } else {
            if (diff <= 2)      { b = single(); a = b * single(); }
            else if (diff <= 4) { b = single() + 1; a = b * (rand(9) + 2); }
            else                { b = single() + 2; a = b * (rand(11) + 3); }
            ans = a / b; op = '÷';
        }

        return { type: 'math', text: `${a} ${op} ${b}`, ans: Math.round(ans) };
    }

    function generateEnglishQuestion() {
        const word = ENG_WORDS[Math.floor(Math.random() * ENG_WORDS.length)];
        return { type: 'eng', text: word.m, ans: word.a, opts: word.o };
    }

    function renderQuestion(player, q) {
        const qtxt  = get(`${player}-q-text`);
        const inp   = get(`${player}-input`);
        const opts  = get(`${player}-eng-opts`);
        if (qtxt) qtxt.textContent = q.text;
        if (inp)  inp.textContent  = '';
        if (!opts) return;

        if (q.type === 'eng') {
            opts.classList.remove('hidden');
            const cc = player === 'p1' ? 'eng-opt-p1' : 'eng-opt-p2';
            opts.innerHTML = q.opts.map((opt, i) =>
                `<div class="eng-opt ${cc}" onclick="tapInput('${player}','${i + 1}')">
                    <span class="text-[var(--muted)] text-[10px]">${i + 1}.</span> ${opt}
                </div>`).join('');
        } else {
            opts.classList.add('hidden');
        }
    }

    /* ─────────────────────────────────────────────────────────────
       §21  INPUT HANDLING & VALIDATION
       ───────────────────────────────────────────────────────────── */
    document.addEventListener('keydown', (e) => {
        if (STATE.assessment.active) return;
        if (STATE.kbdCheck.active)   return;
        if (!STATE.game.active)      return;

        const k        = e.key;
        const isDigit  = /^[0-9]$/.test(k);
        const isNumpad = e.code.startsWith('Numpad') && isDigit;
        const isTopRow = e.code.startsWith('Digit')  && isDigit;

        if (isTopRow && !STATE.game.p1.frozen) handleInput('p1', k);
        if (e.code === 'KeyS')                clearInput('p1');

        if (isNumpad && !STATE.game.p2.frozen) handleInput('p2', k);
        if (e.code === 'Backspace')           clearInput('p2');
    });

    document.addEventListener('keydown', (e) => {
        if (!STATE.assessment.active) return;
        if (e.key === 'Enter') { e.preventDefault(); submitAssessmentAnswer(); }
    });

    function tapInput(player, char) {
        if (!STATE.game.active) return;
        if (STATE.game[player].frozen) return;
        handleInput(player, char);
    }

    function tapClear(player) {
        if (STATE.game.active) clearInput(player);
    }

    function handleInput(player, char) {
        const ps = STATE.game[player];
        if (ps.frozen || ps.processing) return;
        const q = ps.q;
        if (!q) return;
        ps.ans += char;
        const inp = get(`${player}-input`);
        if (inp) inp.textContent = ps.ans;
        if (ps.ans.length >= q.ans.toString().length) {
            ps.processing = true;
            setTimeout(() => validate(player), 60);
        }
    }

    function clearInput(player) {
        STATE.game[player].ans = '';
        const inp = get(`${player}-input`);
        if (inp) inp.textContent = '';
    }

    function validate(player) {
        const ps      = STATE.game[player];
        const given   = parseInt(ps.ans, 10);
        const correct = ps.q.ans;
        const elapsed = Date.now() - ps.startTime;

        if (given === correct) onCorrectAnswer(player, elapsed);
        else                   onWrongAnswer(player, elapsed);

        setTimeout(() => {
            ps.processing = false;
            clearInput(player);
            generateQuestion(player);
        }, FEEDBACK_VISIBLE_MS);
    }

    function onCorrectAnswer(player, elapsed) {
        const ps = STATE.game[player];
        ps.score++;
        ps.streak++;

        if (STATE.gameType !== 'arcade') updateMatchStats(ps.name, true, elapsed);

        const scoreEl = get(`${player}-score`);
        if (scoreEl) scoreEl.textContent = ps.score;
        AUDIO.playCorrect();
        flashFeedback(`${player}-feedback`, '+GOOD', 'feedback-flash text-[var(--green)]');

        if (ps.streak >= 3) {
            const c = get(`${player}-combo`);
            if (c) c.style.display = 'inline-flex';
        }

        let power = 8;
        if (ps.streak >= 3) power = 14;
        if (ps.streak >= 6) power = 18;
        if (player === 'p1' && STATE.game.tugValue > 72) power += 6;
        if (player === 'p2' && STATE.game.tugValue < 28) power += 6;

        if (power > 12) {
            document.body.classList.add('shake');
            setTimeout(() => document.body.classList.remove('shake'), 450);
        }
        moveTug(player, power);
    }

    function onWrongAnswer(player, elapsed) {
        const ps  = STATE.game[player];
        const opp = player === 'p1' ? 'p2' : 'p1';
        ps.streak = 0;
        const c = get(`${player}-combo`);
        if (c) c.style.display = 'none';

        if (STATE.gameType !== 'arcade') updateMatchStats(ps.name, false, elapsed);

        AUDIO.playWrong();
        flashFeedback(`${player}-feedback`, 'MISS', 'feedback-flash text-[var(--red)]');
        moveTug(opp, 4);

        const now = Date.now();
        ps.wrongTimes.push(now);
        if (ps.wrongTimes.length > WRONG_SPAM_COUNT) ps.wrongTimes.shift();
        if (ps.wrongTimes.length === WRONG_SPAM_COUNT) {
            const window = ps.wrongTimes[WRONG_SPAM_COUNT - 1] - ps.wrongTimes[0];
            if (window < WRONG_SPAM_WINDOW_MS) {
                freezePlayer(player);
                ps.wrongTimes = [];
            }
        }
    }

    /* ─────────────────────────────────────────────────────────────
       §22  TUG-OF-WAR PHYSICS & VISUALS
       ───────────────────────────────────────────────────────────── */
    function moveTug(puller, amount) {
        if (puller === 'p1') STATE.game.tugValue -= amount;
        else                 STATE.game.tugValue += amount;
        STATE.game.tugValue = Math.max(0, Math.min(TUG_WIN_THRESHOLD, STATE.game.tugValue));
        updateTugVisuals();
        if (STATE.game.tugValue <= 0)                      endGame('P1_WIN');
        else if (STATE.game.tugValue >= TUG_WIN_THRESHOLD) endGame('P2_WIN');
    }

    function updateTugVisuals() {
        const tug    = STATE.game.tugValue;
        const marker = get('rope-marker');
        const pctEl  = get('rope-pct');
        if (!marker) return;

        const zone1 = get('zone-p1'), zone2 = get('zone-p2');
        if (zone1 && zone2) {
            if (tug < 40) {
                zone1.style.background = 'radial-gradient(ellipse 80% 60% at 50% 120%, rgba(79,70,229,0.18) 0%, transparent 70%)';
                zone2.style.background = 'radial-gradient(ellipse 80% 60% at 50% -20%, rgba(245,158,11,0.04) 0%, transparent 70%)';
            } else if (tug > 60) {
                zone1.style.background = 'radial-gradient(ellipse 80% 60% at 50% 120%, rgba(79,70,229,0.04) 0%, transparent 70%)';
                zone2.style.background = 'radial-gradient(ellipse 80% 60% at 50% -20%, rgba(245,158,11,0.18) 0%, transparent 70%)';
            } else {
                zone1.style.background = 'radial-gradient(ellipse 80% 60% at 50% 120%, rgba(79,70,229,0.08) 0%, transparent 70%)';
                zone2.style.background = 'radial-gradient(ellipse 80% 60% at 50% -20%, rgba(245,158,11,0.08) 0%, transparent 70%)';
            }
        }

        const offset      = (tug - 50) * 0.9;
        const isLandscape = window.innerWidth >= 1024;
        marker.style.left      = '50%';
        marker.style.top       = '50%';
        marker.style.transform = isLandscape
            ? `translate(calc(-50% + ${offset}vw), -50%)`
            : `translate(-50%, calc(-50% + ${offset}vh))`;

        if (pctEl) pctEl.textContent = Math.round(tug);
    }

    /* ─────────────────────────────────────────────────────────────
       §23  FREEZE MECHANIC
       ───────────────────────────────────────────────────────────── */
    function freezePlayer(player) {
        const ps = STATE.game[player];
        ps.frozen = true;
        const ov = get(`${player}-frozen`);
        if (ov) ov.style.display = 'flex';
        setTimeout(() => {
            ps.frozen = false;
            if (ov) ov.style.display = 'none';
        }, FREEZE_DURATION_MS);
    }

    /* ─────────────────────────────────────────────────────────────
       §24  GAME END & WINNER SCREEN
       ───────────────────────────────────────────────────────────── */
    function endGame(reason) {
        if (!STATE.game.active) return;
        STATE.game.active = false;
        clearInterval(STATE.game.interval);
        STATE.game.interval = null;
        AUDIO.stopBGM();

        const p1 = STATE.game.p1, p2 = STATE.game.p2;
        let winnerName, winReason;

        switch (reason) {
            case 'P1_WIN':
                winnerName = p1.name;
                winReason  = 'Knockout! Pulled to victory.';
                break;
            case 'P2_WIN':
                winnerName = p2.name;
                winReason  = 'Knockout! Pulled to victory.';
                break;
            case 'TIME_UP':
                if      (STATE.game.tugValue < 50) { winnerName = p1.name; winReason = "Time's up — P1 had the edge!"; }
                else if (STATE.game.tugValue > 50) { winnerName = p2.name; winReason = "Time's up — P2 had the edge!"; }
                else                               { winnerName = 'DRAW';  winReason = 'Perfect tie!'; }
                break;
            default:
                winnerName = reason;
                winReason  = STATE.game.suddenDeath ? 'Sudden Death Victory!' : 'Victory!';
        }

        AUDIO.playWin();
        if (winnerName !== 'DRAW') {
            confetti({ particleCount: 220, spread: 110, origin: { y: 0.6 },
                       colors: ['#4F46E5', '#F59E0B', '#10B981', '#fff'] });
        }

        const wn = get('winner-name');   if (wn)  wn.textContent  = winnerName;
        const wr = get('winner-reason'); if (wr)  wr.textContent  = winReason;
        const ws2= get('winner-scores'); if (ws2) ws2.textContent = `${p1.score * 10} – ${p2.score * 10}`;

        const ws = get('screen-winner');
        if (ws) ws.style.display = 'flex';

        const btn = get('btn-winner-continue');
        if (btn) btn.onclick = () => {
            if (ws) ws.style.display = 'none';
            if (STATE.gameType === 'tournament') handleTournamentWin(winnerName);
            else                                showScreen('screen-menu');
        };
    }

    /* ─────────────────────────────────────────────────────────────
       §25  OUTSIDE-CLICK → CLOSE AUTOCOMPLETE
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
