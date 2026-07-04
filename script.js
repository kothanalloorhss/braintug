/* =============================================================
   BRAIN TUG — PRO ARENA  |  script.js  v2.0
   Full engine: Setup · Assessment · Battle · Arcade ·
                Tournament · Analytics · Export
   ============================================================= */

'use strict';

/* ─────────────────────────────────────────────────────────────
   §1  CONSTANTS & CONFIG
   ───────────────────────────────────────────────────────────── */

const ADMIN_PASSWORD   = 'admin';
const SETUP_DATE_KEY   = 'bt_setup_date';
const PROFILES_KEY     = 'bt_profiles';      // NEW schema: keyed by student_id
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
const OPS_ORDER = ['add', 'sub', 'mult', 'div'];  // Sequential operation order
const STRIKES_BEFORE_FAIL = 3;                     // Auto-fail after 3 consecutive errors
const LEVELS_PER_OP       = 3;                     // Max level per operation

// Hidden dashboard: 5 clicks on title within 3 seconds
const HIDDEN_TRIGGER_CLICKS = 5;
const HIDDEN_TRIGGER_MS     = 3000;

// Keyboard pre-check codes (P1 = letter keys, P2 = numpad/number row)
// We ask P1 to press 'A' and P2 to press 'L' to verify two distinct keyboards
const KBD_CHECK_P1_CODE = 'KeyA';
const KBD_CHECK_P2_CODE = 'KeyL';

/* ─────────────────────────────────────────────────────────────
   §2  GLOBAL STATE
   ───────────────────────────────────────────────────────────── */

const STATE = {
    /* ── app-level ── */
    gameType:  'battle',   // 'assessment' | 'battle' | 'arcade' | 'tournament'
    students:  [],         // raw array from students.json
    profiles:  {},         // NEW schema — keyed by student_id (see buildStudentId)
    history:   [],
    teacherSort: { key: 'add_level', asc: false },
    muted: false,

    /* ── hidden dashboard trigger ── */
    titleClickCount: 0,
    titleClickTimer: null,

    /* ── setup wizard ── */
    setup: {
        kbd1Connected: false,
        kbd2Connected: false,
        step:          1,
        lastKbd1Time:  0,
    },

    /* ── keyboard pre-check (before multiplayer match) ── */
    kbdCheck: {
        active:    false,
        p1Ready:   false,
        p2Ready:   false,
        onSuccess: null,   // callback fired when both keys pressed
    },

    /* ── assessment (single player) ── */
    assessment: {
        active:           false,
        studentId:        null,
        opIndex:          0,      // index into OPS_ORDER
        level:            1,      // current level within an operation
        consecutiveErrors:0,
        opResults:        {},     // { add: level, sub: level, ... } collected so far
        q:                null,
        startTime:        0,
        interval:         null,
        timer:            90,     // seconds per operation block
        timesPerOp:       [],     // ms per answer for current op
    },

    /* ── battle / arcade name entry ── */
    battle: {
        p1: null,
        p2: null,
        acFocusIndex: { p1: -1, p2: -1 },
        arcadeOps: { add: true, sub: true, mult: false, div: false },
        isArcade: false,
    },

    /* ── active multiplayer game ── */
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

    /* ── tournament ── */
    tourney: {
        id:          null,
        players:     [],      // { name, studentId, present } objects
        bracket:     [],
        activeRound: 0,
        activeMatch: 0,
        classFilter: 'all',
    },
};

/* ─────────────────────────────────────────────────────────────
   §3  STUDENT PROFILE SCHEMA
   ───────────────────────────────────────────────────────────── */

/**
 * Build a unique student_id from name + class.
 * Avoids collisions between students with the same name in different classes.
 */
function buildStudentId(name, classVal) {
    return `${name.trim().toLowerCase().replace(/\s+/g, '_')}_cls${classVal}`;
}

/**
 * Get or create a profile for a student.
 * Schema (matches spec):
 * {
 *   student_id:          string,
 *   name:                string,
 *   class_val:           int,
 *   division:            string,
 *   gender:              string,
 *   addition_level:      int (0 = auto-failed, 1-3 = level cleared),
 *   subtraction_level:   int,
 *   multiplication_level:int,
 *   division_level:      int,
 *   strikes:             int,  // live counter during assessment, reset each op
 *   time_per_op:         [],   // ms per answer — detects spamming
 * }
 */
function getOrCreateProfile(studentObj) {
    const id = buildStudentId(studentObj.name, studentObj.class);
    if (!STATE.profiles[id]) {
        STATE.profiles[id] = {
            student_id:           id,
            name:                 studentObj.name,
            class_val:            studentObj.class,
            division:             studentObj.division,
            gender:               studentObj.gender,
            addition_level:       null,  // null = not yet assessed
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

/** Map op key to profile field name */
function opToField(op) {
    const map = { add: 'addition_level', sub: 'subtraction_level',
                  mult: 'multiplication_level', div: 'division_level' };
    return map[op];
}

/** Get a student's level for a specific operation (returns null if not assessed) */
function getOpLevel(studentId, op) {
    const p = STATE.profiles[studentId];
    if (!p) return null;
    return p[opToField(op)];
}

/** Get the average level across all assessed operations (for matchmaking) */
function getOverallLevel(studentId) {
    const p = STATE.profiles[studentId];
    if (!p) return 0;
    const vals = OPS_ORDER.map(op => p[opToField(op)]).filter(v => v !== null && v > 0);
    if (vals.length === 0) return 0;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/* ─────────────────────────────────────────────────────────────
   §4  DOM HELPERS
   ───────────────────────────────────────────────────────────── */

function get(id) { return document.getElementById(id); }
window.get = get;

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
window.showScreen = showScreen;

function openModal(id)  { const el = get(id); if (el) el.classList.add('open'); }
function closeModal(id) { const el = get(id); if (el) el.classList.remove('open'); }
window.openModal  = openModal;
window.closeModal = closeModal;

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
window.toggleMute = toggleMute;

/* ─────────────────────────────────────────────────────────────
   §6  STUDENT DATABASE  (loads students.json)
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
window.runSetup = runSetup;

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
window.skipSetup = skipSetup;

/* ─────────────────────────────────────────────────────────────
   §8  HIDDEN DASHBOARD TRIGGER
   Title element clicked 5× within 3 seconds → teacher panel
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
window.onTitleClick = onTitleClick;

/* ─────────────────────────────────────────────────────────────
   §9  KEYBOARD PRE-CHECK  (hardware validation before match)
   Requires P1 to press 'A', P2 to press 'L' — proves two keyboards
   ───────────────────────────────────────────────────────────── */

/**
 * Show the keyboard pre-check overlay before launching a multiplayer match.
 * @param {Function} onSuccess - called when both players have verified
 */
function runKbdPreCheck(onSuccess) {
    STATE.kbdCheck.active  = false;
    STATE.kbdCheck.p1Ready = false;
    STATE.kbdCheck.p2Ready = false;
    STATE.kbdCheck.onSuccess = onSuccess;

    // Render the overlay
    const overlay = get('kbd-precheck-overlay');
    if (overlay) {
        overlay.style.display = 'flex';
        renderKbdPreCheckUI();
        STATE.kbdCheck.active = true;
        document.addEventListener('keydown', onKbdPreCheckKey);
    } else {
        // Overlay not in HTML — skip check and proceed directly
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
        // Brief delay so players see the "all ready" state
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
window.skipKbdPreCheck = skipKbdPreCheck;

/* ─────────────────────────────────────────────────────────────
   §10  GAME MODE SELECTOR (Math / English)
   ───────────────────────────────────────────────────────────── */

// We keep a separate mode state for multiplayer games
// Assessment always uses math with its own op sequence
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
window.setGameMode = setGameMode;

function initModeButtons() {
    setGameMode('math');
}

/* ─────────────────────────────────────────────────────────────
   §11  ASSESSMENT MODE  (Single Player · Progressive)
   ───────────────────────────────────────────────────────────── */

/** Entry: show the student name selection screen for assessment */
function setupAssessmentMode() {
    STATE.gameType = 'assessment';
    // Reuse battle entry screen with single-player framing
    get('p2-entry-section').classList.add('hidden');      // hide P2 row
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
window.setupAssessmentMode = setupAssessmentMode;

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
window.startAssessment = startAssessment;

function showAssessmentScreen() {
    showScreen('screen-assessment');
}

/** Kick off the next operation (or finish if all done) */
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

    // Reset profile strikes for this op
    if (STATE.profiles[as.studentId]) {
        STATE.profiles[as.studentId].strikes = 0;
    }

    // Update UI labels
    const opNames = { add: 'Addition', sub: 'Subtraction', mult: 'Multiplication', div: 'Division' };
    get('assessment-op-name').textContent      = opNames[op];
    get('assessment-op-icon').textContent      = opIcon(op);
    get('assessment-level-label').textContent  = `Level ${as.level}`;
    get('assessment-timer-el').textContent     = as.timer;
    get('assessment-strikes-el').textContent   = '○○○';
    get('assessment-answer-input').value       = '';
    get('assessment-answer-input').focus();

    // Update op progress dots
    renderAssessmentProgress();

    // Generate first question
    generateAssessmentQuestion();

    // Start tick
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
        // Time expired for this op — record highest level reached
        endAssessmentOp(as.level);
    }
}

function generateAssessmentQuestion() {
    const as  = STATE.assessment;
    const op  = OPS_ORDER[as.opIndex];
    const lvl = as.level;
    let a, b, ans, text;

    // Level 1 = single digit, Level 2 = double digit, Level 3 = mixed/harder
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
        if (a < b) [a, b] = [b, a];   // ensure non-negative
        ans = a - b; text = `${a} − ${b}`;
    } else if (op === 'mult') {
        if (lvl === 1)      { a = single(); b = single(); }
        else if (lvl === 2) { a = double() % 20 + 2; b = single(); }
        else                { a = single() + 5; b = single() + 5; }
        ans = a * b; text = `${a} × ${b}`;
    } else { // div
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

/** Called when student submits an answer in assessment */
function submitAssessmentAnswer() {
    const as  = STATE.assessment;
    if (!as.active || !as.q) return;

    const raw     = get('assessment-answer-input').value.trim();
    const given   = parseInt(raw, 10);
    const correct = as.q.ans;
    const elapsed = Date.now() - as.startTime;

    // Record time for spam detection
    as.timesPerOp.push(elapsed);

    if (given === correct) {
        as.consecutiveErrors = 0;
        flashAssessmentFeedback(true);

        // Level up after 2 consecutive correct at current level
        as.level = Math.min(as.level + 0.5, LEVELS_PER_OP);  // increments in halves; floor on level-up
        const newLevel = Math.floor(as.level);
        get('assessment-level-label').textContent = `Level ${newLevel}`;

        if (as.level >= LEVELS_PER_OP) {
            // Cleared max level → record and move to next op
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
            // Auto-fail this operation — record level 0
            endAssessmentOp(0);
            return;
        }
        generateAssessmentQuestion();
    }
}
window.submitAssessmentAnswer = submitAssessmentAnswer;

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

    // Show brief result card then continue
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

    // Restore battle entry to normal multi-player state
    const p2sec = get('p2-entry-section');
    if (p2sec) p2sec.classList.remove('hidden');
    const lbl = get('battle-p2-label');
    if (lbl) lbl.style.display = '';
}
window.finishAssessmentDone = function() {
    showScreen('screen-menu');
};

/* ─────────────────────────────────────────────────────────────
   §12  BATTLE MODE — NAME ENTRY WITH AUTOCOMPLETE
   ───────────────────────────────────────────────────────────── */

function setupBattleMode(isArcade = false) {
    STATE.gameType         = isArcade ? 'arcade' : 'battle';
    STATE.battle.isArcade  = isArcade;
    STATE.battle.p1        = null;
    STATE.battle.p2        = null;
    STATE.battle.acFocusIndex = { p1: -1, p2: -1 };

    // Reset entry screen to full 2-player mode
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

    // Arcade ops selector
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
window.setupBattleMode = setupBattleMode;

function setupArcadeMode() { setupBattleMode(true); }
window.setupArcadeMode = setupArcadeMode;

/** Toggle an arcade operation checkbox */
function toggleArcadeOp(op) {
    STATE.battle.arcadeOps[op] = !STATE.battle.arcadeOps[op];
    const el = get(`arcade-op-${op}`);
    if (el) el.classList.toggle('op-active', STATE.battle.arcadeOps[op]);
    // Ensure at least one op is always selected
    const anyOn = Object.values(STATE.battle.arcadeOps).some(Boolean);
    if (!anyOn) {
        STATE.battle.arcadeOps[op] = true;
        if (el) el.classList.add('op-active');
    }
}
window.toggleArcadeOp = toggleArcadeOp;

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
window.onNameInput = onNameInput;

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
window.onNameKeydown = onNameKeydown;

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

        // Show operation levels in the dropdown if the student has been assessed
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
window.selectStudent = selectStudent;

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
window.clearPlayerSelection = clearPlayerSelection;

function updateStartBattleButton() {
    const btn  = get('btn-start-battle');
    const p1ok = STATE.battle.p1 !== null || get('p1-name-input').value.trim().length > 0;
    // If in assessment mode, only P1 matters
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
window.startBattleGame = startBattleGame;

/* ─────────────────────────────────────────────────────────────
   §13  ADMIN / COMPETITION ACCESS
   ───────────────────────────────────────────────────────────── */

function startCompetitionSetup() {
    get('admin-pass-input').value = '';
    get('admin-pass-error').classList.add('hidden');
    openModal('modal-admin-pass');
    setTimeout(() => get('admin-pass-input').focus(), 100);
}
window.startCompetitionSetup = startCompetitionSetup;

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
window.verifyAdminPass = verifyAdminPass;

function showTeacherLogin() {
    const pass = prompt('Enter Teacher Password:');
    if (pass === ADMIN_PASSWORD) { renderTeacherTable(); openModal('modal-teacher'); }
    else if (pass !== null) alert('Incorrect password.');
}
window.showTeacherLogin = showTeacherLogin;

/* ─────────────────────────────────────────────────────────────
   §14  TOURNAMENT SETUP  (Admin-only, level-based matchmaking)
   ───────────────────────────────────────────────────────────── */

function launchTournamentSetup() {
    STATE.gameType = 'tournament';

    // Resume check
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(ACTIVE_TOUR_KEY)); } catch (e) {}
    if (saved && saved.bracket && saved.bracket.length > 0) {
        if (confirm('Resume the active tournament?')) { loadTournament(saved); return; }
    }

    // Restore last player list
    const prev = JSON.parse(localStorage.getItem(LAST_PLAYERS_KEY) || '[]');
    if (prev.length > 0 && confirm(`Reload ${prev.length} students from last session?`)) {
        STATE.tourney.players = [...prev];
    } else {
        STATE.tourney.players = [];
    }

    STATE.tourney.id = Date.now();
    renderTourneyClassFilter();
    updateTourneyPlayerList();
    showScreen('screen-tourney-setup');
}

function loadTournament(data) {
    STATE.tourney.players     = data.players || [];
    STATE.tourney.bracket     = data.bracket || [];
    STATE.tourney.activeRound = data.activeRound || 0;
    STATE.tourney.activeMatch = data.activeMatch || 0;
    STATE.tourney.id          = data.id || Date.now();
    renderBracket();
    showScreen('screen-tourney-hub');
}

/** Build a class dropdown from unique classes in students.json */
function renderTourneyClassFilter() {
    const sel = get('tourney-class-filter');
    if (!sel) return;
    const classes = [...new Set(STATE.students.map(s => s.class))].sort((a, b) => a - b);
    sel.innerHTML = `<option value="all">All Classes</option>`
        + classes.map(c => `<option value="${c}">Class ${c}</option>`).join('');
    sel.onchange = () => {
        STATE.tourney.classFilter = sel.value;
        renderTourneyRoster();
    };
    renderTourneyRoster();
}

/**
 * Render the tournament roster with attendance toggles.
 * Filters students by selected class; each has a present/absent toggle.
 * By default all matching students are present (checked).
 */
function renderTourneyRoster() {
    const filter   = STATE.tourney.classFilter;
    const filtered = filter === 'all'
        ? STATE.students
        : STATE.students.filter(s => String(s.class) === String(filter));

    const roster = get('tourney-roster');
    if (!roster) { return; }

    if (filtered.length === 0) {
        roster.innerHTML = '<li class="text-center text-[var(--muted)] text-sm py-4">No students in this class.</li>';
        get('btn-load-roster').classList.add('hidden');
        return;
    }

    roster.innerHTML = filtered.map((s, i) => {
        const sid    = buildStudentId(s.name, s.class);
        const p      = STATE.profiles[sid];
        const lvl    = p ? `+${p.addition_level ?? '?'} −${p.subtraction_level ?? '?'}` : 'Not assessed';
        const g      = s.gender === 'F' ? '♀' : '♂';
        return `
        <li class="flex items-center gap-3 bg-[var(--surface)] p-2.5 rounded-lg border border-[var(--border)]">
            <label class="flex items-center gap-2 cursor-pointer flex-1">
                <input type="checkbox" id="roster-chk-${i}" class="roster-check" checked
                    data-name="${s.name}" data-class="${s.class}" data-division="${s.division}" data-gender="${s.gender}">
                <span class="f-display font-bold text-white text-sm">${s.name}</span>
                <span class="text-[var(--muted)] text-xs">${g} Cls ${s.class}${s.division}</span>
            </label>
            <span class="text-xs f-mono text-[var(--muted)]">${lvl}</span>
        </li>`;
    }).join('');

    get('btn-load-roster').classList.remove('hidden');
}

/** Load selected (present) students from roster checkboxes into the player list */
function loadRosterIntoPlayers() {
    const checks  = document.querySelectorAll('.roster-check:checked');
    const present = [];
    checks.forEach(ch => {
        const name  = ch.dataset.name;
        const clsV  = parseInt(ch.dataset.class, 10);
        const sid   = buildStudentId(name, clsV);
        // Avoid duplicates
        if (!present.some(p => p.studentId === sid)) {
            present.push({ name, studentId: sid, present: true,
                           class: clsV, division: ch.dataset.division, gender: ch.dataset.gender });
        }
    });
    if (present.length === 0) { alert('No students selected.'); return; }
    STATE.tourney.players = present;
    updateTourneyPlayerList();
    // Scroll down to the player list
    get('t-player-list').scrollIntoView({ behavior: 'smooth' });
}
window.loadRosterIntoPlayers = loadRosterIntoPlayers;

function addTourneyPlayer() {
    const inp  = get('tourney-input');
    const name = inp.value.trim();
    if (!name) return;
    // Allow adding by typing name (free entry)
    const existing = STATE.tourney.players.find(p => p.name === name);
    if (existing) { alert(`"${name}" is already in the list.`); return; }
    const sid = buildStudentId(name, 0);
    STATE.tourney.players.push({ name, studentId: sid, present: true, class: 0, division: '?', gender: '?' });
    inp.value = '';
    inp.focus();
    updateTourneyPlayerList();
    saveTourneyPlayers();
}
window.addTourneyPlayer = addTourneyPlayer;

function clearTPlayers() {
    if (!confirm('Remove all players?')) return;
    STATE.tourney.players = [];
    updateTourneyPlayerList();
}
window.clearTPlayers = clearTPlayers;

function removeTourneyPlayer(index) {
    STATE.tourney.players.splice(index, 1);
    updateTourneyPlayerList();
    saveTourneyPlayers();
}
window.removeTourneyPlayer = removeTourneyPlayer;

function saveTourneyPlayers() {
    localStorage.setItem(LAST_PLAYERS_KEY, JSON.stringify(STATE.tourney.players));
}

function updateTourneyPlayerList() {
    const count = STATE.tourney.players.length;
    const cntEl = get('t-player-count');
    if (cntEl) cntEl.textContent = `${count} Player${count !== 1 ? 's' : ''}`;

    const list = get('t-player-list');
    if (!list) return;
    if (count === 0) {
        list.innerHTML = '<li class="text-center text-[var(--muted)] text-sm py-4">No players yet.</li>';
    } else {
        list.innerHTML = STATE.tourney.players.map((p, i) => {
            const lvl = getOverallLevel(p.studentId);
            const lvlText = lvl > 0 ? `Lvl ${lvl.toFixed(1)}` : 'Unranked';
            return `
            <li class="flex justify-between items-center bg-[var(--surface)] p-2.5 rounded-lg border border-[var(--border)]">
                <span class="f-display font-bold text-white text-sm">${i + 1}. ${p.name}</span>
                <span class="text-xs f-mono text-[var(--muted)]">${lvlText}</span>
                <button onclick="removeTourneyPlayer(${i})" class="text-red-400 hover:text-white transition w-6 h-6 flex items-center justify-center">
                    <i class="fas fa-times text-xs"></i>
                </button>
            </li>`;
        }).join('');
    }

    const btn = get('btn-gen-bracket');
    if (btn) {
        if (count >= 2) { btn.classList.remove('hidden'); btn.textContent = `START BRACKET (${count})`; }
        else            btn.classList.add('hidden');
    }
}

/* ─────────────────────────────────────────────────────────────
   §15  BRACKET ENGINE  (Level-based pairing)
   ───────────────────────────────────────────────────────────── */

function generateBracket() {
    let players = STATE.tourney.players.map(p => p.name);
    if (players.length < 2) return;

    /**
     * Matchmaking: pair students with the closest overall operation level.
     * Sort by overall level, then zip top half vs bottom half.
     * This produces fair matches without using time or points.
     */
    const sorted = [...STATE.tourney.players].sort((a, b) => {
        return getOverallLevel(b.studentId) - getOverallLevel(a.studentId);
    });
    players = sorted.map(p => p.name);

    // Pad to next power of 2
    const size = Math.pow(2, Math.ceil(Math.log2(players.length)));
    while (players.length < size) players.push('BYE');

    // Interleave top seed vs bottom (fair bracket)
    const seeded = [];
    let lo = 0, hi = players.length - 1;
    while (lo <= hi) {
        seeded.push(players[lo++]);
        if (lo <= hi) seeded.push(players[hi--]);
    }

    STATE.tourney.bracket = [];
    const round1 = [];
    for (let i = 0; i < seeded.length; i += 2) {
        round1.push({ p1: seeded[i], p2: seeded[i + 1], winner: null });
    }
    STATE.tourney.bracket.push(round1);

    let prev = round1;
    while (prev.length > 1) {
        const next = [];
        for (let i = 0; i < Math.floor(prev.length / 2); i++) {
            next.push({ p1: 'TBD', p2: 'TBD', winner: null });
        }
        STATE.tourney.bracket.push(next);
        prev = next;
    }

    resolveByes();
    findNextMatch();
    saveTournament();
    renderBracket();
    showScreen('screen-tourney-hub');
}
window.generateBracket = generateBracket;

function resolveByes() {
    STATE.tourney.bracket[0].forEach((match, idx) => {
        if (match.p2 === 'BYE' && !match.winner) { match.winner = match.p1; forwardWinner(0, idx, match.p1); }
        else if (match.p1 === 'BYE' && !match.winner) { match.winner = match.p2; forwardWinner(0, idx, match.p2); }
    });
}

function forwardWinner(roundIdx, matchIdx, winnerName) {
    const nextRoundIdx = roundIdx + 1;
    if (nextRoundIdx >= STATE.tourney.bracket.length) return;
    const nextMatchIdx = Math.floor(matchIdx / 2);
    const slot         = matchIdx % 2 === 0 ? 'p1' : 'p2';
    const nextMatch    = STATE.tourney.bracket[nextRoundIdx][nextMatchIdx];
    nextMatch[slot]    = winnerName;
    const other        = slot === 'p1' ? 'p2' : 'p1';
    if (nextMatch[other] === 'BYE') { nextMatch.winner = winnerName; forwardWinner(nextRoundIdx, nextMatchIdx, winnerName); }
}

function findNextMatch() {
    for (let r = 0; r < STATE.tourney.bracket.length; r++) {
        for (let m = 0; m < STATE.tourney.bracket[r].length; m++) {
            const match = STATE.tourney.bracket[r][m];
            if (!match.winner && match.p1 !== 'TBD' && match.p2 !== 'TBD'
                && match.p1 !== 'BYE' && match.p2 !== 'BYE') {
                STATE.tourney.activeRound = r;
                STATE.tourney.activeMatch = m;
                return true;
            }
        }
    }
    STATE.tourney.activeRound = -1;
    STATE.tourney.activeMatch = -1;
    return false;
}

function setActiveMatch(r, m) { STATE.tourney.activeRound = r; STATE.tourney.activeMatch = m; renderBracket(); }
window.setActiveMatch = setActiveMatch;

function renderBracket() {
    const container = get('bracket-container');
    if (!container) return;
    container.innerHTML = '';

    STATE.tourney.bracket.forEach((round, rIdx) => {
        let label = `ROUND ${rIdx + 1}`;
        if (round.length === 1) label = '🏆 FINAL';
        else if (round.length === 2) label = 'SEMI-FINAL';

        let html = `<div class="mb-5">
            <h3 class="text-[10px] font-bold text-[var(--muted)] mb-2 uppercase tracking-widest f-display sticky top-0 py-1"
                style="background:rgba(13,21,39,0.9)">${label}</h3>
            <div class="flex flex-col gap-2">`;

        round.forEach((match, mIdx) => {
            const isActive   = rIdx === STATE.tourney.activeRound && mIdx === STATE.tourney.activeMatch;
            const isDone     = !!match.winner;
            const isPlayable = !isDone && match.p1 !== 'TBD' && match.p2 !== 'TBD'
                               && match.p1 !== 'BYE' && match.p2 !== 'BYE';

            let cls = 'bracket-match';
            if (isActive) cls += ' active';
            else if (isDone) cls += ' done';
            else if (isPlayable) cls += ' playable';

            const click   = isPlayable ? `onclick="setActiveMatch(${rIdx},${mIdx})"` : '';
            const p1Class = match.winner === match.p1 ? 'bracket-winner-text' : '';
            const p2Class = match.winner === match.p2 ? 'bracket-winner-text' : '';

            // Show level badges next to names
            const p1Sid = STATE.tourney.players.find(p => p.name === match.p1)?.studentId;
            const p2Sid = STATE.tourney.players.find(p => p.name === match.p2)?.studentId;
            const p1Lvl = p1Sid ? getOverallLevel(p1Sid).toFixed(1) : '';
            const p2Lvl = p2Sid ? getOverallLevel(p2Sid).toFixed(1) : '';

            html += `<div class="${cls}" ${click}>
                <span class="bracket-player ${p1Class}">${match.p1}
                    ${p1Lvl ? `<span class="text-[10px] text-[var(--muted)] ml-1">[${p1Lvl}]</span>` : ''}</span>
                <span class="text-[var(--muted)] text-[10px] font-bold f-display">VS</span>
                <span class="bracket-player ${p2Class} text-right">${match.p2}
                    ${p2Lvl ? `<span class="text-[10px] text-[var(--muted)] ml-1">[${p2Lvl}]</span>` : ''}</span>
            </div>`;
        });

        html += '</div></div>';
        container.innerHTML += html;
    });

    renderMatchCard();
}

function renderMatchCard() {
    const card = get('match-card-content');
    if (!card) return;

    if (STATE.tourney.activeRound === -1) {
        const champion = STATE.tourney.bracket[STATE.tourney.bracket.length - 1][0].winner;
        card.innerHTML = `<div class="text-center">
            <div class="text-[var(--green)] f-display font-bold text-xs uppercase tracking-widest mb-3">Champion</div>
            <div class="text-5xl mb-3">👑</div>
            <div class="f-display font-bold text-white text-2xl mb-6">${champion}</div>
            <button onclick="finishTournament('${champion}')" class="btn-primary w-full">Save & End</button>
        </div>`;
        return;
    }

    const match  = STATE.tourney.bracket[STATE.tourney.activeRound][STATE.tourney.activeMatch];
    const total  = STATE.tourney.bracket.length;
    let label = `Round ${STATE.tourney.activeRound + 1}`;
    if (STATE.tourney.activeRound === total - 1)      label = '🏆 FINAL';
    else if (STATE.tourney.activeRound === total - 2) label = 'SEMI-FINAL';

    const lbl = get('t-round-label');
    if (lbl) lbl.textContent = label;

    card.innerHTML = `<div class="text-center">
        <div class="text-[var(--p2)] f-display font-bold text-xs uppercase tracking-widest mb-3 animate-pulse">${label} · Up Next</div>
        <div class="f-display font-bold text-3xl text-[#818CF8] mb-2">${match.p1}</div>
        <div class="text-[var(--muted)] text-xs f-display mb-2">VS</div>
        <div class="f-display font-bold text-3xl text-[#FCD34D] mb-6">${match.p2}</div>
        <button onclick="runKbdPreCheck(() => prepareGame('${match.p1}', '${match.p2}'))" class="btn-primary w-full">
            <i class="fas fa-bolt mr-2"></i>START MATCH
        </button>
    </div>`;
}

function handleTournamentWin(winner) {
    const match  = STATE.tourney.bracket[STATE.tourney.activeRound][STATE.tourney.activeMatch];
    match.winner = winner;
    forwardWinner(STATE.tourney.activeRound, STATE.tourney.activeMatch, winner);
    findNextMatch();
    saveTournament();
    renderBracket();
    showScreen('screen-tourney-hub');
}

function saveTournament() {
    localStorage.setItem(ACTIVE_TOUR_KEY, JSON.stringify({
        id: STATE.tourney.id, players: STATE.tourney.players,
        bracket: STATE.tourney.bracket,
        activeRound: STATE.tourney.activeRound, activeMatch: STATE.tourney.activeMatch,
    }));
}

function saveAndExit() { saveTournament(); showScreen('screen-menu'); }
window.saveAndExit = saveAndExit;

function finishTournament(winner) {
    const record = {
        id: STATE.tourney.id,
        date: new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }),
        time: new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' }),
        winner, players: STATE.tourney.players.length, mode: GAME_MODE.mode,
    };
    STATE.history.unshift(record);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(STATE.history));
    localStorage.removeItem(ACTIVE_TOUR_KEY);
    showScreen('screen-menu');
}
window.finishTournament = finishTournament;

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
window.showHistory = showHistory;

function clearHistory() {
    if (!confirm('Clear all tournament history?')) return;
    STATE.history = [];
    localStorage.removeItem(HISTORY_KEY);
    showHistory();
}
window.clearHistory = clearHistory;

/* ─────────────────────────────────────────────────────────────
   §17  TEACHER DASHBOARD  (New schema · level-based · export)
   ───────────────────────────────────────────────────────────── */

/**
 * Record per-match stats — now written into the student profile's time_per_op.
 * NOTE: We no longer accumulate generic 'correct/wrong' counters.
 * Match results just update the profiles (which already happen in assessment).
 * For multiplayer matches, we track accuracy per player in the profile.
 */
function updateMatchStats(name, isCorrect, timeTakenMs) {
    if (!name || name === '?' || name.startsWith('Player') || name === 'ASSESSMENT') return;
    const student = STATE.students.find(s => s.name === name);
    if (!student) {
        // Create a minimal profile for tracking purposes
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

/** Compute a skill rating from operation levels only (replaces old accuracy×time formula) */
function getPlayerRating(studentId) {
    return getOverallLevel(studentId);
}

function sortTeacherTable(key) {
    if (STATE.teacherSort.key === key) STATE.teacherSort.asc = !STATE.teacherSort.asc;
    else { STATE.teacherSort.key = key; STATE.teacherSort.asc = (key === 'name'); }
    renderTeacherTable();
}
window.sortTeacherTable = sortTeacherTable;

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

        // Colour-code each level cell
        function levelCe
