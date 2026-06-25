/**
 * Brain Tug Pro Arena - Main Script
 * Handles game logic, UI navigation, local storage state, and gameplay loop.
 */

/* ─────────────────────────────────────────────────────────
   1. GLOBAL STATE & CONFIGURATION
   ───────────────────────────────────────────────────────── */
const get = id => document.getElementById(id);

let state = {
  mode: 'math', // 'math' or 'english'
  isTourney: false,
  muted: false,
  setupComplete: false,
};

let game = {
  p1: { id: 'p1', name: '', score: 0, combo: 0, input: '', frozen: false, q: {}, freezeTime: null },
  p2: { id: 'p2', name: '', score: 0, combo: 0, input: '', frozen: false, q: {}, freezeTime: null },
  rope: 50, // 50 is neutral. <50 favors P1, >50 favors P2.
  timer: 60,
  interval: null,
  active: false,
  tourneyMatchId: null
};

// LocalStorage Database
let playersDB = JSON.parse(localStorage.getItem('braintug_players')) || {};
let historyDB = JSON.parse(localStorage.getItem('braintug_history')) || [];
let acFocus = { p1: -1, p2: -1 }; // Tracks keyboard focus in autocomplete

// English Question Bank (Extendable)
const englishBank = [
  { q: "Opposite of Fast?", opts: ["Slow", "Quick", "Rapid"], a: "1" },
  { q: "Synonym of Happy?", opts: ["Sad", "Joyful", "Angry"], a: "2" },
  { q: "Past tense of Go?", opts: ["Goed", "Gone", "Went"], a: "3" },
  { q: "Opposite of Brave?", opts: ["Cowardly", "Heroic", "Bold"], a: "1" },
  { q: "Plural of Mouse?", opts: ["Mouses", "Mice", "Meese"], a: "2" },
  { q: "Synonym of Begin?", opts: ["End", "Stop", "Start"], a: "3" },
  { q: "Opposite of Sharp?", opts: ["Dull", "Pointy", "Keen"], a: "1" },
  { q: "Past tense of Eat?", opts: ["Eated", "Ate", "Eaten"], a: "2" },
  { q: "Synonym of Huge?", opts: ["Tiny", "Small", "Giant"], a: "3" }
];

/* ─────────────────────────────────────────────────────────
   2. INITIALIZATION & UTILS
   ───────────────────────────────────────────────────────── */
window.onload = () => {
  // Select Math game by default
  setGameMode('math'); 

  // Fetch the JSON data from students.json
  loadStudentData(); 

  if (localStorage.getItem('braintug_setup')) {
    state.setupComplete = true;
    showScreen('screen-menu');
  } else {
    showScreen('screen-setup');
    initSetupKeyListeners();
  }
  
  // Resize listener for responsive rope layout
  window.addEventListener('resize', layoutRope);
  layoutRope();

  // Close autocomplete on outside click
  document.addEventListener('click', (e) => {
    if(!e.target.closest('.name-input-wrap')) {
      get('p1-ac-list').classList.remove('open');
      get('p2-ac-list').classList.remove('open');
    }
  });
};

async function loadStudentData() {
  try {
    const response = await fetch('students.json');
    const students = await response.json();
    
    // Loop through JSON and add to our local Database if they don't exist
    students.forEach(s => {
      if (!playersDB[s.name]) {
        playersDB[s.name] = { 
          name: s.name, 
          class: `${s.class}${s.division}`, 
          score: 0, 
          correct: 0, 
          total: 0, 
          rating: 1200 
        };
      }
    });
    saveDB();
  } catch (err) {
    console.warn('Could not load students.json. Ensure you are running a local server.', err);
  }
}

function saveDB() {
  localStorage.setItem('braintug_players', JSON.stringify(playersDB));
}

function saveHistory() {
  localStorage.setItem('braintug_history', JSON.stringify(historyDB));
}

function playAudio(id) {
  if (state.muted) return;
  const audio = get(id);
  if (audio) {
    audio.currentTime = 0;
    audio.play().catch(()=>{});
  }
}

function toggleMute() {
  state.muted = !state.muted;
  const icon = get('icon-mute');
  if (state.muted) {
    icon.classList.remove('fa-volume-up');
    icon.classList.add('fa-volume-mute', 'text-red-400');
    get('bgm').pause();
  } else {
    icon.classList.remove('fa-volume-mute', 'text-red-400');
    icon.classList.add('fa-volume-up');
    get('bgm').play().catch(()=>{});
  }
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  get(screenId).classList.remove('hidden');
  
  if(screenId === 'screen-menu') {
    get('bgm').play().catch(()=>{});
  }
}

/* ─────────────────────────────────────────────────────────
   3. SETUP WIZARD (KEYBOARDS)
   ───────────────────────────────────────────────────────── */
let setupPhase = 1;

function initSetupKeyListeners() {
  document.addEventListener('keydown', handleSetupKey);
}

function handleSetupKey(e) {
  if (state.setupComplete || get('screen-setup').classList.contains('hidden')) return;
  
  if (setupPhase === 1) {
    playAudio('sfx-correct');
    get('kbd-slot-1').classList.remove('waiting');
    get('kbd-slot-1').classList.add('connected');
    get('kbd1-label').innerText = 'CONNECTED';
    get('kbd1-label').classList.replace('text-[var(--p1)]', 'text-[var(--green)]');
    
    get('kbd-slot-2').classList.remove('idle');
    get('kbd-slot-2').classList.add('waiting');
    get('kbd2-label').innerText = 'PRESS NUMPAD KEY';
    get('kbd2-label').classList.replace('text-[var(--muted)]', 'text-[var(--p2)]');
    
    get('setup-step-title').innerText = 'Step 2 — Player 2 Keyboard';
    get('setup-step-sub').innerText = 'Press any key on the numpad to confirm connection';
    setupPhase = 2;
  } else if (setupPhase === 2) {
    if (e.location === KeyboardEvent.DOM_KEY_LOCATION_NUMPAD || "0123456789".includes(e.key)) {
      playAudio('sfx-correct');
      get('kbd-slot-2').classList.remove('waiting');
      get('kbd-slot-2').classList.add('connected');
      get('kbd2-label').innerText = 'CONNECTED';
      get('kbd2-label').classList.replace('text-[var(--p2)]', 'text-[var(--green)]');
      
      get('setup-step-title').innerText = 'Setup Complete!';
      get('setup-step-sub').innerText = 'Navigating to Arena...';
      
      setTimeout(() => {
        localStorage.setItem('braintug_setup', 'true');
        state.setupComplete = true;
        showScreen('screen-menu');
      }, 1500);
    }
  }
}

function skipSetup() {
  localStorage.setItem('braintug_setup', 'true');
  state.setupComplete = true;
  showScreen('screen-menu');
}

function runSetup() {
  setupPhase = 1;
  state.setupComplete = false;
  get('kbd-slot-1').className = 'kbd-slot waiting';
  get('kbd1-label').innerText = 'PRESS ANY KEY';
  get('kbd1-label').className = 'f-display font-bold text-xs tracking-widest uppercase mt-3 text-[var(--p1)]';
  get('kbd-slot-2').className = 'kbd-slot idle';
  get('kbd2-label').innerText = 'WAITING…';
  get('kbd2-label').className = 'f-display font-bold text-xs tracking-widest uppercase mt-3 text-[var(--muted)]';
  get('setup-step-title').innerText = 'Step 1 — Player 1 Keyboard';
  get('setup-step-sub').innerText = 'Press any key on the first keyboard to confirm connection';
  showScreen('screen-setup');
}

/* ─────────────────────────────────────────────────────────
   4. MENU & PLAYER SELECTION
   ───────────────────────────────────────────────────────── */
function setGameMode(m) {
  state.mode = m;
  if (m === 'math') {
    get('btn-mode-math').classList.remove('text-[var(--muted)]');
    get('btn-mode-math').classList.add('bg-[var(--p1)]', 'text-white');
    get('btn-mode-eng').classList.remove('bg-[var(--p2)]', 'text-white');
    get('btn-mode-eng').classList.add('text-[var(--muted)]');
  } else {
    get('btn-mode-eng').classList.remove('text-[var(--muted)]');
    get('btn-mode-eng').classList.add('bg-[var(--p2)]', 'text-black');
    get('btn-mode-math').classList.remove('bg-[var(--p1)]', 'text-white');
    get('btn-mode-math').classList.add('text-[var(--muted)]');
  }
}

function setupBattleMode() {
  state.isTourney = false;
  clearPlayerSelection('p1');
  clearPlayerSelection('p2');
  showScreen('screen-battle-entry');
}

function onNameInput(pId) {
  acFocus[pId] = -1; // Reset focus on new input
  const val = get(`${pId}-name-input`).value.trim().toLowerCase();
  const list = get(`${pId}-ac-list`);
  list.innerHTML = '';
  
  if (val.length === 0) {
    list.classList.remove('open');
    return;
  }

  const matches = Object.keys(playersDB).filter(k => k.toLowerCase().includes(val));
  
  if (matches.length > 0) {
    matches.forEach((name, index) => {
      const pData = playersDB[name];
      const div = document.createElement('div');
      div.className = 'ac-item';
      div.id = `${pId}-ac-item-${index}`; 
      div.innerHTML = `<span class="ac-name">${name}</span> <span class="ac-meta">🎯 ${pData.rating}</span>`;
      div.onclick = () => selectPlayer(pId, name);
      list.appendChild(div);
    });
    list.classList.add('open');
  } else {
    const div = document.createElement('div');
    div.className = 'ac-item text-[var(--p2)]';
    div.innerHTML = `<span class="ac-name">Create "${val}" <i class="fas fa-plus-circle ml-1"></i></span>`;
    div.onclick = () => selectPlayer(pId, get(`${pId}-name-input`).value.trim());
    list.appendChild(div);
    list.classList.add('open');
  }
}

function onNameKeydown(e, pId) {
  const list = get(`${pId}-ac-list`);
  if (!list.classList.contains('open')) return;

  const items = list.querySelectorAll('.ac-item');
  if (items.length === 0) return;

  const isP1 = pId === 'p1';
  
  // P1 uses Standard Arrows. P2 uses Numpad 8 (Up) and Numpad 2 (Down)
  const keyUp = isP1 ? (e.key === 'ArrowUp') : (e.code === 'Numpad8');
  const keyDown = isP1 ? (e.key === 'ArrowDown') : (e.code === 'Numpad2');
  const keyEnter = isP1 ? (e.key === 'Enter') : (e.code === 'NumpadEnter' || e.key === 'Enter');

  if (keyDown) {
    e.preventDefault();
    acFocus[pId] = Math.min(acFocus[pId] + 1, items.length - 1);
    updateACFocus(pId, items);
  } else if (keyUp) {
    e.preventDefault();
    acFocus[pId] = Math.max(acFocus[pId] - 1, 0);
    updateACFocus(pId, items);
  } else if (keyEnter) {
    e.preventDefault();
    if (acFocus[pId] >= 0 && acFocus[pId] < items.length) {
      items[acFocus[pId]].click();
    } else if (items.length > 0) {
      items[0].click(); // Auto-select top item
    }
  }
}

function updateACFocus(pId, items) {
  items.forEach((item, idx) => {
    if (idx === acFocus[pId]) {
      item.classList.add('focused', 'bg-white/10'); 
      item.scrollIntoView({ block: 'nearest' });    
    } else {
      item.classList.remove('focused', 'bg-white/10');
    }
  });
}

function selectPlayer(pId, name) {
  if (!playersDB[name]) {
    playersDB[name] = { name, class: 'General', score: 0, correct: 0, total: 0, rating: 1200 };
    saveDB();
  }
  
  game[pId].name = name;
  get(`${pId}-name-input`).value = '';
  get(`${pId}-name-input`).parentElement.style.display = 'none';
  get(`${pId}-ac-list`).classList.remove('open');
  
  get(`${pId}-selected-card`).classList.remove('hidden');
  get(`${pId}-sc-init`).innerText = name.substring(0, 2).toUpperCase();
  get(`${pId}-sc-name`).innerText = name;
  get(`${pId}-sc-meta`).innerText = `Rating: ${playersDB[name].rating}`;

  checkBattleReady();
}

function clearPlayerSelection(pId) {
  game[pId].name = '';
  get(`${pId}-selected-card`).classList.add('hidden');
  get(`${pId}-name-input`).parentElement.style.display = 'block';
  get(`${pId}-name-input`).focus();
  checkBattleReady();
}

function checkBattleReady() {
  const btn = get('btn-start-battle');
  if (game.p1.name && game.p2.name) {
    btn.disabled = false;
    btn.classList.add('neon-p1');
  } else {
    btn.disabled = true;
    btn.classList.remove('neon-p1');
  }
}

/* ─────────────────────────────────────────────────────────
   5. GAME ENGINE
   ───────────────────────────────────────────────────────── */
function startBattleGame() {
  showScreen('screen-game');
  prepGameUI();
  runCountdown();
}

function prepGameUI() {
  game.rope = 50;
  game.timer = 60;
  game.active = false;
  
  ['p1', 'p2'].forEach(pId => {
    game[pId].score = 0;
    game[pId].combo = 0;
    game[pId].input = '';
    game[pId].frozen = false;
    
    get(`${pId}-score`).innerText = '0';
    get(`${pId}-combo`).style.display = 'none';
    get(`${pId}-name`).innerText = game[pId].name;
    get(`${pId}-avatar-txt`).innerText = game[pId].name.substring(0, 2).toUpperCase();
    get(`${pId}-input`).innerText = '';
    get(`${pId}-frozen`).style.display = 'none';
    
    if (state.mode === 'math') {
      get(`${pId}-eng-opts`).classList.add('hidden');
      get(`${pId}-input`).classList.remove('hidden');
      document.querySelectorAll(`.c-btn-${pId}`).forEach(b => b.style.display = 'flex');
      document.querySelectorAll(`.c-btn-clr`).forEach(b => b.style.display = 'flex');
    } else {
      get(`${pId}-eng-opts`).classList.remove('hidden');
      get(`${pId}-input`).classList.add('hidden');
      document.querySelectorAll(`.c-btn-${pId}`).forEach(b => {
        if(["1","2","3"].includes(b.innerText)) b.style.display = 'flex';
        else b.style.display = 'none';
      });
      document.querySelectorAll(`.c-btn-clr`).forEach(b => b.style.display = 'none');
    }
  });

  updateRopeVisuals();
  get('game-timer').innerText = game.timer;
  get('timer-pill').className = 'timer-pill';
}

function runCountdown() {
  const overlay = get('countdown-overlay');
  const txt = get('countdown-text');
  overlay.style.display = 'flex';
  txt.className = 'countdown-num pop';
  
  let count = 3;
  txt.innerText = count;
  playAudio('sfx-countdown');

  let iv = setInterval(() => {
    count--;
    if (count > 0) {
      txt.innerText = count;
      txt.classList.remove('pop');
      void txt.offsetWidth; 
      txt.classList.add('pop');
    } else if (count === 0) {
      txt.className = 'countdown-fight pop';
      txt.innerText = 'FIGHT!';
    } else {
      clearInterval(iv);
      overlay.style.display = 'none';
      beginMatch();
    }
  }, 1000);
}

function beginMatch() {
  game.active = true;
  generateQuestion('p1');
  generateQuestion('p2');
  
  game.interval = setInterval(() => {
    game.timer--;
    get('game-timer').innerText = game.timer;
    
    if(game.timer <= 10) {
      get('timer-pill').classList.add('danger', 'sd');
    }
    
    if(game.timer <= 0) {
      endMatch();
    }
  }, 1000);
}

function generateQuestion(pId) {
  const pData = playersDB[game[pId].name];
  const rating = pData ? pData.rating : 1200;
  
  if (state.mode === 'math') {
    let max = rating > 1400 ? 50 : (rating > 1200 ? 20 : 10);
    let a = Math.floor(Math.random() * max) + 1;
    let b = Math.floor(Math.random() * max) + 1;
    let ops = rating > 1300 ? ['+', '-', '*'] : ['+', '-'];
    let op = ops[Math.floor(Math.random() * ops.length)];
    
    if (op === '-' && a < b) [a, b] = [b, a];
    
    let ans = 0;
    if (op === '+') ans = a + b;
    if (op === '-') ans = a - b;
    if (op === '*') { a = a%12+2; b = b%12+2; ans = a * b; } 
    
    game[pId].q = { text: `${a} ${op} ${b}`, a: String(ans) };
    get(`${pId}-q-text`).innerText = game[pId].q.text;
    
  } else {
    const q = englishBank[Math.floor(Math.random() * englishBank.length)];
    game[pId].q = q;
    get(`${pId}-q-text`).innerText = q.q;
    
    const optsContainer = get(`${pId}-eng-opts`);
    optsContainer.innerHTML = '';
    q.opts.forEach((opt, idx) => {
      const btn = document.createElement('div');
      btn.className = `eng-opt eng-opt-${pId}`;
      btn.innerHTML = `<span class="text-[var(--muted)] mr-1">${idx+1}.</span> ${opt}`;
      btn.onclick = () => tapInput(pId, String(idx+1));
      optsContainer.appendChild(btn);
    });
  }
}

/* ─────────────────────────────────────────────────────────
   6. INPUT HANDLING & LOGIC
   ───────────────────────────────────────────────────────── */
function tapInput(pId, val) {
  if (!game.active || game[pId].frozen) return;
  
  const p = game[pId];
  
  if (state.mode === 'english') {
    if (val === p.q.a) triggerCorrect(pId);
    else triggerWrong(pId);
  } else {
    p.input += val;
    get(`${pId}-input`).innerText = p.input;
    
    if (p.q.a === p.input) {
      triggerCorrect(pId);
    } else if (!p.q.a.startsWith(p.input)) {
      triggerWrong(pId);
    }
  }
}

function tapClear(pId) {
  if (!game.active || game[pId].frozen) return;
  game[pId].input = '';
  get(`${pId}-input`).innerText = '';
}

function triggerCorrect(pId) {
  playAudio('sfx-correct');
  const p = game[pId];
  
  p.score += 10 + (p.combo * 2);
  p.combo++;
  p.input = '';
  get(`${pId}-input`).innerText = '';
  get(`${pId}-score`).innerText = p.score;
  
  if (p.combo >= 3) {
    const comboEl = get(`${pId}-combo`);
    comboEl.style.display = 'inline-block';
    comboEl.innerText = `🔥 ${p.combo} COMBO`;
    comboEl.classList.remove('pop');
    void comboEl.offsetWidth;
    comboEl.classList.add('pop');
  }

  const fb = get(`${pId}-feedback`);
  fb.innerText = "CORRECT";
  fb.className = 'feedback-flash text-[var(--green)] fade-in-up';
  setTimeout(() => fb.classList.remove('fade-in-up'), 500);

  playersDB[p.name].correct++;
  playersDB[p.name].total++;

  const pullAmt = 3 + Math.min(p.combo, 5);
  if (pId === 'p1') game.rope = Math.max(0, game.rope - pullAmt);
  else game.rope = Math.min(100, game.rope + pullAmt);
  
  updateRopeVisuals();
  
  if (game.rope <= 0 || game.rope >= 100) {
    endMatch();
  } else {
    generateQuestion(pId);
  }
}

function triggerWrong(pId) {
  playAudio('sfx-wrong');
  const p = game[pId];
  p.combo = 0;
  p.input = '';
  get(`${pId}-input`).innerText = '';
  get(`${pId}-combo`).style.display = 'none';
  
  playersDB[p.name].total++;

  const area = get(`zone-${pId}`);
  area.classList.remove('shake');
  void area.offsetWidth;
  area.classList.add('shake');
  
  p.frozen = true;
  get(`${pId}-frozen`).style.display = 'flex';
  
  setTimeout(() => {
    p.frozen = false;
    get(`${pId}-frozen`).style.display = 'none';
  }, 1500);
}

document.addEventListener('keydown', (e) => {
  if (!game.active) return;
  
  // Player 1
  if ("1234567890".includes(e.key) && e.location !== KeyboardEvent.DOM_KEY_LOCATION_NUMPAD) {
    tapInput('p1', e.key);
  }
  if (["Backspace", "c", "C"].includes(e.key) && e.location !== KeyboardEvent.DOM_KEY_LOCATION_NUMPAD) {
    tapClear('p1');
  }
  
  // Player 2
  const p2map = {"Numpad1":"1","Numpad2":"2","Numpad3":"3","Numpad4":"4","Numpad5":"5","Numpad6":"6","Numpad7":"7","Numpad8":"8","Numpad9":"9","Numpad0":"0"};
  if (p2map[e.code]) {
    tapInput('p2', p2map[e.code]);
  }
  if (["NumpadDecimal", "NumpadEnter", "Delete"].includes(e.code)) {
    tapClear('p2');
  }
});

/* ─────────────────────────────────────────────────────────
   7. ROPE RENDERING
   ───────────────────────────────────────────────────────── */
function layoutRope() {
  const isLandscape = window.innerWidth > window.innerHeight;
  const divider = get('rope-divider');
  const z1 = get('zone-p1');
  const z2 = get('zone-p2');

  if (isLandscape) {
    divider.className = 'rope-divider v';
    z1.style = 'position:absolute;top:0;bottom:0;left:0;right:50%;';
    z2.style = 'position:absolute;top:0;bottom:0;left:50%;right:0;';
    z1.querySelector('.player-hud').style.transform = 'none';
  } else {
    divider.className = 'rope-divider h';
    z1.style = 'position:absolute;top:0;left:0;right:0;bottom:50%;';
    z2.style = 'position:absolute;top:50%;left:0;right:0;bottom:0;';
    z1.querySelector('.player-hud').style.transform = 'rotate(180deg)';
    z1.querySelector('.q-area').style.transform = 'rotate(180deg)';
  }
  updateRopeVisuals();
}

function updateRopeVisuals() {
  const marker = get('rope-marker');
  const pctText = get('rope-pct');
  const isLandscape = window.innerWidth > window.innerHeight;
  
  if (isLandscape) {
    marker.style.left = `${game.rope}%`;
    marker.style.top = `50%`;
  } else {
    marker.style.left = `50%`;
    marker.style.top = `${game.rope}%`;
  }
  
  const diff = Math.abs(game.rope - 50);
  pctText.innerText = diff === 0 ? '50' : diff;
  pctText.style.color = game.rope < 50 ? 'var(--p1)' : (game.rope > 50 ? 'var(--p2)' : '#fff');
  
  if(game.rope < 50) {
    marker.style.boxShadow = '0 0 0 3px rgba(79,70,229,0.3),0 0 30px rgba(79,70,229,0.5)';
    marker.style.background = 'conic-gradient(from 0deg,#4F46E5,#818CF8,#4F46E5)';
  } else if (game.rope > 50) {
    marker.style.boxShadow = '0 0 0 3px rgba(245,158,11,0.3),0 0 30px rgba(245,158,11,0.5)';
    marker.style.background = 'conic-gradient(from 0deg,#F59E0B,#FCD34D,#F59E0B)';
  } else {
    marker.style.boxShadow = '0 0 0 3px rgba(255,255,255,0.1),0 0 15px rgba(255,255,255,0.1)';
    marker.style.background = '#64748B';
  }
}

/* ─────────────────────────────────────────────────────────
   8. END GAME & ELO
   ───────────────────────────────────────────────────────── */
function endMatch() {
  game.active = false;
  clearInterval(game.interval);
  playAudio('sfx-win');
  
  let winner = null;
  let reason = '';
  
  if (game.rope <= 0) { winner = 'p1'; reason = 'Knockout!'; }
  else if (game.rope >= 100) { winner = 'p2'; reason = 'Knockout!'; }
  else if (game.rope < 50) { winner = 'p1'; reason = 'Tug Advantage!'; }
  else if (game.rope > 50) { winner = 'p2'; reason = 'Tug Advantage!'; }
  else {
    if (game.p1.score > game.p2.score) { winner = 'p1'; reason = 'Score Tiebreaker!'; }
    else if (game.p2.score > game.p1.score) { winner = 'p2'; reason = 'Score Tiebreaker!'; }
    else { winner = 'tie'; reason = 'Draw!'; }
  }

  if (winner !== 'tie') {
    let wName = game[winner].name;
    let lName = winner === 'p1' ? game.p2.name : game.p1.name;
    let ratingDiff = playersDB[lName].rating - playersDB[wName].rating;
    let wShift = Math.max(10, Math.floor(20 + (ratingDiff * 0.1)));
    let lShift = Math.max(5, Math.floor(15 + (ratingDiff * 0.1)));
    
    playersDB[wName].rating += wShift;
    playersDB[lName].rating = Math.max(100, playersDB[lName].rating - lShift);
    playersDB[wName].score += game[winner].score;
    playersDB[lName].score += game[winner === 'p1' ? 'p2' : 'p1'].score;
  }
  
  saveDB();

  const winScreen = get('screen-winner');
  winScreen.style.display = 'flex';
  get('winner-scores').innerText = `${game.p1.score} - ${game.p2.score}`;
  
  if (winner === 'tie') {
    get('winner-name').innerText = 'DRAW';
    get('winner-name').style.color = '#fff';
    get('winner-reason').innerText = reason;
  } else {
    get('winner-name').innerText = game[winner].name;
    get('winner-name').style.color = winner === 'p1' ? '#818CF8' : '#FCD34D';
    get('winner-reason').innerText = reason;
    confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
  }

  if (state.isTourney) {
    const match = tourneyData.bracket[tourneyData.currentRound].find(m => m.id === game.tourneyMatchId);
    if(match) {
       match.winner = winner === 'tie' ? match.p1 : game[winner].name; 
    }
    
    get('btn-winner-continue').onclick = () => {
      winScreen.style.display = 'none';
      renderBracket();
      showScreen('screen-tourney-hub');
    };
  } else {
    historyDB.unshift({
      date: new Date().toLocaleDateString(),
      p1: game.p1.name, p2: game.p2.name,
      winner: winner === 'tie' ? 'Draw' : game[winner].name,
      mode: state.mode
    });
    if(historyDB.length > 50) historyDB.pop();
    saveHistory();

    get('btn-winner-continue').onclick = () => {
      winScreen.style.display = 'none';
      showScreen('screen-menu');
    };
  }
}

/* ─────────────────────────────────────────────────────────
   9. COMPETITION (TOURNAMENT) MODE
   ───────────────────────────────────────────────────────── */
let tourneyData = {
  players: [],
  bracket: [],
  currentRound: 0
};

function startCompetitionSetup() {
  get('modal-admin-pass').classList.add('open');
  get('admin-pass-input').value = '';
  get('admin-pass-error').classList.add('hidden');
  get('admin-pass-input').focus();
}

function verifyAdminPass() {
  const pwd = get('admin-pass-input').value;
  if (pwd === 'admin' || pwd === '1234') {
    get('modal-admin-pass').classList.remove('open');
    state.isTourney = true;
    tourneyData.players = [];
    tourneyData.bracket = [];
    tourneyData.currentRound = 0;
    updateTPlayerList();
    showScreen('screen-tourney-setup');
  } else {
    get('admin-pass-error').classList.remove('hidden');
  }
}

function addTourneyPlayer() {
  const input = get('tourney-input');
  const name = input.value.trim();
  if (name && !tourneyData.players.includes(name)) {
    tourneyData.players.push(name);
    if(!playersDB[name]) {
      playersDB[name] = { name, class: 'General', score: 0, correct: 0, total: 0, rating: 1200 };
      saveDB();
    }
    input.value = '';
    updateTPlayerList();
  }
}

function clearTPlayers() {
  tourneyData.players = [];
  updateTPlayerList();
}

function updateTPlayerList() {
  const list = get('t-player-list');
  list.innerHTML = '';
  tourneyData.players.forEach(p => {
    const li = document.createElement('li');
    li.className = 'text-white bg-white/5 px-3 py-2 rounded-lg text-sm font-semibold f-display';
    li.innerText = p;
    list.appendChild(li);
  });
  get('t-player-count').innerText = `${tourneyData.players.length} Players`;
  
  if (tourneyData.players.length >= 2) {
    get('btn-gen-bracket').classList.remove('hidden');
  } else {
    get('btn-gen-bracket').classList.add('hidden');
  }
}

function generateBracket() {
  let pl = [...tourneyData.players].sort(() => Math.random() - 0.5);
  tourneyData.bracket = [];
  tourneyData.currentRound = 0;
  
  let round1 = [];
  let matchId = 1;
  for (let i = 0; i < pl.length; i += 2) {
    if (i + 1 < pl.length) {
      round1.push({ id: matchId++, p1: pl[i], p2: pl[i+1], winner: null });
    } else {
      round1.push({ id: matchId++, p1: pl[i], p2: null, winner: pl[i] });
    }
  }
  tourneyData.bracket.push(round1);
  
  showScreen('screen-tourney-hub');
  renderBracket();
}

function renderBracket() {
  const container = get('bracket-container');
  container.innerHTML = '';
  
  let currentRoundMatches = tourneyData.bracket[tourneyData.currentRound];
  get('t-round-label').innerText = `ROUND ${tourneyData.currentRound + 1}`;
  
  if (currentRoundMatches.every(m => m.winner !== null)) {
    if (currentRoundMatches.length === 1) {
      get('match-card-content').innerHTML = `
        <div class="text-center">
          <div class="text-4xl mb-2">🏆</div>
          <h3 class="text-white font-bold f-display text-2xl">${currentRoundMatches[0].winner}</h3>
          <p class="text-[var(--muted)] text-xs mt-1">Tournament Champion</p>
          <button onclick="saveAndExit()" class="btn-primary w-full mt-4 text-sm">Finish</button>
        </div>
      `;
      historyDB.unshift({
        date: new Date().toLocaleDateString(),
        p1: 'TOURNAMENT', p2: 'CHAMPION',
        winner: currentRoundMatches[0].winner,
        mode: state.mode
      });
      saveHistory();
      return;
    } else {
      let nextRound = [];
      let matchId = Date.now();
      for (let i = 0; i < currentRoundMatches.length; i += 2) {
        let p1 = currentRoundMatches[i].winner;
        let p2 = currentRoundMatches[i+1] ? currentRoundMatches[i+1].winner : null;
        nextRound.push({ id: matchId++, p1, p2, winner: p2 ? null : p1 });
      }
      tourneyData.bracket.push(nextRound);
      tourneyData.currentRound++;
      renderBracket();
      return;
    }
  }
  
  currentRoundMatches.forEach(m => {
    const div = document.createElement('div');
    let isPlayable = !m.winner && m.p1 && m.p2;
    div.className = `bracket-match mb-2 ${isPlayable ? 'playable' : ''} ${m.winner ? 'done' : ''}`;
    
    div.innerHTML = `
      <div class="flex flex-col gap-1 w-full">
        <div class="flex justify-between items-center w-full">
          <span class="bracket-player ${m.winner === m.p1 ? 'text-[var(--green)]' : (m.winner ? 'text-[var(--muted)] line-through' : 'text-white')}">${m.p1}</span>
        </div>
        <div class="flex justify-between items-center w-full">
          <span class="bracket-player ${m.winner === m.p2 ? 'text-[var(--green)]' : (m.winner && m.p2 ? 'text-[var(--muted)] line-through' : (m.p2 ? 'text-white' : 'text-[var(--muted)]'))}">${m.p2 || 'BYE'}</span>
        </div>
      </div>
    `;
    
    if (isPlayable) {
      div.onclick = () => {
        document.querySelectorAll('.bracket-match').forEach(el => el.classList.remove('active'));
        div.classList.add('active');
        showMatchDetails(m);
      };
    }
    container.appendChild(div);
  });
  
  const firstPlayable = currentRoundMatches.find(m => !m.winner && m.p2);
  if(firstPlayable) showMatchDetails(firstPlayable);
}

function showMatchDetails(m) {
  const card = get('match-card-content');
  card.innerHTML = `
    <div class="text-center mb-6">
      <h3 class="f-display font-bold text-white text-xl">Up Next</h3>
    </div>
    <div class="flex items-center justify-between bg-black/20 p-3 rounded-lg border border-[var(--border)] mb-2">
      <span class="f-display font-bold text-[#818CF8] text-lg">${m.p1}</span>
      <span class="text-[var(--muted)] text-xs">P1</span>
    </div>
    <div class="text-center text-[var(--muted)] f-display font-bold text-sm my-1">VS</div>
    <div class="flex items-center justify-between bg-black/20 p-3 rounded-lg border border-[var(--border)] mb-6">
      <span class="f-display font-bold text-[#FCD34D] text-lg">${m.p2}</span>
      <span class="text-[var(--muted)] text-xs">P2</span>
    </div>
    <button onclick="playTourneyMatch(${m.id}, '${m.p1}', '${m.p2}')" class="btn-primary w-full shadow-lg">START MATCH</button>
  `;
}

function playTourneyMatch(mId, p1Name, p2Name) {
  game.tourneyMatchId = mId;
  game.p1.name = p1Name;
  game.p2.name = p2Name;
  startBattleGame();
}

function saveAndExit() {
  state.isTourney = false;
  showScreen('screen-menu');
}

/* ─────────────────────────────────────────────────────────
   10. TEACHER & HISTORY PANELS
   ───────────────────────────────────────────────────────── */
function showTeacherLogin() {
  get('modal-admin-pass').classList.add('open');
  get('admin-pass-input').value = '';
  get('admin-pass-error').classList.add('hidden');
  
  const btn = get('modal-admin-pass').querySelector('button.btn-primary');
  btn.onclick = verifyTeacherPass;
  get('admin-pass-input').onkeydown = (e) => { if(e.key==='Enter') verifyTeacherPass(); };
}

function verifyTeacherPass() {
  const pwd = get('admin-pass-input').value;
  if (pwd === 'admin' || pwd === '1234') {
    get('modal-admin-pass').classList.remove('open');
    openTeacherPanel();
  } else {
    get('admin-pass-error').classList.remove('hidden');
  }
}

function openTeacherPanel() {
  get('modal-teacher').classList.add('open');
  renderTeacherTable('score'); 
}

function hideTeacher() {
  get('modal-teacher').classList.remove('open');
  const btn = get('modal-admin-pass').querySelector('button.btn-primary');
  btn.onclick = verifyAdminPass;
  get('admin-pass-input').onkeydown = (e) => { if(e.key==='Enter') verifyAdminPass(); };
}

let sortAsc = false;
function sortTeacherTable(key) {
  sortAsc = !sortAsc;
  renderTeacherTable(key, sortAsc);
}

function renderTeacherTable(sortKey, asc = false) {
  const tbody = get('teacher-table-body');
  tbody.innerHTML = '';
  
  let pArr = Object.values(playersDB);
  
  pArr.sort((a, b) => {
    let valA = a[sortKey];
    let valB = b[sortKey];
    
    if (sortKey === 'accuracy') {
      valA = a.total > 0 ? (a.correct / a.total) : 0;
      valB = b.total > 0 ? (b.correct / b.total) : 0;
    } else if (sortKey === 'name' || sortKey === 'class') {
      return asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    
    return asc ? valA - valB : valB - valA;
  });
  
  pArr.forEach(p => {
    let acc = p.total > 0 ? Math.round((p.correct / p.total) * 100) : 0;
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-white/5 transition';
    tr.innerHTML = `
      <td class="p-3 text-white font-semibold">${p.name}</td>
      <td class="p-3 text-[var(--muted)]">${p.class}</td>
      <td class="p-3 text-[#FCD34D] f-mono font-bold">${p.score}</td>
      <td class="p-3 text-[var(--green)]">${acc}%</td>
      <td class="p-3 text-[#818CF8] f-mono">${p.rating}</td>
    `;
    tbody.appendChild(tr);
  });
}

function clearStats() {
  if(confirm("Are you sure you want to delete all student data? This cannot be undone.")) {
    playersDB = {};
    saveDB();
    renderTeacherTable('score');
  }
}

function showHistory() {
  const modal = get('modal-history');
  const list = get('history-list');
  list.innerHTML = '';
  
  if (historyDB.length === 0) {
    list.innerHTML = '<p class="text-[var(--muted)] text-sm text-center py-4">No recent matches.</p>';
  } else {
    historyDB.forEach(h => {
      const div = document.createElement('div');
      div.className = 'bg-[var(--surface)] p-3 rounded-xl border border-[var(--border)] flex justify-between items-center text-sm';
      div.innerHTML = `
        <div>
          <div class="text-[var(--muted)] text-[10px] mb-1">${h.date} · ${h.mode.toUpperCase()}</div>
          <div class="text-white font-semibold f-display text-base">${h.p1} <span class="text-[var(--muted)] text-xs mx-2">vs</span> ${h.p2}</div>
        </div>
        <div class="text-right">
          <div class="text-[10px] text-[var(--muted)]">WINNER</div>
          <div class="text-[var(--p2)] font-bold f-display text-base">${h.winner}</div>
        </div>
      `;
      list.appendChild(div);
    });
  }
  
  modal.classList.add('open');
}

function clearHistory() {
  historyDB = [];
  saveHistory();
  showHistory();
}