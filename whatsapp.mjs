import {createHmac,timingSafeEqual,randomUUID} from 'node:crypto';
const err=(message,status=400)=>Object.assign(Error(message),{status});
const config=()=>({enabled:process.env.WA_LIVE_ENABLED==='true',version:process.env.WA_GRAPH_VERSION||'',phone:process.env.WA_PHONE_NUMBER_ID||'',waba:process.env.WA_BUSINESS_ACCOUNT_ID||'',token:process.env.WA_ACCESS_TOKEN||'',secret:process.env.WA_APP_SECRET||'',verify:process.env.WA_WEBHOOK_VERIFY_TOKEN||''});
const configured=c=>/^v\d+\.\d+$/.test(c.version)&&/^\d+$/.test(c.phone)&&/^\d+$/.test(c.waba)&&!!c.token&&!!c.secret&&!!c.verify;
const safeEqual=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y)};
export function signatureValid(raw,signature,secret){return !!secret&&safeEqual(signature||'','sha256='+createHmac('sha256',secret).update(raw).digest('hex'))}
async function graph(c,path,{method='GET',body}={}){
 if(!configured(c))throw err('Configure server-side Meta credentials first',503);
 const r=await fetch('https://graph.facebook.com/'+c.version+'/'+path,{method,headers:{Authorization:'Bearer '+c.token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
 const d=await r.json();if(!r.ok)throw err('Meta API request failed (HTTP '+r.status+', code '+String(d.error?.code||'unknown')+')',502);return d;
}
const demo=[{name:'class_update_demo',language:'en_US',status:'APPROVED',category:'UTILITY',components:[{type:'BODY',text:'Hello {{1}}, your {{2}} class update is available.'}]}];
function supported(t){return t?.status==='APPROVED'&&['UTILITY','MARKETING'].includes(t.category)&&t.components?.every(c=>['BODY','FOOTER'].includes(c.type)||(c.type==='HEADER'&&['IMAGE','VIDEO','DOCUMENT'].includes(c.format)))}
async function templates(c,live){if(!live)return demo;const result=await graph(c,c.waba+'/message_templates?fields=name,language,status,category,components&limit=100');return (result.data||[]).filter(supported)}
export function makePayload(t,contact,fields,media){
 if(!supported(t))throw err('Unsupported or unapproved template');
 const body=t.components.find(c=>c.type==='BODY');const slots=[...String(body?.text||'').matchAll(/\{\{([^}]+)\}\}/g)].map(x=>x[1]);const count=slots.length?Math.max(...slots.map(Number)):0;
 if(!Number.isInteger(count)||count>10||slots.some(s=>!/^[1-9]\d*$/.test(s))||!Array.isArray(fields)||fields.length!==count||fields.some(f=>!['name','course','batch'].includes(f)))throw err('Map all numbered body parameters to contact fields');
 const components=[];if(count){const parameters=fields.map(f=>({type:'text',text:String(contact[f]||'').trim()}));if(parameters.some(p=>!p.text))throw err('Missing contact personalization value');components.push({type:'body',parameters})}
 const header=t.components.find(c=>c.type==='HEADER');if(header){if(!/^\d+$/.test(String(media||'')))throw err('Provide a Meta media ID for the approved header');const type=header.format.toLowerCase();components.push({type:'header',parameters:[{type,[type]:{id:String(media)}}]})}
 return {messaging_product:'whatsapp',to:contact.phone.replace(/^\+/,''),type:'template',template:{name:t.name,language:{code:t.language},...(components.length?{components}:{})}};
}
let active=false;
export async function whatsappRoute({p,m,db,user,body,save,audit}){
 const c=config(),out=(data,status=200)=>({data,status}),live=c.enabled&&configured(c);
 if(p==='/api/whatsapp/config'&&m==='GET')return out({configured:configured(c),liveEnabled:live,mode:live?'live available':'mock only'});
 if(p==='/api/whatsapp/history'&&m==='GET')return out(db.waCampaigns);
 if(user.role!=='admin')throw err('Admin only',403);
 if(p==='/api/whatsapp/test'&&m==='POST'){const d=await graph(c,c.phone+'?fields=id,display_phone_number,verified_name');return out({connected:true,displayPhone:d.display_phone_number,verifiedName:d.verified_name})}
 if(p==='/api/whatsapp/templates'&&m==='GET')return out(await templates(c,live));
 if(p!=='/api/whatsapp/send'||m!=='POST')throw err('Not found',404);
 const b=await body();if(active)throw err('Another campaign is processing',409);active=true;
 try{
 const isLive=b.live===true;if(isLive&&(!live||b.confirm!=='SEND APPROVED TEMPLATE'))throw err('Live mode and explicit confirmation required');
 if(!Array.isArray(b.ids)||!b.ids.length||b.ids.length>25||!/^[a-zA-Z0-9_-]{16,100}$/.test(String(b.requestId||'')))throw err('Select 1–25 recipients and a request ID');
 if(db.waCampaigns.some(x=>x.requestId===b.requestId))throw err('Request already recorded; inspect history',409);
 const t=(await templates(c,isLive||live)).find(t=>t.name===b.template&&t.language===b.language);if(!t)throw err('Approved supported template not found');
 const ids=[...new Set(b.ids)],contacts=ids.map(id=>db.contacts.find(x=>x.id===id));if(contacts.some(x=>!x||!x.consent))throw err('All recipients must have recorded consent');
 const payloads=contacts.map(x=>makePayload(t,x,b.fields||[],b.mediaId));
 const row={id:randomUUID(),requestId:b.requestId,template:t.name,language:t.language,mode:isLive?'live':'mock',createdAt:new Date().toISOString(),recipients:contacts.map(x=>({contactId:x.id,name:x.name,phone:x.phone,status:'Pending'}))};db.waCampaigns.unshift(row);audit(user,'create WhatsApp '+row.mode+' campaign');await save();
 for(let i=0;i<contacts.length;i++){const r=row.recipients[i],current=db.contacts.find(x=>x.id===r.contactId);if(!current?.consent||current.phone!==r.phone){r.status='Skipped';await save();continue}
 if(!isLive){r.status='Mock only';await save();continue}
 r.status='Submitting';await save();
 try{const d=await graph(c,c.phone+'/messages',{method:'POST',body:payloads[i]});if(!d.messages?.[0]?.id)throw Error('Missing message ID');r.messageId=d.messages[0].id;r.status='Accepted'}catch(e){r.status='Uncertain';r.error='Submission not confirmed; do not retry automatically';await save();break}await save();
 }
 for(const r of row.recipients)if(r.status==='Pending')r.status='Not attempted';await save();return out(row,201);
 }finally{active=false}
}
export async function whatsappWebhook({req,db,save}){
 const c=config(),url=new URL(req.url,'http://localhost'),out=(status,text)=>({status,text});
 if(req.method==='GET'){return c.verify&&url.searchParams.get('hub.mode')==='subscribe'&&safeEqual(url.searchParams.get('hub.verify_token')||'',c.verify)?out(200,url.searchParams.get('hub.challenge')||''):out(403,'Forbidden')}
 if(req.method!=='POST')return out(405,'Method not allowed');
 let size=0,parts=[];for await(const part of req){size+=part.length;if(size>1000000)return out(413,'Too large');parts.push(part)}const raw=Buffer.concat(parts);
 if(!signatureValid(raw,req.headers['x-hub-signature-256'],c.secret))return out(403,'Invalid signature');
 let data;try{data=JSON.parse(raw)}catch{return out(400,'Invalid JSON')}
 if(data.object!=='whatsapp_business_account')return out(400,'Invalid object');
 const rank={Accepted:0,sent:1,delivered:2,read:3,failed:1};
 for(const entry of data.entry||[]){if(String(entry.id)!==c.waba)continue;for(const change of entry.changes||[]){const v=change.value;if(String(v?.metadata?.phone_number_id)!==c.phone)continue;
 for(const s of v.statuses||[]){if(!['sent','delivered','read','failed'].includes(s.status))continue;const r=db.waCampaigns.flatMap(x=>x.recipients).find(x=>x.messageId===s.id);if(r&&rank[s.status]>=(rank[r.status]??0)&&!(r.status==='failed'&&s.status==='sent')){r.status=s.status;r.statusAt=String(s.timestamp||'')}}
 for(const msg of v.messages||[]){const text=String(msg.text?.body||'').trim().toLowerCase();if(['stop','unsubscribe','opt out'].includes(text)){const contact=db.contacts.find(x=>x.phone==='+'+msg.from);if(contact){contact.consent=false;contact.consentAt=null}}}
 }}await save();return out(200,'OK')
}
