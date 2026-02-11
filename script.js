/* --- CONFIG & STATE --- */
const STATE = {
    mode: 'math',
    type: 'quick',
    players: [],
    bracket: [],
    currentMatchIndex: 0,
    winnersLog: [],
    game: {
        active: false,
        p1: { name: '', score: 0, q: null, ans: '' },
        p2: { name: '', score: 0, q: null, ans: '' },
        tug: 50, // 0 to 100
        timer: 60,
        interval: null,
        difficulty: 1
    }
};

/* --- DOM HELPERS --- */
const get = (id) => document.getElementById(id);
const hideAll = () => document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));

// FIX: Create the main function 'showScreen'
const showScreen = (id) => { 
    hideAll(); 
    const element = get(id);
    if(element) {
        element.classList.remove('hidden'); 
        // Restore flex layout for screens that need it
        if(id.includes('game') || id.includes('menu') || id.includes('setup') || id.includes('hub')) {
            element.classList.add('flex');
        }
    }
};

// FIX: Map 'show' to 'showScreen' so internal code works too
const show = showScreen;

/* --- ROBUST AUDIO SYSTEM --- */
const AUDIO = {
    bgm: get('bgm'),
    playBGM: () => { 
        try {
            if(AUDIO.bgm) { AUDIO.bgm.volume = 0.2; AUDIO.bgm.play().catch(e => console.warn('Audio start blocked')); }
        } catch(e) { console.warn("Audio Error:", e); }
    },
    stopBGM: () => { try { if(AUDIO.bgm) { AUDIO.bgm.pause(); AUDIO.bgm.currentTime = 0; } } catch(e){} },
    playSFX: (id) => { 
        try {
            const sfx = get(id); 
            if(sfx) { 
                sfx.currentTime = 0; 
                sfx.play().catch(e => console.warn('SFX blocked')); 
            } 
        } catch(e) { console.warn("SFX Error:", e); }
    }
};

/* --- NAVIGATION --- */
function setGameType(mode) {
    STATE.mode = mode;
    get('btn-math').className = mode === 'math' ? "px-6 py-2 rounded-lg font-bold bg-blue-600 text-white ring-2 ring-blue-400" : "px-6 py-2 rounded-lg font-bold text-gray-400 hover:text-white";
    get('btn-eng').className = mode === 'english' ? "px-6 py-2 rounded-lg font-bold bg-orange-600 text-white ring-2 ring-orange-400" : "px-6 py-2 rounded-lg font-bold text-gray-400 hover:text-white";
}

function setupQuickPlay() { STATE.type = 'quick'; show('screen-quick-setup'); }
function setupTournament() { STATE.type = 'tournament'; STATE.players = []; updateTourneyUI(); show('screen-tourney-setup'); }

/* --- GAME ENGINE --- */
function startQuickGame() {
    const p1 = get('qp-p1').value || 'Player 1';
    const p2 = get('qp-p2').value || 'Player 2';
    initGame(p1, p2);
}

function initGame(p1Name, p2Name) {
    STATE.game.active = true;
    STATE.game.p1.name = p1Name;
    STATE.game.p2.name = p2Name;
    STATE.game.p1.score = 0;
    STATE.game.p2.score = 0;
    STATE.game.tug = 50;
    STATE.game.timer = 60;
    
    // --- DIFFICULTY LOGIC ---
    let startDiff = 1; // Default: Easy
    
    if (STATE.type === 'tournament') {
        // Calculate how many rounds are left including this one
        const totalRounds = STATE.bracket.length;
        const currentRoundIdx = STATE.activeRoundIndex; // 0-based index
        const roundsRemaining = totalRounds - currentRoundIdx;
        
        // Logic: 1 = Final, 2 = Semi, 3 = Quarter. 
        // If we are in QF, SF, or Final, Start at Level 2 (Normal)
        if (roundsRemaining <= 3) {
            startDiff = 2; 
        }
    }
    
    STATE.game.difficulty = startDiff;
    // ------------------------

    STATE.game.p1.ans = '';
    STATE.game.p2.ans = '';

    // UI Reset
    get('game-p1-name').innerText = p1Name;
    get('game-p2-name').innerText = p2Name;
    get('score-p1').innerText = "0";
    get('score-p2').innerText = "0";
    get('input-p1').innerText = "";
    get('input-p2').innerText = "";
    get('feedback-p1').innerText = "";
    get('feedback-p2').innerText = "";
    
    AUDIO.playBGM();
    generateNewQuestion('p1');
    generateNewQuestion('p2');
    updateTugVisuals();
    show('screen-game');

    if(STATE.game.interval) clearInterval(STATE.game.interval);
    STATE.game.interval = setInterval(gameLoop, 1000);
}

function gameLoop() {
    STATE.game.timer--;
    get('game-timer').innerText = STATE.game.timer;
    if(STATE.game.timer % 15 === 0 && STATE.game.difficulty < 5) STATE.game.difficulty++;
    if(STATE.game.timer <= 0) endGame("Time's Up!");
}

/* --- QUESTION GENERATOR --- */
const ENG_WORDS = [
    {full: "APPLE", miss: "A_PLE", ans: 2, opts: ["R", "P", "S"]},
    {full: "TIGER", miss: "TI_ER", ans: 3, opts: ["A", "I", "G"]},
    {full: "HOUSE", miss: "HO_SE", ans: 1, opts: ["U", "A", "E"]},
    {full: "WATER", miss: "WA_ER", ans: 3, opts: ["P", "D", "T"]},
    {full: "CLOUD", miss: "CL_UD", ans: 3, opts: ["A", "I", "O"]},
    {full: "ROBOT", miss: "ROB_T", ans: 3, opts: ["A", "I", "O"]},
    {full: "MUSIC", miss: "MUS_C", ans: 2, opts: ["K", "I", "E"]},
    {full: "PHONE", miss: "PH_NE", ans: 3, opts: ["A", "U", "O"]},
    {full: "CHAIR", miss: "CH_IR", ans: 1, opts: ["A", "E", "I"]},
    {full: "BREAD", miss: "BR_AD", ans: 2, opts: ["O", "E", "A"]},
    {full: "EARTH", miss: "E_RTH", ans: 1, opts: ["A", "O", "U"]},
    {full: "MONEY", miss: "MON_Y", ans: 2, opts: ["I", "E", "A"]},
    {full: "LEMON", miss: "LE_ON", ans: 2, opts: ["N", "M", "W"]},
    {full: "RIVER", miss: "RIV_R", ans: 2, opts: ["A", "E", "I"]},
    {full: "STONE", miss: "ST_NE", ans: 2, opts: ["A", "O", "I"]},
    {full: "HAPPY", miss: "HA_PY", ans: 1, opts: ["P", "B", "D"]},
    {full: "GREEN", miss: "GR_EN", ans: 3, opts: ["I", "A", "E"]},
    {full: "SMILE", miss: "SM_LE", ans: 1, opts: ["I", "A", "Y"]},
    {full: "BEACH", miss: "BEA_H", ans: 2, opts: ["S", "C", "T"]},
    {full: "NIGHT", miss: "NI_HT", ans: 1, opts: ["G", "F", "H"]},
    {full: "DREAM", miss: "DR_AM", ans: 3, opts: ["I", "A", "E"]},
    {full: "CANDY", miss: "CAN_Y", ans: 1, opts: ["D", "B", "T"]},
    {full: "PIZZA", miss: "PI_ZA", ans: 2, opts: ["S", "Z", "X"]},
    {full: "TRAIN", miss: "TR_IN", ans: 2, opts: ["E", "A", "I"]},
    {full: "SNACK", miss: "SNA_K", ans: 1, opts: ["C", "K", "S"]},
    {full: "GHOST", miss: "GH_ST", ans: 3, opts: ["A", "I", "O"]},
    {full: "MOUSE", miss: "MO_SE", ans: 2, opts: ["O", "U", "A"]},
    {full: "CLOCK", miss: "CL_CK", ans: 2, opts: ["A", "O", "U"]},
    {full: "PLANT", miss: "PL_NT", ans: 3, opts: ["E", "I", "A"]},
    {full: "SPACE", miss: "SP_CE", ans: 3, opts: ["E", "I", "A"]},
    {full: "WORLD", miss: "WO_LD", ans: 1, opts: ["R", "L", "D"]},
    {full: "CAMEL", miss: "CA_EL", ans: 2, opts: ["N", "M", "W"]},
    {full: "ZEBRA", miss: "Z_BRA", ans: 3, opts: ["I", "A", "E"]},
    {full: "DRINK", miss: "DR_NK", ans: 3, opts: ["A", "E", "I"]},
    {full: "TABLE", miss: "TA_LE", ans: 2, opts: ["P", "B", "D"]},
    {full: "FLOOR", miss: "FL_OR", ans: 2, opts: ["A", "O", "U"]},
    {full: "SHOES", miss: "SH_ES", ans: 1, opts: ["O", "A", "I"]},
    {full: "SHIRT", miss: "SH_RT", ans: 3, opts: ["A", "E", "I"]},
    {full: "PANTS", miss: "PA_TS", ans: 2, opts: ["M", "N", "S"]},
    {full: "FRUIT", miss: "FR_IT", ans: 3, opts: ["O", "I", "U"]},
    {full: "GRAPE", miss: "GR_PE", ans: 3, opts: ["E", "I", "A"]},
    {full: "MELON", miss: "M_LON", ans: 3, opts: ["A", "I", "E"]},
    {full: "BERRY", miss: "BE_RY", ans: 1, opts: ["R", "L", "T"]},
    {full: "ONION", miss: "ON_ON", ans: 2, opts: ["E", "I", "A"]},
    {full: "SALAD", miss: "SA_AD", ans: 2, opts: ["R", "L", "T"]},
    {full: "PASTA", miss: "PA_TA", ans: 1, opts: ["S", "Z", "C"]},
    {full: "TOAST", miss: "TO_ST", ans: 3, opts: ["O", "E", "A"]},
    {full: "LUNCH", miss: "LU_CH", ans: 2, opts: ["M", "N", "R"]},
    {full: "SPORT", miss: "SP_RT", ans: 2, opts: ["A", "O", "U"]},
    {full: "RUGBY", miss: "RU_BY", ans: 1, opts: ["G", "J", "D"]},
    {full: "START", miss: "ST_RT", ans: 3, opts: ["E", "O", "A"]},
    {full: "FIRST", miss: "F_RST", ans: 3, opts: ["A", "E", "I"]},
    {full: "THIRD", miss: "TH_RD", ans: 2, opts: ["E", "I", "U"]},
    {full: "BLACK", miss: "BL_CK", ans: 3, opts: ["E", "O", "A"]},
    {full: "WHITE", miss: "WH_TE", ans: 3, opts: ["A", "E", "I"]},
    {full: "BROWN", miss: "BR_WN", ans: 2, opts: ["A", "O", "U"]},
    {full: "HEAVY", miss: "HE_VY", ans: 3, opts: ["E", "I", "A"]},
    {full: "LIGHT", miss: "LI_HT", ans: 1, opts: ["G", "F", "H"]},
    {full: "CLEAN", miss: "CL_AN", ans: 3, opts: ["I", "A", "E"]},
    {full: "DIRTY", miss: "DI_TY", ans: 1, opts: ["R", "L", "T"]},
    {full: "QUICK", miss: "QU_CK", ans: 3, opts: ["A", "E", "I"]},
    {full: "SMART", miss: "SMA_T", ans: 1, opts: ["R", "L", "N"]}
];

function generateNewQuestion(player) {
    let qObj = {};
    const diff = STATE.game.difficulty;
    const opponent = player === 'p1' ? 'p2' : 'p1';
    
    if(STATE.mode === 'math') {
        let a, b, op, ans;
        // Difficulty Tuning
        // Lvl 1 (Easy): Single digits, simple add/sub/mult. No Div.
        // Lvl 2 (Normal): Double digits (up to 20).
        // Lvl 3+ (Hard): Large numbers (up to 50), Division enabled.
        
        let type; 
        if(diff === 1) type = Math.floor(Math.random() * 3); // 0, 1, 2 (No Div)
        else type = Math.floor(Math.random() * 4); // 0, 1, 2, 3 (All)

        if(type === 0) { 
            // Addition
            let range = diff === 1 ? 10 : (diff * 15);
            a = rand(range); 
            b = rand(range); 
            op = '+'; 
            ans = a + b; 
        }
        else if(type === 1) { 
            // Subtraction (Ensure positive result)
            let range = diff === 1 ? 15 : (diff * 20);
            a = rand(range) + (diff === 1 ? 2 : 5); 
            b = rand(a); 
            op = '-'; 
            ans = a - b; 
        }
        else if(type === 2) { 
            // Multiplication
            let rangeA = diff === 1 ? 5 : (diff * 4);
            let rangeB = diff === 1 ? 5 : 10;
            a = rand(rangeA) + 1; 
            b = rand(rangeB) + 1; 
            op = 'x'; 
            ans = a * b; 
        }
        else { 
            // Division (Only Lvl 2+)
            // Make clean division: b is factor, a is multiple
            b = rand(diff * 3) + 2; 
            a = b * (rand(10) + 1); 
            op = '÷'; 
            ans = a / b; 
        }
        
        qObj = { type: 'math', text: `${a} ${op} ${b}`, ans: ans };
    } else {
        // English Logic (Remains Random + No Duplicate)
        let attempts = 0;
        let w;
        do {
            w = ENG_WORDS[Math.floor(Math.random() * ENG_WORDS.length)];
            attempts++;
        } while (STATE.game[opponent].q && w.miss === STATE.game[opponent].q.text && attempts < 10);
        qObj = { type: 'eng', text: w.miss, ans: w.ans, opts: w.opts };
    }
    
    STATE.game[player].q = qObj;
    renderQuestion(player, qObj);
}

function rand(n) { return Math.floor(Math.random() * n) + 1; }

function renderQuestion(player, q) {
    get(`q-${player}-text`).innerText = q.text;
    const optsDiv = get(`q-${player}-opts`);
    if(q.type === 'eng') {
        optsDiv.classList.remove('hidden');
        optsDiv.innerHTML = q.opts.map((o, i) => 
            `<div class="bg-gray-800 p-2 rounded border border-gray-600 text-center font-bold text-white"><span class="text-gray-500 mr-2">${i+1}.</span>${o}</div>`
        ).join('');
    } else {
        optsDiv.classList.add('hidden');
    }
}

/* --- INSTANT INPUT HANDLING (No Submit Key) --- */
document.addEventListener('keydown', (e) => {
    if(!STATE.game.active || get('screen-game').classList.contains('hidden')) return;

    const key = e.key;
    const code = e.code;
    
    // PLAYER 1 (Left): Top Row 0-9
    // Note: We removed 'A' and 'Enter' checks
    if(code.startsWith('Digit') && "0123456789".includes(key)) {
        handleInstantInput('p1', key);
    }
    // Allow 'S' to clear P1 manually if they made a mistake before auto-submit
    if(code === 'KeyS') clearInput('p1');

    // PLAYER 2 (Right): Numpad 0-9
    if(code.startsWith('Numpad') && "0123456789".includes(key)) {
        handleInstantInput('p2', key);
    }
    // Allow 'Backspace' to clear P2 manually
    if(code === 'Backspace') clearInput('p2');
});

function handleInstantInput(player, char) {
    const currentQ = STATE.game[player].q;
    if(!currentQ) return;

    // 1. Calculate Target Length
    // English mode: Answer is always 1 digit (1, 2, or 3)
    // Math mode: Answer could be '12' (len 2) or '5' (len 1)
    const targetLength = currentQ.ans.toString().length;

    // 2. Add Character
    STATE.game[player].ans += char;
    
    // 3. Update UI
    const el = get(`input-${player}`);
    el.innerText = STATE.game[player].ans;
    el.classList.add('text-white'); // Flash effect
    setTimeout(() => el.classList.remove('text-white'), 100);

    // 4. INSTANT CHECK LOGIC
    // If user has typed enough digits, check immediately
    if(STATE.game[player].ans.length >= targetLength) {
        // Add a tiny delay (100ms) so user sees the number they typed before it disappears
        setTimeout(() => {
            validateAnswer(player);
        }, 100);
    }
}

function clearInput(player) {
    STATE.game[player].ans = '';
    get(`input-${player}`).innerText = '';
}

function validateAnswer(player) {
    const inputStr = STATE.game[player].ans;
    const val = parseInt(inputStr);
    const correctVal = STATE.game[player].q.ans;
    const fb = get(`feedback-${player}`);

    // Clear any existing timer to prevent flickering
    if (STATE.game[player].fbTimer) clearTimeout(STATE.game[player].fbTimer);

    if (val === correctVal) {
        // CORRECT
        STATE.game[player].score++; 
        if(player === 'p1') STATE.game.tug -= 7; 
        else STATE.game.tug += 7;

        fb.innerText = "CORRECT!";
        fb.className = "h-6 mt-4 font-bold text-xl text-accent animate-bounce";
        get(`score-${player}`).innerText = STATE.game[player].score;
        AUDIO.playSFX('sfx-correct');
    } else {
        // WRONG
        if(player === 'p1') STATE.game.tug += 3; 
        else STATE.game.tug -= 3;

        fb.innerText = "WRONG";
        fb.className = "h-6 mt-4 font-bold text-xl text-danger animate-pulse";
        AUDIO.playSFX('sfx-wrong');
    }

    // --- FIX: HIDE TEXT AFTER 1 SECOND ---
    STATE.game[player].fbTimer = setTimeout(() => {
        fb.innerText = "";
        fb.className = "h-6 mt-4"; // Keep space layout
    }, 1000);

    // Update Game State
    updateTugVisuals();
    clearInput(player);
    generateNewQuestion(player);
}

function updateTugVisuals() {
    // LOGIC: 
    // Tug 50 = Center (0vw)
    // Tug 0  = Left Edge (-50vw)
    // Tug 100 = Right Edge (+50vw)
    
    // We map the logic 1:1 to Viewport Width (vw)
    let vw = (STATE.game.tug - 50); 
    
    // Move the Marker
    get('rope-marker').style.transform = `translateX(${vw}vw)`;

    // CHECK WINNER
    // Ends exactly when center hits the edge (0 or 100)
    if(STATE.game.tug <= 0) endGame(`${STATE.game.p1.name} Wins!`);
    else if(STATE.game.tug >= 100) endGame(`${STATE.game.p2.name} Wins!`);
}

function endGame(reason) {
    STATE.game.active = false;
    clearInterval(STATE.game.interval);
    AUDIO.stopBGM();
    AUDIO.playSFX('sfx-win');
    
    let winner = "DRAW";
    if(STATE.game.tug < 50) winner = STATE.game.p1.name;
    else if(STATE.game.tug > 50) winner = STATE.game.p2.name;

    get('modal-title').innerText = winner === "DRAW" ? "It's a Draw!" : `${winner} Wins!`;
    get('modal-msg').innerText = reason;
    get('modal').classList.remove('hidden');
    get('modal').classList.add('flex');
    
    get('modal-btn').onclick = () => {
        get('modal').classList.add('hidden');
        get('modal').classList.remove('flex');
        if(STATE.type === 'tournament') advanceTournament(winner);
        else show('screen-menu');
    };
}

/* --- TOURNAMENT LOGIC (Knockout Tree) --- */
function addTourneyPlayer() {
    const name = get('tourney-input').value.trim();
    if(name) {
        STATE.players.push(name);
        get('tourney-input').value = '';
        updateTourneyUI();
    }
}

function updateTourneyUI() {
    const list = get('tourney-list');
    list.innerHTML = STATE.players.map((p,i) => 
        `<li class="bg-gray-700 p-3 rounded flex justify-between"><span>${i+1}. ${p}</span></li>`
    ).join('');
    // Require 4 or 8 players for a perfect bracket (optional but better)
    if(STATE.players.length >= 2) get('btn-start-tourney').classList.remove('hidden');
}

function generateFixture() {
    // 1. Shuffle Players
    let p = [...STATE.players].sort(() => 0.5 - Math.random());
    
    // 2. Pad with "BYE" if not a power of 2 (2, 4, 8, 16)
    // This ensures the tree is balanced.
    const nextPow2 = Math.pow(2, Math.ceil(Math.log2(p.length)));
    while(p.length < nextPow2) {
        p.push("BYE");
    }

    STATE.bracket = []; // This will hold ALL rounds
    let firstRound = [];

    // 3. Create Round 1
    for(let i=0; i<p.length; i+=2) {
        firstRound.push({
            id: `R1-M${(i/2)+1}`,
            p1: p[i], 
            p2: p[i+1], 
            winner: null,
            nextMatchId: null // Will link later
        });
    }
    STATE.bracket.push(firstRound);

    // 4. Generate Future Rounds (Empty slots)
    let activeRound = firstRound;
    let roundNum = 2;
    
    while(activeRound.length > 1) {
        let nextRound = [];
        for(let i=0; i<activeRound.length; i+=2) {
            let matchId = `R${roundNum}-M${(i/2)+1}`;
            
            // Link previous matches to this one
            activeRound[i].nextMatchId = matchId;
            activeRound[i].nextSlot = 'p1';
            
            if(activeRound[i+1]) {
                activeRound[i+1].nextMatchId = matchId;
                activeRound[i+1].nextSlot = 'p2';
            }

            nextRound.push({
                id: matchId,
                p1: "TBD", // To Be Decided
                p2: "TBD", 
                winner: null,
                nextMatchId: null
            });
        }
        STATE.bracket.push(nextRound);
        activeRound = nextRound;
        roundNum++;
    }

    // 5. Auto-Advance "BYES"
    advanceByes();
    
    STATE.currentMatchIndex = 0; // We will find the first playable match
    updateCurrentMatchIndex();
    renderBracket();
    show('screen-tourney-hub');
}

function advanceByes() {
    // Check Round 1 for BYEs and auto-win the opponent
    STATE.bracket[0].forEach(m => {
        if(m.p2 === "BYE") {
            m.winner = m.p1;
            propagateWinner(m);
        } else if (m.p1 === "BYE") {
            m.winner = m.p2;
            propagateWinner(m);
        }
    });
}

function propagateWinner(match) {
    if(!match.nextMatchId) return; // Final match has no next

    // Find the next match object
    for(let r of STATE.bracket) {
        let nextM = r.find(m => m.id === match.nextMatchId);
        if(nextM) {
            if(match.nextSlot === 'p1') nextM.p1 = match.winner;
            else nextM.p2 = match.winner;
            
            // If the next match now has a "BYE" (rare edge case), auto advance it too
            if(nextM.p2 === "BYE" && nextM.p1 !== "TBD") {
                nextM.winner = nextM.p1;
                propagateWinner(nextM);
            }
        }
    }
}

function updateCurrentMatchIndex() {
    // Find the first match that is ready (has 2 players) but no winner
    for(let rIndex = 0; rIndex < STATE.bracket.length; rIndex++) {
        for(let mIndex = 0; mIndex < STATE.bracket[rIndex].length; mIndex++) {
            let m = STATE.bracket[rIndex][mIndex];
            if(!m.winner && m.p1 !== "TBD" && m.p2 !== "TBD" && m.p1 !== "BYE" && m.p2 !== "BYE") {
                STATE.activeRoundIndex = rIndex;
                STATE.activeMatchIndex = mIndex;
                return;
            }
        }
    }
    STATE.activeRoundIndex = -1; // Tournament Over
}

function renderBracket() {
    const view = get('bracket-view');
    view.innerHTML = '';

    STATE.bracket.forEach((round, rIdx) => {
        // Label: Quarter Finals, Semi Finals, Final
        let roundName = "Round " + (rIdx + 1);
        let matchesLeft = round.length;
        if(matchesLeft === 1) roundName = "🏆 GRAND FINAL";
        else if(matchesLeft === 2) roundName = "SEMI FINALS";
        else if(matchesLeft === 4) roundName = "QUARTER FINALS";

        let html = `<h3 class="text-gray-500 font-bold uppercase text-sm mb-2 mt-4 sticky top-0 bg-gray-800 py-2">${roundName}</h3>`;
        
        round.forEach((m, mIdx) => {
            const isActive = (rIdx === STATE.activeRoundIndex && mIdx === STATE.activeMatchIndex);
            
            // Visual Styling
            let borderClass = 'border-gray-600';
            if(m.winner) borderClass = 'border-green-600 opacity-60'; // Done
            else if(isActive) borderClass = 'border-yellow-500 bg-gray-700 shadow-lg scale-105'; // Current

            html += `
            <div class="p-3 border-l-4 ${borderClass} mb-2 rounded bg-gray-800/50 transition-all">
                <div class="flex justify-between text-lg">
                    <span class="${m.winner===m.p1 ? 'text-green-400 font-bold' : (m.p1==='TBD'?'text-gray-600':'text-white')}">${m.p1}</span>
                    <span class="text-gray-600 text-sm px-2 mt-1">VS</span>
                    <span class="${m.winner===m.p2 ? 'text-green-400 font-bold' : (m.p2==='TBD'?'text-gray-600':'text-white')}">${m.p2}</span>
                </div>
            </div>`;
        });
        view.innerHTML += html;
    });

    // Sidebar Update
    if(STATE.activeRoundIndex !== -1) {
        const m = STATE.bracket[STATE.activeRoundIndex][STATE.activeMatchIndex];
        get('next-match-card').innerHTML = `
            <div class="text-xs text-yellow-500 font-bold uppercase mb-2">UP NEXT</div>
            <div class="text-3xl font-bold mb-4">
                <span class="text-p1">${m.p1}</span><br>
                <span class="text-sm text-gray-500">VS</span><br>
                <span class="text-p2">${m.p2}</span>
            </div>
            <button onclick="initGame('${m.p1}', '${m.p2}')" class="w-full py-3 bg-accent text-black font-bold rounded shadow-lg animate-pulse hover:scale-105 transition">START MATCH</button>
        `;
    } else {
        // Find Champion
        let lastRound = STATE.bracket[STATE.bracket.length-1];
        let champ = lastRound[0].winner;
        get('next-match-card').innerHTML = `
            <div class="text-green-400 font-bold text-xl mb-2">TOURNAMENT COMPLETE</div>
            <div class="text-6xl">👑</div>
            <div class="text-white font-bold text-2xl mt-2">${champ}</div>
        `;
    }
}

function advanceTournament(winner) {
    // 1. Record Winner
    let m = STATE.bracket[STATE.activeRoundIndex][STATE.activeMatchIndex];
    m.winner = winner;
    
    // 2. Move Winner to Next Round
    propagateWinner(m);
    
    // 3. Find Next Match
    updateCurrentMatchIndex();
    
    // 4. Log
    STATE.winnersLog.unshift(`Round ${STATE.activeRoundIndex+1}: ${winner} def. ${winner===m.p1?m.p2:m.p1}`);
    get('winners-log').innerHTML = STATE.winnersLog.map(l => `<li>> ${l}</li>`).join('');

    renderBracket();
    show('screen-tourney-hub');
}

function quitTournament() { if(confirm('Exit Tournament?')) show('screen-menu'); }