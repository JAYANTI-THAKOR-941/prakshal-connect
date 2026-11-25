import {randomUUID} from 'node:crypto';
const fail=(message,status=400)=>Object.assign(Error(message),{status});
export const presets={
 fee:'Hello {{name}}, please contact the office regarding your pending {{course}} course fees.',
 enquiry:'Hello {{name}}, following up on your interest in {{course}}. Please contact our admission team.',
 lecture:'Hello {{name}}, this is a reminder about your upcoming {{course}} lecture.',
 holiday:'Hello {{name}}, please contact the institute for the holiday schedule.',
 exam:'Hello {{name}}, please check the upcoming {{course}} examination schedule.',
 custom:''
};
const clean=(v,n=4096)=>String(v??'').trim().slice(0,n);
const render=(msg,c)=>msg.replaceAll('{{name}}',c.name).replaceAll('{{course}}',c.course||'').replaceAll('{{batch}}',c.batch||'');
const locks=new WeakSet();
export async function runDueJobs({db,save,now=Date.now()}){
 if(locks.has(db))return;locks.add(db);
 try{
  for(const job of db.scheduledJobs){
   if(job.status!=='Scheduled'||Date.parse(job.runAt)>now)continue;
   // All jobs are simulation-only. No network calls.
   const recipients=job.ids.map(id=>{const c=db.contacts.find(x=>x.id===id);return c?.consent?{contactId:id,name:c.name,status:'Mock only',message:render(job.message,c)}:{contactId:id,status:'Skipped — no consent or missing contact'}});
   job.recipients=recipients;job.status='Simulated';job.completedAt=new Date(now).toISOString();await save();
  }
 }finally{locks.delete(db)}
}
export function reminderCandidates(db,type,today){
 const courseName=id=>db.courses.find(c=>c.id===id)?.name||'';
 let rows=[];
 if(type==='fee')rows=db.students.filter(s=>s.status==='Active'&&['Pending','Partial'].includes(s.feeStatus));
 if(type==='enquiry')rows=db.enquiries.filter(e=>e.followUp&&e.followUp<=today&&!['Closed','Converted'].includes(e.status));
 return rows.map(r=>{const c=db.contacts.find(x=>x.phone===r.phone&&x.consent);return c?{id:c.id,name:c.name,course:courseName(r.courseId)}:null}).filter(Boolean);
}
export async function scheduleRoute({p,m,db,user,body,save,audit,now=Date.now()}){
 const out=(data,status=200)=>({data,status});
 if(p==='/api/schedule/jobs'&&m==='GET')return out(db.scheduledJobs);
 if(p==='/api/schedule/candidates'&&m==='GET'){
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
  return out({fee:reminderCandidates(db,'fee',today),enquiry:reminderCandidates(db,'enquiry',today)});
 }
 if(user.role!=='admin')throw fail('Admin only',403);
 if(p==='/api/schedule/jobs'&&m==='POST'){
  const b=await body(),name=clean(b.name,120),message=clean(b.message),type=clean(b.type,30),runAt=Date.parse(b.runAt);
  if(!name||!message||!Object.hasOwn(presets,type)||!Number.isFinite(runAt)||runAt<=now||runAt>now+365*86400000||!/(Z|[+-]\d\d:\d\d)$/.test(String(b.runAt)))throw fail('Provide a name, message and future date with timezone (within one year)');
  if(!Array.isArray(b.ids)||b.ids.length<1||b.ids.length>100||b.ids.some(id=>typeof id!=='string'))throw fail('Select 1–100 recipients');
  const ids=[...new Set(b.ids)].sort();
  if(ids.some(id=>!db.contacts.some(c=>c.id===id&&c.consent)))throw fail('All recipients must be opted in');
  if(db.scheduledJobs.some(j=>['Scheduled','Paused','Simulated'].includes(j.status)&&j.runAt===new Date(runAt).toISOString()&&j.message===message&&JSON.stringify(j.ids)===JSON.stringify(ids)))throw fail('Duplicate scheduled job',409);
  const job={id:randomUUID(),name,type,message,ids,runAt:new Date(runAt).toISOString(),status:'Scheduled',mode:'mock',createdAt:new Date(now).toISOString(),recipients:[]};
  db.scheduledJobs.unshift(job);audit(user,'schedule mock reminder');await save();return out(job,201);
 }
 const match=p.match(/^\/api\/schedule\/jobs\/([^/]+)$/);
 if(match&&m==='PATCH'){
  const b=await body(),j=db.scheduledJobs.find(x=>x.id===match[1]);if(!j)throw fail('Job not found',404);
  if(b.action==='pause'&&j.status==='Scheduled')j.status='Paused';
  else if(b.action==='resume'&&j.status==='Paused'){if(Date.parse(j.runAt)<=now)throw fail('Scheduled time has passed; create a new job');j.status='Scheduled'}
  else if(b.action==='cancel'&&['Scheduled','Paused'].includes(j.status))j.status='Cancelled';
  else throw fail('Invalid job transition');
  audit(user,'schedule '+b.action);await save();return out(j);
 }
 throw fail('Not found',404);
}
