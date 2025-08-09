const socket = io();
const $ = (id)=>document.getElementById(id);

// Lobby
const lobby = $("lobby");
const nameEl = $("name");
const btnCreate = $("btnCreate");
const btnJoin = $("btnJoin");
const createBox = $("createBox");
const createRoomEl = $("createRoom");
const createPassEl = $("createPass");
const createLimitEl = $("createLimit");
const createDiffEl = $("createDiff");
const createGo = $("createGo");
const createCancel = $("createCancel");
const joinBox = $("joinBox");
const refreshRooms = $("refreshRooms");
const roomList = $("roomList");
const joinCancel = $("joinCancel");

// Pre-game
const pregame = $("pregame");
const pgRoom = $("pgRoom");
const pgLimit = $("pgLimit");
const pgPlayers = $("pgPlayers");
const hostControls = $("hostControls");
let pregameState = {roomCode:null,count:0,players:[],isHost:false};
const startBtn = $("startBtn");
const waitNote = $("waitNote");

// Game
const game = $("game");
let gameOver=false;
const gridEl = $("grid");
const padEl = $("pad");
const playersEl = $("players");
const announceEl = $("announce");
const timerEl = $("timer"); const limitEl = $("limit");
const notesBtn = $("notesBtn");

let selected=null, puzzle=null, startedAt=Date.now(), mistakeLimit=5, notesMode=false, currentRoom=null, isHost=false;
// notes[r][c] is Set of numbers
let notes = Array.from({length:9},()=>Array.from({length:9},()=>new Set()));

function show(el, yes){ el.classList.toggle("hidden", !yes); }

// Lobby behavior
btnCreate.onclick = ()=>{ show(createBox, true); show(joinBox, false); };
btnJoin.onclick   = ()=>{ show(joinBox, true); show(createBox, false); socket.emit("listRooms"); };
createCancel.onclick = ()=> show(createBox, false);
joinCancel.onclick = ()=> show(joinBox, false);
refreshRooms.onclick = ()=> socket.emit("listRooms");

createGo.onclick = ()=>{
  const code = (createRoomEl.value||"").trim().toUpperCase();
  const pass = (createPassEl.value||"").trim();
  const mlim = Number(createLimitEl.value||5);
  const diff = (createDiffEl.value||'moderate');
  if(!code){ alert("Enter a room name"); return; }
  socket.emit("createRoom", { roomCode: code, password: pass, mistakeLimit: mlim, difficulty: diff });
};

socket.on("created", ({ roomCode })=>{
  const name = (nameEl.value||"Player").trim() || "Player";
  const pass = (createPassEl.value||"").trim();
  socket.emit("join", { roomCode, name, password: pass });
});

socket.on("rooms", (list)=>{
  roomList.innerHTML = "";
  if(!list.length){
    const d=document.createElement("div"); d.className="muted"; d.textContent="No rooms yet. Create one!";
    roomList.appendChild(d); return;
  }
  list.forEach(r=>{
    const row=document.createElement("div"); row.className="room";
    const left=document.createElement("div");
    left.textContent = `${r.code} — ${r.players} player(s)` + (r.protected ? " 🔒" : "");
    const joinBtn=document.createElement("button"); joinBtn.className="btn"; joinBtn.textContent="Join";
    joinBtn.onclick = ()=>{
      const name = (nameEl.value||"Player").trim() || "Player";
      let pwd = "";
      if(r.protected){ pwd = prompt("Password for room "+r.code+"?") || ""; }
      socket.emit("join", { roomCode: r.code, name, password: pwd });
    };
    row.appendChild(left); row.appendChild(joinBtn);
    roomList.appendChild(row);
  });
});
socket.on("roomsUpdate", ()=> socket.emit("listRooms"));
socket.on("errorMsg", (m)=> alert(m));

// Pre-game lobby state
socket.on("pregame", (data)=>{
  currentRoom = data.roomCode;
  isHost = !!data.isHost;
  pgRoom.textContent = data.roomCode;
  pgLimit.textContent = data.mistakeLimit;
  pgPlayers.innerHTML = "";
  (data.players||[]).forEach(p=>{
    const d=document.createElement('div'); d.className='p'; d.textContent = p.name;
    pgPlayers.appendChild(d);
  });
  show(lobby, false); show(joinBox, false); show(createBox, false);
  show(pregame, true); show(game, false);
  hostControls.classList.toggle("hidden", !isHost);
  waitNote.style.display = isHost ? "none" : "block";
  notes = Array.from({length:9},()=>Array.from({length:9},()=>new Set()));
});

startBtn.onclick = ()=>{
  if(!currentRoom) return;
  socket.emit("startGame", { roomCode: currentRoom });
};

socket.on('notReady', ({names})=>{
  announceEl.textContent = 'Waiting for: ' + names.join(', ');
  announceEl.style.opacity='1';
  setTimeout(()=> announceEl.style.opacity='0', 2000);
});

socket.on('forceLeave', ({reason})=>{
  alert(reason||'You were removed from the room');
  // Return to initial lobby screen
  show(game,false); show(pregame,false); show(lobby,true);
});

// In-game state
socket.on("state", (st)=>{
  puzzle = st.puzzle; startedAt = st.startedAt || Date.now();
  mistakeLimit = st.mistakeLimit; limitEl.textContent = mistakeLimit;
  show(pregame, false); show(lobby, false); show(game, true);
  notes = Array.from({length:9},()=>Array.from({length:9},()=>new Set()));
  buildGrid(); buildPad(); startTimer();
});

socket.on("players", (list)=>{
  // live chips
  playersEl.innerHTML='';
  list.forEach(p=>{
    const d=document.createElement('div'); d.className='p';
    const elim = p.eliminated? ' • OUT' : '';
    d.textContent = `${p.name}: ${p.progress||0}% (${p.mistakes||0}❌)${elim}`;
    playersEl.appendChild(d);
  });
  // leaderboard
  const sorted = [...list].sort((a,b)=> (b.progress||0)-(a.progress||0) || (a.mistakes||0)-(b.mistakes||0));
  const board = sorted.map((p,i)=> `${i+1}. ${p.name} — ${p.progress||0}%${p.eliminated?' (OUT)':''}`).join('<br>');
  const leader = document.getElementById('leader');
  leader.innerHTML = `<div class="muted">Leaderboard</div><div class="p" style="width:100%">${board||'—'}</div>`;
});

socket.on("announce", (msg)=>{
  announceEl.textContent = msg.text;
  announceEl.style.opacity = "1";
  setTimeout(()=> announceEl.style.opacity="0", 1200);
});

socket.on("cell", ({r,c,n,correct})=>{
  const cell = cellAt(r,c);
  if(!cell) return;
  if(correct){
    notes[r][c].clear();
    puzzle[r][c] = n; // lock in
    cell.classList.remove('error','selected');
    cell.classList.add('prefill');
    cell.textContent = String(n);
    cell.classList.add('flash');
    setTimeout(()=> cell.classList.remove('flash'), 400);
  } else {
    cell.classList.add('error');
    setTimeout(()=> cell.classList.remove('error'), 350);
  }
});

// Grid & Notes rendering
function buildGrid(){
  // sync board width to keypad
  const w = gridEl.getBoundingClientRect().width;
  document.documentElement.style.setProperty('--board-w', Math.round(w)+'px');
  gridEl.innerHTML='';
  selected = null;
  for(let r=0;r<9;r++){
    for(let c=0;c<9;c++){
      const d=document.createElement('div');
      d.className='cell';
      if((c+1)%3===0 && c!==8) d.classList.add('thick-r');
      if((r+1)%3===0 && r!==8) d.classList.add('thick-b');
      const v = puzzle[r][c];
      if(v!==0){ d.textContent = String(v); d.classList.add('prefill'); }
      d.dataset.r=r; d.dataset.c=c;
      const pick = ()=>{
        if(puzzle[r][c]!==0) return; // locked cell
        const prev = gridEl.querySelector('.cell.selected');
        if(prev) prev.classList.remove('selected');
        selected=[r,c]; d.classList.add('selected');
      };
      d.onclick = pick; d.ontouchstart = pick;
      gridEl.appendChild(d);
      if(v===0) renderCell(r,c);
    }
  }
}
function cellAt(r,c){ return gridEl.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`); }

function renderCell(r,c){
  const cell = cellAt(r,c);
  if(!cell) return;
  if(puzzle[r][c]!==0) return; // already filled
  const container = document.createElement('div');
  container.className = 'notes';
  for(let n=1;n<=9;n++){
    const s = document.createElement('div');
    s.className = 'note';
    s.textContent = notes[r][c].has(n) ? n : '';
    container.appendChild(s);
  }
  cell.innerHTML = ''; // clear
  cell.appendChild(container);
  // reapply selection border if selected
  if(selected && selected[0]===r && selected[1]===c) cell.classList.add('selected');
}

// Keypad layout and actions
function buildPad(){
  padEl.innerHTML='';

  // Row 1: 1..5
  for(let n=1;n<=5;n++){
    const b=document.createElement('div');
    b.className='key'; b.textContent=n;
    b.onclick = ()=>handleInput(n);
    padEl.appendChild(b);
  }
  // Row 2: 6..9 and ERASE
  for(let n=6;n<=9;n++){
    const b=document.createElement('div');
    b.className='key'; b.textContent=n;
    b.onclick = ()=>handleInput(n);
    padEl.appendChild(b);
  }
  const erase=document.createElement('div');
  erase.className='key key-erase'; erase.textContent='Erase';
  erase.onclick = ()=>{
    if(!selected || gameOver) return;
    const [r,c]=selected;
    if(puzzle[r][c]===0){
      notes[r][c].clear();
      renderCell(r,c);
    }
  };
  padEl.appendChild(erase);

  notesBtn.onclick = ()=>{
    notesMode=!notesMode;
    notesBtn.classList.toggle('active', notesMode);
    notesBtn.textContent = notesMode ? 'Notes: ON' : 'Notes: OFF';
  };
}

function handleInput(n){
  if(!selected || gameOver) return;
  // ensure selection exists even after layout changes
  const [r,c]=selected; const cell = cellAt(r,c); if(!cell) return;
  const [r,c]=selected;
  if(puzzle[r][c]!==0) return; // can't edit final numbers or prefill
  if(notesMode){
    if(notes[r][c].has(n)) notes[r][c].delete(n); else notes[r][c].add(n);
    renderCell(r,c);
  }else{
    socket.emit('move', { r, c, n });
  }
}

let timerId=null;
function startTimer(){
  if(timerId) clearInterval(timerId);
  timerId=setInterval(()=>{
    const t = (Date.now()-startedAt)/1000;
    const m = Math.floor(t/60).toString().padStart(2,'0');
    const s = Math.floor(t%60).toString().padStart(2,'0');
    timerEl.textContent = `${m}:${s}`;
  }, 250);
}

// GAME OVER overlay
const overlay = document.createElement('div'); overlay.className='overlay'; overlay.innerHTML='<div class="banner">GAME OVER</div>'; document.body.appendChild(overlay);
socket.on('gameOver', ({reason})=>{ gameOver=true; overlay.classList.add('show'); announceEl.textContent = reason||'Game Over'; });
