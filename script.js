/* --- CONFIG & STATE --- */
const STATE = {
    mode: 'math',
    type: 'quick',
    players: [],
    bracket: [],
    currentMatchIndex: 0,
    winnersLog: [],
    activeRoundIndex: 0,
    activeMatchIndex: 0,
    game: {
        active: false,
        difficulty: 1,
        timer: 60,
        interval: null,
        tug: 50, // 0 = P1 Win, 100 = P2 Win
        p1: { name: '', score: 0, q: null, ans: '', streak: 0, wrongTimestamps: [], frozen: false },
        p2: { name: '', score: 0, q: null, ans: '', streak: 0, wrongTimestamps: [], frozen: false }
    }
};

/* --- DOM HELPERS --- */
const get = (id) => document.getElementById(id);
const hideAll = () => document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));

window.showScreen = (id) => { 
    hideAll(); 
    const element = get(id);
    if(element) {
        element.classList.remove('hidden'); 
        if(id.includes('game') || id.includes('menu') || id.includes('setup') || id.includes('hub')) {
            element.classList.add('flex');
        }
    }
};
const show = window.showScreen;

/* --- AUDIO SYSTEM --- */
const AUDIO = {
    bgm: get('bgm'),
    playBGM: () => { try { if(AUDIO.bgm) { AUDIO.bgm.volume = 0.2; AUDIO.bgm.play().catch(()=>{}); } } catch(e){} },
    stopBGM: () => { try { if(AUDIO.bgm) { AUDIO.bgm.pause(); AUDIO.bgm.currentTime = 0; } } catch(e){} },
    playSFX: (id) => { try { const s = get(id); if(s) { s.currentTime=0; s.play().catch(()=>{}); } } catch(e){} }
};

/* --- NAVIGATION --- */
function setGameType(mode) {
    STATE.mode = mode;
    get('btn-math').className = mode === 'math' ? "px-4 py-2 rounded-lg font-bold bg-blue-600 text-white ring-2 ring-blue-400" : "px-4 py-2 rounded-lg font-bold text-gray-400 hover:text-white";
    get('btn-eng').className = mode === 'english' ? "px-4 py-2 rounded-lg font-bold bg-orange-600 text-white ring-2 ring-orange-400" : "px-4 py-2 rounded-lg font-bold text-gray-400 hover:text-white";
}
function setupQuickPlay() { STATE.type = 'quick'; show('screen-quick-setup'); }
function setupTournament() { STATE.type = 'tournament'; STATE.players = []; updateTourneyUI(); show('screen-tourney-setup'); }

/* --- GAME ENGINE --- */
function startQuickGame() {
    initGame(get('qp-p1').value || 'Player 1', get('qp-p2').value || 'Player 2');
}

function initGame(p1Name, p2Name) {
    STATE.game.active = true;
    STATE.game.p1.name = p1Name;
    STATE.game.p2.name = p2Name;
    STATE.game.p1.score = 0;
    STATE.game.p2.score = 0;
    STATE.game.p1.streak = 0;
    STATE.game.p2.streak = 0;
    STATE.game.p1.frozen = false;
    STATE.game.p2.frozen = false;
    STATE.game.p1.wrongTimestamps = [];
    STATE.game.p2.wrongTimestamps = [];
    STATE.game.tug = 50;
    STATE.game.timer = 60;
    
    let startDiff = 1; 
    if (STATE.type === 'tournament') {
        const roundsRemaining = STATE.bracket.length - STATE.activeRoundIndex;
        if (roundsRemaining <= 3) startDiff = 2; 
    }
    STATE.game.difficulty = startDiff;

    resetInputs();
    resetUI();
    
    AUDIO.playBGM();
    generateNewQuestion('p1');
    generateNewQuestion('p2');
    updateTugVisuals();
    show('screen-game');

    if(STATE.game.interval) clearInterval(STATE.game.interval);
    STATE.game.interval = setInterval(gameLoop, 1000);
}

function resetInputs() {
    STATE.game.p1.ans = '';
    STATE.game.p2.ans = '';
    get('input-p1').innerText = "";
    get('input-p2').innerText = "";
}

function resetUI() {
    get('game-p1-name').innerText = STATE.game.p1.name;
    get('game-p2-name').innerText = STATE.game.p2.name;
    get('score-p1').innerText = "0";
    get('score-p2').innerText = "0";
    get('feedback-p1').innerText = "";
    get('feedback-p2').innerText = "";
    get('frozen-p1').classList.add('hidden');
    get('frozen-p2').classList.add('hidden');
    get('combo-p1').classList.add('hidden');
    get('combo-p2').classList.add('hidden');
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
    {full: "PIZZA", miss: "PI_ZA", ans: 2, opts: ["S", "Z", "X"]},
    {full: "TRAIN", miss: "TR_IN", ans: 2, opts: ["E", "A", "I"]},
    {full: "SNACK", miss: "SNA_K", ans: 1, opts: ["C", "K", "S"]},
    {full: "GHOST", miss: "GH_ST", ans: 3, opts: ["A", "I", "O"]},
    {full: "MOUSE", miss: "MO_SE", ans: 2, opts: ["O", "U", "A"]},
    {full: "CLOCK", miss: "CL_CK", ans: 2, opts: ["A", "O", "U"]},
    {full: "PLANT", miss: "PL_NT", ans: 3, opts: ["E", "I", "A"]},
    {full: "SPACE", miss: "SP_CE", ans: 3, opts: ["E", "I", "A"]},
    {full: "WORLD", miss: "WO_LD", ans: 1, opts: ["R", "L", "D"]},
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
        let a, b, op, ans, type;
        if(diff === 1) type = Math.floor(Math.random() * 2); 
        else if(diff === 2) type = Math.floor(Math.random() * 3);
        else type = Math.floor(Math.random() * 4);

        if(type === 0) { let r = diff===1?10:diff*15; a=rand(r); b=rand(r); op='+'; ans=a+b; }
        else if(type === 1) { let r = diff===1?15:diff*20; a=rand(r)+(diff===1?2:5); b=rand(a); op='-'; ans=a-b; }
        else if(type === 2) { let ra = diff===1?5:diff*4; a=rand(ra)+1; b=rand(5)+1; op='x'; ans=a*b; }
        else { b=rand(diff*3)+2; a=b*(rand(10)+1); op='÷'; ans=a/b; }
        qObj = { type: 'math', text: `${a} ${op} ${b}`, ans: ans };
    } else {
        let attempts=0, w;
        do { w = ENG_WORDS[Math.floor(Math.random()*ENG_WORDS.length)]; attempts++; } 
        while (STATE.game[opponent].q && w.miss===STATE.game[opponent].q.text && attempts<10);
        qObj = { type: 'eng', text: w.miss, ans: w.ans, opts: w.opts };
    }
    STATE.game[player].q = qObj;
    renderQuestion(player, qObj);
}
function rand(n){return Math.floor(Math.random()*n)+1;}
function renderQuestion(p, q) {
    get(`q-${p}-text`).innerText = q.text;
    const opts = get(`q-${p}-opts`);
    if(q.type === 'eng') {
        opts.classList.remove('hidden');
        opts.innerHTML = q.opts.map((o,i)=>`<div class="bg-gray-800 p-2 rounded border border-gray-600 text-center font-bold text-white"><span class="text-gray-500 mr-2">${i+1}.</span>${o}</div>`).join('');
    } else opts.classList.add('hidden');
}

/* --- INPUT HANDLING --- */
// PC Keys
document.addEventListener('keydown', (e) => {
    if(!STATE.game.active || get('screen-game').classList.contains('hidden')) return;
    const key = e.key, code = e.code;
    if(!STATE.game.p1.frozen) {
        if(code.startsWith('Digit') && "0123456789".includes(key)) handleInstantInput('p1', key);
        if(code === 'KeyS') clearInput('p1');
    }
    if(!STATE.game.p2.frozen) {
        if(code.startsWith('Numpad') && "0123456789".includes(key)) handleInstantInput('p2', key);
        if(code === 'Backspace') clearInput('p2');
    }
});

// Mobile Buttons
window.handleInstantInput = (player, char) => {
    if(STATE.game[player].frozen) return;
    const currentQ = STATE.game[player].q;
    if(!currentQ) return;
    const targetLen = currentQ.ans.toString().length;
    
    STATE.game[player].ans += char;
    const el = get(`input-${player}`);
    el.innerText = STATE.game[player].ans;
    el.classList.add('text-white'); setTimeout(()=>el.classList.remove('text-white'), 100);

    if(STATE.game[player].ans.length >= targetLen) {
        setTimeout(() => validateAnswer(player), 100);
    }
};

window.clearInput = (p) => { STATE.game[p].ans=''; get(`input-${p}`).innerText=''; };

function validateAnswer(player) {
    const val = parseInt(STATE.game[player].ans);
    const correctVal = STATE.game[player].q.ans;
    const fb = get(`feedback-${player}`);
    if(STATE.game[player].fbTimer) clearTimeout(STATE.game[player].fbTimer);

    if (val === correctVal) {
        handleCorrect(player);
        fb.innerText = "CORRECT!";
        fb.className = "h-6 mt-2 font-bold text-lg text-accent animate-bounce";
    } else {
        handleWrong(player);
        fb.innerText = "WRONG";
        fb.className = "h-6 mt-2 font-bold text-lg text-danger animate-shake";
    }
    
    STATE.game[player].fbTimer = setTimeout(() => { fb.innerText = ""; fb.className = "h-6 mt-2 font-bold text-lg"; }, 1000);
    updateTugVisuals();
    window.clearInput(player);
    generateNewQuestion(player);
}

function handleCorrect(player) {
    const pObj = STATE.game[player];
    pObj.score++;
    pObj.streak++;
    get(`score-${player}`).innerText = pObj.score;
    AUDIO.playSFX('sfx-correct');

    let power = 7;
    if(pObj.streak >= 3) {
        power = 12; 
        get(`combo-${player}`).classList.remove('hidden');
        get(`zone-${player}`).classList.add('bg-gray-800/80', 'border-yellow-500'); 
    }
    if(player === 'p1' && STATE.game.tug > 80) power += 5;
    if(player === 'p2' && STATE.game.tug < 20) power += 5;

    if(player === 'p1') STATE.game.tug -= power; else STATE.game.tug += power;
}

function handleWrong(player) {
    const pObj = STATE.game[player];
    pObj.streak = 0; 
    get(`combo-${player}`).classList.add('hidden');
    get(`zone-${player}`).classList.remove('bg-gray-800/80', 'border-yellow-500');
    AUDIO.playSFX('sfx-wrong');

    if(player === 'p1') STATE.game.tug += 3; else STATE.game.tug -= 3;

    const now = Date.now();
    pObj.wrongTimestamps.push(now);
    if(pObj.wrongTimestamps.length > 3) pObj.wrongTimestamps.shift();
    if(pObj.wrongTimestamps.length === 3 && (now - pObj.wrongTimestamps[0] < 4000)) {
        triggerFreeze(player);
        pObj.wrongTimestamps = [];
    }
}

function triggerFreeze(player) {
    STATE.game[player].frozen = true;
    get(`frozen-${player}`).classList.remove('hidden');
    setTimeout(() => {
        STATE.game[player].frozen = false;
        get(`frozen-${player}`).classList.add('hidden');
    }, 2000);
}

function updateTugVisuals() {
    // FIX: Check for 'lg' breakpoint (1024px) for Tablets
    const isMobile = window.innerWidth < 1024;
    
    let val = (STATE.game.tug - 50); 
    if(val < -45) val = -45; if(val > 45) val = 45;

    if(isMobile) {
        // Vertical Logic for Tablet/Mobile
        get('rope-marker').style.transform = `translateY(${val}vh)`;
    } else {
        // Horizontal Logic for Desktop
        get('rope-marker').style.transform = `translateX(${val}vw)`;
    }

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

/* --- TOURNAMENT LOGIC --- */
window.addTourneyPlayer = () => {
    const name = get('tourney-input').value.trim();
    if(name) { STATE.players.push(name); get('tourney-input').value=''; updateTourneyUI(); }
};
function updateTourneyUI() {
    const list = get('tourney-list');
    list.innerHTML = STATE.players.map((p,i) => `<li class="bg-gray-700 p-3 rounded flex justify-between"><span>${i+1}. ${p}</span></li>`).join('');
    if(STATE.players.length >= 2) get('btn-start-tourney').classList.remove('hidden');
}
window.generateFixture = () => {
    let p = [...STATE.players].sort(() => 0.5 - Math.random());
    const nextPow2 = Math.pow(2, Math.ceil(Math.log2(p.length)));
    while(p.length < nextPow2) p.push("BYE");

    STATE.bracket = [];
    let firstRound = [];
    for(let i=0; i<p.length; i+=2) {
        firstRound.push({ id: `R1-M${(i/2)+1}`, p1: p[i], p2: p[i+1], winner: null, nextMatchId: null });
    }
    STATE.bracket.push(firstRound);

    let activeRound = firstRound;
    let roundNum = 2;
    while(activeRound.length > 1) {
        let nextRound = [];
        for(let i=0; i<activeRound.length; i+=2) {
            let matchId = `R${roundNum}-M${(i/2)+1}`;
            activeRound[i].nextMatchId = matchId; activeRound[i].nextSlot = 'p1';
            if(activeRound[i+1]) { activeRound[i+1].nextMatchId = matchId; activeRound[i+1].nextSlot = 'p2'; }
            nextRound.push({ id: matchId, p1: "TBD", p2: "TBD", winner: null, nextMatchId: null });
        }
        STATE.bracket.push(nextRound);
        activeRound = nextRound;
        roundNum++;
    }
    advanceByes();
    updateCurrentMatchIndex();
    renderBracket();
    show('screen-tourney-hub');
};
function advanceByes() {
    STATE.bracket[0].forEach(m => {
        if(m.p2 === "BYE") { m.winner = m.p1; propagateWinner(m); }
        else if(m.p1 === "BYE") { m.winner = m.p2; propagateWinner(m); }
    });
}
function propagateWinner(match) {
    if(!match.nextMatchId) return;
    for(let r of STATE.bracket) {
        let nextM = r.find(m => m.id === match.nextMatchId);
        if(nextM) {
            if(match.nextSlot === 'p1') nextM.p1 = match.winner; else nextM.p2 = match.winner;
            if(nextM.p2 === "BYE" && nextM.p1 !== "TBD") { nextM.winner = nextM.p1; propagateWinner(nextM); }
        }
    }
}
function updateCurrentMatchIndex() {
    for(let rIndex = 0; rIndex < STATE.bracket.length; rIndex++) {
        for(let mIndex = 0; mIndex < STATE.bracket[rIndex].length; mIndex++) {
            let m = STATE.bracket[rIndex][mIndex];
            if(!m.winner && m.p1 !== "TBD" && m.p2 !== "TBD" && m.p1 !== "BYE" && m.p2 !== "BYE") {
                STATE.activeRoundIndex = rIndex; STATE.activeMatchIndex = mIndex; return;
            }
        }
    }
    STATE.activeRoundIndex = -1; 
}
function renderBracket() {
    const view = get('bracket-view');
    view.innerHTML = '';
    STATE.bracket.forEach((round, rIdx) => {
        let roundName = round.length === 1 ? "🏆 FINAL" : (round.length===2?"SEMI FINALS":"ROUND "+(rIdx+1));
        let html = `<h3 class="text-gray-500 font-bold uppercase text-sm mb-2 mt-4 sticky top-0 bg-gray-800 py-2">${roundName}</h3>`;
        round.forEach((m, mIdx) => {
            const isActive = (rIdx === STATE.activeRoundIndex && mIdx === STATE.activeMatchIndex);
            let border = m.winner ? 'border-green-600 opacity-60' : (isActive ? 'border-yellow-500 bg-gray-700 shadow-lg scale-105' : 'border-gray-600');
            html += `<div class="p-3 border-l-4 ${border} mb-2 rounded bg-gray-800/50 transition-all"><div class="flex justify-between text-lg"><span class="${m.winner===m.p1?'text-green-400 font-bold':''}">${m.p1}</span><span class="text-gray-600 text-sm px-2">VS</span><span class="${m.winner===m.p2?'text-green-400 font-bold':''}">${m.p2}</span></div></div>`;
        });
        view.innerHTML += html;
    });
    if(STATE.activeRoundIndex !== -1) {
        const m = STATE.bracket[STATE.activeRoundIndex][STATE.activeMatchIndex];
        get('next-match-card').innerHTML = `<div class="text-xs text-yellow-500 font-bold uppercase mb-2">UP NEXT</div><div class="text-3xl font-bold mb-4"><span class="text-p1">${m.p1}</span><br><span class="text-sm text-gray-500">VS</span><br><span class="text-p2">${m.p2}</span></div><button onclick="initGame('${m.p1}', '${m.p2}')" class="w-full py-3 bg-accent text-black font-bold rounded shadow-lg animate-pulse hover:scale-105 transition">START MATCH</button>`;
    } else {
        get('next-match-card').innerHTML = `<div class="text-green-400 font-bold text-xl mb-2">COMPLETE</div><div class="text-6xl">👑</div><div class="text-white font-bold text-2xl mt-2">${STATE.bracket[STATE.bracket.length-1][0].winner}</div>`;
    }
}
function advanceTournament(winner) {
    let m = STATE.bracket[STATE.activeRoundIndex][STATE.activeMatchIndex];
    m.winner = winner;
    propagateWinner(m);
    updateCurrentMatchIndex();
    STATE.winnersLog.unshift(`Round ${STATE.activeRoundIndex+1}: ${winner} def. ${winner===m.p1?m.p2:m.p1}`);
    get('winners-log').innerHTML = STATE.winnersLog.map(l => `<li>> ${l}</li>`).join('');
    renderBracket();
    show('screen-tourney-hub');
}
window.quitTournament = () => { if(confirm('Exit Tournament?')) show('screen-menu'); };