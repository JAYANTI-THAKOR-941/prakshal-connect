import test from 'node:test';import assert from 'node:assert/strict';import {prepareBulk,bulkRoute} from '../bulk.mjs';
test('bulk draft checks consent, duplicate phones and personalization',()=>{
 const db={contacts:[{id:'a',name:'Student',phone:'+919999999999',consent:true,consentAt:'2026-01-01',course:'IT'},{id:'b',name:'Duplicate',phone:'+919999999999',consent:true,consentAt:'2026-01-01'},{id:'c',phone:'+918888888888',consent:false}]};
 const d=prepareBulk(db,{ids:['a','b','c'],name:'Notice',message:'Hello {{name}}'});assert.equal(d.rows.length,1);assert.equal(d.rows[0].message,'Hello Student');assert.equal(d.excluded.length,2);assert.throws(()=>prepareBulk(db,{ids:Array(501).fill('a'),name:'x',message:'y'}));assert.equal(d.mode,'draft only');
});
test('bulk routes require admin and never send',async()=>{await assert.rejects(bulkRoute({p:'/api/bulk/preview',m:'POST',user:{role:'staff'}}),/Admin only/);await assert.rejects(bulkRoute({p:'/api/bulk/send',m:'POST',user:{role:'admin'}}),/Not found/)});
