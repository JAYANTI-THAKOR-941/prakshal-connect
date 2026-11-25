import {randomUUID} from 'node:crypto';
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
export async function bulkRoute({p,m,db,user,body,save,audit}){
 if(user.role!=='admin')throw fail('Admin only',403);
 const out=(data,status=200)=>({data,status});
 if(p==='/api/bulk/preview'&&m==='POST')return out(prepareBulk(db,await body()));
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
