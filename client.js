const socket = io();
const $ = (id)=>document.getElementById(id);

// Lobby elements
const lobby = $("lobby");
const nameEl = $("name");
const btnCreate = $("btnCreate");
const btnJoin = $("btnJoin");
const createBox = $("createBox");
const createRoomEl = $("createRoom");
const createPassEl = $("createPass");
const createGo = $("createGo");
const createCancel = $("createCancel");
const joinBox = $("joinBox");
const refreshRooms = $("refreshRooms");
const roomList = $("roomList");
const joinCancel = $("joinCancel");

// Game elements
const game = $("game");
const gridEl = $("grid");
const padEl = $("pad");
const playersEl = $("players");
const announceEl = $("announce");
const timerEl = $("timer"); const limitEl = $("limit");

let selected=null, puzzle=null, startedAt=Date.now(), mistakeLimit=5, notesMode=false;

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
  if(!code){ alert("Enter a room code"); return; }
  socket.emit("createRoom", { roomCode: code, password: pass });
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
    left.textContent = `${r.code} — ${r.players} player(s)`;
    if(r.protected){ const lock=document.createElement("span"); lock.textContent=" 🔒"; left.appendChild(lock); }
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

// In-room events
socket.on("state", (st)=>{
  puzzle = st.puzzle; startedAt = st.startedAt || Date.now();
  mistakeLimit = st.mistakeLimit; limitEl.textContent = mistakeLimit;
  show(lobby, false); show(game, true);
  buildGrid(); buildPad(); startTimer();
});

socket.on("players", (list)=>{
  playersEl.innerHTML='';
  list.forEach(p=>{
    const d=document.createElement('div'); d.className='p';
    d.textContent = `${p.name}: ${p.progress||0}% (${p.mistakes||0}❌)`;
    playersEl.appendChild(d);
  });
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
    cell.textContent = String(n);
    cell.classList.add('flash');
    setTimeout(()=> cell.classList.remove('flash'), 600);
  } else {
    cell.classList.add('error');
    setTimeout(()=> cell.classList.remove('error'), 400);
  }
});

// Build grid with thick 3x3 lines
function buildGrid(){
  gridEl.innerHTML='';
  for(let r=0;r<9;r++){
    for(let c=0;c<9;c++){
      const d=document.createElement('div');
      d.className='cell';
      if((c+1)%3===0 && c!==8) d.classList.add('thick-r');
      if((r+1)%3===0 && r!==8) d.classList.add('thick-b');
      const v = puzzle[r][c];
      if(v!==0){ d.textContent = String(v); d.classList.add('prefill'); }
      d.dataset.r=r; d.dataset.c=c;
      d.onclick = ()=>{ selected=[r,c]; };
      gridEl.appendChild(d);
    }
  }
}
function cellAt(r,c){ return gridEl.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`); }

function buildPad(){
  padEl.innerHTML='';
  for(let n=1;n<=9;n++){
    const b=document.createElement('div');
    b.className='key'; b.textContent=n;
    b.onclick = ()=>{
      if(!selected) return;
      socket.emit('move', { r:selected[0], c:selected[1], n });
    };
    padEl.appendChild(b);
  }
  const notes=document.createElement('div');
  notes.className='key key-wide'; notes.textContent='Notes: OFF';
  notes.onclick = ()=>{ notesMode=!notesMode; notes.classList.toggle('active', notesMode); notes.textContent = notesMode?'Notes: ON':'Notes: OFF'; };
  padEl.appendChild(notes);
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