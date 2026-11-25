import React, { useEffect, useState, useCallback } from 'react';

/* ── Tiny helpers ─────────────────────────────────────────────────────────── */
const cls = (...a) => a.filter(Boolean).join(' ');

function Badge({ color, children }) {
  const map = {
    green  : 'bg-green-100 text-green-800 border-green-300',
    red    : 'bg-red-100 text-red-800 border-red-300',
    yellow : 'bg-yellow-100 text-yellow-800 border-yellow-300',
    gray   : 'bg-gray-100 text-gray-700 border-gray-300',
    blue   : 'bg-blue-100 text-blue-800 border-blue-300',
  };
  return (
    <span className={cls('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border', map[color] || map.gray)}>
      {children}
    </span>
  );
}

function StatusDot({ ok, warn }) {
  return (
    <span className={cls(
      'inline-block w-2.5 h-2.5 rounded-full mr-1.5 flex-shrink-0',
      ok ? 'bg-green-500' : warn ? 'bg-yellow-400' : 'bg-red-500'
    )} />
  );
}

function Alert({ type, children }) {
  const styles = {
    success : 'bg-green-50 border-green-400 text-green-800',
    error   : 'bg-red-50 border-red-400 text-red-800',
    info    : 'bg-blue-50 border-blue-400 text-blue-800',
    warning : 'bg-yellow-50 border-yellow-400 text-yellow-800',
  };
  return (
    <div className={cls('border-l-4 p-3 rounded text-sm my-2', styles[type] || styles.info)} role="alert">
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 inline-block mr-1.5" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function statusColor(s) {
  if (!s) return 'gray';
  const lc = s.toLowerCase();
  if (['accepted','sent','read'].includes(lc))      return 'green';
  if (lc === 'delivered')                            return 'blue';
  if (['failed','skipped','not attempted'].includes(lc)) return 'red';
  if (['pending','submitting','mock only'].includes(lc))  return 'yellow';
  return 'gray';
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main WhatsApp Dashboard Component
   ═══════════════════════════════════════════════════════════════════════════ */
export default function WhatsApp({ api, role, contacts }) {
  /* ── State ──────────────────────────────────────────────────────────────── */
  const [cfg,       setCfg]       = useState(null);
  const [connInfo,  setConnInfo]  = useState(null);
  const [templates, setTemplates] = useState([]);
  const [history,   setHistory]   = useState([]);
  const [busy,      setBusy]      = useState(false);
  const [notice,    setNotice]    = useState(null);   // { type, text }
  const [tab,       setTab]       = useState('connection');

  /* Test message state */
  const [testTo,       setTestTo]       = useState('');
  const [testTemplate, setTestTemplate] = useState('hello_world');
  const [testLang,     setTestLang]     = useState('en_US');
  const [testConfirm,  setTestConfirm]  = useState('');
  const [testResult,   setTestResult]   = useState(null);

  /* Campaign state */
  const [selTemplate, setSelTemplate] = useState('');
  const [campFields,  setCampFields]  = useState([]);
  const [campMedia,   setCampMedia]   = useState('');
  const [campIds,     setCampIds]     = useState([]);
  const [campLive,    setCampLive]    = useState(false);
  const [campConfirm, setCampConfirm] = useState('');

  const eligible = contacts.filter(c => c.consent);
  const selTmpl  = selTemplate !== '' ? templates[Number(selTemplate)] : null;
  const bodyText = selTmpl?.components?.find(c => c.type === 'BODY')?.text || '';
  const slots    = [...bodyText.matchAll(/\{\{(\d+)\}\}/g)];
  const paramCount = slots.length ? Math.max(...slots.map(x => Number(x[1]))) : 0;

  /* ── Helpers ────────────────────────────────────────────────────────────── */
  const notify = (type, text) => setNotice({ type, text });
  const clearNotice = () => setNotice(null);

  const run = useCallback(async (fn) => {
    setBusy(true); clearNotice();
    try { await fn(); }
    catch (e) { notify('error', e.message); }
    finally   { setBusy(false); }
  }, []);

  const refreshConfig = useCallback(async () => {
    const c = await api('whatsapp/config');
    setCfg(c);
    return c;
  }, [api]);

  const refreshHistory = useCallback(async () => {
    const h = await api('whatsapp/history');
    setHistory(h);
  }, [api]);

  useEffect(() => {
    run(async () => {
      await Promise.all([refreshConfig(), refreshHistory()]);
    });
  }, []);

  /* ── Test Connection ──────────────────────────────────────────────────── */
  async function handleTestConnection() {
    run(async () => {
      setConnInfo(null);
      const d = await api('whatsapp/test', 'POST', {});
      setConnInfo(d);
      notify('success', `✓ Connected — ${d.verifiedName} (${d.displayPhone})`);
      await refreshConfig();
    });
  }

  /* ── Load Templates ──────────────────────────────────────────────────── */
  async function handleLoadTemplates() {
    run(async () => {
      const t = await api('whatsapp/templates');
      setTemplates(t);
      setSelTemplate('');
      notify('info', `${t.length} approved template(s) loaded`);
    });
  }

  /* ── Send Test Message ───────────────────────────────────────────────── */
  async function handleSendTestMessage(e) {
    e.preventDefault();
    run(async () => {
      setTestResult(null);
      const r = await api('whatsapp/testmessage', 'POST', {
        to      : testTo,
        template: testTemplate,
        language: testLang,
        confirm : testConfirm,
      });
      setTestResult(r);
      setTestConfirm('');
      notify('success', `✓ Message accepted — ID: ${r.messageId}`);
    });
  }

  /* ── Send Campaign ────────────────────────────────────────────────────── */
  async function handleSendCampaign(e) {
    e.preventDefault();
    if (!selTmpl) return;
    run(async () => {
      const r = await api('whatsapp/send', 'POST', {
        requestId: crypto.randomUUID(),
        ids      : campIds,
        template : selTmpl.name,
        language : selTmpl.language,
        fields   : Array.from({length: paramCount}, (_, i) => campFields[i] || 'name'),
        mediaId  : campMedia || undefined,
        live     : campLive,
        confirm  : campConfirm,
      });
      notify('success', `${r.mode} campaign recorded — ${r.recipients.length} recipient(s)`);
      setCampIds([]);
      setCampConfirm('');
      await refreshHistory();
    });
  }

  /* ── Tab nav ──────────────────────────────────────────────────────────── */
  const tabs = [
    { id: 'connection', label: '🔗 Connection' },
    { id: 'testmsg',   label: '✉️ Test Message' },
    { id: 'templates', label: '📋 Templates' },
    { id: 'campaign',  label: '📢 Campaign' },
    { id: 'history',   label: '📊 History' },
    { id: 'webhook',   label: '🔔 Webhook' },
    { id: 'diag',      label: '🔧 Diagnostics' },
  ];

  /* ══════════════════════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════════════════════ */
  return (
    <div className="space-y-4">
      {/* ── Page header ── */}
      <div className="panel">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">WhatsApp Cloud API</h1>
            <p className="text-sm text-gray-500">Official Meta WhatsApp Business Messaging · Prakshal IT Academy</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {cfg ? (
              cfg.liveEnabled
                ? <Badge color="green"><StatusDot ok />Live Mode</Badge>
                : cfg.configured
                  ? <Badge color="yellow"><StatusDot warn />Credentials Set</Badge>
                  : <Badge color="gray"><StatusDot />Mock Only</Badge>
            ) : <Badge color="gray">Loading…</Badge>}
            {connInfo && <Badge color="green">✓ Verified</Badge>}
          </div>
        </div>
      </div>

      {/* ── Global notice ── */}
      {notice && (
        <Alert type={notice.type}>
          <div className="flex justify-between items-start gap-2">
            <span>{notice.text}</span>
            <button onClick={clearNotice} className="text-current opacity-60 hover:opacity-100 flex-shrink-0 text-xs">✕</button>
          </div>
        </Alert>
      )}

      {/* ── Tab bar ── */}
      <div className="flex gap-1 flex-wrap border-b border-gray-200 pb-0">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cls(
              'px-3 py-2 text-sm font-medium rounded-t border-b-2 transition-colors',
              tab === t.id
                ? 'border-green-600 text-green-700 bg-green-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          TAB: CONNECTION STATUS
          ════════════════════════════════════════════════════════════════════ */}
      {tab === 'connection' && (
        <div className="panel space-y-4">
          <SectionHeader
            title="API Connection Status"
            subtitle="Verify your Meta WhatsApp Cloud API credentials using the official Graph API"
          />

          {/* Config summary */}
          {cfg && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                ['Graph API Version',      cfg.version || '—'],
                ['Phone Number ID',        cfg.phoneId || '—'],
                ['Business Account ID',    cfg.wabaId  || '—'],
                ['Outbound Credentials',   cfg.configured  ? '✓ Set' : '✗ Missing'],
                ['Live Mode',              cfg.liveEnabled ? '✓ Enabled' : '✗ Disabled'],
                ['Webhook Credentials',    cfg.webhookReady ? '✓ Set' : '✗ Missing'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm py-1 border-b border-gray-100">
                  <span className="text-gray-500">{k}</span>
                  <span className="font-medium text-gray-800">{v}</span>
                </div>
              ))}
            </div>
          )}

          {/* Missing vars warning */}
          {cfg?.missingVars?.length > 0 && (
            <Alert type="error">
              <strong>Missing .env variables:</strong> {cfg.missingVars.join(', ')}
              <br/>Set these in your <code>.env</code> file and restart the server.
            </Alert>
          )}
          {cfg?.webhookMissing?.length > 0 && (
            <Alert type="warning">
              <strong>Webhook-only vars missing</strong> (outbound messaging still works):&nbsp;
              {cfg.webhookMissing.join(', ')}
            </Alert>
          )}

          {/* Connected info */}
          {connInfo && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
              <p className="font-semibold text-green-800">✓ Connection Verified</p>
              {[
                ['Verified Business Name', connInfo.verifiedName],
                ['Display Phone Number',   connInfo.displayPhone],
                ['Phone Number ID',        connInfo.phoneId],
                ['Quality Rating',         connInfo.qualityRating || 'N/A'],
                ['Throughput Level',       connInfo.throughput    || 'N/A'],
                ['Webhook Configured',     connInfo.webhookConfigured ? 'Yes' : 'No'],
              ].map(([k, v]) => v && (
                <div key={k} className="flex justify-between text-sm">
                  <span className="text-green-700">{k}</span>
                  <span className="font-medium text-green-900">{v}</span>
                </div>
              ))}
            </div>
          )}

          {/* Action buttons */}
          {role === 'admin' && (
            <div className="flex gap-2 flex-wrap pt-2">
              <button
                disabled={busy || !cfg?.configured}
                onClick={handleTestConnection}
                className="flex items-center"
                title={!cfg?.configured ? 'Set WA_PHONE_NUMBER_ID, WA_ACCESS_TOKEN, WA_GRAPH_VERSION, WA_BUSINESS_ACCOUNT_ID in .env first' : ''}
              >
                {busy ? <Spinner/> : null}
                Test Connection
              </button>
              <button
                disabled={busy}
                className="secondary"
                onClick={handleLoadTemplates}
              >
                Load Approved Templates
              </button>
              <button
                disabled={busy}
                className="secondary"
                onClick={() => run(async () => { await Promise.all([refreshConfig(), refreshHistory()]); notify('info', 'Refreshed'); })}
              >
                ↻ Refresh
              </button>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: SEND TEST MESSAGE
          ════════════════════════════════════════════════════════════════════ */}
      {tab === 'testmsg' && (
        <div className="panel space-y-4">
          <SectionHeader
            title="Send Test Message"
            subtitle="Send a real WhatsApp message to an authorized recipient using the hello_world template"
          />

          <Alert type="info">
            <strong>Important:</strong> You can only send test messages to phone numbers that are
            registered as <strong>Test Recipients</strong> in your Meta for Developers app, OR after
            your app goes through Meta's App Review for production access. The recipient must have
            an active WhatsApp account.
          </Alert>

          {!cfg?.configured && (
            <Alert type="error">
              Outbound credentials are not configured. Set <code>WA_PHONE_NUMBER_ID</code>,
              <code> WA_ACCESS_TOKEN</code>, <code>WA_GRAPH_VERSION</code>, and
              <code> WA_BUSINESS_ACCOUNT_ID</code> in <code>.env</code>.
            </Alert>
          )}

          {role === 'admin' && cfg?.configured && (
            <form onSubmit={handleSendTestMessage} className="space-y-3 max-w-lg">
              <label>
                Recipient Phone Number (with country code)
                <input
                  type="tel"
                  value={testTo}
                  onChange={e => setTestTo(e.target.value)}
                  placeholder="+919876543210"
                  required
                />
                <small className="text-gray-500">Must be a registered Meta test recipient</small>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label>
                  Template Name
                  <input
                    value={testTemplate}
                    onChange={e => setTestTemplate(e.target.value)}
                    placeholder="hello_world"
                    required
                  />
                </label>
                <label>
                  Language Code
                  <input
                    value={testLang}
                    onChange={e => setTestLang(e.target.value)}
                    placeholder="en_US"
                    required
                  />
                </label>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm">
                <p className="font-semibold text-yellow-800 mb-1">Authorization Required</p>
                <p className="text-yellow-700">
                  This will send a <strong>real WhatsApp message</strong> and may incur Meta API charges.
                  Type <code className="bg-yellow-100 px-1">SEND TEST MESSAGE</code> below to confirm.
                </p>
              </div>

              <label>
                Confirmation
                <input
                  value={testConfirm}
                  onChange={e => setTestConfirm(e.target.value)}
                  placeholder="Type: SEND TEST MESSAGE"
                  required
                />
              </label>

              <button
                type="submit"
                disabled={busy || testConfirm !== 'SEND TEST MESSAGE'}
                className={cls(testConfirm === 'SEND TEST MESSAGE' ? '' : 'opacity-50')}
              >
                {busy ? <><Spinner/>Sending…</> : 'Send Test Message'}
              </button>
            </form>
          )}

          {testResult && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm space-y-1">
              <p className="font-semibold text-green-800">✓ Message Accepted by Meta API</p>
              <p><span className="text-green-700">Message ID:</span> <code>{testResult.messageId}</code></p>
              <p><span className="text-green-700">Recipient:</span> {testResult.to}</p>
              <p><span className="text-green-700">Template:</span> {testResult.template}</p>
              <p className="text-green-700 text-xs mt-1">{testResult.note}</p>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: TEMPLATES
          ════════════════════════════════════════════════════════════════════ */}
      {tab === 'templates' && (
        <div className="panel space-y-4">
          <SectionHeader
            title="Approved Message Templates"
            subtitle={cfg?.liveEnabled ? 'Live templates from your Meta Business Account' : 'Demo templates (mock mode)'}
          />

          <div className="flex gap-2">
            <button disabled={busy} onClick={handleLoadTemplates}>
              {busy ? <Spinner/> : null}
              {cfg?.liveEnabled ? 'Fetch Live Templates' : 'Load Demo Templates'}
            </button>
          </div>

          {templates.length === 0 && (
            <p className="text-gray-500 text-sm">No templates loaded yet. Click the button above.</p>
          )}

          <div className="space-y-3">
            {templates.map((t, i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-4 hover:border-green-300 transition-colors">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <p className="font-semibold text-gray-900">{t.name}</p>
                    <p className="text-xs text-gray-500">{t.language} · {t.category}</p>
                  </div>
                  <Badge color={t.status === 'APPROVED' ? 'green' : 'red'}>{t.status}</Badge>
                </div>
                {t.components?.map((comp, j) => (
                  <div key={j} className="mt-2">
                    <span className="text-xs text-gray-400 uppercase">{comp.type}</span>
                    {comp.text && <p className="text-sm text-gray-700 mt-0.5 bg-gray-50 rounded p-2">{comp.text}</p>}
                    {comp.format && <p className="text-sm text-gray-500">Media: {comp.format}</p>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: CAMPAIGN (Bulk Template Messaging)
          ════════════════════════════════════════════════════════════════════ */}
      {tab === 'campaign' && role === 'admin' && (
        <div className="columns">
          <form className="panel space-y-4" onSubmit={handleSendCampaign}>
            <SectionHeader
              title="Template Campaign"
              subtitle="Send approved WhatsApp templates to opted-in contacts"
            />

            {templates.length === 0 && (
              <Alert type="warning">Load approved templates first from the Templates tab.</Alert>
            )}

            <label>
              Approved Template
              <select
                className="w-full border rounded p-2"
                value={selTemplate}
                onChange={e => { setSelTemplate(e.target.value); setCampFields([]); setCampMedia(''); }}
                required
              >
                <option value="">Choose template…</option>
                {templates.map((t, i) => (
                  <option key={i} value={i}>{t.name} ({t.language})</option>
                ))}
              </select>
            </label>

            {selTmpl && (
              <div className="bg-gray-50 rounded p-3 text-sm">
                <p className="text-gray-500 text-xs mb-1">Message Preview:</p>
                <p className="text-gray-800">{bodyText}</p>
              </div>
            )}

            {selTmpl && paramCount > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Parameter Mapping ({paramCount} parameter{paramCount > 1 ? 's' : ''})</p>
                {Array.from({length: Math.min(paramCount, 10)}, (_, i) => (
                  <label key={i}>
                    Parameter {`{{${i+1}}}`} maps to:
                    <select
                      className="w-full border rounded p-2"
                      value={campFields[i] || 'name'}
                      onChange={e => { const a = [...campFields]; a[i] = e.target.value; setCampFields(a); }}
                    >
                      {['name', 'course', 'batch'].map(x => <option key={x}>{x}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            )}

            {selTmpl?.components?.some(c => c.type === 'HEADER') && (
              <label>
                Meta Media ID (for header image/video/document)
                <input value={campMedia} onChange={e => setCampMedia(e.target.value)} required />
                <small className="text-gray-500">Upload media via Meta Business Manager and paste the media ID here.</small>
              </label>
            )}

            <label className="check">
              <input
                type="checkbox"
                checked={campLive}
                disabled={!cfg?.liveEnabled}
                onChange={e => setCampLive(e.target.checked)}
              />
              Enable live delivery for this campaign
              {!cfg?.liveEnabled && <span className="text-gray-400 ml-1">(requires WA_LIVE_ENABLED=true)</span>}
            </label>

            {campLive && (
              <div className="bg-red-50 border border-red-200 rounded p-3 text-sm">
                <p className="font-semibold text-red-800 mb-1">⚠ Live Delivery Confirmation</p>
                <p className="text-red-700">
                  This will send real WhatsApp messages to {campIds.length} recipient(s). Type{' '}
                  <code className="bg-red-100 px-1">SEND APPROVED TEMPLATE</code> to confirm.
                </p>
                <input
                  className="mt-2 w-full border border-red-300 rounded p-2"
                  value={campConfirm}
                  onChange={e => setCampConfirm(e.target.value)}
                  placeholder="Type: SEND APPROVED TEMPLATE"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={
                busy ||
                !selTmpl ||
                !campIds.length ||
                campIds.length > 25 ||
                (campLive && campConfirm !== 'SEND APPROVED TEMPLATE')
              }
            >
              {busy ? <Spinner/> : null}
              {campLive ? `Send Live to ${campIds.length} Recipient(s)` : `Simulate (${campIds.length} selected)`}
            </button>
          </form>

          {/* Recipient selector */}
          <div className="panel space-y-3">
            <SectionHeader
              title={`Recipients (${campIds.length} / 25 selected)`}
              subtitle="Only opted-in contacts are eligible"
            />
            {eligible.length === 0 && (
              <p className="text-sm text-gray-500">No opted-in contacts. Add contacts and record consent first.</p>
            )}
            {eligible.map(c => (
              <label className="check" key={c.id}>
                <input
                  type="checkbox"
                  checked={campIds.includes(c.id)}
                  disabled={!campIds.includes(c.id) && campIds.length >= 25}
                  onChange={e => setCampIds(e.target.checked
                    ? [...campIds, c.id]
                    : campIds.filter(x => x !== c.id)
                  )}
                />
                <span>
                  <span className="font-medium">{c.name}</span>
                  <span className="text-gray-500 text-xs ml-1">· {c.phone}</span>
                  {c.course && <span className="text-gray-400 text-xs ml-1">· {c.course}</span>}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: CAMPAIGN HISTORY
          ════════════════════════════════════════════════════════════════════ */}
      {tab === 'history' && (
        <div className="panel space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <SectionHeader title="Cloud Campaign History" subtitle="Message delivery status and history" />
            <button
              className="secondary"
              disabled={busy}
              onClick={() => run(refreshHistory)}
            >
              ↻ Refresh Status
            </button>
          </div>

          {history.length === 0 && (
            <p className="text-gray-500 text-sm">No Cloud campaigns recorded yet.</p>
          )}

          {history.map(c => (
            <div key={c.id} className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <span className="font-semibold text-gray-900">{c.template}</span>
                  <span className="text-xs text-gray-500 ml-2">{c.language}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge color={c.mode === 'live' ? 'green' : 'gray'}>{c.mode}</Badge>
                  <span className="text-xs text-gray-400">{new Date(c.createdAt).toLocaleString('en-IN')}</span>
                </div>
              </div>
              <div className="table">
                <table>
                  <thead>
                    <tr>
                      <th>Recipient</th>
                      <th>Phone</th>
                      <th>Status</th>
                      <th>Message ID</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.recipients.map(r => (
                      <tr key={r.contactId}>
                        <td>{r.name}</td>
                        <td>{r.phone}</td>
                        <td><Badge color={statusColor(r.status)}>{r.status}</Badge></td>
                        <td><code className="text-xs">{r.messageId || '—'}</code></td>
                        <td className="text-xs text-gray-400">
                          {r.statusAt ? new Date(Number(r.statusAt) * 1000).toLocaleString('en-IN') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {c.recipients.some(r => r.error) && (
                <div className="px-4 py-2 bg-red-50 border-t border-red-100">
                  {c.recipients.filter(r => r.error).map(r => (
                    <p key={r.contactId} className="text-xs text-red-700">
                      <strong>{r.name}:</strong> {r.error}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: WEBHOOK
          ════════════════════════════════════════════════════════════════════ */}
      {tab === 'webhook' && (
        <div className="panel space-y-4">
          <SectionHeader
            title="Webhook Configuration"
            subtitle="Configure incoming message events and delivery status updates"
          />

          <Alert type="info">
            Webhook configuration requires a public HTTPS URL. For local development, use a tunnel
            tool like <strong>ngrok</strong> or <strong>Cloudflare Tunnel</strong>.
          </Alert>

          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-1">Webhook Endpoint</p>
              <code className="block bg-gray-100 rounded p-2 text-sm">https://your-domain.com/api/whatsapp/webhook</code>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700 mb-1">Required .env Variables</p>
              <div className="space-y-1">
                {[
                  ['WA_APP_SECRET',          cfg?.webhookMissing?.includes('WA_APP_SECRET')          ? 'Missing' : 'Set', cfg?.webhookMissing?.includes('WA_APP_SECRET')],
                  ['WA_WEBHOOK_VERIFY_TOKEN', cfg?.webhookMissing?.includes('WA_WEBHOOK_VERIFY_TOKEN') ? 'Missing' : 'Set', cfg?.webhookMissing?.includes('WA_WEBHOOK_VERIFY_TOKEN')],
                ].map(([k, v, missing]) => (
                  <div key={k} className="flex justify-between text-sm py-1 border-b border-gray-100">
                    <code className="text-gray-600">{k}</code>
                    <Badge color={missing ? 'red' : 'green'}>{v}</Badge>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700 mb-1">Subscribed Events</p>
              <div className="flex flex-wrap gap-2">
                {['messages', 'message_deliveries', 'message_reads', 'message_echoes'].map(e => (
                  <Badge key={e} color="blue">{e}</Badge>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700 mb-1">Supported Status Updates</p>
              <div className="flex flex-wrap gap-2">
                {['sent', 'delivered', 'read', 'failed'].map(s => (
                  <Badge key={s} color={statusColor(s)}>{s}</Badge>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: DIAGNOSTICS
          ════════════════════════════════════════════════════════════════════ */}
      {tab === 'diag' && (
        <div className="panel space-y-4">
          <SectionHeader
            title="API Diagnostics"
            subtitle="Inspect configuration, common errors and troubleshooting steps"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Config check */}
            <div className="border rounded-lg p-4 space-y-2">
              <p className="font-semibold text-gray-800">Configuration Check</p>
              {cfg ? (
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Graph API version valid</span>
                    <Badge color={/^v\d+\.\d+$/.test(cfg.version || '') ? 'green' : 'red'}>
                      {/^v\d+\.\d+$/.test(cfg.version || '') ? 'Yes' : 'No'}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Phone Number ID present</span>
                    <Badge color={cfg.phoneId ? 'green' : 'red'}>{cfg.phoneId ? 'Yes' : 'No'}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">WABA ID present</span>
                    <Badge color={cfg.wabaId ? 'green' : 'red'}>{cfg.wabaId ? 'Yes' : 'No'}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Access token present</span>
                    <Badge color={cfg.configured ? 'green' : 'red'}>{cfg.configured ? 'Yes' : 'No'}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Outbound ready</span>
                    <Badge color={cfg.configured ? 'green' : 'red'}>{cfg.configured ? 'Yes' : 'No'}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Webhook ready</span>
                    <Badge color={cfg.webhookReady ? 'green' : 'yellow'}>{cfg.webhookReady ? 'Yes' : 'Partial'}</Badge>
                  </div>
                </div>
              ) : <p className="text-sm text-gray-400">Loading…</p>}
            </div>

            {/* Common errors */}
            <div className="border rounded-lg p-4 space-y-2">
              <p className="font-semibold text-gray-800">Common Error Solutions</p>
              <ul className="text-sm space-y-2">
                {[
                  ['Error code 190', 'Token expired — regenerate from Meta for Developers'],
                  ['Error code 100', 'Invalid Phone Number ID — check WA_PHONE_NUMBER_ID'],
                  ['Error code 10',  'Missing permission — add whatsapp_business_messaging in app review'],
                  ['Error 131026',   'Recipient not on WhatsApp or restricted region'],
                  ['Error 131047',   'Outside 24-hour window — use approved template'],
                  ['Error 80007',    'Rate limit — wait and retry'],
                  ['mock only',      'Set WA_LIVE_ENABLED=true in .env'],
                ].map(([code, fix]) => (
                  <li key={code} className="text-gray-600">
                    <code className="text-xs bg-gray-100 px-1 rounded">{code}</code>
                    <span className="ml-1">{fix}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Official links */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Official Resources</p>
            <div className="flex flex-wrap gap-2">
              {[
                ['Meta for Developers', 'https://developers.facebook.com/'],
                ['WhatsApp Business API Docs', 'https://developers.facebook.com/docs/whatsapp/cloud-api/'],
                ['Template Manager', 'https://business.facebook.com/wa/manage/message-templates/'],
                ['API Explorer', 'https://developers.facebook.com/tools/explorer/'],
              ].map(([label, url]) => (
                <a
                  key={label}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-2 py-1 hover:bg-blue-100"
                >
                  {label} ↗
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
