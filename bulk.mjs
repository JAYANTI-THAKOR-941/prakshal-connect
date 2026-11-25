import {randomUUID} from 'node:crypto';
import {bulkProviderStatus,submitBulkText,uploadBulkMedia,submitBulkMedia} from './whatsapp.mjs';
import {validateAttachment} from './media.mjs';
const fail=(message,status=400)=>Object.assign(Error(message),{status});
const clean=(x,n)=>String(x??'').trim().slice(0,n);
export const MAX_RECIPIENTS=500;
export function prepareBulk(db,b){
 if(!Array.isArray(b.ids)||!b.ids.length||b.ids.length>MAX_RECIPIENTS||b.ids.some(x=>typeof x!=='string'))throw fail('Select 1–500 contacts');
 const name=clean(b.name,120),message=clean(b.message,4096);
 if(!name||!message||String(b.message).length>4096)throw fail('Campaign name and message (up to 4096 characters) required');
 const ids=[...new Set(b.ids)],phones=new Set(),rows=[],excluded=[];
 for(const id of ids){
  const c=db.contacts.find(x=>x.id===id);
  if(!c?.consent||!c.consentAt){excluded.push({id,reason:'No recorded consent or contact missing'});continue}
  if(!/^\+[1-9]\d{7,14}$/.test(c.phone)||phones.has(c.phone)){excluded.push({id,reason:'Invalid or duplicate number'});continue}
  const text=message.replace(/\{\{(name|course|batch)\}\}/g,(_,k)=>String(c[k]??''));
  if(!text.trim()||text.length>4096){excluded.push({id,reason:'Personalized message invalid'});continue}
  phones.add(c.phone);rows.push({id,name:c.name,phone:c.phone,course:c.course||'',batch:c.batch||'',message:text});
 }
 return {name,message,ids,rows,excluded,mode:'draft only',provider:'Not connected'};
}
export function hasActiveWindow(db,phone,provider,now=Date.now()){
 if(!provider.phoneId||!provider.wabaId)return false;
 return (db.conversations||[]).some(c=>c.phone===phone&&!c.mock&&c.messages.some(m=>{
  const t=Date.parse(m.verifiedEventAt||'');
  return m.direction==='incoming'&&!m.mock&&m.phoneId===provider.phoneId&&m.wabaId===provider.wabaId&&Number.isFinite(t)&&t<=now&&now-t<86400000;
 }));
}
export function reviewLive(db,draft,provider,now=Date.now()){
 return {...draft,provider:provider.provider,liveEnabled:provider.enabled,rows:draft.rows.map(r=>({...r,canSend:hasActiveWindow(db,r.phone,provider,now)}))};
}
const running=new WeakSet();
export async function bulkRoute({p,m,db,user,body,save,audit,localTest=false,providerStatus=bulkProviderStatus,submit=submitBulkText}){
 if(user.role!=='admin')throw fail('Admin only',403);
 const out=(data,status=200)=>({data,status});
 const provider=()=>{const v=providerStatus();return {...v,enabled:!localTest&&v.enabled}};
 if(p==='/api/bulk/preview'&&m==='POST')return out(reviewLive(db,prepareBulk(db,await body()),provider()));
 if(p==='/api/bulk/history'&&m==='GET')return out((db.bulkRuns||[]).slice(0,30));
 if(p==='/api/bulk/send'&&m==='POST'){
  if(localTest)throw fail('Live delivery disabled in offline test mode',403);
  const b=await body(),cfg=provider();
  if(!cfg.enabled)throw fail('Enable live Meta API and configure verified incoming webhooks first',403);
  if(b.confirm!=='SEND CUSTOM TEXT'||!/^[a-zA-Z0-9_-]{16,100}$/.test(String(b.requestId||'')))throw fail('Explicit confirmation and request ID required');
  if(running.has(db))throw fail('Another direct-message campaign is processing',409);
  running.add(db);
  try{
   db.bulkRuns??=[];
   if(db.bulkRuns.some(r=>r.requestId===b.requestId))throw fail('Request already recorded; check history',409);
   if(db.bulkRuns.length>=100)throw fail('Campaign storage limit reached; contact administrator',409);
   const attachment=b.attachment?validateAttachment(b.attachment):null;
   const draft=reviewLive(db,prepareBulk(db,b),cfg);
   if(attachment&&(attachment.kind==='audio'||draft.rows.some(r=>r.message.length>1024)))throw fail('Media captions must be up to 1024 characters; audio with captions is not supported');
   const eligible=draft.rows.filter(r=>r.canSend);
   if(!eligible.length)throw fail('No recipients with an active verified 24-hour conversation');
   if(eligible.length>25)throw fail('Pilot safety limit: select at most 25 eligible recipients per live campaign');
   const row={id:randomUUID(),requestId:b.requestId,name:draft.name,createdAt:new Date().toISOString(),mode:'live',recipients:draft.rows.map(r=>({contactId:r.id,name:r.name,phone:r.phone,status:r.canSend?'Pending':'Skipped — template required'}))};
   db.bulkRuns.unshift(row);audit(user,'create direct-text campaign');await save();
   let media=null;if(attachment){try{media=await uploadBulkMedia(b.attachment,cfg);row.attachment={name:media.name,kind:media.kind};await save()}catch(e){for(const r of row.recipients)if(r.status==='Pending'){r.status='Not attempted';r.error='Media upload failed'}await save();throw e}}
   for(const r of row.recipients){
    if(r.status!=='Pending')continue;
    const c=db.contacts.find(x=>x.id===r.contactId),current=provider();
    if(!c?.consent||!c.consentAt||c.phone!==r.phone||!current.enabled||current.phoneId!==cfg.phoneId||current.wabaId!==cfg.wabaId||!hasActiveWindow(db,r.phone,current)){r.status='Skipped';await save();continue}
    r.status='Submitting';await save();
    if(!c.consent||!hasActiveWindow(db,r.phone,current)){r.status='Skipped';await save();continue}
    try{r.messageId=await (media?submitBulkMedia:submit)({phone:r.phone,message:eligible.find(x=>x.id===r.contactId).message,phoneId:cfg.phoneId,wabaId:cfg.wabaId,media});r.status='Accepted'}
    catch{r.status='Uncertain';r.error='Submission not confirmed. Check provider history before retrying.';await save();break}
    await save();
   }
   for(const r of row.recipients)if(r.status==='Pending')r.status='Not attempted';
   await save();return out(row,201);
  }finally{running.delete(db)}
 }
 if(p==='/api/bulk/drafts'&&m==='GET')return out(db.bulkDrafts.map(({id,name,message,ids,createdAt})=>({id,name,message,ids,createdAt})));
 if(p==='/api/bulk/drafts'&&m==='POST'){
  const draft=prepareBulk(db,await body());if(!draft.rows.length)throw fail('No eligible contacts');
  if(db.bulkDrafts.length>=100)throw fail('Delete an old draft before saving another');
  const row={id:randomUUID(),name:draft.name,message:draft.message,ids:draft.rows.map(r=>r.id),createdAt:new Date().toISOString()};
  db.bulkDrafts.unshift(row);audit(user,'save bulk announcement draft');await save();return out(row,201);
 }
 const match=p.match(/^\/api\/bulk\/drafts\/([^/]+)$/);
 if(match&&m==='DELETE'){const i=db.bulkDrafts.findIndex(x=>x.id===match[1]);if(i<0)throw fail('Draft not found',404);db.bulkDrafts.splice(i,1);audit(user,'delete bulk draft');await save();return out({ok:true})}
 throw fail('Not found',404);
}
