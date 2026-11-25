const fail=(message,status=400)=>Object.assign(Error(message),{status});
const list=x=>Array.isArray(x)?x:[];
const dateKey=value=>{const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);return ['year','month','day'].map(k=>parts.find(p=>p.type===k)?.value).join('-')};
function validDate(x){return typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x}
const pct=(a,b)=>b?Math.round(a/b*1000)/10:null;
export function buildReport(db,{from='',to=''}={}){
 if((from&&!validDate(from))||(to&&!validDate(to))||(from&&to&&from>to))throw fail('Invalid date range');
 const inRange=x=>{if(!from&&!to)return true;const d=dateKey(x);return !!d&&(!from||d>=from)&&(!to||d<=to)};
 const live=list(db.waCampaigns).filter(c=>c.mode==='live'&&inRange(c.createdAt)),mock=list(db.waCampaigns).filter(c=>c.mode==='mock'&&inRange(c.createdAt));
 const stats=c=>{const r=list(c.recipients),n=s=>r.filter(x=>x.status===s).length;return {recipients:r.length,accepted:n('Accepted'),sent:n('sent'),delivered:n('delivered'),read:n('read'),failed:n('failed'),uncertain:n('Uncertain')+n('Submitting'),other:r.filter(x=>!['Accepted','sent','delivered','read','failed','Uncertain','Submitting'].includes(x.status)).length}};
 const rows=live.map(c=>({id:c.id,name:c.template,date:dateKey(c.createdAt),...stats(c)}));
 const total=rows.reduce((a,r)=>{for(const k of Object.keys(a))a[k]+=r[k];return a},{recipients:0,accepted:0,sent:0,delivered:0,read:0,failed:0,uncertain:0,other:0});
 const submitted=total.accepted+total.sent+total.delivered+total.read+total.failed;
 const delivered=total.delivered+total.read;
 const students=list(db.students),enquiries=list(db.enquiries),courses=list(db.courses);
 const courseRows=courses.map(c=>({course:c.name,students:students.filter(s=>s.courseId===c.id).length,enquiries:enquiries.filter(s=>s.courseId===c.id).length,converted:enquiries.filter(s=>s.courseId===c.id&&s.status==='Converted').length}));
 const fee=['Pending','Partial','Paid','Unspecified'].map(status=>({status,count:students.filter(s=>(['Pending','Partial','Paid'].includes(s.feeStatus)?s.feeStatus:'Unspecified')===status).length}));
 const conv=list(db.conversations).filter(c=>!c.mock),incoming=conv.flatMap(c=>list(c.messages).filter(m=>m.direction==='incoming'&&!m.mock&&inRange(m.at))).length;
 const staff=list(db.users).map(u=>({staff:u.email,assigned:conv.filter(c=>c.assignedTo===u.id).length,resolved:conv.filter(c=>c.assignedTo===u.id&&c.status==='Resolved').length}));
 return {from,to,live:{...total,submitted,deliveryRate:pct(delivered,submitted),readRate:pct(total.read,delivered)},campaigns:rows,mock:{campaigns:list(db.campaigns).filter(c=>inRange(c.createdAt)).length+mock.length,recipients:list(db.campaigns).filter(c=>inRange(c.createdAt)).reduce((n,c)=>n+list(c.recipients).filter(r=>r.status==='Mock only').length,0)+mock.reduce((n,c)=>n+list(c.recipients).filter(r=>r.status==='Mock only').length,0),scheduled:list(db.scheduledJobs).filter(j=>j.status==='Simulated'&&inRange(j.completedAt)).length},snapshot:{students:students.length,enquiries:enquiries.length,contacts:list(db.contacts).length,optedIn:list(db.contacts).filter(c=>c.consent).length,open:conv.filter(c=>c.status==='Open').length,resolved:conv.filter(c=>c.status==='Resolved').length},incoming,courseRows,fee,staff};
}
const drafts={
 en:{lecture:'Hello {{name}}, this is a reminder about your {{course}} lecture. Please confirm the timing with your faculty.',fee:'Hello {{name}}, please contact our administration office regarding your {{course}} fee status.',admission:'Hello {{name}}, thank you for your interest in {{course}}. Our admission team can share course details.',holiday:'Hello {{name}}, please check with your faculty for the holiday schedule.',exam:'Hello {{name}}, please contact your faculty for the {{course}} examination schedule.'},
 hi:{lecture:'नमस्ते {{name}}, आपकी {{course}} कक्षा के लिए यह एक रिमाइंडर है। कृपया अपने शिक्षक से समय की पुष्टि करें।',fee:'नमस्ते {{name}}, कृपया {{course}} की फीस की जानकारी के लिए कार्यालय से संपर्क करें।',admission:'नमस्ते {{name}}, {{course}} में रुचि दिखाने के लिए धन्यवाद। हमारी एडमिशन टीम आपको जानकारी दे सकती है।',holiday:'नमस्ते {{name}}, कृपया छुट्टी की जानकारी के लिए अपने शिक्षक से संपर्क करें।',exam:'नमस्ते {{name}}, कृपया {{course}} परीक्षा की जानकारी के लिए अपने शिक्षक से संपर्क करें।'},
 gu:{lecture:'નમસ્તે {{name}}, તમારા {{course}} ક્લાસ માટે આ રિમાઇન્ડર છે. કૃપા કરીને ફેકલ્ટી પાસે સમયની ખાતરી કરો.',fee:'નમસ્તે {{name}}, કૃપા કરીને {{course}} ની ફીની માહિતી માટે ઓફિસનો સંપર્ક કરો.',admission:'નમસ્તે {{name}}, {{course}} માં રસ દર્શાવવા બદલ આભાર. અમારી એડમિશન ટીમ તમને માહિતી આપી શકે છે.',holiday:'નમસ્તે {{name}}, રજાની માહિતી માટે કૃપા કરીને ફેકલ્ટીનો સંપર્ક કરો.',exam:'નમસ્તે {{name}}, {{course}} પરીક્ષાની માહિતી માટે કૃપા કરીને ફેકલ્ટીનો સંપર્ક કરો.'}
};
export function draftMessage(language,type){if(!Object.hasOwn(drafts,language)||!Object.hasOwn(drafts[language],type))throw fail('Unsupported draft type');return drafts[language][type]+'\n\nPrakshal IT Academy, Gandhinagar'}
export async function analyticsRoute({p,m,db,user,body}){
 if(p==='/api/analytics/report'&&m==='POST'){if(user.role!=='admin')throw fail('Admin only',403);return {status:200,data:buildReport(db,await body())}}
 if(p==='/api/analytics/draft'&&m==='POST'){const b=await body();return {status:200,data:{text:draftMessage(b.language,b.type),source:'Local multilingual template'}}}
 throw fail('Not found',404);
}
