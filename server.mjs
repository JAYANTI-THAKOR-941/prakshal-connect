import http from 'node:http';
import {analyticsRoute} from './analytics.mjs';
import {inboxRoute} from './inbox.mjs';
import {scheduleRoute,runDueJobs} from './scheduler.mjs';
import {whatsappRoute, whatsappWebhook} from './whatsapp.mjs';
import {instituteRoute} from './institute.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const clean=x=>String(x??'').trim();
const hash=x=>createHash('sha256').update(x).digest('hex');
const passwordHash=(p,s=randomBytes(16).toString('hex'))=>s+':'+scryptSync(p,s,64).toString('hex');
function verify(p,h){if(typeof p!=='string'||p.length>256||typeof h!=='string'||!/^([a-f0-9]{32}):([a-f0-9]{128})$/.test(h))return false;const [s]=h.split(':');return timingSafeEqual(Buffer.from(passwordHash(p,s)),Buffer.from(h))}
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
function contact(x){let phone=clean(x.phone).replace(/[\s()-]/g,'');if(/^\d{10}$/.test(phone))phone='+91'+phone;if(!/^\+[1-9]\d{7,14}$/.test(phone))throw fail('Invalid phone number');if(!clean(x.name))throw fail('Name required');return {id:randomUUID(),name:clean(x.name).slice(0,100),phone,course:clean(x.course).slice(0,100),batch:clean(x.batch).slice(0,100),consent:x.consent===true,consentAt:x.consent===true?new Date().toISOString():null}}
const publicUser=({id,email,role})=>({id,email,role});
async function body(req){if(!String(req.headers['content-type']).startsWith('application/json'))throw fail('JSON required',415);let b='';for await(const c of req){b+=c;if(b.length>1000000)throw fail('Request too large',413)}try{return JSON.parse(b||'{}')}catch{throw fail('Invalid JSON')}}
export async function createApp(opts={}){
 const file=opts.file||process.env.DATA_FILE||path.join(root,'data.json');let client,collection,db;
 if(process.env.MONGO_URI&&!opts.file){let MongoClient;try{({MongoClient}=await import('mongodb'))}catch(e){if(e.code==='ERR_MODULE_NOT_FOUND')throw Error('MongoDB driver unavailable. Run npm install, or use npm run start:local for isolated offline testing.');throw e}client=new MongoClient(process.env.MONGO_URI,{serverSelectionTimeoutMS:10000,connectTimeoutMS:10000});try{await client.connect();collection=client.db(process.env.MONGO_DB||'prakshal_connect').collection('workspace');db=(await collection.findOne({_id:'main'}))?.data}catch{await client.close().catch(()=>{});throw Error('MongoDB connection failed. Check network, Atlas IP access and credentials. Use npm run start:local for isolated offline testing.')}}
 else if(fs.existsSync(file))db=JSON.parse(fs.readFileSync(file,'utf8'));
 db={contacts:[],campaigns:[],users:[],audit:[],courses:[],batches:[],students:[],enquiries:[],waCampaigns:[],scheduledJobs:[],conversations:[],...db};
 let pending=Promise.resolve();const save=()=>{const snapshot=JSON.stringify(db);const job=pending.catch(()=>{}).then(async()=>{if(collection)await collection.replaceOne({_id:'main'},{_id:'main',data:JSON.parse(snapshot)},{upsert:true});else{fs.writeFileSync(file+'.tmp',snapshot,{mode:0o600});fs.renameSync(file+'.tmp',file)}});pending=job;return job};
 if(!db.users.length){const email=clean(opts.email||process.env.ADMIN_EMAIL).toLowerCase(),password=opts.password||process.env.ADMIN_PASSWORD;if(!email.includes('@')||typeof password!=='string'||password.length<12||password.length>256)throw Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (12–256 characters) in .env before first start.');db.users.push({id:randomUUID(),email,role:'admin',password:passwordHash(password)});await save()}
 const sessions=new Map(),attempts=new Map();const audit=(u,action)=>{db.audit.unshift({id:randomUUID(),user:u.email,action,at:new Date().toISOString()});db.audit=db.audit.slice(0,1000)};
 const handler=async(req,res)=>{const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data))};try{
 const p=new URL(req.url,'http://localhost').pathname,m=req.method;
 if(opts.localTest&&p.startsWith('/api/whatsapp/'))return send(403,{error:'Cloud API is disabled in offline test mode'});
 if(p==='/api/whatsapp/webhook'){const result=await whatsappWebhook({req,db,save});res.writeHead(result.status,{'Content-Type':'text/plain','Cache-Control':'no-store'});return res.end(result.text)}
 if(!p.startsWith('/api/')){const base=opts.staticDir?path.resolve(opts.staticDir):fs.existsSync(path.join(root,'dist','index.html'))?path.join(root,'dist'):path.join(root,'public');const rel=p==='/'?'index.html':p.slice(1);const target=path.resolve(base,rel);if(!target.startsWith(base+path.sep)||!fs.existsSync(target)||!fs.statSync(target).isFile())return send(404,{error:'Not found'});res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(target)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; frame-ancestors 'none'"});return res.end(fs.readFileSync(target))}
 if(!['GET','HEAD'].includes(m)&&req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`&&req.headers.origin!==`https://${req.headers.host}`)throw fail('Origin rejected',403);
 const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('pc_session='))?.slice(11);const key=token?hash(token):'';const session=sessions.get(key);const user=session&&session.expires>Date.now()?db.users.find(x=>x.id===session.id):null;
 if(p==='/api/login'&&m==='POST'){const ip=req.socket.remoteAddress;let a=attempts.get(ip)||{count:0,until:0};if(a.until<Date.now())a={count:0,until:Date.now()+15*60000};if(a.count>=8)throw fail('Too many attempts. Try later.',429);const b=await body(req);const u=db.users.find(x=>x.email===clean(b.email).toLowerCase());if(!u||!verify(b.password,u.password)){a.count++;attempts.set(ip,a);throw fail('Invalid credentials',401)}attempts.delete(ip);for(const [k,v] of sessions)if(v.expires<Date.now())sessions.delete(k);const t=randomBytes(32).toString('hex');sessions.set(hash(t),{id:u.id,expires:Date.now()+8*3600000});res.setHeader('Set-Cookie',`pc_session=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);audit(u,'login');await save();return send(200,publicUser(u))}
 if(!user)throw fail('Please sign in',401);
 if(p.startsWith('/api/analytics/')){const result=await analyticsRoute({p,m,db,user,body:()=>body(req)});return send(result.status,result.data)}
 if(p.startsWith('/api/inbox/')){const result=await inboxRoute({p,m,db,user,body:()=>body(req),save,audit});return send(result.status,result.data)}
 if(p.startsWith('/api/schedule/')){const result=await scheduleRoute({p,m,db,user,body:()=>body(req),save,audit});return send(result.status,result.data)}
 if(p.startsWith('/api/whatsapp/')){const result=await whatsappRoute({p,m,db,user,body:()=>body(req),save,audit});return send(result.status,result.data)}
 if(p.startsWith('/api/institute/')){const result=await instituteRoute({p,m,db,user,body:()=>body(req),save,audit});return send(result.status,result.data)}
 if(p==='/api/me'&&m==='GET')return send(200,publicUser(user));
 if(p==='/api/logout'&&m==='POST'){sessions.delete(key);res.setHeader('Set-Cookie','pc_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return send(200,{ok:true})}
 if(p==='/api/state'&&m==='GET')return send(200,{contacts:db.contacts,campaigns:db.campaigns,storage:collection?'MongoDB':'Local JSON',mode:'mock'});
 if(p==='/api/users'||p==='/api/audit'){if(user.role!=='admin')throw fail('Admin only',403);if(m==='GET')return send(200,p.endsWith('audit')?db.audit:db.users.map(publicUser));if(p.endsWith('users')&&m==='POST'){const b=await body(req),email=clean(b.email).toLowerCase();if(!/^\S+@\S+\.\S+$/.test(email)||typeof b.password!=='string'||b.password.length<12||b.password.length>256)throw fail('Valid email and password (12–256 characters) required');if(db.users.some(x=>x.email===email))throw fail('Email already exists');const u={id:randomUUID(),email,role:'staff',password:passwordHash(b.password)};db.users.push(u);audit(user,'create staff');await save();return send(201,publicUser(u))}}
 if(p==='/api/contacts'&&m==='POST'){const b=await body(req),rows=Array.isArray(b.contacts)?b.contacts:[b];if(rows.length>5000)throw fail('Maximum 5000 contacts');let added=0,skipped=[];for(const x of rows){try{const c=contact(x);if(db.contacts.some(y=>y.phone===c.phone))throw fail('Duplicate phone');db.contacts.push(c);added++}catch(e){skipped.push({name:clean(x?.name),reason:e.message})}}audit(user,`import/add ${added} contacts`);await save();return send(200,{added,skipped})}
 if(p.startsWith('/api/contacts/')&&['PATCH','DELETE'].includes(m)){const c=db.contacts.find(x=>x.id===p.split('/').pop());if(!c)throw fail('Not found',404);if(m==='DELETE'){if(user.role!=='admin')throw fail('Admin only',403);db.contacts=db.contacts.filter(x=>x.id!==c.id)}else{const b=await body(req);if(typeof b.consent!=='boolean')throw fail('Consent must be boolean');c.consent=b.consent;c.consentAt=c.consent?new Date().toISOString():null}audit(user,m==='DELETE'?'delete contact':'update consent');await save();return send(200,{ok:true})}
 if(p==='/api/campaigns'&&m==='POST'){const b=await body(req);if(!clean(b.name)||!clean(b.message)||clean(b.message).length>4096||!Array.isArray(b.ids))throw fail('Enter campaign name, message and recipients');const eligible=db.contacts.filter(x=>b.ids.includes(x.id)&&x.consent);if(!eligible.length)throw fail('No opted-in recipients');const c={id:randomUUID(),name:clean(b.name),message:clean(b.message),createdAt:new Date().toISOString(),status:'Simulated',recipients:eligible.map(x=>({id:x.id,name:x.name,phone:x.phone,message:clean(b.message).replaceAll('{{name}}',x.name).replaceAll('{{course}}',x.course),status:'Mock only'}))};db.campaigns.unshift(c);audit(user,'simulate campaign');await save();return send(201,c)}
 return send(404,{error:'Not found'});
 }catch(e){return send(e.status||500,{error:e.status?e.message:'Internal server error'})}};
 const timer=opts.disableScheduler?null:setInterval(()=>runDueJobs({db,save}).catch(()=>console.error('Mock scheduler tick failed')),15000);timer?.unref();
 return {handler,close:()=>{if(timer)clearInterval(timer);return client?.close()}};
}
export async function createServer(opts){const app=await createApp(opts);const server=http.createServer(app.handler);server.on('close',()=>app.close());return server}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{const server=await createServer();server.listen(Number(process.env.PORT)||5173,'127.0.0.1',()=>console.log('Prakshal Connect: http://127.0.0.1:'+(process.env.PORT||5173)))}catch(e){console.error(e.message);process.exitCode=1}}
