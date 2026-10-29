'use strict';
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {setTimeout:delay}=require('node:timers/promises');
const PORT=3101,child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:String(PORT)},cwd:__dirname});
child.on('error',e=>console.error(e));
const base=`http://127.0.0.1:${PORT}`;
const send=async (url,p)=>{const r=await fetch(base+url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(p)});return {status:r.status,...await r.json()};};
const state=async t=>await (await fetch(base+'/api/state?token='+t)).json();
(async()=>{
  for(let i=0;i<50;i++){try{await fetch(base);break;}catch{await delay(60);}}
  let a=await send('/api/create',{name:'Captain'}),b=await send('/api/join',{code:a.code,name:'Member'});
  assert.equal((await send('/api/action',{token:b.token,type:'chat',value:'Hello captain'})).status,200);
  assert.equal((await state(a.token)).messages.at(-1).text,'Hello captain');
  assert.equal((await send('/api/action',{token:a.token,type:'start'})).status,200);
  for(let round=1;round<=5;round++){
    const da=await state(a.token), db=await state(b.token);
    assert.equal(da.round,round);assert.equal(da.current.options.length,4);
    assert.notEqual(da.current.myClue.kind,db.current.myClue.kind);
    const color=da.current.myClue.detail.split('in ')[1].split('.')[0];
    const symbol=db.current.myClue.detail.split('the ')[1].split(' insignia')[0];
    const eligible=da.current.options.filter(o=>o.colorLabel===color&&o.markLabel===symbol);
    assert.equal(eligible.length,1);
    const id=eligible[0].id;
    await send('/api/action',{token:a.token,type:'vote',value:id});await send('/api/action',{token:b.token,type:'vote',value:id});
    await delay(2250);
    const dr=await state(a.token);assert.equal(dr.current.revealed.success,true);
    if(round<5){assert.equal(dr.stage,'reveal');await send('/api/action',{token:a.token,type:'next'});}
    else {assert.equal(dr.stage,'finished');assert.ok(dr.score>=500);}
  }
  assert.equal((await send('/api/action',{token:a.token,type:'replay'})).status,200);
  assert.equal((await state(b.token)).stage,'lobby');
  assert.equal((await send('/api/action',{token:a.token,type:'leave'})).status,200);
  let newCaptain=await state(b.token);assert.equal(newCaptain.host,true);
  console.log('✅ Full five-round scenario, chat, scores, replay, departure and host handover passed.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{child.kill('SIGTERM');});
