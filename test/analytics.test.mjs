import test from 'node:test';import assert from 'node:assert/strict';import {buildReport,draftMessage,analyticsRoute} from '../analytics.mjs';
test('report separates mock from live, handles IST dates and missing denominators',()=>{
 const db={waCampaigns:[{id:'1',mode:'live',template:'test',createdAt:'2026-11-25T19:00:00Z',recipients:[{status:'read'},{status:'delivered'},{status:'failed'},{status:'Uncertain'}]},{mode:'mock',createdAt:'2026-11-25T19:00:00Z',recipients:[{status:'Mock only'}]}]};
 const d=buildReport(db,{from:'2026-11-26',to:'2026-11-26'});assert.equal(d.live.submitted,3);assert.equal(d.live.deliveryRate,66.7);assert.equal(d.live.readRate,50);assert.equal(d.mock.recipients,1);assert.equal(buildReport(db,{to:'2026-11-25'}).live.deliveryRate,null);assert.throws(()=>buildReport(db,{from:'2026-02-30'}));
});
test('drafts support three languages and report requires admin',async()=>{for(const l of ['en','hi','gu'])assert.match(draftMessage(l,'lecture'),/\{\{name\}\}/);await assert.rejects(analyticsRoute({p:'/api/analytics/report',m:'POST',user:{role:'staff'},db:{},body:async()=>({})}),/Admin only/)});
