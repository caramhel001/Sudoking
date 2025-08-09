import express from 'express';
import http from 'http';
import { Server } from 'socket.io';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Serve static files from ROOT only (no public folder)
app.use(express.static('.'));

// ---- In-memory rooms (demo) ----
const rooms = new Map(); // code -> room

function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; }
function deepCopy(b){ return b.map(r=>r.slice()); }
function findEmpty(b){ for(let r=0;r<9;r++) for(let c=0;c<9;c++) if(b[r][c]===0) return [r,c]; return null; }
function valid(b,r,c,n){
  for(let i=0;i<9;i++){ if(b[r][i]===n||b[i][c]===n) return false; }
  const br=Math.floor(r/3)*3, bc=Math.floor(c/3)*3;
  for(let rr=0;rr<3;rr++) for(let cc=0;cc<3;cc++) if(b[br+rr][bc+cc]===n) return false;
  return true;
}
function solve(b){
  const pos=findEmpty(b); if(!pos) return true;
  const [r,c]=pos; const nums=shuffle([1,2,3,4,5,6,7,8,9]);
  for(const n of nums){ if(valid(b,r,c,n)){ b[r][c]=n; if(solve(b)) return true; b[r][c]=0; } }
  return false;
}
function generateSolved(){
  const b=Array.from({length:9},()=>Array(9).fill(0));
  b[0]=shuffle([1,2,3,4,5,6,7,8,9]).slice(); solve(b); return b;
}
function ensureUnique(board){
  let count=0;
  (function bt(){
    if(count>=2) return;
    const pos=findEmpty(board); if(!pos){ count++; return; }
    const [r,c]=pos;
    for(let n=1;n<=9;n++){ if(valid(board,r,c,n)){ board[r][c]=n; bt(); board[r][c]=0; if(count>=2) return; } }
  })();
  return count===1;
}

function holesForDifficulty(level){
  switch((level||'').toLowerCase()){
    case 'easy': return 40;       // fewer blanks
    case 'moderate': return 50;
    case 'hard': return 58;
    case 'extreme': return 64;    // many blanks
    default: return 50;
  }
}
function makePuzzle(solved, holes=50){
  const p=deepCopy(solved); let attempts=holes, guard=0;
  while(attempts>0 && guard<6000){
    guard++; const r=Math.floor(Math.random()*9), c=Math.floor(Math.random()*9);
    if(p[r][c]===0) continue; const bak=p[r][c]; p[r][c]=0;
    const copy=deepCopy(p); if(!ensureUnique(copy)){ p[r][c]=bak; } else attempts--;
  }
  return p;
}
function snapshotPlayers(room){
  room.allowedIds = new Set([...room.players.keys()]);
}

function newRoom(code, opts={}){
  const solved=generateSolved();
  const puzzle=makePuzzle(solved, opts.holes ?? 50);
  const room={
    code,
    createdAt: Date.now(),
    solved,
    puzzle,
    players: new Map(),     // id -> {name, progress, mistakes, ready}
    started:false,
    creatorId:null,
    allowedIds:new Set(),
    mistakeLimit: opts.mistakeLimit ?? 5,
    password: opts.password || null,
    startedAt:null
  };
  rooms.set(code, room);
  return room;
}
function computeProgress(puzzle, userBoard){
  let filled=0, total=0;
  for(let r=0;r<9;r++) for(let c=0;c<9;c++){
    if(puzzle[r][c]===0){ total++; if(userBoard[r][c]) filled++; }
  }
  return Math.round((filled/Math.max(1,total))*100);
}

io.on('connection', (socket)=>{

  socket.on('listRooms', ()=>{
    const list = Array.from(rooms.values()).filter(r=>!r.started).map(r=>({
      code:r.code, players:r.players.size, protected:!!r.password
    }));
    socket.emit('rooms', list);
  });

  socket.on('createRoom', ({roomCode, password, mistakeLimit, difficulty})=>{
    if(!roomCode) return;
    if(rooms.has(roomCode)){ socket.emit('errorMsg','Room already exists'); return; }
    const ml = [3,5,10].includes(Number(mistakeLimit)) ? Number(mistakeLimit) : 5;
    const holes = holesForDifficulty(difficulty);
    const room = newRoom(roomCode, {password: password||null, mistakeLimit: ml, holes});
    room.creatorId = socket.id;
    socket.emit('created', {roomCode});
    io.emit('roomsUpdate');
  });

  socket.on('join', ({roomCode, name, password})=>{
    const room = rooms.get(roomCode);
    if(!room){ socket.emit('errorMsg','Room not found'); return; }
    if(room.started){
      if(!room.allowedIds.has(socket.id)){
        socket.emit('errorMsg','Game already started'); return;
      }
    }
    if(room.password && room.password !== (password||'')){
      socket.emit('errorMsg','Wrong password'); return;
    }
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.data.name = (name||'Player').trim() || 'Player';
    if(room.players.size>=10 && !room.started){ socket.emit('errorMsg','Room is full (10 players)'); return; }
    room.players.set(socket.id, {name:socket.data.name, progress:0, mistakes:0, ready:false});
    if(!room.started){
      io.to(roomCode).emit('pregame', { roomCode, count: room.players.size, players: Array.from(room.players, ([id,p])=>({id,name:p.name,ready:!!p.ready})), isHost: socket.id===room.creatorId, mistakeLimit: room.mistakeLimit });
    }else{
      socket.emit('state', { puzzle: room.puzzle, mistakeLimit: room.mistakeLimit, startedAt: room.startedAt, roomCode });
      io.to(roomCode).emit('players', Array.from(room.players, ([id,p])=>({id,...p})));
    }
  });

  
  socket.on('setReady', ({roomCode, ready})=>{
    const room = rooms.get(roomCode);
    if(!room || room.started) return;
    const p = room.players.get(socket.id);
    if(!p) return;
    p.ready = !!ready;
    io.to(roomCode).emit('pregame', { roomCode, count: room.players.size, players: Array.from(room.players, ([id,pp])=>({id,name:pp.name,ready:!!pp.ready})), isHost: socket.id===room.creatorId, mistakeLimit: room.mistakeLimit });
  });
socket.on('setOptions', ({roomCode, mistakeLimit})=>{
    const room = rooms.get(roomCode);
    if(!room || socket.id !== room.creatorId || room.started) return;
    if([3,5,10].includes(Number(mistakeLimit))) room.mistakeLimit = Number(mistakeLimit);
    io.to(roomCode).emit('pregame', {
      roomCode,
      players: [...room.players.values()].map(p=>({name:p.name})),
      isHost: true,
      mistakeLimit: room.mistakeLimit
    });
  });

  socket.on('startGame', ({roomCode})=>{
    const room = rooms.get(roomCode);
    if(!room || socket.id !== room.creatorId || room.started) return;
    room.started = true;
    snapshotPlayers(room);
    room.startedAt = Date.now();
    io.emit('roomsUpdate'); // hide from lobby
    io.to(roomCode).emit('state', { puzzle: room.puzzle, mistakeLimit: room.mistakeLimit, startedAt: room.startedAt, roomCode });
    io.to(roomCode).emit('players', Array.from(room.players, ([id,p])=>({id,...p})));
  });

  socket.on('move', ({r,c,n})=>{
    const code = socket.data.roomCode; if(!code) return;
    const room = rooms.get(code); if(!room || !room.started) return;
    const pcur = room.players.get(socket.id); if(!pcur || (pcur.eliminated===true)) return; // ignore eliminated
    const correct = n === room.solved[r][c];
    if(correct){
      if(room.puzzle[r][c]===0){
        room.puzzle[r][c]=n;
        io.to(code).emit('cell', {r,c,n,correct:true,who:socket.data.name});
      }
    }else{
      const p=room.players.get(socket.id);
      if(p){
        p.mistakes++;
        if(p.mistakes >= room.mistakeLimit){
          p.eliminated = true;
          try{ socket.emit('gameOver', {reason:'Mistake limit reached'}); }catch(e){}
        } else {
          socket.emit('cell', {r,c,n,correct:false});
        }
        io.to(code).emit('players', Array.from(room.players, ([id,pp])=>({id,...pp})));
      }
    }
    const p=room.players.get(socket.id);
    if(p){
      const userBoard = room.puzzle;
      p.progress = computeProgress(room.puzzle, userBoard);
      io.to(code).emit('players', Array.from(room.players, ([id,pp])=>({id,...pp})));
    }
  });

  
  socket.on('kick', ({roomCode, targetId})=>{
    const room = rooms.get(roomCode);
    if(!room || socket.id !== room.creatorId || room.started) return;
    if(!room.players.has(targetId)) return;
    room.players.delete(targetId);
    try{
      const s = io.sockets.sockets.get(targetId);
      if(s){ s.leave(roomCode); s.emit('forceLeave', {reason:'Kicked by host'}); }
    }catch(e){}
    io.to(roomCode).emit('pregame', { roomCode, count: room.players.size, players: Array.from(room.players, ([id,pp])=>({id,name:pp.name,ready:!!pp.ready})), isHost: socket.id===room.creatorId, mistakeLimit: room.mistakeLimit });
    io.emit('roomsUpdate');
  });
socket.on('disconnect', ()=>{
    const code = socket.data.roomCode;
    if(!code) return;
    const room = rooms.get(code);
    if(!room) return;
    room.players.delete(socket.id);
    if(room.players.size===0){
      rooms.delete(code);
    }else{
      if(!room.started){
        io.to(code).emit('pregame', { roomCode:code, count: room.players.size, players: Array.from(room.players, ([id,p])=>({id,name:p.name,ready:!!p.ready})), isHost: socket.id===room.creatorId, mistakeLimit: room.mistakeLimit });
      }else{
        io.to(code).emit('players', Array.from(room.players, ([id,p])=>({id,...p})));
      }
    }
    io.emit('roomsUpdate');
  });

});

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=> console.log('Server listening on '+PORT));
