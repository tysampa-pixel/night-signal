'use strict';
// Night Signal — dependency-free multiplayer party game.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const PORT = Number(process.env.PORT) || 3000;
const rooms = new Map();
const tokens = new Map();
const ROOM_LIMIT = 8;
const ROUND_MS = 65000;
const ROUND_COUNT = 5;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const palette = [
  { label: 'CYAN', color: '#33DCE2' }, { label: 'AMBER', color: '#FFB15A' },
  { label: 'VIOLET', color: '#B894FC' }, { label: 'CORAL', color: '#FF697E' },
  { label: 'LIME', color: '#B5E77A' }, { label: 'ICE', color: '#8DC2FF' }
];
const marks = [
  { label: 'STAR', glyph: '✦' }, { label: 'MOON', glyph: '☾' },
  { label: 'DIAMOND', glyph: '◆' }, { label: 'CIRCLE', glyph: '◉' },
  { label: 'TRIANGLE', glyph: '▲' }, { label: 'CROSS', glyph: '✚' }
];
const missions = [
  ['THE BLACKOUT', 'Four transmissions. One safe corridor. Combine the private clues to route the crew home.'],
  ['THE GHOST FREQUENCY', 'An unknown signal is copying our call signs. Identify the real frequency together.'],
  ['THE DRIFT', 'The ship has lost orientation. Two independent signals reveal a safe passage.'],
  ['THE DEEP FIELD', 'A stellar storm hides our return gate. Trust the combined intel, not a guess.'],
  ['FINAL TRANSMISSION', 'One last sequence before sunrise. Get everyone home.']
];
function shuffle(a) { a = a.slice(); for(let i = a.length-1; i>0; i--) { const j = crypto.randomInt(i+1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function rand(list) { return list[crypto.randomInt(list.length)]; }
function code() { let s; do { s = Array.from({length: 5}, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join(''); } while(rooms.has(s)); return s; }
function sanitizeName(name) { return String(name||'').trim().replace(/[\u0000-\u001F\u007F<>]/g,'').slice(0,20) || 'Explorer'; }
function now() { return Date.now(); }
function user(room, token) { return room.players.find(p => p.token === token); }
function touch(room) { room.touched = now(); }
function snapshot(room, p) {
  const round = room.current;
  const timeLeft = room.stage === 'playing' && round ? Math.max(0,Math.ceil((round.endsAt - now())/1000)) : 0;
  return {
    code: room.code, name: p.name, id: p.id, host: p.id === room.host,
    stage: room.stage, playerCount: room.players.length,
    players: room.players.map(x => ({id:x.id,name:x.name,host:x.id===room.host,voted:!!room.votes[x.id]})),
    round: room.round, totalRounds: ROUND_COUNT, score: room.score, streak: room.streak,
    current: round ? {
      mission: missions[room.round-1] || missions[0],
      options: round.options, endsAt: round.endsAt, timeLeft,
      myClue: round.clues[p.id], myVote: room.votes[p.id] || null,
      votesCast: Object.keys(room.votes).length,
      revealed: room.stage !== 'playing' ? {
        correctId: round.correctId, success: round.success,
        winningId: round.winningId, count: round.voteCount,
        points: round.points, explanation: round.explanation
      } : null
    } : null,
    messages: room.messages.slice(-30),
    finalTitle: room.stage === 'finished' ? (room.score >= 800 ? 'LEGENDARY CREW' : room.score >= 450 ? 'SIGNAL SURVIVORS' : 'THE NIGHT WATCH') : null
  };
}
function broadcast(room) {
  touch(room);
  for(const p of room.players) {
    const event = 'data: ' + JSON.stringify(snapshot(room,p)) + '\n\n';
    for(const res of p.connections) {
      try { res.write(event); } catch { p.connections.delete(res); }
    }
  }
}
function addMessage(room, who, text, system=false) {
  room.messages.push({id:crypto.randomUUID(),who,text,system,time:now()});
  if(room.messages.length>50) room.messages.shift();
}
function startRound(room) {
  room.round += 1;
  room.votes = {};
  const colors = shuffle(palette).slice(0,2);
  const signs = shuffle(marks).slice(0,2);
  const targetColor = crypto.randomInt(2), targetMark = crypto.randomInt(2);
  let choices = [];
  for(let c=0;c<2;c++) for(let m=0;m<2;m++) {
    choices.push({id:`${c}${m}`,colorLabel:colors[c].label,color:colors[c].color,markLabel:signs[m].label,glyph:signs[m].glyph});
  }
  choices = shuffle(choices).map((x,i)=>({...x,callSign:`BEACON ${String(i+1).padStart(2,'0')}`}));
  const target = choices.find(x=>x.id===`${targetColor}${targetMark}`);
  const clues = {};
  // Alternate assignments: each game requires a minimum of two people to share intelligence.
  room.players.forEach((p,i) => {
    clues[p.id] = i%2===0 ? {role:'SPECTRUM ANALYST',kind:'COLOR',detail:`The safe beacon transmits in ${target.colorLabel}.`,color:target.color} : {role:'SYMBOL ANALYST',kind:'SYMBOL',detail:`The safe beacon carries the ${target.markLabel} insignia.`,glyph:target.glyph};
  });
  room.current = {
    options:choices, correctId:target.id, clues, endsAt:now()+ROUND_MS,
    success:null, winningId:null, points:0, voteCount:{},
    explanation:`The correct beacon was ${target.callSign}: ${target.colorLabel} spectrum + ${target.markLabel} symbol.`
  };
  room.stage='playing';
  addMessage(room,'MISSION CONTROL', `Round ${room.round}/${ROUND_COUNT} live. Share your PRIVATE clue, then vote.`,true);
  broadcast(room);
  const thisRound = room.round;
  room.timer = setTimeout(()=>{
    if(room.stage==='playing' && room.round===thisRound) reveal(room);
  }, ROUND_MS+100);
}
function reveal(room) {
  if(room.stage!=='playing'||!room.current)return;
  clearTimeout(room.timer);
  const r=room.current;
  const tally={};
  Object.values(room.votes).forEach(v=>tally[v]=(tally[v]||0)+1);
  const ranked=Object.entries(tally).sort((a,b)=>b[1]-a[1]);
  const winningId=ranked.length && (ranked.length===1 || ranked[0][1]>ranked[1][1]) ? ranked[0][0] : null;
  const success=winningId===r.correctId;
  const bonus=success ? 100 + Math.max(0,Math.ceil((r.endsAt-now())/1000))*2 : 0;
  room.score += bonus;
  room.streak=success ? room.streak+1:0;
  r.winningId=winningId;
  r.success=success;
  r.points=bonus;
  r.voteCount=tally;
  room.stage=room.round >= ROUND_COUNT ? 'finished' : 'reveal';
  addMessage(room,'MISSION CONTROL', success ? `Signal confirmed! +${bonus} points. The crew advances.` : 'Signal lost. Review the clues and regroup.',true);
  broadcast(room);
}
function respond(res,status,obj) { const data=JSON.stringify(obj); res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(data),'Cache-Control':'no-store'});res.end(data); }
async function body(req) { let raw=''; for await(const c of req){raw+=c.toString();if(raw.length>8000)throw Error('Request too large.');} try{return JSON.parse(raw||'{}');}catch{throw Error('Malformed JSON.');} }
function auth(token) { const code=tokens.get(token),room=rooms.get(code);const p=room&&user(room,token);return {room,p}; }
async function api(req,res,url) {
  if(req.method==='GET'&&url.pathname==='/api/state') {
    const {room,p}=auth(url.searchParams.get('token'));
    if(!room||!p)return respond(res,401,{error:'Session not found. Create or join a room.'});
    return respond(res,200,snapshot(room,p));
  }
  if(req.method==='GET'&&url.pathname==='/api/events') {
    const {room,p}=auth(url.searchParams.get('token'));
    if(!room||!p)return respond(res,401,{error:'Session expired.'});
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
    res.write('retry: 2000\n\n');
    p.connections.add(res);
    res.write('data: '+JSON.stringify(snapshot(room,p))+'\n\n');
    const keepalive=setInterval(()=>{try{res.write(': ping\n\n');}catch{}},15000);
    req.on('close',()=>{clearInterval(keepalive);p.connections.delete(res);});
    return;
  }
  if(req.method!=='POST') return respond(res,405,{error:'Method not allowed.'});
  let v;try{v=await body(req);}catch(e){return respond(res,400,{error:e.message});}
  if(url.pathname==='/api/create') {
    const c=code(),token=crypto.randomUUID();
    const player={id:crypto.randomUUID(),name:sanitizeName(v.name),token,connections:new Set(),lastChat:0};
    const room={code:c,host:player.id,players:[player],stage:'lobby',round:0,score:0,streak:0,votes:{},current:null,messages:[],touched:now()};
    rooms.set(c,room);tokens.set(token,c);
    addMessage(room,'MISSION CONTROL','Crew room created. Invite friends with the code or link.',true);
    return respond(res,200,{code:c,token});
  }
  if(url.pathname==='/api/join') {
    const c=String(v.code||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
    const room=rooms.get(c);
    if(!room)return respond(res,404,{error:'Room not found. Check the code.'});
    if(room.stage!=='lobby')return respond(res,409,{error:'Mission already started. Ask the crew to start a new room.'});
    if(room.players.length>=ROOM_LIMIT)return respond(res,409,{error:'Crew is full (8 players max).'});
    const token=crypto.randomUUID();
    const player={id:crypto.randomUUID(),name:sanitizeName(v.name),token,connections:new Set(),lastChat:0};
    room.players.push(player);tokens.set(token,c);
    addMessage(room,'MISSION CONTROL',`${player.name} joined the crew.`,true);
    broadcast(room);
    return respond(res,200,{code:c,token});
  }
  if(url.pathname==='/api/action') {
    const {room,p}=auth(v.token);
    if(!room||!p)return respond(res,401,{error:'Session expired. Please rejoin.'});
    const type=String(v.type||'');
    if(type==='start') {
      if(p.id!==room.host)return respond(res,403,{error:'Only the crew captain can launch.'});
      if(room.stage!=='lobby')return respond(res,409,{error:'Mission already launched.'});
      if(room.players.length<2)return respond(res,409,{error:'At least 2 players required.'});
      startRound(room);return respond(res,200,{ok:true});
    }
    if(type==='vote') {
      if(room.stage!=='playing')return respond(res,409,{error:'Voting is closed.'});
      if(!room.current.options.find(o=>o.id===v.value))return respond(res,400,{error:'Invalid beacon.'});
      room.votes[p.id]=v.value;broadcast(room);
      // Resolve after everyone has voted, with short grace period to revise.
      if(Object.keys(room.votes).length===room.players.length) {
        if(!room.voteTimer) room.voteTimer=setTimeout(()=>{room.voteTimer=null;if(room.stage==='playing'&&Object.keys(room.votes).length===room.players.length)reveal(room);},2200);
      }
      return respond(res,200,{ok:true});
    }
    if(type==='chat') {
      if(room.stage!=='lobby'&&room.stage!=='playing')return respond(res,409,{error:'Chat is closed for this phase.'});
      const msg=String(v.value||'').replace(/[\u0000-\u001F\u007F]/g,'').trim().slice(0,160);
      if(!msg)return respond(res,400,{error:'Message is empty.'});
      if(now()-p.lastChat<650)return respond(res,429,{error:'Please slow down a little.'});
      p.lastChat=now();addMessage(room,p.name,msg);broadcast(room);return respond(res,200,{ok:true});
    }
    if(type==='next') {
      if(p.id!==room.host)return respond(res,403,{error:'Only the crew captain can advance.'});
      if(room.stage!=='reveal')return respond(res,409,{error:'Wait for the reveal.'});
      clearTimeout(room.voteTimer);room.voteTimer=null;startRound(room);return respond(res,200,{ok:true});
    }
    if(type==='leave') {
      if(room.stage!=='lobby'&&room.stage!=='finished')return respond(res,409,{error:'Finish this mission before leaving.'});
      room.players=room.players.filter(x=>x.id!==p.id);
      tokens.delete(p.token);
      p.connections.forEach(response=>{try{response.end();}catch{}});
      if(room.players.length===0) rooms.delete(room.code);
      else { if(p.id===room.host)room.host=room.players[0].id;addMessage(room,'MISSION CONTROL',`${p.name} left the crew.`,true);broadcast(room); }
      return respond(res,200,{ok:true});
    }
    if(type==='replay') {
      if(p.id!==room.host)return respond(res,403,{error:'Only the crew captain can replay.'});
      if(room.stage!=='finished')return respond(res,409,{error:'Finish the mission first.'});
      room.stage='lobby';room.round=0;room.score=0;room.streak=0;room.votes={};room.current=null;room.messages=[];
      addMessage(room,'MISSION CONTROL','New mission armed. All crew members are still connected.',true);
      broadcast(room);return respond(res,200,{ok:true});
    }
    return respond(res,400,{error:'Unknown action.'});
  }
  return respond(res,404,{error:'Not found.'});
}
const STATIC = {'/':'index.html','/index.html':'index.html','/app.js':'app.js','/style.css':'style.css','/cover.svg':'cover.svg'};
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/')) { api(req,res,url).catch(e=>{console.error(e);if(!res.headersSent)respond(res,500,{error:'Server error.'});});return; }
  const file=STATIC[url.pathname];
  if(!file){res.writeHead(404);res.end('Not found');return;}
  const location=path.join(__dirname,'public',file);
  fs.readFile(location,(err,data)=>{
    if(err){res.writeHead(500);res.end('File unavailable');return;}
    res.writeHead(200,{'Content-Type':MIME[path.extname(file)],'Cache-Control':'public, max-age=60','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'"});res.end(data);
  });
});
setInterval(()=>{for(const [c,r] of rooms){if(now()-r.touched>60*60*1000){clearTimeout(r.timer);clearTimeout(r.voteTimer);rooms.delete(c);r.players.forEach(p=>{tokens.delete(p.token);p.connections.forEach(res=>res.end());});}}},60000).unref();
server.listen(PORT,'0.0.0.0',()=>console.log(`Night Signal running at http://localhost:${PORT}`));
