import test from 'node:test';import assert from 'node:assert/strict';import {recordIncoming,inboxRoute,suggestReply} from '../inbox.mjs';
test('inbox deduplication, assignment, drafts and resolution',async()=>{
 const db={contacts:[],conversations:[],users:[{id:'admin',email:'admin@example.com',role:'admin'}]};
 const msg={id:'wamid.test',from:'15550100001',type:'text',text:{body:'course details'}};
 const c=recordIncoming(db,msg);assert.equal(c.unread,1);assert.equal(recordIncoming(db,msg),null);assert.match(suggestReply('course details'),/course/);
 const call=(p,m,b,role='admin')=>inboxRoute({p:'/api/inbox/'+p,m,db,user:{email:'test@example.com',role},body:async()=>b,save:async()=>{},audit:()=>{}});
 const p='conversations/'+c.id;
 await assert.rejects(call(p,'PATCH',{action:'assign',userId:'admin'},'staff'),/Admin only/);
 await call(p,'PATCH',{action:'assign',userId:'admin'});assert.equal(c.assignedTo,'admin');
 await call(p+'/draft','POST',{text:'Review reply'});assert.equal(c.messages.at(-1).direction,'draft');
 await call(p,'PATCH',{action:'read'});assert.equal(c.unread,0);
 await call(p,'PATCH',{action:'status',status:'Resolved'});assert.equal(c.status,'Resolved');
 recordIncoming(db,{...msg,id:'wamid.new'});assert.equal(c.status,'Open');
});
