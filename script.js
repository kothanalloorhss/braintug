/* =========================================
   BRAIN TUG: PRO ENGINE (FINAL BUILD)
   ========================================= */

/* --- 1. STATE & STORAGE --- */
const STATE = {
    mode: 'math',          // 'math' or 'english'
    type: 'quick',         // 'quick' or 'tournament'
    players: [],           // List of players for setup
    bracket: [],           // Tournament tree
    activeRound: 0, 
    activeMatch: 0, 
    activeTourneyId: null,
    history: JSON.parse(localStorage.getItem('brainTugHistory')) || [],
    stats: JSON.parse(localStorage.getItem('brainTugStats')) || {}, // { "Name": { correct: 10, wrong: 2, timeSum: 5000 } }
    teacherSort: { key: 'rating', asc: false }, // Default sort for teacher dashboard
    game: {
        active: false, 
        difficulty: 1, 
        timer: 60, 
        interval: null, 
        tugValue: 50,      // 0 (P1 Win) -- 50 (Center) -- 100 (P2 Win)
        suddenDeath: false, 
        p1: { name:'', score:0, streak:0, frozen:false, processing:false, ans:'', q:null, wrongTime:[], startTime:0 },
        p2: { name:'', score:0, streak:0, frozen:false, processing:false, ans:'', q:null, wrongTime:[], startTime:0 }
    }
};

/* --- 2. DOM UTILS --- */
const get = (id) => document.getElementById(id);
const hideAllScreens = () => document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));

// Global Screen Switcher
window.showScreen = (id) => {
    hideAllScreens();
    const el = get(id);
    if(el) {
        el.classList.remove('hidden');
        if(id.includes('game') || id.includes('menu') || id.includes('setup') || id.includes('hub') || id.includes('history') || id.includes('modal')) {
            el.classList.add('flex');
        }
    }
};

/* --- 3. AUDIO ENGINE --- */
const AUDIO = {
    bgm: get('bgm'),
    muted: false,
    playBGM: () => { if(!AUDIO.muted && AUDIO.bgm) { AUDIO.bgm.volume=0.2; AUDIO.bgm.play().catch(()=>{}); } },
    stopBGM: () => { if(AUDIO.bgm) { AUDIO.bgm.pause(); AUDIO.bgm.currentTime=0; } },
    playSFX: (id) => { if(AUDIO.muted) return; const s = get(id); if(s) { s.currentTime=0; s.play().catch(()=>{}); } }
};

window.toggleMute = () => {
    AUDIO.muted = !AUDIO.muted;
    const icon = get('icon-mute');
    if(icon) icon.className = AUDIO.muted ? "fas fa-volume-mute text-red-500" : "fas fa-volume-up text-white";
    if(AUDIO.muted) AUDIO.stopBGM(); else if(STATE.game.active) AUDIO.playBGM();
};

/* --- 4. TEACHER & STATS SYSTEM --- */
// Update stats after every answer
function updateStats(name, isCorrect, timeTaken) {
    if(!name || name.startsWith("Player")) return; // Don't track generics
    if(!STATE.stats[name]) STATE.stats[name] = { correct:0, wrong:0, timeSum:0 };
    
    if(isCorrect) STATE.stats[name].correct++;
    else STATE.stats[name].wrong++;
    
    STATE.stats[name].timeSum += timeTaken;
    localStorage.setItem('brainTugStats', JSON.stringify(STATE.stats));
}

// Calculate Rating: High Accuracy + Fast Speed = High Rating
function getPlayerRating(name) {
    const s = STATE.stats[name];
    if(!s) return -9999;
    const total = s.correct + s.wrong;
    if(total === 0) return -9999;
    
    const accuracy = (s.correct / total) * 100; // 0-100
    const avgTime = s.timeSum / total; // ms
    
    // Formula: Accuracy is king. Speed is the tie-breaker.
    return (accuracy * 100) - (avgTime / 10); 
}

window.showTeacherLogin = () => {
    const pass = prompt("Enter Teacher Password:");
    if(pass === "admin") {
        renderTeacherTable();
        get('modal-teacher').classList.remove('hidden');
        get('modal-teacher').classList.add('flex');
    } else if(pass !== null) {
        alert("Incorrect Password");
    }
};

window.sortTeacherTable = (key) => {
    // Toggle sort order if clicking same header, else default to Descending (High is better)
    if(STATE.teacherSort.key === key) STATE.teacherSort.asc = !STATE.teacherSort.asc;
    else { STATE.teacherSort.key = key; STATE.teacherSort.asc = false; }
    
    // Names usually sort Ascending A-Z first
    if(key === 'name' && STATE.teacherSort.key !== key) STATE.teacherSort.asc = true;
    
    renderTeacherTable();
};

function renderTeacherTable() {
    const tbody = get('teacher-table-body'); 
    tbody.innerHTML = '';
    const names = Object.keys(STATE.stats);

    if(names.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-500">No data available.</td></tr>';
        return;
    }

    // Sorting Logic
    names.sort((a, b) => {
        let valA, valB;
        const sA = STATE.stats[a], sB = STATE.stats[b];
        const totA = sA.correct+sA.wrong, totB = sB.correct+sB.wrong;

        switch(STATE.teacherSort.key) {
            case 'name': valA = a.toLowerCase(); valB = b.toLowerCase(); break;
            case 'score': valA = sA.correct * 10; valB = sB.correct * 10; break;
            case 'accuracy': valA = totA ? (sA.correct/totA) : 0; valB = totB ? (sB.correct/totB) : 0; break;
            case 'rating': valA = getPlayerRating(a); valB = getPlayerRating(b); break;
        }

        if(valA < valB) return STATE.teacherSort.asc ? -1 : 1;
        if(valA > valB) return STATE.teacherSort.asc ? 1 : -1;
        return 0;
    });

    names.forEach((name) => {
        const s = STATE.stats[name];
        const total = s.correct + s.wrong;
        const acc = total ? Math.round((s.correct / total) * 100) : 0;
        const rating = Math.round(getPlayerRating(name));
        
        // Color coding
        let accColor = "text-red-400";
        if(acc > 80) accColor = "text-green-400";
        else if(acc > 50) accColor = "text-yellow-400";

        tbody.innerHTML += `
            <tr class="border-b border-gray-700 hover:bg-white/5">
                <td class="p-3 font-bold text-white">${name}</td>
                <td class="p-3 text-white">${s.correct * 10}</td>
                <td class="p-3 ${accColor} font-bold">${acc}%</td>
                <td class="p-3 font-mono text-xs text-gray-400">${rating > -9000 ? rating : '-'}</td>
            </tr>`;
    });
}

window.hideTeacher = () => { get('modal-teacher').classList.add('hidden'); get('modal-teacher').classList.remove('flex'); };
window.clearStats = () => { 
    if(confirm("Reset ALL student performance data? This cannot be undone.")) { 
        STATE.stats={}; 
        localStorage.removeItem('brainTugStats'); 
        renderTeacherTable();
    } 
};

/* --- 5. MENU & NAVIGATION --- */
window.setGameMode = (m) => {
    STATE.mode = m;
    get('btn-mode-math').className = m==='math' ? "px-4 py-2 rounded-lg font-bold transition bg-p1 text-white shadow-lg" : "px-4 py-2 rounded-lg font-bold transition text-gray-400 hover:text-white";
    get('btn-mode-eng').className = m==='english' ? "px-4 py-2 rounded-lg font-bold transition bg-orange-600 text-white shadow-lg" : "px-4 py-2 rounded-lg font-bold transition text-gray-400 hover:text-white";
};

window.setupQuickPlay = () => { 
    STATE.type='quick'; 
    get('modal-quick-setup').classList.remove('hidden'); 
    get('modal-quick-setup').classList.add('flex'); 
};

window.startQuickGameFromModal = () => {
    const p1 = get('qp-p1').value.trim() || 'Player 1';
    const p2 = get('qp-p2').value.trim() || 'Player 2';
    get('modal-quick-setup').classList.add('hidden'); 
    get('modal-quick-setup').classList.remove('flex'); 
    prepareGame(p1, p2);
};

/* --- 6. GAME LIFECYCLE --- */
window.prepareGame = (p1Name, p2Name) => {
    STATE.game.active = false;
    STATE.game.timer = 60;
    STATE.game.tugValue = 50;
    STATE.game.suddenDeath = false;
    
    // Difficulty Scaling based on Round
    let diff = 1; 
    if(STATE.type === 'tournament') {
        const remaining = STATE.bracket.length - STATE.activeRound;
        if(remaining <= 2) diff = 3; // Hard
        else if(remaining <= 3) diff = 2; // Medium
    }
    STATE.game.difficulty = diff;

    setupPlayer('p1', p1Name);
    setupPlayer('p2', p2Name);

    // UI Reset
    updateTugVisuals();
    const tBox = get('timer-box');
    tBox.className = "bg-black/80 px-3 py-1 rounded-full border border-gray-600 backdrop-blur shadow-xl transition-colors duration-300";
    get('game-timer').classList.remove('text-red-500');
    get('game-timer').innerText = "60";

    window.showScreen('screen-game');
    runCountdown();
};

function setupPlayer(key, name) {
    STATE.game[key] = { 
        name: name, score:0, streak:0, frozen:false, processing:false, 
        ans:'', q:null, wrongTime:[], startTime:0 
    };
    get(`${key}-name`).innerText = name;
    get(`${key}-score`).innerText = "0";
    get(`${key}-input`).innerText = "";
    
    const fb = get(`${key}-feedback`);
    fb.innerText = ""; fb.style.opacity = "0"; 
    fb.className = "absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 font-bold text-4xl opacity-0 pointer-events-none z-50";

    get(`${key}-frozen`).classList.add('hidden');
    get(`${key}-combo`).classList.add('hidden');
    get(`zone-${key}`).classList.remove('border-yellow-400');
}

function runCountdown() {
    const overlay = get('countdown-overlay');
    const text = get('countdown-text');
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
    
    let count = 3;
    text.innerText = count;
    text.className = "text-9xl font-black text-yellow-400 animate-bounce";
    
    AUDIO.playSFX('sfx-countdown');
    
    const int = setInterval(() => {
        count--;
        if(count > 0) {
            text.innerText = count;
        } else if (count === 0) {
            text.innerText = "FIGHT!";
            text.className = "text-8xl font-black text-red-500 animate-pop";
            AUDIO.playSFX('sfx-win');
        } else {
            clearInterval(int);
            overlay.classList.add('hidden');
            overlay.classList.remove('flex');
            startGame();
        }
    }, 1000);
}

function startGame() {
    STATE.game.active = true;
    AUDIO.playBGM();
    generateQuestion('p1');
    generateQuestion('p2');
    if(STATE.game.interval) clearInterval(STATE.game.interval);
    STATE.game.interval = setInterval(gameTick, 1000);
}

function gameTick() {
    STATE.game.timer--;
    get('game-timer').innerText = STATE.game.timer;
    
    const tBox = get('timer-box');
    const tText = get('game-timer');

    // Sudden Death UI
    if(STATE.game.suddenDeath) {
        tBox.classList.add('border-red-500', 'animate-pulse');
        tText.classList.add('text-red-500');
        tText.innerText = "SD!";
    } else if(STATE.game.timer <= 10) {
        tBox.classList.add('border-red-500');
        tText.classList.add('text-red-500');
    }

    // Ramping Difficulty
    if(!STATE.game.suddenDeath && STATE.game.timer % 15 === 0 && STATE.game.difficulty < 5) {
        STATE.game.difficulty++;
    }

    if(STATE.game.timer <= 0) {
        if(STATE.game.tugValue === 50) {
            // TRIGGER SUDDEN DEATH
            STATE.game.suddenDeath = true;
            STATE.game.timer = 999; // Infinite
            
            // Visual Alert
            AUDIO.playSFX('sfx-wrong'); 
            const ov = get('countdown-overlay'); 
            const txt = get('countdown-text');
            ov.classList.remove('hidden'); ov.classList.add('flex');
            txt.innerText = "SUDDEN DEATH!";
            txt.className = "text-6xl font-black text-red-500 animate-pulse";
            setTimeout(() => { ov.classList.add('hidden'); ov.classList.remove('flex'); }, 1500);
        } else {
            endGame("TIME'S UP!");
        }
    }
}

/* --- 7. QUESTION ENGINE --- */
const ENG_DICT = [
    {f:"APPLE",m:"A_PLE",a:2,o:["R","P","S"]}, {f:"TIGER",m:"TI_ER",a:3,o:["A","I","G"]}, {f:"HOUSE",m:"HO_SE",a:1,o:["U","A","E"]},
    {f:"WATER",m:"WA_ER",a:3,o:["P","D","T"]}, {f:"ROBOT",m:"ROB_T",a:3,o:["A","I","O"]}, {f:"MUSIC",m:"MUS_C",a:2,o:["K","I","E"]},
    {f:"PHONE",m:"PH_NE",a:3,o:["A","U","O"]}, {f:"EARTH",m:"E_RTH",a:1,o:["A","O","U"]}, {f:"MONEY",m:"MON_Y",a:2,o:["I","E","A"]},
    {f:"RIVER",m:"RIV_R",a:2,o:["A","E","I"]}, {f:"STONE",m:"ST_NE",a:2,o:["A","O","I"]}, {f:"HAPPY",m:"HA_PY",a:1,o:["P","B","D"]},
    {f:"GREEN",m:"GR_EN",a:3,o:["I","A","E"]}, {f:"NIGHT",m:"NI_HT",a:1,o:["G","F","H"]}, {f:"PIZZA",m:"PI_ZA",a:2,o:["S","Z","X"]},
    {f:"TRAIN",m:"TR_IN",a:2,o:["E","A","I"]}, {f:"SNACK",m:"SNA_K",a:1,o:["C","K","S"]}, {f:"GHOST",m:"GH_ST",a:3,o:["A","I","O"]},
    {f:"MOUSE",m:"MO_SE",a:2,o:["O","U","A"]}, {f:"CLOCK",m:"CL_CK",a:2,o:["A","O","U"]}, {f:"SPACE",m:"SP_CE",a:3,o:["E","I","A"]},
    {f:"WORLD",m:"WO_LD",a:1,o:["R","L","D"]}, {f:"TABLE",m:"TA_LE",a:2,o:["P","B","D"]}, {f:"FLOOR",m:"FL_OR",a:2,o:["A","O","U"]},
    {f:"SHOES",m:"SH_ES",a:1,o:["O","A","I"]}, {f:"FRUIT",m:"FR_IT",a:3,o:["O","I","U"]}, {f:"GRAPE",m:"GR_PE",a:3,o:["E","I","A"]}
];

function generateQuestion(p) {
    const diff = STATE.game.difficulty;
    let q = {};

    if(STATE.mode === 'math') {
        let a,b,op,ans;
        const r = Math.random();
        
        if(diff === 1) { 
            if(r > 0.5) { a=rand(10); b=rand(10); op='+'; ans=a+b; }
            else { a=rand(15)+3; b=rand(a); op='-'; ans=a-b; }
        } else if(diff === 2) { 
            if(r > 0.6) { a=rand(9)+1; b=rand(9)+1; op='x'; ans=a*b; }
            else { a=rand(20); b=rand(20); op='+'; ans=a+b; }
        } else { 
             if(r < 0.25) { b=rand(8)+2; a=b*(rand(9)+1); op='÷'; ans=a/b; }
             else if(r < 0.5) { a=rand(12)+2; b=rand(12)+2; op='x'; ans=a*b; }
             else { a=rand(50); b=rand(50); op='+'; ans=a+b; }
        }
        q = { t:'math', txt:`${a} ${op} ${b}`, ans:ans };
    } else {
        const w = ENG_DICT[Math.floor(Math.random()*ENG_DICT.length)];
        q = { t:'eng', txt:w.m, ans:w.a, opts:w.o };
    }

    STATE.game[p].q = q;
    STATE.game[p].startTime = Date.now(); 
    renderQuestion(p, q);
}

function rand(n){return Math.floor(Math.random()*n)+1;}

function renderQuestion(p, q) {
    get(`${p}-q-text`).innerText = q.txt;
    const opts = get(`${p}-q-opts`);
    if(q.t === 'eng') {
        opts.classList.remove('hidden');
        opts.innerHTML = q.opts.map((o,i) => 
            `<div class="bg-gray-800 p-2 rounded border border-gray-600 text-center font-bold text-white text-xs lg:text-sm">
                <span class="text-gray-500 mr-1">${i+1}.</span>${o}
            </div>`
        ).join('');
    } else {
        opts.classList.add('hidden');
    }
}

/* --- 8. INPUT & SCORING --- */
document.addEventListener('keydown', (e) => {
    if(!STATE.game.active) return;
    const k=e.key, c=e.code;
    
    if(!STATE.game.p1.frozen) {
        if(c.startsWith('Digit') && "0123456789".includes(k)) handleInput('p1', k);
        if(c==='KeyS') clearInput('p1');
    }
    if(!STATE.game.p2.frozen) {
        if(c.startsWith('Numpad') && "0123456789".includes(k)) handleInput('p2', k);
        if(c==='Backspace') clearInput('p2');
    }
});

window.tapInput = (p, k) => handleInput(p, k);
window.tapClear = (p) => clearInput(p);

function handleInput(p, char) {
    // Flag to prevent double submission
    if(STATE.game[p].frozen || STATE.game[p].processing) return;
    const q = STATE.game[p].q;
    if(!q) return;

    STATE.game[p].ans += char;
    get(`${p}-input`).innerText = STATE.game[p].ans;
    
    const reqLen = q.ans.toString().length;
    if(STATE.game[p].ans.length >= reqLen) {
        STATE.game[p].processing = true; 
        setTimeout(() => validate(p), 50);
    }
}

function clearInput(p) { STATE.game[p].ans = ''; get(`${p}-input`).innerText = ''; }

function validate(p) {
    const val = parseInt(STATE.game[p].ans);
    const correct = STATE.game[p].q.ans;
    const fb = get(`${p}-feedback`);
    const timeTaken = Date.now() - STATE.game[p].startTime;
    
    if(val === correct) {
        updateStats(STATE.game[p].name, true, timeTaken);
        
        STATE.game[p].score++;
        STATE.game[p].streak++;
        get(`${p}-score`).innerText = STATE.game[p].score;
        AUDIO.playSFX('sfx-correct');
        
        fb.innerText = "GOOD!";
        fb.style.opacity = "1";
        fb.className = "absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 font-bold text-4xl text-accent animate-pop pointer-events-none z-50";
        
        let power = 8;
        if(STATE.game[p].streak >= 3) {
            power = 15;
            get(`${p}-combo`).classList.remove('hidden');
            get(`zone-${p}`).classList.add('border-yellow-400');
        }
        // Rubber Banding (Help loser)
        if(p==='p1' && STATE.game.tugValue > 80) power += 5;
        if(p==='p2' && STATE.game.tugValue < 20) power += 5;

        moveTug(p, power);

    } else {
        updateStats(STATE.game[p].name, false, timeTaken);
        
        STATE.game[p].streak = 0;
        get(`${p}-combo`).classList.add('hidden');
        get(`zone-${p}`).classList.remove('border-yellow-400');
        
        AUDIO.playSFX('sfx-wrong');
        fb.innerText = "MISS";
        fb.style.opacity = "1";
        fb.className = "absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 font-bold text-4xl text-danger animate-shake pointer-events-none z-50";
        
        moveTug(p === 'p1' ? 'p2' : 'p1', 4); // Penalty
        
        const now = Date.now();
        STATE.game[p].wrongTime.push(now);
        if(STATE.game[p].wrongTime.length > 3) STATE.game[p].wrongTime.shift();
        
        // Anti-Spam Freeze
        if(STATE.game[p].wrongTime.length === 3 && (now - STATE.game[p].wrongTime[0] < 3000)) {
            freezePlayer(p);
            STATE.game[p].wrongTime = [];
        }
    }

    setTimeout(() => { 
        fb.style.opacity = "0"; 
        STATE.game[p].processing = false; 
    }, 600);
    clearInput(p);
    generateQuestion(p);
}

function moveTug(puller, amount) {
    if(puller === 'p1') STATE.game.tugValue -= amount;
    else STATE.game.tugValue += amount;
    
    if(STATE.game.tugValue < 0) STATE.game.tugValue = 0;
    if(STATE.game.tugValue > 100) STATE.game.tugValue = 100;

    // Shake
    if(amount > 10) {
        document.body.classList.add('camera-shake');
        setTimeout(() => document.body.classList.remove('camera-shake'), 500);
    }

    updateTugVisuals();
    
    // Check Win
    if(STATE.game.tugValue <= 0) endGame(STATE.game.p1.name);
    else if(STATE.game.tugValue >= 100) endGame(STATE.game.p2.name);
}

function updateTugVisuals() {
    const isMobile = window.innerWidth < 1024; 
    let pct = STATE.game.tugValue - 50; 
    if(pct < -45) pct = -45; if(pct > 45) pct = 45;

    const marker = get('rope-marker');
    if(isMobile) marker.style.transform = `translateY(${pct}vh)`;
    else marker.style.transform = `translateX(${pct}vw)`;
}

function freezePlayer(p) {
    STATE.game[p].frozen = true;
    get(`${p}-frozen`).classList.remove('hidden');
    get(`${p}-frozen`).classList.add('flex');
    setTimeout(() => {
        STATE.game[p].frozen = false;
        get(`${p}-frozen`).classList.add('hidden');
        get(`${p}-frozen`).classList.remove('flex');
    }, 2000);
}

function endGame(winnerName) {
    STATE.game.active = false;
    clearInterval(STATE.game.interval);
    AUDIO.stopBGM();
    
    if(winnerName === "TIME'S UP!") {
        if(STATE.game.tugValue < 50) winnerName = STATE.game.p1.name;
        else if(STATE.game.tugValue > 50) winnerName = STATE.game.p2.name;
        else winnerName = "DRAW - ERROR"; 
    }

    get('winner-name').innerText = winnerName;
    get('winner-reason').innerText = STATE.game.suddenDeath ? "SUDDEN DEATH VICTORY!" : (STATE.game.tugValue <= 0 || STATE.game.tugValue >= 100 ? "KNOCKOUT!" : "TIME DECISION");
    
    if(winnerName !== "DRAW") {
        AUDIO.playSFX('sfx-win');
        confetti({ particleCount: 200, spread: 100, origin: { y: 0.6 } });
    }

    get('modal-winner').classList.remove('hidden');
    get('modal-winner').classList.add('flex');

    const btn = get('btn-winner-continue');
    btn.onclick = () => {
        get('modal-winner').classList.add('hidden');
        get('modal-winner').classList.remove('flex');
        
        if(STATE.type === 'tournament') {
            handleTournamentWin(winnerName);
        } else {
            window.showScreen('screen-menu');
        }
    };
}

/* --- 9. TOURNAMENT ENGINE --- */
window.setupTournament = () => {
    STATE.type = 'tournament';
    
    // 1. Resume Check
    let saved = null; try { saved = JSON.parse(localStorage.getItem('brainTugActive')); } catch(e) {}
    if(saved && confirm("Resume active tournament?")) { loadTournament(saved); return; }

    // 2. Previous Players
    const prev = JSON.parse(localStorage.getItem('brainTugLastPlayers'));
    if(prev && prev.length > 0 && confirm(`Reload ${prev.length} students from last session?`)) {
        STATE.players = prev;
    } else {
        STATE.players = [];
    }
    
    STATE.activeTourneyId = Date.now();
    updatePlayerList();
    window.showScreen('screen-tourney-setup');
};

function loadTournament(data) {
    STATE.players = data.players;
    STATE.bracket = data.bracket;
    STATE.activeRound = data.round;
    STATE.activeMatch = data.match;
    STATE.activeTourneyId = data.id;
    renderBracket();
    window.showScreen('screen-tourney-hub');
}

window.addTourneyPlayer = () => {
    const inp = get('tourney-input');
    const name = inp.value.trim();
    if(name) { STATE.players.push(name); inp.value=''; updatePlayerList(); }
};

window.clearPlayers = () => { STATE.players=[]; updatePlayerList(); };

function updatePlayerList() {
    get('player-count').innerText = `${STATE.players.length} Players`;
    const list = get('player-list');
    list.innerHTML = STATE.players.map((p, i) => 
        `<li class="flex justify-between items-center bg-gray-800 p-2 rounded-lg border border-gray-700 animate-pop">
            <span class="font-bold text-white">${i+1}. ${p}</span>
            <button onclick="removePlayer(${i})" class="text-red-400 hover:text-white"><i class="fas fa-times"></i></button>
        </li>`
    ).join('');
    
    const btn = get('btn-generate');
    if(STATE.players.length >= 2) {
        btn.classList.remove('hidden');
        btn.innerText = `START BRACKET (${STATE.players.length})`;
    } else {
        btn.classList.add('hidden');
    }
    localStorage.setItem('brainTugLastPlayers', JSON.stringify(STATE.players));
}

window.removePlayer = (i) => { STATE.players.splice(i,1); updatePlayerList(); };

/* --- 10. BRACKET LOGIC --- */
window.generateBracket = () => {
    let p = [...STATE.players];
    // Smart Seed: Sort High Rank vs High Rank
    p.sort((a,b) => getPlayerRating(b) - getPlayerRating(a));

    const nextPow2 = Math.pow(2, Math.ceil(Math.log2(p.length)));
    while(p.length < nextPow2) p.push("BYE");

    STATE.bracket = []; 
    let r1 = [];
    for(let i=0; i<p.length; i+=2) r1.push({p1:p[i],p2:p[i+1],winner:null});
    STATE.bracket.push(r1);

    let ar = r1;
    while(ar.length > 1) {
        let nr = [];
        for(let i=0; i<ar.length; i+=2) nr.push({p1:'TBD',p2:'TBD',winner:null});
        STATE.bracket.push(nr); ar = nr;
    }
    
    resolveByes(); findNextMatch(); saveTournament(); renderBracket(); window.showScreen('screen-tourney-hub');
};

function resolveByes() {
    STATE.bracket[0].forEach((m, idx) => {
        if(m.p2 === "BYE") { m.winner = m.p1; forwardWinner(0, idx, m.p1); }
        else if(m.p1 === "BYE") { m.winner = m.p2; forwardWinner(0, idx, m.p2); }
    });
}

function forwardWinner(rIdx, mIdx, winnerName) {
    if(rIdx + 1 >= STATE.bracket.length) return; 
    const nextR = STATE.bracket[rIdx + 1];
    const nextMIdx = Math.floor(mIdx / 2);
    const slot = (mIdx % 2 === 0) ? 'p1' : 'p2';
    nextR[nextMIdx][slot] = winnerName;
    
    const oppSlot = (slot === 'p1') ? 'p2' : 'p1';
    if(nextR[nextMIdx][oppSlot] === "BYE") {
        nextR[nextMIdx].winner = winnerName;
        forwardWinner(rIdx + 1, nextMIdx, winnerName);
    }
}

function findNextMatch() {
    for(let r=0; r<STATE.bracket.length; r++) {
        for(let m=0; m<STATE.bracket[r].length; m++) {
            const match = STATE.bracket[r][m];
            if(!match.winner && match.p1 !== 'TBD' && match.p2 !== 'TBD' && match.p1 !== 'BYE' && match.p2 !== 'BYE') {
                STATE.activeRound = r;
                STATE.activeMatch = m;
                return;
            }
        }
    }
    STATE.activeRound = -1; 
}

// ADMIN OVERRIDE
window.setActiveMatch = (r, m) => { STATE.activeRound = r; STATE.activeMatch = m; renderBracket(); }

function renderBracket() {
    const c = get('bracket-container'); c.innerHTML = '';
    
    STATE.bracket.forEach((round, rIdx) => {
        let label = `ROUND ${rIdx+1}`;
        if(round.length === 1) label = "🏆 FINAL";
        else if(round.length === 2) label = "SEMI FINAL";
        
        let html = `<div class="mb-4"><h3 class="text-xs font-bold text-gray-500 mb-2 sticky top-0 bg-card py-1 uppercase">${label}</h3><div class="space-y-2">`;
        
        round.forEach((m, mIdx) => {
            const active = (rIdx === STATE.activeRound && mIdx === STATE.activeMatch);
            // Allow Admin Click only on playable matches
            const isPlayable = !m.winner && m.p1 !== 'TBD' && m.p2 !== 'TBD';
            const clickAttr = isPlayable ? `onclick="setActiveMatch(${rIdx},${mIdx})"` : "";
            const cursorClass = isPlayable ? "match-card" : "";

            let sc = "border-gray-700 bg-gray-800/50 opacity-50"; 
            if(active) sc = "border-yellow-400 bg-gray-800 shadow-lg scale-105 border-l-4 opacity-100";
            else if(m.winner) sc = "border-green-600 bg-gray-800/80 border-l-4 opacity-70";
            else if(m.p1 !== 'TBD' && m.p2 !== 'TBD') sc = "border-blue-500 bg-gray-800 border-l-2 opacity-90"; 

            html += `
            <div class="p-3 rounded-lg border ${sc} transition-all flex justify-between items-center ${cursorClass}" ${clickAttr}>
                <span class="${m.winner===m.p1?'text-accent font-bold':''} text-sm">${m.p1}</span>
                <span class="text-xs text-gray-500 mx-2">VS</span>
                <span class="${m.winner===m.p2?'text-accent font-bold':''} text-sm">${m.p2}</span>
            </div>`;
        });
        html += `</div></div>`;
        c.innerHTML += html;
    });

    const card = get('match-card-content');
    if(STATE.activeRound !== -1) {
        const m = STATE.bracket[STATE.activeRound][STATE.activeMatch];
        card.innerHTML = `
            <div class="text-yellow-400 font-bold text-xs uppercase mb-2 animate-pulse">UP NEXT</div>
            <div class="text-3xl font-black text-white mb-4">
                <span class="text-p1">${m.p1}</span>
                <span class="text-sm text-gray-500 block my-1">VS</span>
                <span class="text-p2">${m.p2}</span>
            </div>
            <button onclick="prepareGame('${m.p1}', '${m.p2}')" class="w-full py-4 bg-accent text-dark font-bold rounded-xl shadow-lg hover:scale-105 transition">START MATCH</button>
        `;
    } else {
        const w = STATE.bracket[STATE.bracket.length-1][0].winner;
        card.innerHTML = `
            <div class="text-accent font-bold text-xl uppercase mb-2">CHAMPION</div>
            <div class="text-6xl mb-4">👑</div>
            <div class="text-3xl font-black text-white mb-6">${w}</div>
            <button onclick="finishTournament('${w}')" class="text-sm text-gray-400 hover:text-white underline">End & Save Record</button>
        `;
    }
}

function handleTournamentWin(winner) {
    const m = STATE.bracket[STATE.activeRound][STATE.activeMatch];
    m.winner = winner;
    forwardWinner(STATE.activeRound, STATE.activeMatch, winner);
    findNextMatch();
    saveTournament();
    renderBracket();
    window.showScreen('screen-tourney-hub');
}

function saveTournament() {
    const data = { 
        id: STATE.activeTourneyId, 
        players: STATE.players, 
        bracket: STATE.bracket, 
        round: STATE.activeRound, 
        match: STATE.activeMatch 
    };
    localStorage.setItem('brainTugActive', JSON.stringify(data));
}

window.saveAndExit = () => { saveTournament(); window.showScreen('screen-menu'); };

function finishTournament(winner) {
    const record = {
        id: new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString(),
        winner: winner,
        players: STATE.players.length
    };
    STATE.history.unshift(record);
    localStorage.setItem('brainTugHistory', JSON.stringify(STATE.history));
    localStorage.removeItem('brainTugActive');
    window.showScreen('screen-menu');
}

window.showHistory = () => {
    const list = get('history-list');
    if(STATE.history.length === 0) list.innerHTML = "<div class='text-gray-500 text-center italic'>No history yet.</div>";
    else {
        list.innerHTML = STATE.history.map(h => `
            <div class="bg-gray-800 p-4 rounded-xl border border-gray-700 flex justify-between items-center">
                <div>
                    <div class="text-accent font-bold text-lg">👑 ${h.winner}</div>
                    <div class="text-xs text-gray-500">${h.players} Players</div>
                </div>
                <div class="text-xs text-gray-400">${h.id}</div>
            </div>
        `).join('');
    }
    window.showScreen('screen-history');
};

window.clearHistory = () => {
    if(confirm("Clear all history?")) {
        STATE.history = [];
        localStorage.removeItem('brainTugHistory');
        window.showHistory();
    }
};
