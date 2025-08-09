
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// serve everything from root
app.use(express.static('.'));

// ---------- Sudoku generation (simple but valid) ----------
function deepCopy(b){ return b.map(r=>r.slice()); }
function findEmpty(b){ for(let r=0;r<9;r++) for(let c=0;c<9;c++) if(b[r][c]===0) return [r,c]; return null; }
function valid(b,r,c,n){
  for(let i=0;i<9;i++){ if(b[r][i]===n || b[i][c]===n) return false; }
  const br=Math.floor(r/3)*3, bc=Math.floor(c/3)*3;
  for(let rr=0;rr<3;rr++) for(let cc=0;cc<3;cc++) if(b[br+rr][bc+cc]===n) return false;
  return true;
}
function solve(b){
  const pos=findEmpty(b); if(!pos) return true;
  const [r,c]=pos; const nums=[1,2,3,4,5,6,7,8,9];
  for(const n of nums){
    if(valid(b,r,c,n)){ b[r][c]=n; if(solve(b)) return true; b[r][c]=0; }
  }
  return false;
}
function makeSolved(){
  // base solved grid then shuffle rows/cols/blocks
  const base = [
    [5,3,4,6,7,8,9,1,2],
    [6,7,2,1,9,5,3,4,8],
    [1,9,8,3,4,2,5,6,7],
    [8,5,9,7,6,1,4,2,3],
    [4,2,6,8,5,3,7,9,1],
    [7,1,3,9,2,4,8,5,6],
    [9,6,1,5,3,7,2,8,4],
    [2,8,7,4,1,9,6,3,5],
    [3,4,5,2,8,6,1,7,9],
  ];
  const rand=(a)=>a.sort(()=>Math.random()-0.5);
  // shuffle rows within blocks and blocks themselves
  const rows=[0,1,2,3,4,5,6,7,8]; const cols=[0,1,2,3,4,5,6,7,8];
  const swapRows=(r1,r2)=>{ const t=base[r1]; base[r1]=base[r2]; base[r2]=t; };
  const swapCols=(c1,c2)=>{ for(let r=0;r<9;r++){ const t=base[r][c1]; base[r][c1]=base[r][c2]; base[r][c2]=t; } };
  // swap row blocks
  const rb=[0,3,6]; rand(rb).forEach((start,i)=>{ /* noop order changes via later swaps */ });
  // swap rows inside each block
  for(let b=0;b<3;b++){ const r=rand([0,1,2]); swapRows(b*3+0, b*3+r[0]); swapRows(b*3+1, b*3+r[1]); swapRows(b*3+2, b*3+r[2]); }
  // swap col blocks
  for(let b=0;b<3;b++){ const c=rand([0,1,2]); swapCols(b*3+0, b*3+c[0]); swapCols(b*3+1, b*3+c[1]); swapCols(b*3+2, b*3+c[2]); }
  return base;
}
function holesForDifficulty(level){
  switch(String(level||'moderate').toLowerCase()){
    case 'easy': return 40;
    case 'moderate': return 50;
    case 'hard': return 58;
    case 'extreme': return 64;
    default: return 50;
  }
}
function makePuzzle(difficulty='moderate'){
  const solved = makeSolved();
  const puzzle = deepCopy(solved);
  const holes = holesForDifficulty(difficulty);
  // remove cells randomly
  const cells=[...Array(81).keys()]; cells.sort(()=>Math.random()-0.5);
  for(let i=0;i<holes && i<cells.length;i++){
    const r=Math.floor(cells[i]/9), c=cells[i]%9;
    puzzle[r][c]=0;
  }
  return { puzzle, solved };
}

// ---------- Rooms ----------
const rooms = new Map();
// room: { code, password, creatorId, mistakeLimit, difficulty, holes, puzzle, solved, players: Map(id->{name,ready,progress,mistakes,eliminated}), started, startedAt }

function calcProgress(puz, solved){
  let filled=0; for(let r=0;r<9;r++) for(let c=0;c<9;c++) if(puz[r][c]!==0) filled++;
  const total=81; const given=(()=>{ let g=0; for(let r=0;r<9;r++) for(let c=0;c<9;c++) if(puz[r][c]!==0) g++; return g; })();
  // This function wants progress of a player; we approximate via percentage of solved cells in current puzzle
  return Math.round((filled / total)*100);
}

function listOpenRooms(){
  const arr=[]; for(const [code,room] of rooms){
    if(room.started) continue; // hide rooms that already started
    arr.push({ code, players: room.players.size, protected: !!room.password });
  }
  return arr.slice(0,50);
}

io.on('connection', (socket)=>{
  socket.data.name = `Player-${socket.id.slice(0,4)}`;

  socket.on('listRooms', ()=>{
    socket.emit('rooms', listOpenRooms());
  });

  socket.on('createRoom', ({roomCode, password, mistakeLimit, difficulty})=>{
    const code = String(roomCode||'').trim().toUpperCase();
    if(!code) return socket.emit('errorMsg','Enter a room name');
    if(rooms.has(code)) return socket.emit('errorMsg','Room already exists');
    const ml = [3,5,10].includes(Number(mistakeLimit)) ? Number(mistakeLimit) : 5;
    const { puzzle, solved } = makePuzzle(difficulty||'moderate');
    const room = {
      code, password: password||null, creatorId: socket.id, mistakeLimit: ml, difficulty: difficulty||'moderate',
      puzzle, solved, players: new Map(), started:false, startedAt: null
    };
    rooms.set(code, room);
    socket.emit('created', { roomCode: code });
    io.emit('roomsUpdate');
  });

  socket.on('join', ({roomCode, name, password})=>{
    const code=String(roomCode||'').trim().toUpperCase();
    const room = rooms.get(code);
    if(!room) return socket.emit('errorMsg','Room not found');
    if(room.started) return socket.emit('errorMsg','Room already started');
    if(room.password && password!==room.password) return socket.emit('errorMsg','Wrong password');
    if(room.players.size>=10) return socket.emit('errorMsg','Room is full (10)');

    socket.join(code);
    socket.data.roomCode = code;
    socket.data.name = String(name||'Player').slice(0,20)||'Player';

    room.players.set(socket.id, { name: socket.data.name, ready:false, progress:0, mistakes:0, eliminated:false });

    io.to(code).emit('pregame', {
      roomCode: code,
      count: room.players.size,
      players: Array.from(room.players, ([id,p])=>({ id, name:p.name, ready:p.ready })),
      isHost: socket.id===room.creatorId,
      mistakeLimit: room.mistakeLimit,
      difficulty: room.difficulty
    });
    io.emit('roomsUpdate');
  });

  socket.on('setReady', ({roomCode, ready})=>{
    const room = rooms.get(roomCode);
    if(!room || room.started) return;
    const p = room.players.get(socket.id);
    if(!p) return;
    p.ready = !!ready;
    io.to(roomCode).emit('pregame', {
      roomCode,
      count: room.players.size,
      players: Array.from(room.players, ([id,pp])=>({ id, name:pp.name, ready:pp.ready })),
      isHost: socket.id===room.creatorId,
      mistakeLimit: room.mistakeLimit,
      difficulty: room.difficulty
    });
  });

  socket.on('kick', ({roomCode, targetId})=>{
    const room = rooms.get(roomCode);
    if(!room || room.started) return;
    if(socket.id !== room.creatorId) return;
    if(room.players.has(targetId)){
      room.players.delete(targetId);
      const s = io.sockets.sockets.get(targetId);
      if(s){ s.leave(roomCode); s.emit('forceLeave',{reason:'Kicked by host'}); }
      io.to(roomCode).emit('pregame', {
        roomCode,
        count: room.players.size,
        players: Array.from(room.players, ([id,pp])=>({ id, name:pp.name, ready:pp.ready })),
        isHost: socket.id===room.creatorId,
        mistakeLimit: room.mistakeLimit,
        difficulty: room.difficulty
      });
      io.emit('roomsUpdate');
    }
  });

  socket.on('startGame', ({roomCode})=>{
    const room = rooms.get(roomCode);
    if(!room || socket.id!==room.creatorId || room.started) return;
    const notReady = Array.from(room.players.values()).filter(p=>!p.ready).map(p=>p.name);
    if(notReady.length>0){ io.to(socket.id).emit('notReady', {names:notReady}); return; }
    room.started = true;
    room.startedAt = Date.now();
    io.emit('roomsUpdate');
    io.to(roomCode).emit('state', { puzzle: room.puzzle, mistakeLimit: room.mistakeLimit, startedAt: room.startedAt, roomCode });
    io.to(roomCode).emit('players', Array.from(room.players, ([id,p])=>({ id, ...p })));
  });

  socket.on('move', ({r,c,n})=>{
    const code = socket.data.roomCode; if(!code) return;
    const room = rooms.get(code); if(!room || !room.started) return;
    const p = room.players.get(socket.id); if(!p || p.eliminated) return;

    const correct = Number(n)===room.solved[r][c];
    if(correct){
      if(room.puzzle[r][c]===0){
        room.puzzle[r][c] = Number(n);
        // recalc progress for everyone based on current filled cells
        const prog = calcProgress(room.puzzle, room.solved);
        for(const [id,pp] of room.players){ pp.progress = prog; }
        socket.emit('cell', { r,c,n,correct:true });
        io.to(code).emit('players', Array.from(room.players, ([id,pp])=>({ id, ...pp })));
      }
    }else{
      p.mistakes++;
      if(p.mistakes >= room.mistakeLimit){
        p.eliminated = true;
        socket.emit('gameOver', {reason:'Mistake limit reached'});
      }else{
        socket.emit('cell', { r,c,n,correct:false });
      }
      io.to(code).emit('players', Array.from(room.players, ([id,pp])=>({ id, ...pp })));
    }
  });

  socket.on('leaveRoom', ()=>{
    const code = socket.data.roomCode;
    if(!code) return;
    const room = rooms.get(code);
    if(!room) return;
    room.players.delete(socket.id);
    socket.leave(code);
    socket.data.roomCode = null;
    if(room.players.size===0){ rooms.delete(code); io.emit('roomsUpdate'); return; }
    if(!room.started){
      io.to(code).emit('pregame', {
        roomCode: code,
        count: room.players.size,
        players: Array.from(room.players, ([id,pp])=>({ id, name:pp.name, ready:pp.ready })),
        isHost: socket.id===room.creatorId,
        mistakeLimit: room.mistakeLimit,
        difficulty: room.difficulty
      });
      io.emit('roomsUpdate');
    }else{
      io.to(code).emit('players', Array.from(room.players, ([id,pp])=>({ id, ...pp })));
    }
  });

  socket.on('disconnect', ()=>{
    const code = socket.data.roomCode;
    if(!code) return;
    const room = rooms.get(code);
    if(!room) return;
    room.players.delete(socket.id);
    if(room.players.size===0){ rooms.delete(code); io.emit('roomsUpdate'); return; }
    if(!room.started){
      io.to(code).emit('pregame', {
        roomCode: code,
        count: room.players.size,
        players: Array.from(room.players, ([id,pp])=>({ id, name:pp.name, ready:pp.ready })),
        isHost: socket.id===room.creatorId,
        mistakeLimit: room.mistakeLimit,
        difficulty: room.difficulty
      });
      io.emit('roomsUpdate');
    }else{
      io.to(code).emit('players', Array.from(room.players, ([id,pp])=>({ id, ...pp })));
    }
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, ()=> console.log('Sudoking server listening on '+PORT));
