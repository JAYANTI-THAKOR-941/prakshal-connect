/**
 * whatsapp.mjs – Prakshal Connect WhatsApp Cloud API Integration
 * Official Meta WhatsApp Cloud API v23.0
 * Fixed: separated outbound-config check from webhook-config check,
 *        proper error propagation, rich error messages.
 */
import {createHmac,timingSafeEqual,randomUUID} from 'node:crypto';
import {recordIncoming} from './inbox.mjs';
import {validateAttachment} from './media.mjs';

const err = (message, status = 400) => Object.assign(Error(message), {status});

/* ── Config helpers ─────────────────────────────────────────────────────── */
const config = () => ({
  enabled  : process.env.WA_LIVE_ENABLED === 'true',
  version  : (process.env.WA_GRAPH_VERSION || '').trim(),
  phone    : (process.env.WA_PHONE_NUMBER_ID || '').trim(),
  waba     : (process.env.WA_BUSINESS_ACCOUNT_ID || '').trim(),
  token    : (process.env.WA_ACCESS_TOKEN || '').trim(),
  secret   : (process.env.WA_APP_SECRET || '').trim(),
  verify   : (process.env.WA_WEBHOOK_VERIFY_TOKEN || '').trim(),
});

/** Only outbound (messaging) credentials – does NOT require webhook creds */
const outboundReady = c =>
  /^v\d+\.\d+$/.test(c.version) &&
  /^\d+$/.test(c.phone) &&
  /^\d+$/.test(c.waba) &&
  c.token.length > 0;

/** Full config: outbound + webhook (used only for webhook validation) */
const webhookReady = c => outboundReady(c) && !!c.secret && !!c.verify;

/** Timing-safe string comparison */
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

export function signatureValid(raw, signature, secret) {
  return !!secret && safeEqual(
    signature || '',
    'sha256=' + createHmac('sha256', secret).update(raw).digest('hex')
  );
}

/* ── Meta Graph API caller ───────────────────────────────────────────────── */
async function graph(c, path, {method = 'GET', body} = {}) {
  if (!outboundReady(c)) {
    const missing = [];
    if (!/^v\d+\.\d+$/.test(c.version)) missing.push('WA_GRAPH_VERSION (must be like v23.0)');
    if (!/^\d+$/.test(c.phone))          missing.push('WA_PHONE_NUMBER_ID (digits only)');
    if (!/^\d+$/.test(c.waba))           missing.push('WA_BUSINESS_ACCOUNT_ID (digits only)');
    if (!c.token)                         missing.push('WA_ACCESS_TOKEN');
    throw err('Missing or invalid credentials: ' + missing.join(', '), 503);
  }

  let r, d;
  try {
    r = await fetch(
      `https://graph.facebook.com/${c.version}/${path}`,
      {
        method,
        headers: {
          Authorization : 'Bearer ' + c.token,
          'Content-Type': 'application/json',
        },
        ...(body ? {body: JSON.stringify(body)} : {}),
        signal: AbortSignal.timeout(15000),
      }
    );
  } catch (fetchErr) {
    // Network / DNS / timeout errors
    if (fetchErr.name === 'TimeoutError' || fetchErr.name === 'AbortError') {
      throw err('Meta API request timed out (15 s). Check internet connectivity.', 504);
    }
    if (fetchErr.cause?.code === 'ENOTFOUND' || fetchErr.cause?.code === 'EAI_AGAIN') {
      throw err('DNS resolution failed for graph.facebook.com. Check internet connectivity.', 503);
    }
    if (fetchErr.cause?.code === 'ECONNREFUSED') {
      throw err('Connection refused by Meta API. Check firewall/proxy settings.', 503);
    }
    throw err('Network error reaching Meta API: ' + fetchErr.message, 503);
  }

  try {
    d = await r.json();
  } catch {
    throw err(`Meta API returned non-JSON response (HTTP ${r.status})`, 502);
  }

  if (!r.ok) {
    const e = d?.error || {};
    const code    = e.code    || 'unknown';
    const subcode = e.error_subcode ? ` / ${e.error_subcode}` : '';
    const fbtrace = e.fbtrace_id ? ` [trace:${e.fbtrace_id}]` : '';
    const userMsg = e.error_user_msg || e.message || 'Unknown Meta API error';

    // Translate common Meta error codes to actionable messages
    let hint = '';
    if (code === 190)  hint = ' — Access token is invalid or expired. Generate a new token from Meta for Developers.';
    else if (code === 10)   hint = ' — Missing permission. Ensure the app has whatsapp_business_messaging permission.';
    else if (code === 100)  hint = ' — Invalid parameter or Phone Number ID. Verify WA_PHONE_NUMBER_ID.';
    else if (code === 200 || code === 368) hint = ' — Account or message policy violation.';
    else if (code === 80007) hint = ' — Rate limit exceeded. Wait before retrying.';
    else if (code === 131026) hint = ' — Recipient phone number not in a supported region or not on WhatsApp.';
    else if (code === 131047) hint = ' — Re-engagement message outside the 24-hour window requires an approved template.';

    throw err(
      `Meta API error (HTTP ${r.status}, code ${code}${subcode}): ${userMsg}${hint}${fbtrace}`,
      r.status >= 500 ? 502 : 400
    );
  }

  return d;
}

/* ── Template helpers ───────────────────────────────────────────────────── */
const demo = [
  {
    name      : 'hello_world',
    language  : 'en_US',
    status    : 'APPROVED',
    category  : 'UTILITY',
    components: [{type: 'BODY', text: 'Hello World'}],
  },
  {
    name      : 'class_update_demo',
    language  : 'en_US',
    status    : 'APPROVED',
    category  : 'UTILITY',
    components: [{type: 'BODY', text: 'Hello {{1}}, your {{2}} class update is available.'}],
  },
];

function supported(t) {
  return (
    t?.status === 'APPROVED' &&
    ['UTILITY', 'MARKETING'].includes(t.category) &&
    t.components?.every(c =>
      ['BODY', 'FOOTER'].includes(c.type) ||
      (c.type === 'HEADER' && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(c.format))
    )
  );
}

async function templates(c, live) {
  if (!live) return demo;
  const result = await graph(c, `${c.waba}/message_templates?fields=name,language,status,category,components&limit=100`);
  return (result.data || []).filter(supported);
}

/* ── Payload builder ────────────────────────────────────────────────────── */
export function makePayload(t, contact, fields, media) {
  if (!supported(t)) throw err('Unsupported or unapproved template');

  const bodyComp = t.components.find(c => c.type === 'BODY');
  const slots    = [...String(bodyComp?.text || '').matchAll(/\{\{([^}]+)\}\}/g)].map(x => x[1]);
  const count    = slots.length ? Math.max(...slots.map(Number)) : 0;

  if (
    !Number.isInteger(count) ||
    count > 10 ||
    slots.some(s => !/^[1-9]\d*$/.test(s)) ||
    !Array.isArray(fields) ||
    fields.length !== count ||
    fields.some(f => !['name', 'course', 'batch'].includes(f))
  ) throw err('Map all numbered body parameters to contact fields');

  const components = [];
  if (count) {
    const parameters = fields.map(f => ({type: 'text', text: String(contact[f] || '').trim()}));
    if (parameters.some(p => !p.text)) throw err('Missing contact personalization value');
    components.push({type: 'body', parameters});
  }

  const header = t.components.find(c => c.type === 'HEADER');
  if (header) {
    if (!/^\d+$/.test(String(media || ''))) throw err('Provide a Meta media ID for the approved header');
    const type = header.format.toLowerCase();
    components.push({type: 'header', parameters: [{type, [type]: {id: String(media)}}]});
  }

  return {
    messaging_product: 'whatsapp',
    to      : contact.phone.replace(/^\+/, ''),
    type    : 'template',
    template: {
      name    : t.name,
      language: {code: t.language},
      ...(components.length ? {components} : {}),
    },
  };
}

/* ── Route handler ───────────────────────────────────────────────────────── */
let active = false;

export async function whatsappRoute({p, m, db, user, body, save, audit}) {
  const c    = config();
  const out  = (data, status = 200) => ({data, status});
  const live = c.enabled && outboundReady(c);    // live = outbound API ready

  /* ── GET /api/whatsapp/config ────────────────────────────────────────── */
  if (p === '/api/whatsapp/config' && m === 'GET') {
    const ready   = outboundReady(c);
    const webhook = webhookReady(c);
    const missing = [];
    if (!ready) {
      if (!/^v\d+\.\d+$/.test(c.version)) missing.push('WA_GRAPH_VERSION');
      if (!/^\d+$/.test(c.phone))          missing.push('WA_PHONE_NUMBER_ID');
      if (!/^\d+$/.test(c.waba))           missing.push('WA_BUSINESS_ACCOUNT_ID');
      if (!c.token)                         missing.push('WA_ACCESS_TOKEN');
    }
    return out({
      configured     : ready,
      webhookReady   : webhook,
      liveEnabled    : live,
      mode           : live ? 'live' : (ready ? 'credentials set – test pending' : 'mock only'),
      version        : c.version || null,
      phoneId        : c.phone   || null,
      wabaId         : c.waba    || null,
      missingVars    : missing,
      webhookMissing : !webhook ? (['secret', 'verify'].filter(k => !c[k]).map(k =>
        k === 'secret' ? 'WA_APP_SECRET' : 'WA_WEBHOOK_VERIFY_TOKEN'
      )) : [],
    });
  }

  /* ── GET /api/whatsapp/history ───────────────────────────────────────── */
  if (p === '/api/whatsapp/history' && m === 'GET') return out(db.waCampaigns);

  /* ── Admin-only beyond this point ────────────────────────────────────── */
  if (user.role !== 'admin') throw err('Admin only', 403);

  /* ── POST /api/whatsapp/test  (Test Connection) ──────────────────────── */
  if (p === '/api/whatsapp/test' && m === 'POST') {
    const d = await graph(c, `${c.phone}?fields=id,display_phone_number,verified_name,quality_rating,platform_type,throughput,webhook_configuration`);
    return out({
      connected          : true,
      displayPhone       : d.display_phone_number,
      verifiedName       : d.verified_name,
      qualityRating      : d.quality_rating,
      platformType       : d.platform_type,
      throughput         : d.throughput?.level || null,
      phoneId            : d.id,
      webhookConfigured  : !!d.webhook_configuration?.application,
    });
  }

  /* ── POST /api/whatsapp/testmessage  (Send single test message) ──────── */
  if (p === '/api/whatsapp/testmessage' && m === 'POST') {
    if (!live) throw err('Enable authorized live messaging first',403);
    const b = await body();
    const to = String(b.to || '').trim().replace(/\s+/g, '');
    if (!/^\+[1-9]\d{7,14}$/.test(to)) throw err('Enter a valid recipient number with country code (e.g. +919876543210)');
    if (b.confirm !== 'SEND TEST MESSAGE') throw err('Type SEND TEST MESSAGE in the confirmation field to authorize delivery');

    const tmplName = String(b.template || 'hello_world');
    const tmplLang = String(b.language  || 'en_US');
    const payload  = {
      messaging_product: 'whatsapp',
      to    : to.replace(/^\+/, ''),
      type  : 'template',
      template: {name: tmplName, language: {code: tmplLang}},
    };
    const d = await graph(c, `${c.phone}/messages`, {method: 'POST', body: payload});
    if (!d.messages?.[0]?.id) throw err('Message submitted but no message ID returned. Verify on Meta dashboard.');
    return out({
      submitted : true,
      messageId : d.messages[0].id,
      to        : to,
      template  : tmplName,
      note      : 'Message accepted by Meta API. Delivery status will appear via webhook events.',
    }, 201);
  }

  /* ── GET /api/whatsapp/templates ─────────────────────────────────────── */
  if (p === '/api/whatsapp/templates' && m === 'GET') return out(await templates(c, live));

  /* ── POST /api/whatsapp/send  (Template campaign) ────────────────────── */
  if (p !== '/api/whatsapp/send' || m !== 'POST') throw err('Not found', 404);

  const b = await body();
  if (active) throw err('Another campaign is processing', 409);
  active = true;

  try {
    const isLive = b.live === true;
    if (isLive && (!live || b.confirm !== 'SEND APPROVED TEMPLATE')) {
      throw err('Live mode and explicit confirmation required');
    }
    if (
      !Array.isArray(b.ids) ||
      !b.ids.length ||
      b.ids.length > 25 ||
      !/^[a-zA-Z0-9_-]{16,100}$/.test(String(b.requestId || ''))
    ) throw err('Select 1–25 recipients and a request ID');

    if (db.waCampaigns.some(x => x.requestId === b.requestId)) {
      throw err('Request already recorded; inspect history', 409);
    }

    const t = (await templates(c, isLive || live)).find(
      t => t.name === b.template && t.language === b.language
    );
    if (!t) throw err('Approved supported template not found');

    const ids      = [...new Set(b.ids)];
    const contacts = ids.map(id => db.contacts.find(x => x.id === id));
    if (contacts.some(x => !x || !x.consent)) throw err('All recipients must have recorded consent');

    const payloads = contacts.map(x => makePayload(t, x, b.fields || [], b.mediaId));

    const row = {
      id        : randomUUID(),
      requestId : b.requestId,
      template  : t.name,
      language  : t.language,
      mode      : isLive ? 'live' : 'mock',
      createdAt : new Date().toISOString(),
      recipients: contacts.map(x => ({
        contactId: x.id, name: x.name, phone: x.phone, status: 'Pending',
      })),
    };
    db.waCampaigns.unshift(row);
    audit(user, `create WhatsApp ${row.mode} campaign`);
    await save();

    for (let i = 0; i < contacts.length; i++) {
      const r = row.recipients[i];
      const current = db.contacts.find(x => x.id === r.contactId);
      if (!current?.consent || current.phone !== r.phone) {r.status = 'Skipped'; await save(); continue;}
      if (!isLive) {r.status = 'Mock only'; await save(); continue;}
      r.status = 'Submitting'; await save();
      try {
        const d = await graph(c, `${c.phone}/messages`, {method: 'POST', body: payloads[i]});
        if (!d.messages?.[0]?.id) throw Error('Missing message ID');
        r.messageId = d.messages[0].id;
        r.status    = 'Accepted';
      } catch (e) {
        r.status = 'Failed';
        r.error  = e.message;
        await save();
        break;
      }
      await save();
    }

    for (const r of row.recipients) if (r.status === 'Pending') r.status = 'Not attempted';
    await save();
    return out(row, 201);
  } finally {
    active = false;
  }
}

/* ── Webhook handler ─────────────────────────────────────────────────────── */
export async function whatsappWebhook({req, db, save}) {
  const c   = config();
  const url = new URL(req.url, 'http://localhost');
  const out = (status, text) => ({status, text});

  if (req.method === 'GET') {
    // Webhook verification challenge
    return (
      c.verify &&
      url.searchParams.get('hub.mode') === 'subscribe' &&
      safeEqual(url.searchParams.get('hub.verify_token') || '', c.verify)
    )
      ? out(200, url.searchParams.get('hub.challenge') || '')
      : out(403, 'Forbidden');
  }

  if (req.method !== 'POST') return out(405, 'Method not allowed');

  let size = 0, parts = [];
  for await (const part of req) {
    size += part.length;
    if (size > 1_000_000) return out(413, 'Too large');
    parts.push(part);
  }
  const raw = Buffer.concat(parts);

  if (!signatureValid(raw, req.headers['x-hub-signature-256'], c.secret)) {
    return out(403, 'Invalid signature');
  }

  let data;
  try { data = JSON.parse(raw); } catch { return out(400, 'Invalid JSON'); }

  if (data.object !== 'whatsapp_business_account') return out(400, 'Invalid object');

  const rank = {Accepted: 0, sent: 1, delivered: 2, read: 3, failed: 1};

  for (const entry of data.entry || []) {
    if (String(entry.id) !== c.waba) continue;
    for (const change of entry.changes || []) {
      const v = change.value;
      if (String(v?.metadata?.phone_number_id) !== c.phone) continue;

      // Delivery status updates
      for (const s of v.statuses || []) {
        if (!['sent', 'delivered', 'read', 'failed'].includes(s.status)) continue;
        const r = [...db.waCampaigns,...(db.bulkRuns||[])].flatMap(x => x.recipients).find(x => x.messageId === s.id);
        if (r && rank[s.status] >= (rank[r.status] ?? 0) && !(r.status === 'failed' && s.status === 'sent')) {
          r.status   = s.status;
          r.statusAt = String(s.timestamp || '');
          if (s.status === 'failed' && s.errors?.[0]) {
            r.error = `${s.errors[0].title} (code ${s.errors[0].code})`;
          }
        }
      }

      // Incoming messages
      for (const msg of v.messages || []) {
        recordIncoming(db, msg, {phoneId:c.phone,wabaId:c.waba});
        const text = String(msg.text?.body || '').trim().toLowerCase();
        if (['stop', 'unsubscribe', 'opt out'].includes(text)) {
          const contact = db.contacts.find(x => x.phone === '+' + msg.from);
          if (contact) { contact.consent = false; contact.consentAt = null; }
        }
      }
    }
  }

  await save();
  return out(200, 'OK');
}

export function bulkProviderStatus(){
 const c=config();return {provider:'Meta Cloud API',enabled:c.enabled&&outboundReady(c)&&webhookReady(c),phoneId:c.phone,wabaId:c.waba};
}
export async function submitBulkText({phone,message,phoneId,wabaId}){
 const c=config();
 if(!c.enabled||!webhookReady(c)||c.phone!==phoneId||c.waba!==wabaId)throw err('Live provider or webhook configuration changed',403);
 const d=await graph(c,c.phone+'/messages',{method:'POST',body:{messaging_product:'whatsapp',recipient_type:'individual',to:phone.replace(/^\+/,''),type:'text',text:{preview_url:false,body:message}}});
 if(!d.messages?.[0]?.id)throw err('Submission not confirmed',502);
 return d.messages[0].id;
}

export async function uploadBulkMedia(attachment,provider){
 const c=config();if(!c.enabled||!webhookReady(c)||c.phone!==provider.phoneId||c.waba!==provider.wabaId)throw err('Live provider unavailable',403);
 const a=validateAttachment(attachment),form=new FormData();form.append('messaging_product','whatsapp');form.append('type',a.mime);form.append('file',new Blob([a.bytes],{type:a.mime}),a.name);
 let r,d;try{r=await fetch('https://graph.facebook.com/'+c.version+'/'+c.phone+'/media',{method:'POST',headers:{Authorization:'Bearer '+c.token},body:form,signal:AbortSignal.timeout(30000)});d=await r.json()}catch{throw err('Media upload failed or timed out',502)}
 if(!r.ok||!d.id)throw err('Meta media upload rejected (HTTP '+r.status+')',502);
 return {id:String(d.id),kind:a.kind,name:a.name};
}
export async function submitBulkMedia({phone,message,phoneId,wabaId,media}){
 const c=config();if(!c.enabled||!webhookReady(c)||c.phone!==phoneId||c.waba!==wabaId)throw err('Live provider unavailable',403);
 const item={id:media.id,...(media.kind==='document'?{filename:media.name}:{}),...(media.kind!=='audio'&&message?{caption:message}:{})};
 const d=await graph(c,c.phone+'/messages',{method:'POST',body:{messaging_product:'whatsapp',recipient_type:'individual',to:phone.replace(/^\+/,''),type:media.kind,[media.kind]:item}});
 if(!d.messages?.[0]?.id)throw err('Submission not confirmed',502);return d.messages[0].id;
}
