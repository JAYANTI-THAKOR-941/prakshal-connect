import test from 'node:test';import assert from 'node:assert/strict';import {scheduleRoute,runDueJobs} from '../scheduler.mjs';
test('mock schedule validates consent, deduplicates, pauses and checks consent again',async()=>{
 const now=Date.parse('2026-11-25T10:00:00Z'),db={scheduledJobs:[],contacts:[{id:'a',name:'Demo',consent:true},{id:'b',name:'No',consent:false}],students:[],enquiries:[],courses:[]};
 const call=(p,m,b,role='admin')=>scheduleRoute({p:'/api/schedule/'+p,m,db,user:{role},body:async()=>b,save:async()=>{},audit:()=>{},now});
 const b={name:'Demo',type:'fee',message:'Hello {{name}}',ids:['a'],runAt:'2026-11-25T11:00:00Z'};
 await assert.rejects(call('jobs','POST',{...b,ids:['b']}),/opted in/);
 await assert.rejects(call('jobs','POST',b,'staff'),/Admin only/);
 const j=(await call('jobs','POST',b)).data;await assert.rejects(call('jobs','POST',b),/Duplicate/);
 await call('jobs/'+j.id,'PATCH',{action:'pause'});await runDueJobs({db,save:async()=>{},now:now+7200000});assert.equal(j.status,'Paused');
 await call('jobs/'+j.id,'PATCH',{action:'resume'});db.contacts[0].consent=false;
 await runDueJobs({db,save:async()=>{},now:now+7200000});assert.equal(j.status,'Simulated');assert.match(j.recipients[0].status,/Skipped/);
 await runDueJobs({db,save:async()=>{},now:now+7200000});assert.equal(j.recipients.length,1);
});
