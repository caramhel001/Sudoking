const socket = io();
const $ = (id)=>document.getElementById(id);
const nameEl=$("name"), roomEl=$("room"), statusEl=$("status");
const playersEl=$("players"), gridEl=$("grid"), padEl=$("pad");
const announceEl=$("announce"), timerEl=$("timer"), limitEl=$("limit");

let notesMode=false, selected=null, puzzle=null, mistakeLimit=5, startedAt=Date.now();

$("join").onclick = ()=>{
  const name = nameEl.value.trim()||"Player";
  const room = roomEl.value.trim().toUpperCase();
  if(!room){ alert("Enter room code"); return; }
  socket.emit('join', { roomCode: room, name });
  statusEl.textContent = "Joining "+room+"...";
};

socket.on('state', (st)=>{
  puzzle = st.puzzle;
  mistakeLimit = st.mistakeLimit;
  startedAt = st.startedAt || Date.now();
  limitEl.textContent = mistakeLimit;
  buildGrid();
  buildPad();
  statusEl.textContent = "Connected";
  startTimer();
});

socket.on('players', (list)=>{
  playersEl.innerHTML='';
  list.forEach(p=>{
    const d=document.createElement('div'); d.className='p';
    d.textContent = `${p.name}: ${p.progress||0}% (${p.mistakes||0}❌)`;
    playersEl.appendChild(d);
  });
});

socket.on('announce', (msg)=>{
  announceEl.textContent = msg.text;
  announceEl.style.opacity = "1";
  setTimeout(()=> announceEl.style.opacity="0", 1200);
});

socket.on('cell', ({r,c,n,correct,who})=>{
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

function buildGrid(){
  gridEl.innerHTML='';
  for(let r=0;r<9;r++){
    for(let c=0;c<9;c++){
      const d=document.createElement('div');
      d.className='cell';
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
  const erase=document.createElement('div');
  erase.className='key'; erase.textContent='Erase';
  erase.onclick = ()=>{ /* erase disabled in shared board */ };
  padEl.appendChild(erase);

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
