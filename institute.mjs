import {randomUUID} from 'node:crypto';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const str=(v,max=200)=>String(v??'').trim().slice(0,max);
const required=(v,label)=>{const x=str(v);if(!x)throw fail(label+' is required');return x};
const phone=v=>{let x=str(v).replace(/[\s()-]/g,'');if(/^\d{10}$/.test(x))x='+91'+x;if(!/^\+[1-9]\d{7,14}$/.test(x))throw fail('Invalid phone number');return x};
const pick=(v,options,def)=>{const x=str(v)||def;if(!options.includes(x))throw fail('Invalid status');return x};
const date=v=>{const x=str(v);if(x&&(!/^\d{4}-\d{2}-\d{2}$/.test(x)||!Number.isFinite(Date.parse(x))||new Date(x).toISOString().slice(0,10)!==x))throw fail('Invalid date');return x};
function normalize(kind,b,db,old={}){
 const x={...old,...b}, id=old.id;
 const unique=(field,val)=>{if(db[kind].some(r=>r.id!==id&&String(r[field]).toLowerCase()===val.toLowerCase()))throw fail('Duplicate '+field)};
 const courseId=()=>{const c=str(x.courseId);if(!db.courses.some(r=>r.id===c))throw fail('Select an existing course');return c};
 if(kind==='courses'){const name=required(x.name,'Course name');unique('name',name);return {name,duration:str(x.duration),description:str(x.description,1000),status:pick(x.status,['Active','Inactive'],'Active')}}
 if(kind==='batches'){const name=required(x.name,'Batch name');const cid=courseId();if(db.batches.some(r=>r.id!==id&&r.courseId===cid&&r.name.toLowerCase()===name.toLowerCase()))throw fail('Duplicate batch');return {name,courseId:cid,startDate:date(x.startDate),timing:str(x.timing),status:pick(x.status,['Upcoming','Active','Completed'],'Upcoming')}}
 const name=required(x.name,'Name'), ph=phone(x.phone),cid=courseId(),email=str(x.email);
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw fail('Invalid email');
 if(kind==='students'){unique('phone',ph);const batchId=str(x.batchId);if(batchId&&!db.batches.some(r=>r.id===batchId&&r.courseId===cid))throw fail('Batch must belong to selected course');return {name,phone:ph,email,courseId:cid,batchId,feeStatus:pick(x.feeStatus,['Pending','Partial','Paid'],'Pending'),status:pick(x.status,['Active','Completed','Withdrawn'],'Active'),admissionDate:date(x.admissionDate)}}
 unique('phone',ph);return {name,phone:ph,email,courseId:cid,status:pick(x.status,['New','Contacted','Follow-up','Converted','Closed'],'New'),followUp:date(x.followUp),notes:str(x.notes,1000)};
}
export async function instituteRoute({p,m,db,user,body,save,audit}){
 const [, , ,kind,id]=p.split('/');
 if(!['students','enquiries','courses','batches'].includes(kind))throw fail('Not found',404);
 const rows=db[kind], out=(data,status=200)=>({data,status});
 if(m==='GET'&&!id)return out(rows);
 if(m==='POST'&&id==='import'){
  if(!['students','enquiries'].includes(kind))throw fail('Import unsupported');
  const b=await body();if(!Array.isArray(b.rows)||b.rows.length>5000)throw fail('Expected up to 5000 rows');
  let added=0;const skipped=[];
  for(const [i,r] of b.rows.entries()){try{const course=db.courses.find(c=>c.name.toLowerCase()===str(r.course).toLowerCase());const batch=str(r.batch)?db.batches.find(c=>c.courseId===course?.id&&c.name.toLowerCase()===str(r.batch).toLowerCase()):null;if(str(r.batch)&&!batch)throw fail('Unknown batch');const n=normalize(kind,{...r,courseId:course?.id,batchId:batch?.id},db);rows.push({...n,id:randomUUID(),createdAt:new Date().toISOString()});added++}catch(e){skipped.push({row:i+2,reason:e.message})}}
  audit(user,'import '+kind+' '+added);await save();return out({added,skipped});
 }
 if(m==='POST'&&!id){const n=normalize(kind,await body(),db);const row={...n,id:randomUUID(),createdAt:new Date().toISOString()};rows.push(row);audit(user,'create '+kind);await save();return out(row,201)}
 const index=rows.findIndex(r=>r.id===id);if(index<0)throw fail('Not found',404);
 if(m==='PATCH'){const old=rows[index],n=normalize(kind,await body(),db,old);if(kind==='batches'&&n.courseId!==old.courseId&&db.students.some(r=>r.batchId===id))throw fail('Batch is assigned to students');rows[index]={...old,...n};audit(user,'update '+kind);await save();return out(rows[index])}
 if(m==='DELETE'){if(user.role!=='admin')throw fail('Admin only',403);if(kind==='courses'&&['batches','students','enquiries'].some(k=>db[k].some(r=>r.courseId===id)))throw fail('Course is referenced by other records');if(kind==='batches'&&db.students.some(r=>r.batchId===id))throw fail('Batch is assigned to students');rows.splice(index,1);audit(user,'delete '+kind);await save();return out({ok:true})}
 if(m==='POST'&&kind==='students'&&id){const row=rows[index];const existing=db.contacts.find(c=>c.phone===row.phone);if(existing)return out({id:existing.id,existing:true});const contact={id:randomUUID(),name:row.name,phone:row.phone,course:db.courses.find(c=>c.id===row.courseId)?.name||'',batch:db.batches.find(c=>c.id===row.batchId)?.name||'',consent:false,consentAt:null};db.contacts.push(contact);audit(user,'create student contact without consent');await save();return out({id:contact.id,existing:false},201)}
 throw fail('Not found',404);
}
