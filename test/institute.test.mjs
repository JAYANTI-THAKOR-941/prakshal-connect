import test from 'node:test';
import assert from 'node:assert/strict';
import {instituteRoute} from '../institute.mjs';
test('institute records, links, import and consent-safe contact creation',async()=>{
 const db={courses:[],batches:[],students:[],enquiries:[],contacts:[]};
 const call=(kind,m='GET',b={},id='',role='admin')=>instituteRoute({p:'/api/institute/'+kind+(id?'/'+id:''),m,db,user:{role},body:async()=>b,save:async()=>{},audit:()=>{}});
 const c=(await call('courses','POST',{name:'Cyber Security'})).data;
 const b=(await call('batches','POST',{name:'Morning',courseId:c.id})).data;
 const s=(await call('students','POST',{name:'Demo',phone:'9999999999',courseId:c.id,batchId:b.id})).data;
 await assert.rejects(call('courses','DELETE',{},c.id),/referenced/);
 await assert.rejects(call('students','DELETE',{},s.id,'staff'),/Admin only/);
 await assert.rejects(call('students','POST',{name:'Demo 2',phone:'9999999999',courseId:c.id}),/Duplicate/);
 await call('students','POST',{},s.id);assert.equal(db.contacts[0].consent,false);
 const imp=await call('students','POST',{rows:[{name:'Example',phone:'8888888888',course:'Cyber Security',batch:'Morning'},{name:'Invalid',phone:'bad',course:'Cyber Security'}]},'import');assert.equal(imp.data.added,1);assert.equal(imp.data.skipped.length,1);
 const e=(await call('enquiries','POST',{name:'Lead',phone:'7777777777',courseId:c.id})).data;
 await call('enquiries','PATCH',{status:'Follow-up',followUp:'2026-12-01'},e.id);
 assert.equal(db.enquiries[0].status,'Follow-up');
});
