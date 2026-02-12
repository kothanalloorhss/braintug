/* --- CONFIG & STATE --- */
const STATE = {
    mode: 'math',
    type: 'quick',
    players: [],
    bracket: [],
    history: JSON.parse(localStorage.getItem('brainTugHistory')) || [],
    currentTourneyID: null,
    activeRoundIndex: 0,
    activeMatchIndex: 0,
    game: {
        active: false,
        difficulty: 1,
        timer: 60,
        interval: null,
        tug: 50,
        p1: { name: '', score: 0, q: null, ans: '', streak: 0, frozen: false },
        p2: { name: '', score: 0, q: null, ans: '', streak: 0, frozen: false }
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
        if(id.includes('game') || id.includes('menu') || id.includes('setup') || id.includes('hub') || id.includes('history')) {
            element.classList.add('flex');
        }
    }
};
const show = window.showScreen;

/* --- AUDIO --- */
const AUDIO = {
    bgm: get('bgm'), muted: false,
    playBGM: () => { if(AUDIO.bgm && !AUDIO.muted) { AUDIO.bgm.volume=0.2; AUDIO.bgm.play().catch(()=>{}); }},
    stopBGM: () => { if(AUDIO.bgm) { AUDIO.bgm.pause(); AUDIO.bgm.currentTime=0; }},
    playSFX: (id) => { const s=get(id); if(s && !AUDIO.muted) { s.currentTime=0; s.play().catch(()=>{}); }}
};
window.toggleMute = () => {
    AUDIO.muted = !AUDIO.muted;
    get('icon-mute').className = AUDIO.muted ? "fas fa-volume-mute text-red-500" : "fas fa-volume-up text-white";
    if(AUDIO.muted) AUDIO.stopBGM(); else if(STATE.game.active) AUDIO.playBGM();
};

/* --- NAVIGATION & MODE --- */
function setGameType(mode) {
    STATE.mode = mode;
    get('btn-math').className = mode === 'math' ? "px-4 py-2 rounded-lg font-bold bg-blue-600 text-white ring-2 ring-blue-400" : "px-4 py-2 rounded-lg font-bold text-gray-400 hover:text-white";
    get('btn-eng').className = mode === 'english' ? "px-4 py-2 rounded-lg font-bold bg-orange-600 text-white ring-2 ring-orange-400" : "px-4 py-2 rounded-lg font-bold text-gray-400 hover:text-white";
}
function setupQuickPlay() { STATE.type = 'quick'; show('screen-quick-setup'); }

/* --- PERSISTENT TOURNAMENT LOGIC --- */
function setupTournament() {
    STATE.type = 'tournament';
    // Check if there is an active tournament
    const activeData = localStorage.getItem('brainTugActiveTourney');
    if(activeData) {
        const data = JSON.parse(activeData);
        if(confirm(`Resume Tournament: ${data.id}?`)) {
            loadTournament(data);
            return;
        } else {
            localStorage.removeItem('brainTugActiveTourney');
        }
    }
    STATE.players = []; 
    STATE.bracket = [];
    STATE.currentTourneyID = "T-" + new Date().toISOString().slice(0,10);
    updateTourneyUI(); 
    show('screen-tourney-setup');
}

function loadTournament(data) {
    STATE.players = data.players;
    STATE.bracket = data.bracket;
    STATE.currentTourneyID = data.id;
    updateCurrentMatchIndex();
    renderBracket();
    show('screen-tourney-hub');
}

function saveTournament() {
    if(STATE.type !== 'tournament') return;
    const data = { id: STATE.currentTourneyID, players: STATE.players, bracket: STATE.bracket, date: Date.now() };
    localStorage.setItem('brainTugActiveTourney', JSON.stringify(data));
}

function finishTournament(winner) {
    // Save to History
    STATE.history.unshift({ id: STATE.currentTourneyID, winner: winner, date: new Date().toLocaleDateString() });
    localStorage.setItem('brainTugHistory', JSON.stringify(STATE.history));
    localStorage.removeItem('brainTugActiveTourney'); // Clear active
}

window.saveAndExit = () => { saveTournament(); show('screen-menu'); };

window.showHistory = () => {
    const list = get('history-list');
    list.innerHTML = STATE.history.map(h => 
        `<li class="bg-gray-700 p-4 rounded flex justify-between items-center">
            <div><div class="font-bold text-white">${h.winner}</div><div class="text-xs text-gray-400">${h.id}</div></div>
            <div class="text-sm text-gray-400">${h.date}</div>
        </li>`
    ).join('') || "<div class='text-center text-gray-500'>No history yet.</div>";
    show('screen-history');
};

/* --- GAME ENGINE WITH COUNTDOWN --- */
window.prepareGame = (p1, p2) => {
    // 1. Setup UI
    initGameUI(p1, p2);
    // 2. Show Game Screen
    show('screen-game');
    // 3. Start Countdown
    startCountdown();
};

function startCountdown() {
    const overlay = get('countdown-overlay');
    const text = get('countdown-text');
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
    
    let count = 3;
    text.innerText = count;
    
    const interval = setInterval(() => {
        count--;
        if(count > 0) {
            text.innerText = count;
            AUDIO.playSFX('sfx-correct'); // Beep
        } else if (count === 0) {
            text.innerText = "FIGHT!";
            text.classList.add('text-red-500');
        } else {
            clearInterval(interval);
            overlay.classList.add('hidden');
            overlay.classList.remove('flex');
            startGameLogic();
        }
    }, 1000);
}

function initGameUI(p1Name, p2Name) {
    STATE.game.p1.name = p1Name; STATE.game.p2.name = p2Name;
    STATE.game.p1.score = 0; STATE.game.p2.score = 0;
    STATE.game.p1.streak = 0; STATE.game.p2.streak = 0;
    STATE.game.tug = 50; STATE.game.timer = 60;
    STATE.game.p1.frozen = false; STATE.game.p2.frozen = false;
    
    let startDiff = 1; 
    if (STATE.type === 'tournament') {
        const roundsRemaining = STATE.bracket.length - STATE.activeRoundIndex;
        if (roundsRemaining <= 3) startDiff = 2; 
    }
    STATE.game.difficulty = startDiff;

    resetInputs();
    updateUI();
    updateTugVisuals();
}

function startGameLogic() {
    STATE.game.active = true;
    AUDIO.playBGM();
    generateNewQuestion('p1');
    generateNewQuestion('p2');
    if(STATE.game.interval) clearInterval(STATE.game.interval);
    STATE.game.interval = setInterval(gameLoop, 1000);
}

function resetInputs() { STATE.game.p1.ans=''; STATE.game.p2.ans=''; get('input-p1').innerText=''; get('input-p2').innerText=''; }
function updateUI() {
    get('game-p1-name').innerText = STATE.game.p1.name; get('game-p2-name').innerText = STATE.game.p2.name;
    get('score-p1').innerText = "0"; get('score-p2').innerText = "0";
    get('feedback-p1').innerText = ""; get('feedback-p2').innerText = "";
    get('frozen-p1').classList.add('hidden'); get('frozen-p2').classList.add('hidden');
    get('combo-p1').classList.add('hidden'); get('combo-p2').classList.add('hidden');
}

function gameLoop() {
    STATE.game.timer--;
    const tEl = get('game-timer');
    tEl.innerText = STATE.game.timer;
    
    // Sudden Death Red Pulse
    if(STATE.game.timer <= 10) tEl.parentElement.classList.add('bg-red-600', 'animate-pulse');
    else tEl.parentElement.classList.remove('bg-red-600', 'animate-pulse');

    if(STATE.game.timer % 15 === 0 && STATE.game.difficulty < 5) STATE.game.difficulty++;
    if(STATE.game.timer <= 0) endGame("Time's Up!");
}

/* --- MATH/ENGLISH & INPUT --- */
const ENG_WORDS = [
    {full:"APPLE",miss:"A_PLE",ans:2,opts:["R","P","S"]}, {full:"TIGER",miss:"TI_ER",ans:3,opts:["A","I","G"]}, {full:"HOUSE",miss:"HO_SE",ans:1,opts:["U","A","E"]},
    {full:"WATER",miss:"WA_ER",ans:3,opts:["P","D","T"]}, {full:"CLOUD",miss:"CL_UD",ans:3,opts:["A","I","O"]}, {full:"ROBOT",miss:"ROB_T",ans:3,opts:["A","I","O"]},
    {full:"MUSIC",miss:"MUS_C",ans:2,opts:["K","I","E"]}, {full:"PHONE",miss:"PH_NE",ans:3,opts:["A","U","O"]}, {full:"CHAIR",miss:"CH_IR",ans:1,opts:["A","E","I"]},
    {full:"EARTH",miss:"E_RTH",ans:1,opts:["A","O","U"]}, {full:"MONEY",miss:"MON_Y",ans:2,opts:["I","E","A"]}, {full:"LEMON",miss:"LE_ON",ans:2,opts:["N","M","W"]},
    {full:"RIVER",miss:"RIV_R",ans:2,opts:["A","E","I"]}, {full:"STONE",miss:"ST_NE",ans:2,opts:["A","O","I"]}, {full:"HAPPY",miss:"HA_PY",ans:1,opts:["P","B","D"]},
    {full:"GREEN",miss:"GR_EN",ans:3,opts:["I","A","E"]}, {full:"SMILE",miss:"SM_LE",ans:1,opts:["I","A","Y"]}, {full:"BEACH",miss:"BEA_H",ans:2,opts:["S","C","T"]},
    {full:"NIGHT",miss:"NI_HT",ans:1,opts:["G","F","H"]}, {full:"PIZZA",miss:"PI_ZA",ans:2,opts:["S","Z","X"]}, {full:"TRAIN",miss:"TR_IN",ans:2,opts:["E","A","I"]},
    {full:"SNACK",miss:"SNA_K",ans:1,opts:["C","K","S"]}, {full:"GHOST",miss:"GH_ST",ans:3,opts:["A","I","O"]}, {full:"MOUSE",miss:"MO_SE",ans:2,opts:["O","U","A"]},
    {full:"CLOCK",miss:"CL_CK",ans:2,opts:["A","O","U"]}, {full:"PLANT",miss:"PL_NT",ans:3,opts:["E","I","A"]}, {full:"SPACE",miss:"SP_CE",ans:3,opts:["E","I","A"]},
    {full:"WORLD",miss:"WO_LD",ans:1,opts:["R","L","D"]}, {full:"TABLE",miss:"TA_LE",ans:2,opts:["P","B","D"]}, {full:"FLOOR",miss:"FL_OR",ans:2,opts:["A","O","U"]},
    {full:"SHOES",miss:"SH_ES",ans:1,opts:["O","A","I"]}, {full:"SHIRT",miss:"SH_RT",ans:3,opts:["A","E","I"]}, {full:"PANTS",miss:"PA_TS",ans:2,opts:["M","N","S"]},
    {full:"FRUIT",miss:"FR_IT",ans:3,opts:["O","I","U"]}, {full:"GRAPE",miss:"GR_PE",ans:3,opts:["E","I","A"]}, {full:"MELON",miss:"M_LON",ans:3,opts:["A","I","E"]}
];

function generateNewQuestion(player) {
    let qObj={}; const diff=STATE.game.difficulty;
    if(STATE.mode==='math'){
        let a,b,op,ans,type;
        if(diff===1) type=Math.floor(Math.random()*2); else if(diff===2) type=Math.floor(Math.random()*3); else type=Math.floor(Math.random()*4);
        if(type===0){let r=diff===1?10:diff*15; a=rand(r); b=rand(r); op='+'; ans=a+b;}
        else if(type===1){let r=diff===1?15:diff*20; a=rand(r)+(diff===1?2:5); b=rand(a); op='-'; ans=a-b;}
        else if(type===2){let ra=diff===1?5:diff*4; a=rand(ra)+1; b=rand(5)+1; op='x'; ans=a*b;}
        else {b=rand(diff*3)+2; a=b*(rand(10)+1); op='÷'; ans=a/b;}
        qObj={type:'math', text:`${a} ${op} ${b}`, ans:ans};
    } else {
        let w=ENG_WORDS[Math.floor(Math.random()*ENG_WORDS.length)];
        qObj={type:'eng', text:w.miss, ans:w.ans, opts:w.opts};
    }
    STATE.game[player].q=qObj; renderQuestion(player, qObj);
}
function rand(n){return Math.floor(Math.random()*n)+1;}
function renderQuestion(p,q){
    get(`q-${p}-text`).innerText=q.text; const opts=get(`q-${p}-opts`);
    if(q.type==='eng'){opts.classList.remove('hidden');opts.innerHTML=q.opts.map((o,i)=>`<div class="bg-gray-800 p-1 rounded border border-gray-600 text-center font-bold text-white"><span class="text-gray-500 mr-1">${i+1}.</span>${o}</div>`).join('');}
    else opts.classList.add('hidden');
}

/* --- INPUTS --- */
document.addEventListener('keydown', (e) => {
    if(!STATE.game.active) return;
    const k=e.key, c=e.code;
    if(!STATE.game.p1.frozen) { if(c.startsWith('Digit') && "0123456789".includes(k)) handleInstantInput('p1',k); if(c==='KeyS') clearInput('p1'); }
    if(!STATE.game.p2.frozen) { if(c.startsWith('Numpad') && "0123456789".includes(k)) handleInstantInput('p2',k); if(c==='Backspace') clearInput('p2'); }
});
window.handleInstantInput = (p, char) => {
    if(STATE.game[p].frozen) return;
    const q=STATE.game[p].q; if(!q) return;
    STATE.game[p].ans += char;
    get(`input-${p}`).innerText=STATE.game[p].ans;
    if(STATE.game[p].ans.length >= q.ans.toString().length) setTimeout(()=>validateAnswer(p), 50);
};
window.clearInput = (p) => { STATE.game[p].ans=''; get(`input-${p}`).innerText=''; };

function validateAnswer(p) {
    const val=parseInt(STATE.game[p].ans); const corr=STATE.game[p].q.ans;
    const fb=get(`feedback-${p}`);
    if(val===corr) {
        STATE.game[p].score++; STATE.game[p].streak++; get(`score-${p}`).innerText=STATE.game[p].score;
        AUDIO.playSFX('sfx-correct'); fb.innerText="GOOD"; fb.className="h-6 mt-1 font-bold text-accent animate-bounce";
        // Logic
        let pow=7; if(STATE.game[p].streak>=3) { pow=12; get(`combo-${p}`).classList.remove('hidden'); }
        if(p==='p1') STATE.game.tug -= pow; else STATE.game.tug += pow;
    } else {
        STATE.game[p].streak=0; get(`combo-${p}`).classList.add('hidden');
        AUDIO.playSFX('sfx-wrong'); fb.innerText="BAD"; fb.className="h-6 mt-1 font-bold text-danger animate-shake";
        if(p==='p1') STATE.game.tug += 3; else STATE.game.tug -= 3;
        // Freeze Logic
        triggerFreeze(p);
    }
    setTimeout(()=>{fb.innerText="";}, 500);
    updateTugVisuals(); clearInput(p); generateNewQuestion(p);
}

function triggerFreeze(p) {
    // Only freeze randomly or after repeated fails to prevent frustration? 
    // Simplified: Freeze on wrong answer for 1s to stop spamming
    STATE.game[p].frozen = true; get(`frozen-${p}`).classList.remove('hidden');
    setTimeout(()=>{ STATE.game[p].frozen=false; get(`frozen-${p}`).classList.add('hidden'); }, 1000);
}

function updateTugVisuals() {
    const isMobile = window.innerWidth < 1024;
    let val = (STATE.game.tug - 50);
    if(val < -48) val = -48; if(val > 48) val = 48;
    
    // Centered Visuals + Camera Shake on big moves
    const marker = get('rope-marker');
    if(isMobile) marker.style.transform = `translateY(${val}vh)`;
    else marker.style.transform = `translateX(${val}vw)`;

    if(STATE.game.tug <= 0) endGame(`${STATE.game.p1.name} Wins!`);
    else if(STATE.game.tug >= 100) endGame(`${STATE.game.p2.name} Wins!`);
}

function endGame(reason) {
    STATE.game.active = false; clearInterval(STATE.game.interval);
    AUDIO.stopBGM(); AUDIO.playSFX('sfx-win');
    
    let w="DRAW"; if(STATE.game.tug<50) w=STATE.game.p1.name; else if(STATE.game.tug>50) w=STATE.game.p2.name;
    
    // Confetti
    if(w!=="DRAW") confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });

    get('modal-title').innerText = w==="DRAW"?"Draw!":`${w} Wins!`;
    get('modal-msg').innerText = reason;
    get('modal').classList.remove('hidden'); get('modal').classList.add('flex');
    
    get('modal-btn').onclick = () => {
        get('modal').classList.add('hidden'); get('modal').classList.remove('flex');
        if(STATE.type==='tournament') advanceTournament(w); else show('screen-menu');
    };
}

/* --- TOURNAMENT LOGIC --- */
window.addTourneyPlayer = () => {
    const name=get('tourney-input').value.trim();
    if(name){ STATE.players.push(name); get('tourney-input').value=''; updateTourneyUI(); }
};
window.clearTourneySetup = () => { STATE.players=[]; updateTourneyUI(); };
function updateTourneyUI() {
    get('player-count').innerText = `${STATE.players.length} Players`;
    get('tourney-list').innerHTML = STATE.players.map((p,i)=>`<li class="bg-gray-700 p-2 rounded flex justify-between"><span>${i+1}. ${p}</span><button onclick="removePlayer(${i})" class="text-red-400">x</button></li>`).join('');
    if(STATE.players.length>=2) get('btn-start-tourney').classList.remove('hidden');
}
window.removePlayer = (i) => { STATE.players.splice(i,1); updateTourneyUI(); };

window.generateFixture = () => {
    let p=[...STATE.players].sort(()=>0.5-Math.random());
    const nextPow2 = Math.pow(2, Math.ceil(Math.log2(p.length)));
    while(p.length < nextPow2) p.push("BYE");

    STATE.bracket=[]; let firstRound=[];
    for(let i=0; i<p.length; i+=2) firstRound.push({id:`R1-M${(i/2)+1}`, p1:p[i], p2:p[i+1], winner:null, nextMatchId:null});
    STATE.bracket.push(firstRound);

    let activeRound=firstRound; let rNum=2;
    while(activeRound.length > 1) {
        let nextRound=[];
        for(let i=0; i<activeRound.length; i+=2) {
            let mId=`R${rNum}-M${(i/2)+1}`;
            activeRound[i].nextMatchId=mId; activeRound[i].nextSlot='p1';
            if(activeRound[i+1]) { activeRound[i+1].nextMatchId=mId; activeRound[i+1].nextSlot='p2'; }
            nextRound.push({id:mId, p1:"TBD", p2:"TBD", winner:null});
        }
        STATE.bracket.push(nextRound); activeRound=nextRound; rNum++;
    }
    
    advanceByes(); updateCurrentMatchIndex(); saveTournament(); renderBracket(); show('screen-tourney-hub');
};

function advanceByes() { STATE.bracket[0].forEach(m=>{ if(m.p2==="BYE"){m.winner=m.p1; propWin(m);} else if(m.p1==="BYE"){m.winner=m.p2; propWin(m);} }); }
function propWin(m) {
    if(!m.nextMatchId) return;
    for(let r of STATE.bracket) {
        let nm = r.find(x=>x.id===m.nextMatchId);
        if(nm) {
            if(m.nextSlot==='p1') nm.p1=m.winner; else nm.p2=m.winner;
            if(nm.p2==="BYE" && nm.p1!=="TBD") { nm.winner=nm.p1; propWin(nm); }
        }
    }
}
function updateCurrentMatchIndex() {
    for(let r=0; r<STATE.bracket.length; r++) {
        for(let m=0; m<STATE.bracket[r].length; m++) {
            let match=STATE.bracket[r][m];
            if(!match.winner && match.p1!=="TBD" && match.p2!=="TBD") { STATE.activeRoundIndex=r; STATE.activeMatchIndex=m; return; }
        }
    }
    STATE.activeRoundIndex=-1;
}

function renderBracket() {
    const view=get('bracket-view'); view.innerHTML='';
    STATE.bracket.forEach((round, rIdx) => {
        let rName = round.length===1?"🏆 FINAL":(round.length===2?"SEMI FINALS":"ROUND "+(rIdx+1));
        let h=`<h3 class="text-gray-500 font-bold uppercase text-xs mb-2 mt-4 sticky top-0 bg-gray-800 py-1">${rName}</h3>`;
        round.forEach((m, i) => {
            const active = (rIdx===STATE.activeRoundIndex && i===STATE.activeMatchIndex);
            let b = m.winner ? 'border-green-600 opacity-60' : (active?'border-yellow-500 bg-gray-700 shadow-lg scale-105':'border-gray-600');
            h+=`<div class="p-2 border-l-4 ${b} mb-2 rounded bg-gray-800/50 text-sm"><div class="flex justify-between"><span class="${m.winner===m.p1?'text-green-400':''}">${m.p1}</span><span class="text-gray-600 px-1">vs</span><span class="${m.winner===m.p2?'text-green-400':''}">${m.p2}</span></div></div>`;
        });
        view.innerHTML+=h;
    });

    if(STATE.activeRoundIndex!==-1) {
        let m=STATE.bracket[STATE.activeRoundIndex][STATE.activeMatchIndex];
        get('next-match-card').innerHTML=`<div class="text-xs text-yellow-500 uppercase mb-2">UP NEXT</div><div class="text-2xl font-bold mb-4">${m.p1} <span class="text-sm text-gray-500">vs</span> ${m.p2}</div><button onclick="prepareGame('${m.p1}','${m.p2}')" class="w-full py-3 bg-accent text-black font-bold rounded shadow-lg hover:scale-105 transition">START MATCH</button>`;
        get('tourney-status').innerText = `Round ${STATE.activeRoundIndex+1} / ${STATE.bracket.length}`;
    } else {
        let winner = STATE.bracket[STATE.bracket.length-1][0].winner;
        get('next-match-card').innerHTML=`<div class="text-green-400 font-bold text-xl mb-2">CHAMPION</div><div class="text-6xl mb-2">👑</div><div class="text-white font-bold text-2xl">${winner}</div><button onclick="finishTournament('${winner}');showScreen('screen-menu')" class="mt-4 text-sm text-gray-400 underline">Finish & Save</button>`;
        get('tourney-status').innerText = "Complete";
    }
}
function advanceTournament(w) {
    let m=STATE.bracket[STATE.activeRoundIndex][STATE.activeMatchIndex];
    m.winner=w; propWin(m); updateCurrentMatchIndex(); saveTournament(); renderBracket(); show('screen-tourney-hub');
}