/* =============================================================
   BRAIN TUG — PRO ARENA  |  script.js
   Full engine: Setup · Students · Battle · Competition · Stats
   ============================================================= */

'use strict';

/* ─────────────────────────────────────────────────────────────
   §1  CONSTANTS & CONFIG
   ───────────────────────────────────────────────────────────── */

const ADMIN_PASSWORD  = 'admin';        // Change to whatever the school wants
const SETUP_DATE_KEY  = 'bt_setup_date';
const STATS_KEY       = 'bt_stats';
const HISTORY_KEY     = 'bt_history';
const ACTIVE_TOUR_KEY = 'bt_active_tourney';
const LAST_PLAYERS_KEY= 'bt_last_players';
const STUDENTS_URL    = 'students.json';// Relative path — place file in same folder

// Rope boundary: if tugValue hits 0 → P1 wins; 100 → P2 wins
const TUG_WIN_THRESHOLD = 100;
const FREEZE_DURATION_MS = 2500;
const WRONG_SPAM_WINDOW_MS = 3000;
const WRONG_SPAM_COUNT = 3;
const COUNTDOWN_TICK_MS = 1000;
const FEEDBACK_VISIBLE_MS = 650;
const DIFFICULTY_RAMP_INTERVAL = 15; // seconds between auto-difficulty increases

/* ─────────────────────────────────────────────────────────────
   §2  GLOBAL STATE
   ───────────────────────────────────────────────────────────── */

const STATE = {
    /* ── app-level ── */
    mode: 'math',           // 'math' | 'english'
    gameType: 'battle',     // 'battle' | 'tournament'
    students: [],           // loaded from students.json
    stats: {},              // { "Name": { correct, wrong, timeSum, class, division, gender } }
    history: [],            // array of tournament result records
    teacherSort: { key: 'rating', asc: false },
    muted: false,

    /* ── setup wizard ── */
    setup: {
        kbd1Connected: false,
        kbd2Connected: false,
        step: 1,            // 1 = waiting for kbd1, 2 = waiting for kbd2, 3 = done
        firstKeys: {
            kbd1: null,     // Set of key codes detected first — helps distinguish keyboards
            kbd2: null,
        },
        /* We detect keyboards by listening which physical key arrives first.
           Once kbd1 is confirmed we wait for a *different* key group for kbd2.
           In a real multi-keyboard scenario the OS assigns separate event sources,
           but browsers merge them. We instead use a time-gate heuristic:
           any keypress triggers kbd1; after 600ms blackout, any NEW keypress = kbd2. */
        lastKbd1Time: 0,
    },

    /* ── battle name entry ── */
    battle: {
        p1: null,   // selected student object (or { name, class:'?', division:'?', gender:'?' })
        p2: null,
        acFocusIndex: { p1: -1, p2: -1 },
    },

    /* ── active game ── */
    game: {
        active: false,
        difficulty: 1,
        timer: 60,
        interval: null,
        tugValue: 50,       // 0 (P1 wins) ↔ 100 (P2 wins)
        suddenDeath: false,
        p1: null,           // player state objects created in setupPlayerState()
        p2: null,
    },

    /* ── tournament ── */
    tourney: {
        id: null,
        players: [],        // string names
        bracket: [],        // array of rounds, each round is array of match objects
        activeRound: 0,
        activeMatch: 0,
    },
};

/* ─────────────────────────────────────────────────────────────
   §3  DOM HELPERS
   ───────────────────────────────────────────────────────────── */

/** Shortcut for getElementById — also exposed globally for inline HTML usage */
function get(id) { return document.getElementById(id); }
window.get = get;  // used in inline HTML onclick snippets

/** Show one named screen, hide all others. Overlays (modal-*) are toggled separately. */
function showScreen(id) {
    // All .screen elements get hidden
    document.querySelectorAll('.screen').forEach(el => {
        el.classList.add('hidden');
        el.style.display = '';
    });
    const el = get(id);
    if (!el) return;
    el.classList.remove('hidden');
    // Some screens have explicit style="display:none" from HTML — clear that
    el.style.display = '';
}
window.showScreen = showScreen;

/** Open/close modal overlays (elements with class .modal-overlay) */
function openModal(id) {
    const el = get(id);
    if (el) el.classList.add('open');
}
function closeModal(id) {
    const el = get(id);
    if (el) el.classList.remove('open');
}

/** Flash an inline feedback element (the ±GOOD/MISS banners) */
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

/** Briefly animate a key on the setup screen */
function animateSetupKey(keyId) {
    const el = get(keyId);
    if (!el) return;
    el.classList.add('active');
    setTimeout(() => el.classList.remove('active'), 200);
}

/* ─────────────────────────────────────────────────────────────
   §4  AUDIO ENGINE
   ───────────────────────────────────────────────────────────── */

const AUDIO = {
    bgm:     null,
    correct: null,
    wrong:   null,
    win:     null,
    countdown: null,

    init() {
        this.bgm      = get('bgm');
        this.correct  = get('sfx-correct');
        this.wrong    = get('sfx-wrong');
        this.win      = get('sfx-win');
        this.countdown = get('sfx-countdown');
    },

    playBGM() {
        if (STATE.muted || !this.bgm) return;
        this.bgm.volume = 0.18;
        this.bgm.play().catch(() => {});
    },

    stopBGM() {
        if (!this.bgm) return;
        this.bgm.pause();
        this.bgm.currentTime = 0;
    },

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
    if (icon) {
        icon.className = STATE.muted
            ? 'fas fa-volume-mute' 
            : 'fas fa-volume-up text-[var(--muted)] text-sm';
    }
    if (STATE.muted) AUDIO.stopBGM();
    else if (STATE.game.active) AUDIO.playBGM();
}
window.toggleMute = toggleMute;

/* ─────────────────────────────────────────────────────────────
   §5  STUDENT DATABASE  (loads students.json)
   ───────────────────────────────────────────────────────────── */

async function loadStudents() {
    try {
        const resp = await fetch(STUDENTS_URL);
        if (!resp.ok) throw new Error('fetch failed');
        STATE.students = await resp.json();
    } catch (e) {
        // Graceful fallback — game still works without the JSON
        console.warn('students.json not found or invalid. Autocomplete will be empty.');
        STATE.students = [];
    }
}

/**
 * Search students by name prefix (case-insensitive).
 * Returns up to `limit` results sorted by best match.
 */
function searchStudents(query, limit = 6) {
    if (!query || query.length < 1) return [];
    const q = query.toLowerCase().trim();
    return STATE.students
        .filter(s => s.name.toLowerCase().includes(q))
        .sort((a, b) => {
            // Exact prefix match ranks higher
            const aStart = a.name.toLowerCase().startsWith(q) ? 0 : 1;
            const bStart = b.name.toLowerCase().startsWith(q) ? 0 : 1;
            return aStart - bStart || a.name.localeCompare(b.name);
        })
        .slice(0, limit);
}

/* ─────────────────────────────────────────────────────────────
   §6  DAILY SETUP WIZARD
   ───────────────────────────────────────────────────────────── */

/**
 * Decide whether to show setup or go straight to menu.
 * Setup runs once per calendar day, tracked in localStorage.
 * Pass `force = true` to re-run regardless.
 */
function runSetup(force = false) {
    const today = new Date().toDateString();
    const lastSetup = localStorage.getItem(SETUP_DATE_KEY);

    if (!force && lastSetup === today) {
        // Already done today — go to menu
        showScreen('screen-menu');
        return;
    }

    // Reset wizard state
    STATE.setup.kbd1Connected = false;
    STATE.setup.kbd2Connected = false;
    STATE.setup.step = 1;
    STATE.setup.lastKbd1Time = 0;

    // Reset UI
    const slot1 = get('kbd-slot-1');
    const slot2 = get('kbd-slot-2');
    slot1.className = 'kbd-slot waiting';
    slot2.className = 'kbd-slot idle';
    get('kbd1-label').textContent = 'PRESS ANY KEY';
    get('kbd1-status').textContent = 'Player 1 Keyboard';
    get('kbd2-label').textContent = 'WAITING…';
    get('kbd2-status').textContent = 'Player 2 Keyboard';
    get('kbd2-label').style.color = 'var(--muted)';
    get('setup-step-title').textContent = 'Step 1 — Player 1 Keyboard';
    get('setup-step-sub').textContent = 'Press any key on the first keyboard to confirm connection';

    showScreen('screen-setup');

    // Attach the one-time global listener for the wizard
    document.addEventListener('keydown', onSetupKeydown);
}
window.runSetup = runSetup;

/**
 * Keyboard listener active ONLY during setup wizard.
 * Removed once setup completes or is skipped.
 */
function onSetupKeydown(e) {
    e.preventDefault();

    if (STATE.setup.step === 1) {
        // ── Connect Keyboard 1 ──
        STATE.setup.lastKbd1Time = Date.now();
        STATE.setup.kbd1Connected = true;
        STATE.setup.step = 2;

        // Animate slot 1
        const slot1 = get('kbd-slot-1');
        slot1.className = 'kbd-slot connected';
        get('kbd1-label').textContent = '✓ CONNECTED';
        get('kbd1-label').style.color = 'var(--green)';
        get('kbd1-status').textContent = `Player 1 · ${e.key.toUpperCase()} detected`;

        // Flash key visuals
        const p1Keys = ['k1-q', 'k1-w', 'k1-e', 'k1-a', 'k1-s', 'k1-d'];
        p1Keys.forEach((k, i) => setTimeout(() => animateSetupKey(k), i * 60));

        // Activate slot 2
        const slot2 = get('kbd-slot-2');
        slot2.className = 'kbd-slot waiting';
        get('kbd2-label').textContent = 'PRESS ANY KEY';
        get('kbd2-label').style.color = 'var(--p2)';

        // Update step message
        get('setup-step-title').textContent = 'Step 2 — Player 2 Keyboard';
        get('setup-step-sub').textContent = 'Now press any key on the second keyboard';

    } else if (STATE.setup.step === 2) {
        // ── Connect Keyboard 2 ──
        // Brief blackout period to avoid same key re-triggering
        if (Date.now() - STATE.setup.lastKbd1Time < 600) return;

        STATE.setup.kbd2Connected = true;
        STATE.setup.step = 3;

        const slot2 = get('kbd-slot-2');
        slot2.className = 'kbd-slot connected';
        get('kbd2-label').textContent = '✓ CONNECTED';
        get('kbd2-label').style.color = 'var(--green)';
        get('kbd2-status').textContent = `Player 2 · ${e.key.toUpperCase()} detected`;

        const p2Keys = ['k2-4', 'k2-5', 'k2-6', 'k2-7', 'k2-8', 'k2-9'];
        p2Keys.forEach((k, i) => setTimeout(() => animateSetupKey(k), i * 60));

        get('setup-step-title').textContent = '✓ Both Keyboards Connected!';
        get('setup-step-sub').textContent = 'Setup complete. Launching arena…';

        // Remove listener & proceed after a moment
        document.removeEventListener('keydown', onSetupKeydown);
        setTimeout(completeSetup, 1200);
    }
}

function completeSetup() {
    localStorage.setItem(SETUP_DATE_KEY, new Date().toDateString());
    showScreen('screen-menu');
}

function skipSetup() {
    document.removeEventListener('keydown', onSetupKeydown);
    localStorage.setItem(SETUP_DATE_KEY, new Date().toDateString());
    showScreen('screen-menu');
}
window.skipSetup = skipSetup;

/* ─────────────────────────────────────────────────────────────
   §7  GAME MODE SELECTOR
   ───────────────────────────────────────────────────────────── */

function setGameMode(mode) {
    STATE.mode = mode;
    const mathBtn = get('btn-mode-math');
    const engBtn  = get('btn-mode-eng');

    if (mode === 'math') {
        mathBtn.className = 'px-5 py-2 rounded-lg f-display font-bold text-sm tracking-wide transition bg-[var(--p1)] text-white';
        engBtn.className  = 'px-5 py-2 rounded-lg f-display font-bold text-sm tracking-wide transition text-[var(--muted)]';
    } else {
        engBtn.className  = 'px-5 py-2 rounded-lg f-display font-bold text-sm tracking-wide transition bg-[var(--p2)] text-black';
        mathBtn.className = 'px-5 py-2 rounded-lg f-display font-bold text-sm tracking-wide transition text-[var(--muted)]';
    }
}
window.setGameMode = setGameMode;

// Initialise math as selected
function initModeButtons() {
    get('btn-mode-math').className = 'px-5 py-2 rounded-lg f-display font-bold text-sm tracking-wide transition bg-[var(--p1)] text-white';
    get('btn-mode-eng').className  = 'px-5 py-2 rounded-lg f-display font-bold text-sm tracking-wide transition text-[var(--muted)]';
}

/* ─────────────────────────────────────────────────────────────
   §8  BATTLE MODE — NAME ENTRY WITH AUTOCOMPLETE
   ───────────────────────────────────────────────────────────── */

function setupBattleMode() {
    STATE.gameType = 'battle';
    STATE.battle.p1 = null;
    STATE.battle.p2 = null;
    STATE.battle.acFocusIndex = { p1: -1, p2: -1 };

    // Clear inputs
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

/** Called on every keystroke in a name input */
function onNameInput(player) {
    const input = get(`${player}-name-input`);
    const query = input.value;

    // If a student is already confirmed for this slot, typing again clears the selection
    if (STATE.battle[player]) {
        STATE.battle[player] = null;
        get(`${player}-selected-card`).classList.add('hidden');
        updateStartBattleButton();
    }

    if (query.length === 0) {
        closeAutocomplete(player);
        return;
    }

    const results = searchStudents(query);
    renderAutocomplete(player, results, query);
}
window.onNameInput = onNameInput;

/** Keyboard navigation inside autocomplete list */
function onNameKeydown(event, player) {
    const list = get(`${player}-ac-list`);
    const items = list.querySelectorAll('.ac-item');
    let idx = STATE.battle.acFocusIndex[player];

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
        if (idx >= 0 && items[idx]) {
            items[idx].click();
        } else {
            // Confirm free-text if no dropdown selection
            confirmFreeText(player);
        }
    } else if (event.key === 'Escape') {
        closeAutocomplete(player);
    } else if (event.key === 'Tab') {
        // Tab moves focus to next player's input
        closeAutocomplete(player);
    }
}
window.onNameKeydown = onNameKeydown;

function highlightAcItem(items, idx) {
    items.forEach(el => el.classList.remove('focused'));
    if (items[idx]) {
        items[idx].classList.add('focused');
        items[idx].scrollIntoView({ block: 'nearest' });
    }
}

/** Build and display the autocomplete dropdown */
function renderAutocomplete(player, results, query) {
    const list = get(`${player}-ac-list`);
    STATE.battle.acFocusIndex[player] = -1;

    if (results.length === 0) {
        closeAutocomplete(player);
        return;
    }

    const ql = query.toLowerCase();
    list.innerHTML = results.map((s, i) => {
        // Bold-highlight the matching characters in the name
        const nameLower  = s.name.toLowerCase();
        const matchStart = nameLower.indexOf(ql);
        let displayName  = s.name;
        if (matchStart !== -1) {
            displayName =
                s.name.slice(0, matchStart) +
                `<span class="ac-highlight">${s.name.slice(matchStart, matchStart + query.length)}</span>` +
                s.name.slice(matchStart + query.length);
        }
        const glyph = s.gender === 'F' ? '♀' : '♂';
        return `
            <div class="ac-item" data-index="${i}" onclick="selectStudent('${player}', ${STATE.students.indexOf(s)})">
                <span class="ac-name">${displayName}</span>
                <span class="ac-meta">Cls ${s.class}${s.division} ${glyph}</span>
            </div>`;
    }).join('');

    list.classList.add('open');
}

function closeAutocomplete(player) {
    const list = get(`${player}-ac-list`);
    if (list) {
        list.classList.remove('open');
        list.innerHTML = '';
    }
    STATE.battle.acFocusIndex[player] = -1;
}

/** Called when a student is chosen from the autocomplete list */
function selectStudent(player, studentIndex) {
    const student = STATE.students[studentIndex];
    if (!student) return;

    STATE.battle[player] = student;

    // Update the input field
    get(`${player}-name-input`).value = student.name;
    closeAutocomplete(player);

    // Show the confirmation card
    const card  = get(`${player}-selected-card`);
    const init  = get(`${player}-sc-init`);
    const name  = get(`${player}-sc-name`);
    const meta  = get(`${player}-sc-meta`);
    init.textContent = student.name.charAt(0).toUpperCase();
    name.textContent = student.name;
    const glyph = student.gender === 'F' ? '♀' : '♂';
    meta.textContent = `Class ${student.class} · Division ${student.division} · ${glyph}`;
    card.classList.remove('hidden');

    updateStartBattleButton();
}
window.selectStudent = selectStudent;

/**
 * If user types a name not in the list and presses Enter,
 * create a minimal ad-hoc player object so the game can still start.
 */
function confirmFreeText(player) {
    const val = get(`${player}-name-input`).value.trim();
    if (!val) return;
    closeAutocomplete(player);

    // Check if it partially matches a student — if exactly one match, auto-select it
    const results = searchStudents(val);
    if (results.length === 1) {
        selectStudent(player, STATE.students.indexOf(results[0]));
        return;
    }

    STATE.battle[player] = { name: val, class: '?', division: '?', gender: '?' };
    const card = get(`${player}-selected-card`);
    get(`${player}-sc-init`).textContent = val.charAt(0).toUpperCase();
    get(`${player}-sc-name`).textContent = val;
    get(`${player}-sc-meta`).textContent = 'Guest Player';
    card.classList.remove('hidden');
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
    const btn = get('btn-start-battle');
    const p1ok = (STATE.battle.p1 !== null) || (get('p1-name-input').value.trim().length > 0);
    const p2ok = (STATE.battle.p2 !== null) || (get('p2-name-input').value.trim().length > 0);
    btn.disabled = !(p1ok && p2ok);
}

/** Fired when the FIGHT! button is pressed */
function startBattleGame() {
    // Confirm any free-text that hasn't been selected yet
    if (!STATE.battle.p1) confirmFreeText('p1');
    if (!STATE.battle.p2) confirmFreeText('p2');

    const p1 = STATE.battle.p1;
    const p2 = STATE.battle.p2;

    if (!p1 || !p2) {
        alert('Both players must enter their names.');
        return;
    }
    if (p1.name === p2.name) {
        alert('Both players cannot have the same name. Please choose different names.');
        return;
    }

    prepareGame(p1.name, p2.name);
}
window.startBattleGame = startBattleGame;

/* ─────────────────────────────────────────────────────────────
   §9  ADMIN / COMPETITION ACCESS
   ───────────────────────────────────────────────────────────── */

function startCompetitionSetup() {
    // Show admin password modal
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
        get('admin-pass-input').focus();
        // Shake the box
        const box = get('admin-pass-input');
        box.classList.add('shake');
        setTimeout(() => box.classList.remove('shake'), 500);
    }
}
window.verifyAdminPass = verifyAdminPass;

function showTeacherLogin() {
    const pass = prompt('Enter Teacher Password:');
    if (pass === ADMIN_PASSWORD) {
        renderTeacherTable();
        openModal('modal-teacher');
    } else if (pass !== null) {
        alert('Incorrect password.');
    }
}
window.showTeacherLogin = showTeacherLogin;

/* ─────────────────────────────────────────────────────────────
   §10  TOURNAMENT SETUP
   ───────────────────────────────────────────────────────────── */

function launchTournamentSetup() {
    STATE.gameType = 'tournament';

    // Check for a saved active tournament
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(ACTIVE_TOUR_KEY)); } catch (e) {}
    if (saved && saved.bracket && saved.bracket.length > 0) {
        if (confirm('Resume the active tournament?')) {
            loadTournament(saved);
            return;
        }
    }

    // Optionally restore last player list
    const prev = JSON.parse(localStorage.getItem(LAST_PLAYERS_KEY) || '[]');
    if (prev.length > 0 && confirm(`Reload ${prev.length} students from last session?`)) {
        STATE.tourney.players = [...prev];
    } else {
        STATE.tourney.players = [];
    }

    STATE.tourney.id = Date.now();
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

function addTourneyPlayer() {
    const inp  = get('tourney-input');
    const name = inp.value.trim();
    if (!name) return;
    if (STATE.tourney.players.includes(name)) {
        alert(`"${name}" is already in the list.`);
        return;
    }
    STATE.tourney.players.push(name);
    inp.value = '';
    inp.focus();
    updateTourneyPlayerList();
    localStorage.setItem(LAST_PLAYERS_KEY, JSON.stringify(STATE.tourney.players));
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
    localStorage.setItem(LAST_PLAYERS_KEY, JSON.stringify(STATE.tourney.players));
}
window.removeTourneyPlayer = removeTourneyPlayer;

function updateTourneyPlayerList() {
    const count = STATE.tourney.players.length;
    get('t-player-count').textContent = `${count} Player${count !== 1 ? 's' : ''}`;

    const list = get('t-player-list');
    if (count === 0) {
        list.innerHTML = '<li class="text-center text-[var(--muted)] text-sm py-4">No players yet. Add names above.</li>';
    } else {
        list.innerHTML = STATE.tourney.players.map((p, i) => `
            <li class="flex justify-between items-center bg-[var(--surface)] p-2.5 rounded-lg border border-[var(--border)]">
                <span class="f-display font-bold text-white text-sm">${i + 1}. ${p}</span>
                <button onclick="removeTourneyPlayer(${i})" class="text-red-400 hover:text-white transition w-6 h-6 flex items-center justify-center">
                    <i class="fas fa-times text-xs"></i>
                </button>
            </li>`).join('');
    }

    const btn = get('btn-gen-bracket');
    if (count >= 2) {
        btn.classList.remove('hidden');
        btn.textContent = `START BRACKET (${count} Players)`;
    } else {
        btn.classList.add('hidden');
    }
}

/* ─────────────────────────────────────────────────────────────
   §11  BRACKET ENGINE
   ───────────────────────────────────────────────────────────── */

function generateBracket() {
    let players = [...STATE.tourney.players];
    if (players.length < 2) return;

    // Smart seeding: highest rated players are spread across the bracket
    players.sort((a, b) => getPlayerRating(b) - getPlayerRating(a));

    // Pad to next power of 2 with BYEs
    const size = Math.pow(2, Math.ceil(Math.log2(players.length)));
    while (players.length < size) players.push('BYE');

    // Build round 1 — top seed vs bottom seed (interleave)
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

    // Build subsequent empty rounds
    let prev = round1;
    while (prev.length > 1) {
        const nextRound = [];
        for (let i = 0; i < Math.floor(prev.length / 2); i++) {
            nextRound.push({ p1: 'TBD', p2: 'TBD', winner: null });
        }
        STATE.tourney.bracket.push(nextRound);
        prev = nextRound;
    }

    // Auto-resolve BYEs
    resolveByes();
    findNextMatch();
    saveTournament();
    renderBracket();
    showScreen('screen-tourney-hub');
}
window.generateBracket = generateBracket;

/** Walk round 0 and auto-advance any BYE matches */
function resolveByes() {
    STATE.tourney.bracket[0].forEach((match, idx) => {
        if (match.p2 === 'BYE' && !match.winner) {
            match.winner = match.p1;
            forwardWinner(0, idx, match.p1);
        } else if (match.p1 === 'BYE' && !match.winner) {
            match.winner = match.p2;
            forwardWinner(0, idx, match.p2);
        }
    });
}

/** Propagate a winner forward into the next round */
function forwardWinner(roundIdx, matchIdx, winnerName) {
    const nextRoundIdx = roundIdx + 1;
    if (nextRoundIdx >= STATE.tourney.bracket.length) return;

    const nextMatchIdx = Math.floor(matchIdx / 2);
    const slot = matchIdx % 2 === 0 ? 'p1' : 'p2';
    const nextMatch = STATE.tourney.bracket[nextRoundIdx][nextMatchIdx];

    nextMatch[slot] = winnerName;

    // If the opposing slot is a BYE, auto-advance again
    const otherSlot = slot === 'p1' ? 'p2' : 'p1';
    if (nextMatch[otherSlot] === 'BYE') {
        nextMatch.winner = winnerName;
        forwardWinner(nextRoundIdx, nextMatchIdx, winnerName);
    }
}

/** Scan the bracket to find the first unplayed but ready match */
function findNextMatch() {
    for (let r = 0; r < STATE.tourney.bracket.length; r++) {
        for (let m = 0; m < STATE.tourney.bracket[r].length; m++) {
            const match = STATE.tourney.bracket[r][m];
            const playable = !match.winner
                && match.p1 !== 'TBD' && match.p2 !== 'TBD'
                && match.p1 !== 'BYE' && match.p2 !== 'BYE';
            if (playable) {
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

/** Admin can manually select any playable match by clicking its card */
function setActiveMatch(r, m) {
    STATE.tourney.activeRound = r;
    STATE.tourney.activeMatch = m;
    renderBracket();
}
window.setActiveMatch = setActiveMatch;

function renderBracket() {
    const container = get('bracket-container');
    container.innerHTML = '';

    STATE.tourney.bracket.forEach((round, rIdx) => {
        let roundLabel;
        if (round.length === 1)       roundLabel = '🏆 FINAL';
        else if (round.length === 2)  roundLabel = 'SEMI-FINAL';
        else                          roundLabel = `ROUND ${rIdx + 1}`;

        let html = `<div class="mb-5">
            <h3 class="text-[10px] font-bold text-[var(--muted)] mb-2 uppercase tracking-widest f-display sticky top-0 py-1" style="background:rgba(13,21,39,0.9)">${roundLabel}</h3>
            <div class="flex flex-col gap-2">`;

        round.forEach((match, mIdx) => {
            const isActive   = rIdx === STATE.tourney.activeRound && mIdx === STATE.tourney.activeMatch;
            const isDone     = !!match.winner;
            const isPlayable = !isDone && match.p1 !== 'TBD' && match.p2 !== 'TBD'
                               && match.p1 !== 'BYE' && match.p2 !== 'BYE';

            let cardClass = 'bracket-match';
            if (isActive)        cardClass += ' active';
            else if (isDone)     cardClass += ' done';
            else if (isPlayable) cardClass += ' playable';

            const clickAttr = isPlayable
                ? `onclick="setActiveMatch(${rIdx},${mIdx})" title="Click to select this match"`
                : '';

            const p1Class = match.winner === match.p1 ? 'bracket-winner-text' : '';
            const p2Class = match.winner === match.p2 ? 'bracket-winner-text' : '';

            html += `
                <div class="${cardClass}" ${clickAttr}>
                    <span class="bracket-player ${p1Class}">${match.p1}</span>
                    <span class="text-[var(--muted)] text-[10px] font-bold f-display">VS</span>
                    <span class="bracket-player ${p2Class} text-right">${match.p2}</span>
                </div>`;
        });

        html += '</div></div>';
        container.innerHTML += html;
    });

    // Render the action card
    renderMatchCard();
}

function renderMatchCard() {
    const card = get('match-card-content');
    if (STATE.tourney.activeRound === -1) {
        // Tournament complete
        const finalMatch = STATE.tourney.bracket[STATE.tourney.bracket.length - 1][0];
        const champion   = finalMatch.winner;
        card.innerHTML = `
            <div class="text-center">
                <div class="text-[var(--green)] f-display font-bold text-xs uppercase tracking-widest mb-3">Champion</div>
                <div class="text-5xl mb-3">👑</div>
                <div class="f-display font-bold text-white text-2xl mb-6">${champion}</div>
                <button onclick="finishTournament('${champion}')" class="btn-primary w-full">Save & End</button>
            </div>`;
        return;
    }

    const match = STATE.tourney.bracket[STATE.tourney.activeRound][STATE.tourney.activeMatch];
    const roundNum = STATE.tourney.activeRound + 1;
    let roundLabel;
    const totalRounds = STATE.tourney.bracket.length;
    if (STATE.tourney.activeRound === totalRounds - 1)      roundLabel = '🏆 FINAL';
    else if (STATE.tourney.activeRound === totalRounds - 2) roundLabel = 'SEMI-FINAL';
    else                                                    roundLabel = `Round ${roundNum}`;

    card.innerHTML = `
        <div class="text-center">
            <div class="text-[var(--p2)] f-display font-bold text-xs uppercase tracking-widest mb-3 animate-pulse">${roundLabel} · Up Next</div>
            <div class="f-display font-bold text-3xl text-[#818CF8] mb-2">${match.p1}</div>
            <div class="text-[var(--muted)] text-xs f-display mb-2">VS</div>
            <div class="f-display font-bold text-3xl text-[#FCD34D] mb-6">${match.p2}</div>
            <button onclick="prepareGame('${match.p1}', '${match.p2}')" class="btn-primary w-full">
                <i class="fas fa-bolt mr-2"></i>START MATCH
            </button>
        </div>`;

    // Update round label in header
    const label = get('t-round-label');
    if (label) label.textContent = roundLabel;
}

function handleTournamentWin(winnerName) {
    const match = STATE.tourney.bracket[STATE.tourney.activeRound][STATE.tourney.activeMatch];
    match.winner = winnerName;
    forwardWinner(STATE.tourney.activeRound, STATE.tourney.activeMatch, winnerName);
    findNextMatch();
    saveTournament();
    renderBracket();
    showScreen('screen-tourney-hub');
}

function saveTournament() {
    const data = {
        id:           STATE.tourney.id,
        players:      STATE.tourney.players,
        bracket:      STATE.tourney.bracket,
        activeRound:  STATE.tourney.activeRound,
        activeMatch:  STATE.tourney.activeMatch,
    };
    localStorage.setItem(ACTIVE_TOUR_KEY, JSON.stringify(data));
}

function saveAndExit() {
    saveTournament();
    showScreen('screen-menu');
}
window.saveAndExit = saveAndExit;

function finishTournament(winner) {
    const record = {
        id:       STATE.tourney.id,
        date:     new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        time:     new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        winner:   winner,
        players:  STATE.tourney.players.length,
        mode:     STATE.mode,
    };
    STATE.history.unshift(record);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(STATE.history));
    localStorage.removeItem(ACTIVE_TOUR_KEY);
    showScreen('screen-menu');
}
window.finishTournament = finishTournament;

/* ─────────────────────────────────────────────────────────────
   §12  HISTORY
   ───────────────────────────────────────────────────────────── */

function showHistory() {
    const list = get('history-list');
    if (STATE.history.length === 0) {
        list.innerHTML = '<div class="text-[var(--muted)] text-center italic py-4 text-sm">No tournaments recorded yet.</div>';
    } else {
        list.innerHTML = STATE.history.map(h => `
            <div class="bg-[var(--surface)] p-3 rounded-xl border border-[var(--border)] flex items-center justify-between gap-3">
                <div>
                    <div class="text-[var(--green)] f-display font-bold">👑 ${h.winner}</div>
                    <div class="text-xs text-[var(--muted)] mt-0.5">${h.players} players · ${h.mode || 'math'}</div>
                </div>
                <div class="text-right text-xs text-[var(--muted)]">
                    <div>${h.date}</div>
                    <div>${h.time || ''}</div>
                </div>
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
   §13  TEACHER DASHBOARD
   ───────────────────────────────────────────────────────────── */

function updateStats(name, isCorrect, timeTakenMs) {
    // Do not track placeholder names
    if (!name || name === '?' || name.startsWith('Player')) return;

    // Merge with student data if available
    const studentRecord = STATE.students.find(s => s.name === name);
    if (!STATE.stats[name]) {
        STATE.stats[name] = {
            correct: 0, wrong: 0, timeSum: 0,
            class:    studentRecord ? studentRecord.class    : '?',
            division: studentRecord ? studentRecord.division : '?',
            gender:   studentRecord ? studentRecord.gender   : '?',
        };
    }

    if (isCorrect) STATE.stats[name].correct++;
    else           STATE.stats[name].wrong++;
    STATE.stats[name].timeSum += timeTakenMs;

    localStorage.setItem(STATS_KEY, JSON.stringify(STATE.stats));
}

/**
 * Rating formula:
 *   Accuracy (0–100) × 100  minus  average response time in 10ms units.
 *   Higher is better. Ensures accuracy is primary, speed is tiebreaker.
 */
function getPlayerRating(name) {
    const s = STATE.stats[name];
    if (!s) return -Infinity;
    const total = s.correct + s.wrong;
    if (total === 0) return -Infinity;
    const accuracy = (s.correct / total) * 100;
    const avgTime  = s.timeSum / total;
    return (accuracy * 100) - (avgTime / 10);
}

function sortTeacherTable(key) {
    if (STATE.teacherSort.key === key) {
        STATE.teacherSort.asc = !STATE.teacherSort.asc;
    } else {
        STATE.teacherSort.key = key;
        STATE.teacherSort.asc = (key === 'name');
    }
    renderTeacherTable();
}
window.sortTeacherTable = sortTeacherTable;

function renderTeacherTable() {
    const tbody = get('teacher-table-body');
    const names = Object.keys(STATE.stats);

    if (names.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-[var(--muted)] text-sm">No data yet. Play some matches!</td></tr>';
        return;
    }

    // Sort
    names.sort((a, b) => {
        const sA = STATE.stats[a], sB = STATE.stats[b];
        const tA = sA.correct + sA.wrong, tB = sB.correct + sB.wrong;
        let vA, vB;

        switch (STATE.teacherSort.key) {
            case 'name':
                vA = a.toLowerCase(); vB = b.toLowerCase();
                break;
            case 'class':
                vA = `${sA.class}${sA.division}`; vB = `${sB.class}${sB.division}`;
                break;
            case 'score':
                vA = sA.correct * 10; vB = sB.correct * 10;
                break;
            case 'accuracy':
                vA = tA ? sA.correct / tA : 0;
                vB = tB ? sB.correct / tB : 0;
                break;
            case 'rating':
            default:
                vA = getPlayerRating(a); vB = getPlayerRating(b);
                break;
        }

        if (vA < vB) return STATE.teacherSort.asc ? -1 : 1;
        if (vA > vB) return STATE.teacherSort.asc ?  1 : -1;
        return 0;
    });

    tbody.innerHTML = names.map(name => {
        const s     = STATE.stats[name];
        const total = s.correct + s.wrong;
        const acc   = total ? Math.round((s.correct / total) * 100) : 0;
        const rating = getPlayerRating(name);
        const ratingDisplay = isFinite(rating) ? Math.round(rating) : '-';

        let accColor = 'text-red-400';
        if (acc > 80) accColor = 'text-[var(--green)]';
        else if (acc > 55) accColor = 'text-[var(--p2)]';

        return `
            <tr class="hover:bg-white/3 transition">
                <td class="p-3 f-display font-bold text-white">${name}</td>
                <td class="p-3 text-[var(--muted)] text-xs">${s.class}${s.division}</td>
                <td class="p-3 text-white f-mono">${s.correct * 10}</td>
                <td class="p-3 ${accColor} font-bold f-display">${acc}%</td>
                <td class="p-3 f-mono text-xs text-[var(--muted)]">${ratingDisplay}</td>
            </tr>`;
    }).join('');
}

function hideTeacher() { closeModal('modal-teacher'); }
window.hideTeacher = hideTeacher;

function clearStats() {
    if (!confirm('Reset ALL student performance data? This cannot be undone.')) return;
    STATE.stats = {};
    localStorage.removeItem(STATS_KEY);
    renderTeacherTable();
}
window.clearStats = clearStats;

/* ─────────────────────────────────────────────────────────────
   §14  GAME LIFECYCLE — PREPARE & COUNTDOWN
   ───────────────────────────────────────────────────────────── */

/**
 * Main entry point to start any match (battle or tournament).
 * Sets up game state, shows the countdown, then starts play.
 */
function prepareGame(p1Name, p2Name) {
    // Stop any running game
    if (STATE.game.interval) {
        clearInterval(STATE.game.interval);
        STATE.game.interval = null;
    }
    AUDIO.stopBGM();

    // Determine difficulty from tournament round progression
    let difficulty = 1;
    if (STATE.gameType === 'tournament') {
        const roundsLeft = STATE.tourney.bracket.length - 1 - STATE.tourney.activeRound;
        if (roundsLeft <= 0)      difficulty = 4; // Final
        else if (roundsLeft <= 1) difficulty = 3; // Semi
        else if (roundsLeft <= 2) difficulty = 2; // QF
        else                      difficulty = 1;
    }

    // Initialise game state
    STATE.game.active      = false;
    STATE.game.timer       = 60;
    STATE.game.tugValue    = 50;
    STATE.game.suddenDeath = false;
    STATE.game.difficulty  = difficulty;
    STATE.game.p1          = createPlayerState(p1Name);
    STATE.game.p2          = createPlayerState(p2Name);

    // Layout the zones responsively
    layoutGameZones();

    // Reset UI
    resetGameUI();

    showScreen('screen-game');
    runCountdown();
}
window.prepareGame = prepareGame;

/** Creates a fresh per-player state object */
function createPlayerState(name) {
    return {
        name:       name,
        score:      0,
        streak:     0,
        frozen:     false,
        processing: false,
        ans:        '',
        q:          null,
        wrongTimes: [],     // rolling window of wrong-answer timestamps
        startTime:  0,      // when the current question appeared
    };
}

/** Lay out P1 zone (top/left) and P2 zone (bottom/right) based on screen orientation */
function layoutGameZones() {
    const isLandscape = window.innerWidth >= 1024;
    const zone1 = get('zone-p1');
    const zone2 = get('zone-p2');
    const divider = get('rope-divider');

    if (isLandscape) {
        zone1.style.cssText = 'position:absolute;top:0;left:0;bottom:0;right:50%;';
        zone2.style.cssText = 'position:absolute;top:0;left:50%;bottom:0;right:0;';
        divider.className   = 'rope-divider v';
    } else {
        zone1.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:50%;';
        zone2.style.cssText = 'position:absolute;top:50%;left:0;right:0;bottom:0;';
        divider.className   = 'rope-divider h';
    }
}

window.addEventListener('resize', () => {
    if (STATE.game.active) {
        layoutGameZones();
        updateTugVisuals();
    }
});

function resetGameUI() {
    // Player 1
    const p1 = STATE.game.p1;
    get('p1-name').textContent  = p1.name;
    get('p1-score').textContent = '0';
    get('p1-avatar-txt').textContent = p1.name.charAt(0).toUpperCase();
    get('p1-input').textContent = '';
    get('p1-combo').style.display = 'none';
    get('p1-frozen').style.display = 'none';
    get('p1-q-text').textContent = '…';
    get('p1-eng-opts').classList.add('hidden');
    clearFeedback('p1');

    // Player 2
    const p2 = STATE.game.p2;
    get('p2-name').textContent  = p2.name;
    get('p2-score').textContent = '0';
    get('p2-avatar-txt').textContent = p2.name.charAt(0).toUpperCase();
    get('p2-input').textContent = '';
    get('p2-combo').style.display = 'none';
    get('p2-frozen').style.display = 'none';
    get('p2-q-text').textContent = '…';
    get('p2-eng-opts').classList.add('hidden');
    clearFeedback('p2');

    // Timer
    get('game-timer').textContent = '60';
    const pill = get('timer-pill');
    pill.classList.remove('danger', 'sd');

    // Tug marker
    updateTugVisuals();

    // Hide winner screen
    get('screen-winner').style.display = 'none';
}

function clearFeedback(player) {
    const fb = get(`${player}-feedback`);
    if (fb) {
        fb.textContent = '';
        fb.style.opacity = '0';
    }
}

function runCountdown() {
    const overlay = get('countdown-overlay');
    const text    = get('countdown-text');
    overlay.style.display = 'flex';

    let count = 3;
    text.textContent = count;
    text.className   = 'countdown-num';
    AUDIO.playCountdown();

    const tick = setInterval(() => {
        count--;
        if (count > 0) {
            text.textContent = count;
            text.className   = 'countdown-num';
        } else if (count === 0) {
            text.textContent = 'FIGHT!';
            text.className   = 'countdown-fight';
            AUDIO.playWin();
        } else {
            clearInterval(tick);
            overlay.style.display = 'none';
            startGame();
        }
    }, COUNTDOWN_TICK_MS);
}

/* ─────────────────────────────────────────────────────────────
   §15  GAME TICK & SUDDEN DEATH
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
        timerEl.textContent = 'SD!';
        pill.classList.add('sd');
    } else {
        timerEl.textContent = STATE.game.timer;
        if (STATE.game.timer <= 10) {
            pill.classList.add('danger');
        }

        // Ramp difficulty every N seconds (capped at 5)
        if (STATE.game.timer > 0
            && STATE.game.timer % DIFFICULTY_RAMP_INTERVAL === 0
            && STATE.game.difficulty < 5) {
            STATE.game.difficulty++;
        }

        if (STATE.game.timer <= 0) {
            if (STATE.game.tugValue === 50) {
                // Dead heat — trigger Sudden Death
                triggerSuddenDeath();
            } else {
                endGame('TIME_UP');
            }
        }
    }
}

function triggerSuddenDeath() {
    STATE.game.suddenDeath = true;
    STATE.game.timer = 9999; // effectively infinite

    AUDIO.playWrong();

    // Show brief SD overlay
    const overlay = get('countdown-overlay');
    const text    = get('countdown-text');
    overlay.style.display = 'flex';
    text.textContent = 'SUDDEN DEATH!';
    text.className   = 'countdown-fight';
    setTimeout(() => { overlay.style.display = 'none'; }, 1800);
}

/* ─────────────────────────────────────────────────────────────
   §16  QUESTION ENGINE
   ───────────────────────────────────────────────────────────── */

// English fill-in-the-blank word bank
const ENG_WORDS = [
    { f:'APPLE',  m:'A_PLE',  a:2, o:['R','P','S'] },
    { f:'TIGER',  m:'TI_ER',  a:3, o:['A','I','G'] },
    { f:'HOUSE',  m:'HO_SE',  a:1, o:['U','A','E'] },
    { f:'WATER',  m:'WA_ER',  a:3, o:['P','D','T'] },
    { f:'ROBOT',  m:'ROB_T',  a:3, o:['A','I','O'] },
    { f:'MUSIC',  m:'MUS_C',  a:2, o:['K','I','E'] },
    { f:'PHONE',  m:'PH_NE',  a:3, o:['A','U','O'] },
    { f:'EARTH',  m:'E_RTH',  a:1, o:['A','O','U'] },
    { f:'MONEY',  m:'MON_Y',  a:2, o:['I','E','A'] },
    { f:'RIVER',  m:'RIV_R',  a:2, o:['A','E','I'] },
    { f:'STONE',  m:'ST_NE',  a:2, o:['A','O','I'] },
    { f:'HAPPY',  m:'HA_PY',  a:1, o:['P','B','D'] },
    { f:'GREEN',  m:'GR_EN',  a:3, o:['I','A','E'] },
    { f:'NIGHT',  m:'NI_HT',  a:1, o:['G','F','H'] },
    { f:'PIZZA',  m:'PI_ZA',  a:2, o:['S','Z','X'] },
    { f:'TRAIN',  m:'TR_IN',  a:2, o:['E','A','I'] },
    { f:'GHOST',  m:'GH_ST',  a:3, o:['A','I','O'] },
    { f:'MOUSE',  m:'MO_SE',  a:2, o:['O','U','A'] },
    { f:'CLOCK',  m:'CL_CK',  a:2, o:['A','O','U'] },
    { f:'SPACE',  m:'SP_CE',  a:3, o:['E','I','A'] },
    { f:'WORLD',  m:'WO_LD',  a:1, o:['R','L','D'] },
    { f:'TABLE',  m:'TA_LE',  a:2, o:['P','B','D'] },
    { f:'FLOOR',  m:'FL_OR',  a:2, o:['A','O','U'] },
    { f:'SHOES',  m:'SH_ES',  a:1, o:['O','A','I'] },
    { f:'FRUIT',  m:'FR_IT',  a:3, o:['O','I','U'] },
    { f:'GRAPE',  m:'GR_PE',  a:3, o:['E','I','A'] },
    { f:'BREAD',  m:'BR_AD',  a:3, o:['E','I','O'] },
    { f:'CLOUD',  m:'CL_UD',  a:3, o:['O','A','U'] },
    { f:'DREAM',  m:'DR_AM',  a:3, o:['E','A','I'] },
    { f:'FLAME',  m:'FL_ME',  a:3, o:['A','O','I'] },
    { f:'GLOBE',  m:'GL_BE',  a:3, o:['O','A','I'] },
    { f:'PLANT',  m:'PL_NT',  a:3, o:['A','O','I'] },
    { f:'SMILE',  m:'SM_LE',  a:2, o:['I','O','A'] },
    { f:'STORM',  m:'ST_RM',  a:3, o:['O','A','U'] },
    { f:'SWORD',  m:'SW_RD',  a:3, o:['O','A','U'] },
    { f:'TOWER',  m:'T_WER',  a:1, o:['O','A','E'] },
    { f:'TRIBE',  m:'TR_BE',  a:2, o:['I','A','O'] },
    { f:'VOICE',  m:'VO_CE',  a:2, o:['I','A','O'] },
    { f:'WHEEL',  m:'WH_EL',  a:3, o:['E','A','O'] },
    { f:'YOUTH',  m:'Y_UTH',  a:1, o:['O','A','U'] },
];

function rand(n) { return Math.floor(Math.random() * n) + 1; }

function generateQuestion(player) {
    const diff = STATE.game.difficulty;
    let q;

    if (STATE.mode === 'math') {
        q = generateMathQuestion(diff);
    } else {
        q = generateEnglishQuestion();
    }

    STATE.game[player].q         = q;
    STATE.game[player].startTime = Date.now();
    STATE.game[player].ans       = '';
    renderQuestion(player, q);
}

function generateMathQuestion(diff) {
    const r = Math.random();
    let a, b, op, ans;

    if (diff === 1) {
        // Simple add/subtract within 20
        if (r > 0.5) { a = rand(10); b = rand(10); op = '+'; ans = a + b; }
        else         { a = rand(15) + 3; b = rand(a); op = '−'; ans = a - b; }

    } else if (diff === 2) {
        // Add/subtract within 50, or easy multiply
        if (r > 0.55) { a = rand(9) + 1; b = rand(9) + 1; op = '×'; ans = a * b; }
        else          { a = rand(40) + 5; b = rand(30) + 5; op = '+'; ans = a + b; }

    } else if (diff === 3) {
        // Mix of operations
        if (r < 0.3)       { b = rand(8) + 2; a = b * (rand(9) + 1); op = '÷'; ans = a / b; }
        else if (r < 0.6)  { a = rand(12) + 2; b = rand(12) + 2; op = '×'; ans = a * b; }
        else               { a = rand(60) + 10; b = rand(50) + 10; op = '−'; ans = a - b; }

    } else if (diff === 4) {
        // Harder — bigger numbers
        if (r < 0.35)      { b = rand(11) + 2; a = b * (rand(11) + 2); op = '÷'; ans = a / b; }
        else if (r < 0.65) { a = rand(15) + 3; b = rand(15) + 3; op = '×'; ans = a * b; }
        else               { a = rand(99) + 20; b = rand(80) + 10; op = '+'; ans = a + b; }

    } else {
        // Difficulty 5 — large multiply / divide / compound
        if (r < 0.4) { a = rand(20) + 5; b = rand(20) + 5; op = '×'; ans = a * b; }
        else         { a = rand(150) + 50; b = rand(100) + 20; op = '+'; ans = a + b; }
    }

    return { type: 'math', text: `${a} ${op} ${b}`, ans: ans };
}

function generateEnglishQuestion() {
    const word = ENG_WORDS[Math.floor(Math.random() * ENG_WORDS.length)];
    return { type: 'eng', text: word.m, ans: word.a, opts: word.o };
}

function renderQuestion(player, q) {
    get(`${player}-q-text`).textContent = q.text;
    get(`${player}-input`).textContent  = '';

    const optsEl = get(`${player}-eng-opts`);
    if (q.type === 'eng') {
        optsEl.classList.remove('hidden');
        const colorClass = player === 'p1' ? 'eng-opt-p1' : 'eng-opt-p2';
        optsEl.innerHTML = q.opts.map((opt, i) => `
            <div class="eng-opt ${colorClass}" onclick="tapInput('${player}','${i + 1}')">
                <span class="text-[var(--muted)] text-[10px]">${i + 1}.</span> ${opt}
            </div>`).join('');
    } else {
        optsEl.classList.add('hidden');
    }
}

/* ─────────────────────────────────────────────────────────────
   §17  INPUT HANDLING & VALIDATION
   ───────────────────────────────────────────────────────────── */

// Global keyboard listener (active only during game)
document.addEventListener('keydown', (e) => {
    if (!STATE.game.active) return;

    const k = e.key;

    // P1 uses: digit row 1-0 + S to clear
    // P2 uses: numpad 0-9 + Backspace to clear
    const isDigit    = /^[0-9]$/.test(k);
    const isNumpad   = e.code.startsWith('Numpad') && isDigit;
    const isTopRow   = e.code.startsWith('Digit') && isDigit;

    if (isTopRow && !STATE.game.p1.frozen)  handleInput('p1', k);
    if (e.code === 'KeyS')                  clearInput('p1');

    if (isNumpad && !STATE.game.p2.frozen)  handleInput('p2', k);
    if (e.code === 'Backspace')             clearInput('p2');
});

function tapInput(player, char) {
    if (!STATE.game.active) return;
    if (STATE.game[player].frozen) return;
    handleInput(player, char);
}
window.tapInput = tapInput;

function tapClear(player) {
    if (!STATE.game.active) return;
    clearInput(player);
}
window.tapClear = tapClear;

function handleInput(player, char) {
    const ps = STATE.game[player];
    if (ps.frozen || ps.processing) return;
    const q = ps.q;
    if (!q) return;

    ps.ans += char;
    get(`${player}-input`).textContent = ps.ans;

    const expectedLength = q.ans.toString().length;
    if (ps.ans.length >= expectedLength) {
        ps.processing = true;
        // Small delay so the last character is visible
        setTimeout(() => validate(player), 60);
    }
}

function clearInput(player) {
    STATE.game[player].ans = '';
    get(`${player}-input`).textContent = '';
}

function validate(player) {
    const ps      = STATE.game[player];
    const given   = parseInt(ps.ans, 10);
    const correct = ps.q.ans;
    const elapsed = Date.now() - ps.startTime;

    if (given === correct) {
        onCorrectAnswer(player, elapsed);
    } else {
        onWrongAnswer(player, elapsed);
    }

    // Clear answer display after validation
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
    updateStats(ps.name, true, elapsed);

    get(`${player}-score`).textContent = ps.score;
    AUDIO.playCorrect();

    // Feedback flash
    flashFeedback(`${player}-feedback`, '+GOOD', 'feedback-flash text-[var(--green)]');

    // Streak combo banner
    if (ps.streak >= 3) {
        get(`${player}-combo`).style.display = 'inline-flex';
    }

    // Power = how much the rope moves
    let power = 8;
    if (ps.streak >= 3) power = 14;
    if (ps.streak >= 6) power = 18;

    // Rubber-banding: bonus power if the player is far behind
    if (player === 'p1' && STATE.game.tugValue > 72) power += 6;
    if (player === 'p2' && STATE.game.tugValue < 28) power += 6;

    // Camera shake for big moves
    if (power > 12) {
        document.body.classList.add('shake');
        setTimeout(() => document.body.classList.remove('shake'), 450);
    }

    moveTug(player, power);
}

function onWrongAnswer(player, elapsed) {
    const ps   = STATE.game[player];
    const opp  = player === 'p1' ? 'p2' : 'p1';

    ps.streak = 0;
    get(`${player}-combo`).style.display = 'none';
    updateStats(ps.name, false, elapsed);

    AUDIO.playWrong();
    flashFeedback(`${player}-feedback`, 'MISS', 'feedback-flash text-[var(--red)]');

    // Wrong answer gives opponent a small bonus pull
    moveTug(opp, 4);

    // Anti-spam: 3 wrong answers within WRONG_SPAM_WINDOW_MS → freeze
    const now = Date.now();
    ps.wrongTimes.push(now);
    // Keep only the last N
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
   §18  TUG-OF-WAR PHYSICS & VISUALS
   ───────────────────────────────────────────────────────────── */

function moveTug(puller, amount) {
    if (puller === 'p1') STATE.game.tugValue -= amount;
    else                 STATE.game.tugValue += amount;

    // Clamp
    STATE.game.tugValue = Math.max(0, Math.min(TUG_WIN_THRESHOLD, STATE.game.tugValue));

    updateTugVisuals();

    // Check win condition
    if (STATE.game.tugValue <= 0)                   endGame('P1_WIN');
    else if (STATE.game.tugValue >= TUG_WIN_THRESHOLD) endGame('P2_WIN');
}

function updateTugVisuals() {
    const tug    = STATE.game.tugValue;   // 0–100
    const marker = get('rope-marker');
    const pctEl  = get('rope-pct');
    if (!marker) return;

    // Zone zones colour tint based on who's winning
    const zone1 = get('zone-p1');
    const zone2 = get('zone-p2');

    if (zone1 && zone2) {
        if (tug < 40) {
            // P1 dominating
            zone1.style.background = 'radial-gradient(ellipse 80% 60% at 50% 120%, rgba(79,70,229,0.18) 0%, transparent 70%)';
            zone2.style.background = 'radial-gradient(ellipse 80% 60% at 50% -20%, rgba(245,158,11,0.04) 0%, transparent 70%)';
        } else if (tug > 60) {
            // P2 dominating
            zone1.style.background = 'radial-gradient(ellipse 80% 60% at 50% 120%, rgba(79,70,229,0.04) 0%, transparent 70%)';
            zone2.style.background = 'radial-gradient(ellipse 80% 60% at 50% -20%, rgba(245,158,11,0.18) 0%, transparent 70%)';
        } else {
            zone1.style.background = 'radial-gradient(ellipse 80% 60% at 50% 120%, rgba(79,70,229,0.08) 0%, transparent 70%)';
            zone2.style.background = 'radial-gradient(ellipse 80% 60% at 50% -20%, rgba(245,158,11,0.08) 0%, transparent 70%)';
        }
    }

    // Move the rope marker
    // tug=50 → centre, tug=0 → P1 side, tug=100 → P2 side
    // We map tug into a ±45% offset
    const offset = (tug - 50) * 0.9; // ±45
    const isLandscape = window.innerWidth >= 1024;

    // Marker sits at the centre of the divider line
    if (isLandscape) {
        // Divider is vertical (left: 50%), marker moves along X axis
        marker.style.left = '50%';
        marker.style.top  = '50%';
        marker.style.transform = `translate(calc(-50% + ${offset}vw), -50%)`;
    } else {
        // Divider is horizontal (top: 50%), marker moves along Y axis
        marker.style.left = '50%';
        marker.style.top  = '50%';
        marker.style.transform = `translate(-50%, calc(-50% + ${offset}vh))`;
    }

    // Update inner percentage display
    if (pctEl) pctEl.textContent = Math.round(tug);
}

/* ─────────────────────────────────────────────────────────────
   §19  FREEZE MECHANIC
   ───────────────────────────────────────────────────────────── */

function freezePlayer(player) {
    const ps = STATE.game[player];
    ps.frozen = true;

    const overlay = get(`${player}-frozen`);
    overlay.style.display = 'flex';

    setTimeout(() => {
        ps.frozen = false;
        overlay.style.display = 'none';
    }, FREEZE_DURATION_MS);
}

/* ─────────────────────────────────────────────────────────────
   §20  GAME END & WINNER SCREEN
   ───────────────────────────────────────────────────────────── */

function endGame(reason) {
    if (!STATE.game.active) return;  // Guard against double-call
    STATE.game.active = false;

    clearInterval(STATE.game.interval);
    STATE.game.interval = null;
    AUDIO.stopBGM();

    const p1 = STATE.game.p1;
    const p2 = STATE.game.p2;

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
            if (STATE.game.tugValue < 50) {
                winnerName = p1.name;
                winReason  = "Time's up — P1 had the edge!";
            } else if (STATE.game.tugValue > 50) {
                winnerName = p2.name;
                winReason  = "Time's up — P2 had the edge!";
            } else {
                winnerName = 'DRAW';
                winReason  = 'Perfect tie — no winner!';
            }
            break;
        default:
            winnerName = reason;
            winReason  = STATE.game.suddenDeath ? 'Sudden Death Victory!' : 'Victory!';
    }

    // Show winner screen
    AUDIO.playWin();
    if (winnerName !== 'DRAW') {
        confetti({ particleCount: 220, spread: 110, origin: { y: 0.6 }, colors: ['#4F46E5','#F59E0B','#10B981','#fff'] });
    }

    get('winner-name').textContent   = winnerName;
    get('winner-reason').textContent = winReason;
    get('winner-scores').textContent = `${p1.score * 10} – ${p2.score * 10}`;

    const winnerScreen = get('screen-winner');
    winnerScreen.style.display = 'flex';

    // Wire the Continue button
    get('btn-winner-continue').onclick = () => {
        winnerScreen.style.display = 'none';
        if (STATE.gameType === 'tournament') {
            handleTournamentWin(winnerName);
        } else {
            showScreen('screen-menu');
        }
    };
}

/* ─────────────────────────────────────────────────────────────
   §21  STATS — LOAD FROM STORAGE
   ───────────────────────────────────────────────────────────── */

function loadPersistedState() {
    try {
        const stats   = localStorage.getItem(STATS_KEY);
        const history = localStorage.getItem(HISTORY_KEY);
        if (stats)   STATE.stats   = JSON.parse(stats);
        if (history) STATE.history = JSON.parse(history);
    } catch (e) {
        console.warn('Could not load persisted state:', e);
    }
}

/* ─────────────────────────────────────────────────────────────
   §22  RESPONSIVE ROPE MARKER POSITIONING
           (recalculate on first paint and on resize)
   ───────────────────────────────────────────────────────────── */

function positionRopeMarker() {
    // Marker starts at true center
    const marker = get('rope-marker');
    if (!marker) return;
    marker.style.left = '50%';
    marker.style.top  = '50%';
    marker.style.transform = 'translate(-50%, -50%)';
}

/* ─────────────────────────────────────────────────────────────
   §23  CLOSE AUTOCOMPLETE ON OUTSIDE CLICK
   ───────────────────────────────────────────────────────────── */

document.addEventListener('click', (e) => {
    // Close P1 autocomplete
    const p1wrap = document.querySelector('#screen-battle-entry .name-input-wrap:nth-of-type(1)');
    if (p1wrap && !p1wrap.contains(e.target)) closeAutocomplete('p1');

    // Close P2 autocomplete
    const p2wrap = document.querySelector('#screen-battle-entry .name-input-wrap:nth-of-type(2)');
    if (p2wrap && !p2wrap.contains(e.target)) closeAutocomplete('p2');
});

/* ─────────────────────────────────────────────────────────────
   §24  INITIALISATION  (runs on DOMContentLoaded)
   ───────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Boot audio engine
    AUDIO.init();

    // 2. Load persisted stats & history
    loadPersistedState();

    // 3. Load student database
    await loadStudents();

    // 4. Initialise mode buttons
    initModeButtons();

    // 5. Position rope marker at centre
    positionRopeMarker();

    // 6. Decide entry point: setup wizard or menu
    runSetup(false);
});

/* ─────────────────────────────────────────────────────────────
   §25  MISC GLOBAL EXPORTS
        (functions referenced directly from inline HTML onclick)
   ───────────────────────────────────────────────────────────── */

window.setGameMode          = setGameMode;
window.setupBattleMode      = setupBattleMode;
window.startCompetitionSetup= startCompetitionSetup;
window.showHistory          = showHistory;
window.runSetup             = runSetup;
window.skipSetup            = skipSetup;
window.verifyAdminPass      = verifyAdminPass;
window.showTeacherLogin     = showTeacherLogin;
window.sortTeacherTable     = sortTeacherTable;
window.hideTeacher          = hideTeacher;
window.clearStats           = clearStats;
window.clearHistory         = clearHistory;
window.addTourneyPlayer     = addTourneyPlayer;
window.clearTPlayers        = clearTPlayers;
window.removeTourneyPlayer  = removeTourneyPlayer;
window.generateBracket      = generateBracket;
window.setActiveMatch       = setActiveMatch;
window.saveAndExit          = saveAndExit;
window.finishTournament     = finishTournament;
window.tapInput             = tapInput;
window.tapClear             = tapClear;
window.toggleMute           = toggleMute;
window.onNameInput          = onNameInput;
window.onNameKeydown        = onNameKeydown;
window.selectStudent        = selectStudent;
window.clearPlayerSelection = clearPlayerSelection;
window.startBattleGame      = startBattleGame;
window.prepareGame          = prepareGame;