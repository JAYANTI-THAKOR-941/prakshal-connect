import {randomUUID} from 'node:crypto';
const fail=(message,status=400)=>Object.assign(Error(message),{status});
const clean=(v,n=4096)=>String(v??'').trim().slice(0,n);
export function suggestReply(text){
 const s=clean(text).toLowerCase();
 if(/^(stop|unsubscribe|opt out)$/.test(s))return 'Your opt-out request has been recorded. Thank you.';
 if(/fee|fees|payment|फीस/.test(s))return 'Thank you for contacting Prakshal IT Academy. Our administration team can help with fee details.';
 if(/course|admission|cyber|ccna|python/.test(s))return 'Welcome to Prakshal IT Academy, Gandhinagar. Which course are you interested in? Our admission team can share the details.';
 if(/timing|batch|class|lecture/.test(s))return 'Please share your course and batch name so our team can confirm the class schedule.';
 if(/^(hi|hello|hey|namaste)[!. ]*$/.test(s))return 'Hello! Welcome to Prakshal IT Academy, Gandhinagar. How can we help you today?';
 return 'Thank you for your message. Our team will review your enquiry and respond.';
}
export function recordIncoming(db,msg,{mock=false,now=Date.now(),phoneId='',wabaId=''}={}){
 if(!Array.isArray(db.conversations))db.conversations=[];
 const phone='+'+String(msg?.from||'').replace(/^\+/,'');const providerId=clean(msg?.id,250);
 if(!/^\+[1-9]\d{7,14}$/.test(phone)||!providerId)return null;
 if(db.conversations.some(c=>c.messages.some(m=>m.providerId===providerId&&m.mock===mock)))return null;
 let c=db.conversations.find(c=>c.phone===phone&&c.mock===mock);
 if(!c){const contact=db.contacts.find(x=>x.phone===phone);c={id:randomUUID(),phone,name:contact?.name||phone,mock,status:'Open',assignedTo:null,unread:0,messages:[],notes:[],updatedAt:new Date(now).toISOString()};db.conversations.unshift(c)}
 const type=clean(msg.type||'text',30),text=type==='text'?clean(msg.text?.body):'['+type+' message — media retrieval not enabled]';
 const eventMs=/^\d{1,12}$/.test(String(msg.timestamp||''))?Number(msg.timestamp)*1000:NaN;
 const verifiedEventAt=!mock&&phoneId&&wabaId&&Number.isFinite(eventMs)&&eventMs>0&&eventMs<=now?new Date(eventMs).toISOString():null;
 const incoming={id:randomUUID(),providerId,direction:'incoming',type,text,mock,at:new Date(now).toISOString(),verifiedEventAt,phoneId,wabaId};
 c.messages.push(incoming);c.unread++;c.status='Open';c.updatedAt=incoming.at;
 return c;
}
export async function inboxRoute({p,m,db,user,body,save,audit}){
 const out=(data,status=200)=>({data,status});
 if(p==='/api/inbox/conversations'&&m==='GET')return out(db.conversations.map(({messages,notes,...c})=>({...c,lastMessage:messages.at(-1)?.text||'',messageCount:messages.length})).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)));
 if(p==='/api/inbox/staff'&&m==='GET')return out(db.users.map(({id,email,role})=>({id,email,role})));
 if(p==='/api/inbox/demo'&&m==='POST'){
  if(user.role!=='admin')throw fail('Admin only',403);
  const b=await body(),text=clean(b.text);if(!text)throw fail('Enter demo message');
  const c=recordIncoming(db,{from:'15550100001',id:'mock-'+randomUUID(),type:'text',text:{body:text}},{mock:true});
  audit(user,'create synthetic inbox message');await save();return out(c,201);
 }
 const match=p.match(/^\/api\/inbox\/conversations\/([^/]+)(?:\/(draft|note))?$/);
 if(!match)throw fail('Not found',404);
 const c=db.conversations.find(x=>x.id===match[1]);if(!c)throw fail('Conversation not found',404);
 if(m==='GET'&&!match[2])return out({...c,suggestion:suggestReply([...c.messages].reverse().find(x=>x.direction==='incoming')?.text||'')});
 if(m==='PATCH'&&!match[2]){
  const b=await body();
  if(b.action==='read')c.unread=0;
  else if(b.action==='status'){if(!['Open','Resolved'].includes(b.status))throw fail('Invalid status');c.status=b.status}
  else if(b.action==='assign'){if(user.role!=='admin')throw fail('Admin only',403);if(b.userId!==null&&!db.users.some(x=>x.id===b.userId))throw fail('Unknown staff');c.assignedTo=b.userId}
  else throw fail('Invalid action');
  audit(user,'inbox '+b.action);await save();return out(c);
 }
 if(m==='POST'&&['draft','note'].includes(match[2])){
  const b=await body(),text=clean(b.text);if(!text)throw fail('Text required');
  if(match[2]==='draft'){c.messages.push({id:randomUUID(),direction:'draft',type:'text',text,mock:true,at:new Date().toISOString(),author:user.email});c.updatedAt=new Date().toISOString()}
  else c.notes.push({id:randomUUID(),text,author:user.email,at:new Date().toISOString()});
  audit(user,'save inbox '+match[2]);await save();return out(c,201);
 }
 throw fail('Not found',404);
}
