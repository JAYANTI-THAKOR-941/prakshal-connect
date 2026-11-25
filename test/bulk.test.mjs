import test from 'node:test';import assert from 'node:assert/strict';import {prepareBulk,bulkRoute,hasActiveWindow} from '../bulk.mjs';
test('bulk draft checks consent, duplicate phones and personalization',()=>{
 const db={contacts:[{id:'a',name:'Student',phone:'+919999999999',consent:true,consentAt:'2026-01-01',course:'IT'},{id:'b',name:'Duplicate',phone:'+919999999999',consent:true,consentAt:'2026-01-01'},{id:'c',phone:'+918888888888',consent:false}]};
 const d=prepareBulk(db,{ids:['a','b','c'],name:'Notice',message:'Hello {{name}}'});assert.equal(d.rows.length,1);assert.equal(d.rows[0].message,'Hello Student');assert.equal(d.excluded.length,2);assert.throws(()=>prepareBulk(db,{ids:Array(501).fill('a'),name:'x',message:'y'}));assert.equal(d.mode,'draft only');
});
test('bulk routes require admin and offline mode blocks sending',async()=>{await assert.rejects(bulkRoute({p:'/api/bulk/preview',m:'POST',user:{role:'staff'}}),/Admin only/);await assert.rejects(bulkRoute({p:'/api/bulk/send',m:'POST',user:{role:'admin'},localTest:true}),/offline test mode/)});

test('only verified provider-matched inbound timestamps authorize direct text',()=>{
 const now=Date.parse('2026-11-25T12:00:00Z'),provider={phoneId:'123',wabaId:'456'};
 const m={direction:'incoming',mock:false,phoneId:'123',wabaId:'456',verifiedEventAt:'2026-11-25T11:00:00Z'};
 const db={conversations:[{phone:'+919999999999',mock:false,messages:[m]}]};
 assert.equal(hasActiveWindow(db,'+919999999999',provider,now),true);
 assert.equal(hasActiveWindow(db,'+919999999999',{...provider,phoneId:'other'},now),false);
 assert.equal(hasActiveWindow(db,'+919999999999',provider,now+86400000),false);
 delete m.verifiedEventAt;assert.equal(hasActiveWindow(db,'+919999999999',provider,now),false);
});
test('direct text checks confirmation, consent and active window; injectable fake provider',async()=>{
 const cfg={provider:'Meta',enabled:true,phoneId:'123',wabaId:'456'};
 const db={contacts:[{id:'a',name:'Student',phone:'+919999999999',consent:true,consentAt:'2026-01-01'}],conversations:[{phone:'+919999999999',mock:false,messages:[{direction:'incoming',mock:false,phoneId:'123',wabaId:'456',verifiedEventAt:new Date(Date.now()-1000).toISOString()}]}],bulkRuns:[]};
 let calls=0;const b={name:'Notice',message:'Hello {{name}}',ids:['a'],requestId:'test-request-id-123',confirm:'SEND CUSTOM TEXT'};
 const opts={p:'/api/bulk/send',m:'POST',db,user:{role:'admin'},body:async()=>b,save:async()=>{},audit:()=>{},providerStatus:()=>cfg,submit:async({message})=>{calls++;assert.equal(message,'Hello Student');return 'wamid.fake'}};
 const result=await bulkRoute(opts);assert.equal(result.data.recipients[0].status,'Accepted');assert.equal(calls,1);
 await assert.rejects(bulkRoute(opts),/already recorded/);assert.equal(calls,1);
 db.contacts[0].consent=false;b.requestId='test-request-id-456';await assert.rejects(bulkRoute(opts),/No recipients/);
});
