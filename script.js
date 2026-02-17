/* =========================================
   BRAIN TUG: ULTIMATE ENGINE
   ========================================= */

const STATE = {
    mode: 'math', type: 'quick', players: [], bracket: [],
    history: JSON.parse(localStorage.getItem('brainTugHistory')) || [],
    activeTourneyId: null, activeRound: 0, activeMatch: 0,
    game: { active: false, difficulty: 1, timer: 60, interval: null, tugValue: 50, p1:{}, p2:{} }
};

const get = (id) => document.getElementById(id);
const hideAllScreens = () => document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
function showScreen(id) {
    hideAllScreens(); const el = get(id);
    if(el) { el.classList.remove('hidden'); if(id.includes('game')||id.includes('menu')||id.includes('setup')||id.includes('hub')||id.includes('history')) el.classList.add('flex'); }
}

const AUDIO = {
    bgm: get('bgm'), muted: false,
    playBGM: () => { if(!AUDIO.muted && AUDIO.bgm) { AUDIO.bgm.volume=0.3; AUDIO.bgm.play().catch(()=>{}); } },
    stopBGM: () => { if(AUDIO.bgm) { AUDIO.bgm.pause(); AUDIO.bgm.currentTime=0; } },
    playSFX: (id) => { if(AUDIO.muted) return; const s=get(id); if(s){s.currentTime=0;s.play().catch(()=>{});} }
};
window.toggleMute = () => {
    AUDIO.muted = !AUDIO.muted;
    get('icon-mute').className = AUDIO.muted ? "fas fa-volume-mute text-red-500" : "fas fa-volume-up text-white";
    if(AUDIO.muted) AUDIO.stopBGM(); else if(STATE.game.active) AUDIO.playBGM();
};

window.setGameMode = (m) => {
    STATE.mode = m;
    get('btn-mode-math').className = m==='math'?"px-6 py-2 rounded-lg font-bold transition bg-p1 text-white shadow-lg ring-2 ring-blue-400":"px-6 py-2 rounded-lg font-bold transition text-gray-400 hover:text-white";
    get('btn-mode-eng').className = m==='english'?"px-6 py-2 rounded-lg font-bold transition bg-orange-600 text-white shadow-lg ring-2 ring-orange-400":"px-6 py-2 rounded-lg font-bold transition text-gray-400 hover:text-white";
};

window.setupQuickPlay = () => { STATE.type='quick'; showScreen('modal-quick-setup'); };
window.startQuickGameFromModal = () => {
    const p1 = get('qp-p1').value.trim() || 'Player 1';
    const p2 = get('qp-p2').value.trim() || 'Player 2';
    showScreen('modal-quick-setup'); prepareGame(p1, p2);
};

function prepareGame(p1Name, p2Name) {
    STATE.game.active = false; STATE.game.timer = 60; STATE.game.tugValue = 50;
    let diff = 1;
    if(STATE.type === 'tournament') {
        const remaining = STATE.bracket.length - STATE.activeRound;
        if(remaining <= 2) diff = 3; else if(remaining <= 3) diff = 2;
    }
    STATE.game.difficulty = diff;
    setupPlayer('p1', p1Name); setupPlayer('p2', p2Name);
    updateTugVisuals();
    get('timer-box').className = "bg-black/80 px-4 py-2 rounded-full border border-gray-600 backdrop-blur shadow-xl";
    get('game-timer').classList.remove('text-red-500');
    showScreen('screen-game'); runCountdown();
}

function setupPlayer(key, name) {
    STATE.game[key] = { name: name, score: 0, streak: 0, frozen: false, ans: '', q: null, wrongTime: [] };
    get(`${key}-name`).innerText = name; get(`${key}-score`).innerText = "0";
    get(`${key}-input`).innerText = ""; get(`${key}-feedback`).innerText = "";
    get(`${key}-frozen`).classList.add('hidden'); get(`${key}-combo`).classList.add('hidden');
    get(`zone-${key}`).classList.remove('border-yellow-400');
}

function runCountdown() {
    const overlay = get('countdown-overlay');
    const text = get('countdown-text');
    overlay.classList.remove('hidden'); overlay.classList.add('flex');
    let count = 3; text.innerText = count;
    AUDIO.playSFX('sfx-countdown');
    const int = setInterval(() => {
        count--;
        if(count > 0) { text.innerText = count; }
        else if (count === 0) { text.innerText = "FIGHT!"; text.className = "text-9xl font-black text-red-500 animate-ping-slow"; AUDIO.playSFX('sfx-win'); }
        else { clearInterval(int); overlay.classList.add('hidden'); overlay.classList.remove('flex'); startGame(); }
    }, 1000);
}

function startGame() {
    STATE.game.active = true; AUDIO.playBGM();
    generateQuestion('p1'); generateQuestion('p2');
    if(STATE.game.interval) clearInterval(STATE.game.interval);
    STATE.game.interval = setInterval(gameTick, 1000);
}

function gameTick() {
    STATE.game.timer--; get('game-timer').innerText = STATE.game.timer;
    if(STATE.game.timer <= 10) { get('timer-box').classList.add('border-red-500', 'animate-pulse'); get('game-timer').classList.add('text-red-500'); }
    if(STATE.game.timer % 15 === 0 && STATE.game.difficulty < 5) STATE.game.difficulty++;
    if(STATE.game.timer <= 0) endGame("TIME'S UP!");
}

const ENG_DICT = [{f:"APPLE",m:"A_PLE",a:2,o:["R","P","S"]}, {f:"TIGER",m:"TI_ER",a:3,o:["A","I","G"]}, {f:"HOUSE",m:"HO_SE",a:1,o:["U","A","E"]},{f:"WATER",m:"WA_ER",a:3,o:["P","D","T"]}, {f:"ROBOT",m:"ROB_T",a:3,o:["A","I","O"]}, {f:"MUSIC",m:"MUS_C",a:2,o:["K","I","E"]},{f:"PHONE",m:"PH_NE",a:3,o:["A","U","O"]}, {f:"EARTH",m:"E_RTH",a:1,o:["A","O","U"]}, {f:"MONEY",m:"MON_Y",a:2,o:["I","E","A"]},{f:"RIVER",m:"RIV_R",a:2,o:["A","E","I"]}, {f:"STONE",m:"ST_NE",a:2,o:["A","O","I"]}, {f:"HAPPY",m:"HA_PY",a:1,o:["P","B","D"]},{f:"GREEN",m:"GR_EN",a:3,o:["I","A","E"]}, {f:"NIGHT",m:"NI_HT",a:1,o:["G","F","H"]}, {f:"PIZZA",m:"PI_ZA",a:2,o:["S","Z","X"]},{f:"TRAIN",m:"TR_IN",a:2,o:["E","A","I"]}, {f:"SNACK",m:"SNA_K",a:1,o:["C","K","S"]}, {f:"GHOST",m:"GH_ST",a:3,o:["A","I","O"]},{f:"MOUSE",m:"MO_SE",a:2,o:["O","U","A"]}, {f:"CLOCK",m:"CL_CK",a:2,o:["A","O","U"]}, {f:"SPACE",m:"SP_CE",a:3,o:["E","I","A"]},{f:"WORLD",m:"WO_LD",a:1,o:["R","L","D"]}, {f:"TABLE",m:"TA_LE",a:2,o:["P","B","D"]}, {f:"FLOOR",m:"FL_OR",a:2,o:["A","O","U"]},{f:"SHOES",m:"SH_ES",a:1,o:["O","A","I"]}, {f:"FRUIT",m:"FR_IT",a:3,o:["O","I","U"]}, {f:"GRAPE",m:"GR_PE",a:3,o:["E","I","A"]}];

function generateQuestion(p) {
    const diff = STATE.game.difficulty; let q = {};
    if(STATE.mode === 'math') {
        let a,b,op,ans; const r=Math.random();
        if(diff===1) { if(r>0.5){a=rand(10);b=rand(10);op='+';ans=a+b;} else{a=rand(15)+3;b=rand(a);op='-';ans=a-b;} }
        else if(diff===2) { if(r>0.6){a=rand(9)+1;b=rand(9)+1;op='x';ans=a*b;} else{a=rand(20);b=rand(20);op='+';ans=a+b;} }
        else { if(r<0.25){b=rand(8)+2;a=b*(rand(9)+1);op='÷';ans=a/b;} else if(r<0.5){a=rand(12)+2;b=rand(12)+2;op='x';ans=a*b;} else{a=rand(50);b=rand(50);op='+';ans=a+b;} }
        q = {t:'math', txt:`${a} ${op} ${b}`, ans:ans};
    } else { const w=ENG_DICT[Math.floor(Math.random()*ENG_DICT.length)]; q={t:'eng', txt:w.m, ans:w.a, opts:w.o}; }
    STATE.game[p].q = q; renderQuestion(p,q);
}
function rand(n){return Math.floor(Math.random()*n)+1;}
function renderQuestion(p,q) {
    get(`${p}-q-text`).innerText = q.txt; const opts = get(`${p}-q-opts`);
    if(q.t === 'eng') { opts.classList.remove('hidden'); opts.innerHTML = q.opts.map((o,i) => `<div class="bg-gray-800 p-2 rounded border border-gray-600 text-center font-bold text-white text-xs lg:text-sm"><span class="text-gray-500 mr-1">${i+1}.</span>${o}</div>`).join(''); } else { opts.classList.add('hidden'); }
}

document.addEventListener('keydown', (e) => {
    if(!STATE.game.active) return;
    const k=e.key, c=e.code;
    if(!STATE.game.p1.frozen) { if(c.startsWith('Digit') && "0123456789".includes(k)) handleInput('p1', k); if(c==='KeyS') clearInput('p1'); }
    if(!STATE.game.p2.frozen) { if(c.startsWith('Numpad') && "0123456789".includes(k)) handleInput('p2', k); if(c==='Backspace') clearInput('p2'); }
});
window.tapInput = (p,k) => handleInput(p,k);
window.tapClear = (p) => clearInput(p);

function handleInput(p,char) {
    if(STATE.game[p].frozen) return; const q=STATE.game[p].q; if(!q) return;
    STATE.game[p].ans += char; get(`${p}-input`).innerText = STATE.game[p].ans;
    if(STATE.game[p].ans.length >= q.ans.toString().length) setTimeout(()=>validate(p), 50);
}
function clearInput(p) { STATE.game[p].ans=''; get(`${p}-input`).innerText=''; }

function validate(p) {
    const val=parseInt(STATE.game[p].ans); const corr=STATE.game[p].q.ans; const fb=get(`${p}-feedback`);
    if(val===corr) {
        STATE.game[p].score++; STATE.game[p].streak++; get(`${p}-score`).innerText=STATE.game[p].score;
        AUDIO.playSFX('sfx-correct'); fb.innerText="GOOD!"; fb.className="h-8 mt-2 font-bold text-xl tracking-wider text-accent animate-pop";
        let pow=8; if(STATE.game[p].streak>=3){pow=15;get(`${p}-combo`).classList.remove('hidden');get(`zone-${p}`).classList.add('border-yellow-400');}
        if(p==='p1'&&STATE.game.tugValue>80) pow+=5; if(p==='p2'&&STATE.game.tugValue<20) pow+=5;
        moveTug(p, pow);
    } else {
        STATE.game[p].streak=0; get(`${p}-combo`).classList.add('hidden'); get(`zone-${p}`).classList.remove('border-yellow-400');
        AUDIO.playSFX('sfx-wrong'); fb.innerText="MISS"; fb.className="h-8 mt-2 font-bold text-xl tracking-wider text-danger animate-shake";
        moveTug(p==='p1'?'p2':'p1', 4);
        const now=Date.now(); STATE.game[p].wrongTime.push(now); if(STATE.game[p].wrongTime.length>3) STATE.game[p].wrongTime.shift();
        if(STATE.game[p].wrongTime.length===3 && (now-STATE.game[p].wrongTime[0]<3000)) { freezePlayer(p); STATE.game[p].wrongTime=[]; }
    }
    setTimeout(()=>fb.innerText="", 800); clearInput(p); generateQuestion(p);
}

function moveTug(puller, amount) {
    if(puller==='p1') STATE.game.tugValue-=amount; else STATE.game.tugValue+=amount;
    if(STATE.game.tugValue<0) STATE.game.tugValue=0; if(STATE.game.tugValue>100) STATE.game.tugValue=100;
    if(amount>10) { document.body.classList.add('camera-shake'); setTimeout(()=>document.body.classList.remove('camera-shake'), 500); }
    updateTugVisuals();
    if(STATE.game.tugValue<=0) endGame(STATE.game.p1.name); else if(STATE.game.tugValue>=100) endGame(STATE.game.p2.name);
}

function updateTugVisuals() {
    const isMobile = window.innerWidth < 1024; let pct = STATE.game.tugValue - 50;
    if(pct<-45) pct=-45; if(pct>45) pct=45;
    const marker = get('rope-marker');
    if(isMobile) marker.style.transform = `translateY(${pct}vh)`; else marker.style.transform = `translateX(${pct}vw)`;
}

function freezePlayer(p) {
    STATE.game[p].frozen=true; get(`${p}-frozen`).classList.remove('hidden'); get(`${p}-frozen`).classList.add('flex');
    setTimeout(()=>{STATE.game[p].frozen=false; get(`${p}-frozen`).classList.add('hidden'); get(`${p}-frozen`).classList.remove('flex');}, 2000);
}

function endGame(wName) {
    STATE.game.active=false; clearInterval(STATE.game.interval); AUDIO.stopBGM();
    if(wName==="TIME'S UP!") { if(STATE.game.tugValue<50) wName=STATE.game.p1.name; else if(STATE.game.tugValue>50) wName=STATE.game.p2.name; else wName="DRAW"; }
    get('winner-name').innerText=wName; get('winner-reason').innerText=(STATE.game.tugValue<=0||STATE.game.tugValue>=100)?"KNOCKOUT!":"TIME DECISION";
    if(wName!=="DRAW") { AUDIO.playSFX('sfx-win'); confetti({particleCount:200, spread:100, origin:{y:0.6}}); }
    get('modal-winner').classList.remove('hidden'); get('modal-winner').classList.add('flex');
    get('btn-winner-continue').onclick = () => {
        get('modal-winner').classList.add('hidden'); get('modal-winner').classList.remove('flex');
        if(STATE.type==='tournament') handleTournamentWin(wName); else showScreen('screen-menu');
    };
}

/* --- TOURNAMENT --- */
window.setupTournament = () => {
    STATE.type='tournament'; const s=localStorage.getItem('brainTugActive');
    if(s && confirm("Resume active tournament?")) { loadTournament(JSON.parse(s)); return; }
    STATE.players=[]; STATE.activeTourneyId=Date.now(); updatePlayerList(); showScreen('screen-tourney-setup');
};
window.addPlayer = () => { const i=get('tourney-input'); if(i.value.trim()){STATE.players.push(i.value.trim()); i.value=''; updatePlayerList();} };
window.clearPlayers = () => { STATE.players=[]; updatePlayerList(); };
function updatePlayerList() {
    get('player-count').innerText=`${STATE.players.length} Players`;
    get('tourney-list').innerHTML=STATE.players.map((p,i)=>`<li class="flex justify-between items-center bg-gray-800 p-3 rounded-lg border border-gray-700 animate-pop"><span class="font-bold text-white">${i+1}. ${p}</span><button onclick="removePlayer(${i})" class="text-red-400 hover:text-white"><i class="fas fa-times"></i></button></li>`).join('');
    const btn=get('btn-generate'); if(STATE.players.length>=2){btn.classList.remove('hidden');btn.innerText=`START (${STATE.players.length})`;}else btn.classList.add('hidden');
}
window.removePlayer=(i)=>{STATE.players.splice(i,1);updatePlayerList();};

window.generateBracket = () => {
    let p=[...STATE.players].sort(()=>0.5-Math.random()); const np2=Math.pow(2,Math.ceil(Math.log2(p.length))); while(p.length<np2)p.push("BYE");
    STATE.bracket=[]; let r1=[]; for(let i=0;i<p.length;i+=2) r1.push({p1:p[i],p2:p[i+1],winner:null}); STATE.bracket.push(r1);
    let ar=r1; while(ar.length>1) { let nr=[]; for(let i=0;i<ar.length;i+=2) nr.push({p1:'TBD',p2:'TBD',winner:null}); STATE.bracket.push(nr); ar=nr; }
    resolveByes(); findNextMatch(); saveTournament(); renderBracket(); showScreen('screen-tourney-hub');
};
function resolveByes() { STATE.bracket[0].forEach((m,i)=>{if(m.p2==="BYE"){m.winner=m.p1;fw(0,i,m.p1);}else if(m.p1==="BYE"){m.winner=m.p2;fw(0,i,m.p2);}}); }
function fw(ri,mi,w) { if(ri+1>=STATE.bracket.length)return; const nr=STATE.bracket[ri+1], nmi=Math.floor(mi/2), slot=(mi%2===0)?'p1':'p2'; nr[nmi][slot]=w; const os=(slot==='p1')?'p2':'p1'; if(nr[nmi][os]==="BYE"){nr[nmi].winner=w;fw(ri+1,nmi,w);} }
function findNextMatch() {
    for(let r=0;r<STATE.bracket.length;r++) for(let m=0;m<STATE.bracket[r].length;m++) { const ma=STATE.bracket[r][m]; if(!ma.winner&&ma.p1!=='TBD'&&ma.p2!=='TBD'&&ma.p1!=='BYE'&&ma.p2!=='BYE'){STATE.activeRound=r;STATE.activeMatch=m;return;} }
    STATE.activeRound=-1;
}
function loadTournament(d) { STATE.players=d.players; STATE.bracket=d.bracket; STATE.activeRound=d.round; STATE.activeMatch=d.match; STATE.activeTourneyId=d.id; renderBracket(); showScreen('screen-tourney-hub'); }
function renderBracket() {
    const c=get('bracket-container'); c.innerHTML='';
    STATE.bracket.forEach((r,ri)=>{
        let l=`ROUND ${ri+1}`; if(r.length===1)l="🏆 FINAL"; else if(r.length===2)l="SEMI FINAL";
        let h=`<div class="mb-4"><h3 class="text-xs font-bold text-gray-500 mb-2 sticky top-0 bg-card py-1 uppercase">${l}</h3><div class="space-y-2">`;
        r.forEach((m,mi)=>{
            const act=(ri===STATE.activeRound&&mi===STATE.activeMatch); let sc="border-gray-700 bg-gray-800/50 opacity-50";
            if(act) sc="border-yellow-400 bg-gray-800 shadow-lg scale-105 border-l-4 opacity-100"; else if(m.winner) sc="border-green-600 bg-gray-800/80 border-l-4 opacity-70"; else if(m.p1!=='TBD'&&m.p2!=='TBD') sc="border-blue-500 bg-gray-800 border-l-2 opacity-90";
            h+=`<div class="p-3 rounded-lg border ${sc} transition-all flex justify-between items-center"><span class="${m.winner===m.p1?'text-accent font-bold':''} text-sm">${m.p1}</span><span class="text-xs text-gray-500 mx-2">VS</span><span class="${m.winner===m.p2?'text-accent font-bold':''} text-sm">${m.p2}</span></div>`;
        });
        c.innerHTML+=h+"</div></div>";
    });
    const card=get('match-card-content');
    if(STATE.activeRound!==-1) {
        const m=STATE.bracket[STATE.activeRound][STATE.activeMatch];
        card.innerHTML=`<div class="text-yellow-400 font-bold text-xs uppercase mb-2 animate-pulse">UP NEXT</div><div class="text-3xl font-black text-white mb-4"><span class="text-p1">${m.p1}</span><span class="text-sm text-gray-500 block my-1">VS</span><span class="text-p2">${m.p2}</span></div><button onclick="prepareGame('${m.p1}','${m.p2}')" class="w-full py-4 bg-accent text-dark font-bold rounded-xl shadow-lg hover:scale-105 transition">START MATCH</button>`;
    } else {
        const w=STATE.bracket[STATE.bracket.length-1][0].winner;
        card.innerHTML=`<div class="text-accent font-bold text-xl uppercase mb-2">CHAMPION</div><div class="text-6xl mb-4">👑</div><div class="text-3xl font-black text-white mb-6">${w}</div><button onclick="finishTournament('${w}')" class="text-sm text-gray-400 hover:text-white underline">End & Save Record</button>`;
    }
}
function handleTournamentWin(w) { const m=STATE.bracket[STATE.activeRound][STATE.activeMatch]; m.winner=w; fw(STATE.activeRound,STATE.activeMatch,w); findNextMatch(); saveTournament(); renderBracket(); showScreen('screen-tourney-hub'); }
function saveTournament() { localStorage.setItem('brainTugActive', JSON.stringify({id:STATE.activeTourneyId, players:STATE.players, bracket:STATE.bracket, round:STATE.activeRound, match:STATE.activeMatch})); }
window.saveAndExit = () => { saveTournament(); showScreen('screen-menu'); };
function finishTournament(w) { STATE.history.unshift({id:new Date().toLocaleString(), winner:w, players:STATE.players.length}); localStorage.setItem('brainTugHistory', JSON.stringify(STATE.history)); localStorage.removeItem('brainTugActive'); showScreen('screen-menu'); }
window.showHistory = () => {
    const l=get('history-list'); if(STATE.history.length===0)l.innerHTML="<div class='text-gray-500 text-center italic'>No history yet.</div>";
    else l.innerHTML=STATE.history.map(h=>`<div class="bg-gray-800 p-4 rounded-xl border border-gray-700 flex justify-between items-center"><div><div class="text-accent font-bold text-lg">👑 ${h.winner}</div><div class="text-xs text-gray-500">${h.players} Players</div></div><div class="text-xs text-gray-400">${h.id}</div></div>`).join('');
    showScreen('screen-history');
};
window.clearHistory = () => { if(confirm("Clear all history?")){STATE.history=[]; localStorage.removeItem('brainTugHistory'); window.showHistory();} };
