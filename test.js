'use strict';
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {setTimeout:delay}=require('node:timers/promises');
const PORT=3099;
const child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:String(PORT)},cwd:__dirname});
child.stdout.on('data',x=>process.stdout.write(String(x)));
child.stderr.on('data',x=>process.stderr.write(String(x)));
const base=`http://127.0.0.1:${PORT}`;
async function req(path,body){const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
async function state(t){const r=await fetch(base+`/api/state?token=${t}`);return r.json();}
(async()=>{
  for(let i=0;i<30;i++){try{await fetch(base);break;}catch{await delay(100);}}
  const a=await req('/api/create',{name:'Alpha'}); assert.equal(a.status,200);
  const b=await req('/api/join',{name:'Bravo',code:a.body.code}); assert.equal(b.status,200);
  const ta=a.body.token,tb=b.body.token;
  assert.equal((await state(ta)).players.length,2);
  const start=await req('/api/action',{token:ta,type:'start'}); assert.equal(start.status,200);
  const aa=await state(ta),bb=await state(tb);
  assert.equal(aa.current.options.length,4);
  assert.notEqual(aa.current.myClue.kind,bb.current.myClue.kind,'private clues must differ');
  const opts=aa.current.options;
  const correct=opts.find(o=>aa.current.myClue.detail.includes(o.colorLabel)&&bb.current.myClue.detail.includes(o.markLabel));
  assert.ok(correct,'both intel cards should identify one beacon');
  assert.equal(opts.filter(o=>aa.current.myClue.detail.includes(o.colorLabel)).length,2);
  assert.equal(opts.filter(o=>bb.current.myClue.detail.includes(o.markLabel)).length,2);
  assert.equal((await req('/api/action',{token:ta,type:'vote',value:correct.id})).status,200);
  assert.equal((await req('/api/action',{token:tb,type:'vote',value:correct.id})).status,200);
  await delay(2400);
  const final=await state(ta);assert.equal(final.stage,'reveal');assert.equal(final.current.revealed.success,true);
  assert.ok(final.score>0);assert.equal((await req('/api/action',{token:ta,type:'next'})).status,200);
  assert.equal((await state(tb)).round,2);
  assert.equal((await req('/api/join',{name:'Late',code:a.body.code})).status,409);
  console.log('✅ End-to-end two-player, secret clue, vote, score, next round, late join tests passed.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{child.kill('SIGTERM');});
