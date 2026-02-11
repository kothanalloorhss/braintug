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
const show = (id) => { 
    hideAll(); 
    get(id).classList.remove('hidden'); 
    if(id.includes('game') || id.includes('menu') || id.includes('setup') || id.includes('hub')) {
        get(id).classList.add('flex');
    }
};

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
    STATE.game.difficulty = 1;
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
    {full: "MONEY", miss: "MON_Y", ans: 2, opts: ["I", "E", "A"]}
];

function generateNewQuestion(player) {
    let qObj = {};
    const diff = STATE.game.difficulty;
    const opponent = player === 'p1' ? 'p2' : 'p1';
    
    if(STATE.mode === 'math') {
        const type = Math.floor(Math.random() * 4); 
        let a, b, op, ans;
        if(type === 0) { a=rand(10*diff); b=rand(10*diff); op='+'; ans=a+b; }
        else if(type === 1) { a=rand(15*diff)+5; b=rand(a); op='-'; ans=a-b; }
        else if(type === 2) { a=rand(3*diff)+2; b=rand(10); op='x'; ans=a*b; }
        else { b=rand(2*diff)+2; a=b*rand(10); op='÷'; ans=a/b; }
        qObj = { type: 'math', text: `${a} ${op} ${b}`, ans: ans };
    } else {
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

    // Always reset after a check
    updateTugVisuals();
    clearInput(player);
    generateNewQuestion(player);
}

function updateTugVisuals() {
    let percent = (STATE.game.tug - 50); 
    if(percent < -48) percent = -48;
    if(percent > 48) percent = 48;
    get('rope-marker').style.transform = `translateX(${percent * 1.5}vw)`;
    if(STATE.game.tug <= 5) endGame(`${STATE.game.p1.name} Wins!`);
    else if(STATE.game.tug >= 95) endGame(`${STATE.game.p2.name} Wins!`);
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

/* --- TOURNAMENT LOGIC --- */
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
    if(STATE.players.length >= 2) get('btn-start-tourney').classList.remove('hidden');
}

function generateFixture() {
    let p = [...STATE.players].sort(() => 0.5 - Math.random());
    STATE.bracket = [];
    STATE.currentMatchIndex = 0;
    for(let i=0; i<p.length; i+=2) {
        if(i+1 < p.length) STATE.bracket.push({ p1: p[i], p2: p[i+1], winner: null });
        else STATE.winnersLog.push(`${p[i]} (Bye)`); 
    }
    renderBracket();
    show('screen-tourney-hub');
}

function renderBracket() {
    const view = get('bracket-view');
    view.innerHTML = STATE.bracket.map((m, i) => {
        const active = (i === STATE.currentMatchIndex && !m.winner);
        return `
        <div class="p-4 border-l-4 ${active ? 'border-yellow-500 bg-gray-700' : 'border-gray-600'} mb-2 rounded bg-gray-800/50">
            <div class="flex justify-between font-bold">
                <span class="${m.winner===m.p1 ? 'text-green-400' : ''}">${m.p1}</span>
                <span class="text-gray-500">VS</span>
                <span class="${m.winner===m.p2 ? 'text-green-400' : ''}">${m.p2}</span>
            </div>
            <div class="text-xs text-gray-400 mt-1 uppercase tracking-wider">${m.winner ? 'Finished' : (active ? 'UP NEXT' : 'Pending')}</div>
        </div>`;
    }).join('');

    if(STATE.currentMatchIndex < STATE.bracket.length) {
        const m = STATE.bracket[STATE.currentMatchIndex];
        get('next-match-card').innerHTML = `
            <div class="text-3xl font-bold mb-4">
                <span class="text-p1">${m.p1}</span><br><span class="text-sm text-gray-500">VS</span><br><span class="text-p2">${m.p2}</span>
            </div>
            <button onclick="initGame('${m.p1}', '${m.p2}')" class="w-full py-3 bg-accent text-black font-bold rounded shadow-lg animate-pulse">START</button>
        `;
    } else {
        get('next-match-card').innerHTML = `<div class="text-green-400 font-bold text-xl">Tournament Finished!</div>`;
    }
}

function advanceTournament(winner) {
    if(STATE.bracket[STATE.currentMatchIndex]) {
        STATE.bracket[STATE.currentMatchIndex].winner = winner;
        STATE.winnersLog.push(`${winner} won Match ${STATE.currentMatchIndex+1}`);
        get('winners-log').innerHTML = STATE.winnersLog.map(l => `<li>> ${l}</li>`).join('');
        STATE.currentMatchIndex++;
        renderBracket();
        show('screen-tourney-hub');
    }
}

function quitTournament() { if(confirm('Exit Tournament?')) show('screen-menu'); }