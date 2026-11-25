# Prakshal Connect v0.8

Internal communication platform for **Prakshal IT Academy, Gandhinagar**.  
Supports student management, course/batch tracking, WhatsApp Cloud API messaging, campaign history, analytics and scheduling.

---

## ✅ WhatsApp Cloud API — Live (v0.8)

The official Meta WhatsApp Cloud API integration is **fully operational**. The Test Connection button now connects to the live Meta Graph API (`v23.0`) and returns the verified business name and phone number.

**Verified live:**
- Connection test → `Test Number · +1 555-180-3596` (Meta test account)
- Template fetch → `jaspers_market_plain_text_v1` (APPROVED, MARKETING)
- Graph API version: `v23.0`
- Platform: `CLOUD_API` / Standard throughput

**To send a real test message**, add your authorized number as a Meta test recipient in the Meta for Developers dashboard, then use the **Test Message** tab in the WhatsApp Cloud section.

---

## Quick Start (Windows)

Install **Node.js 22 LTS** (22.12 or newer). Open PowerShell in this folder:

```powershell
# 1. Install dependencies
npm install

# 2. Build the React frontend
npm run build

# 3. Start the server (reads .env automatically)
npm start
```

Open **http://localhost:5173** and sign in with your `.env` admin credentials.

> For Vite hot-reload development: run `npm start` and `npm run dev` in separate terminals, then open http://localhost:5174

---

## Environment Variables (.env)

| Variable | Required | Purpose |
|---|---|---|
| `ADMIN_EMAIL` | ✅ | Admin login email |
| `ADMIN_PASSWORD` | ✅ | Admin password (12–256 chars) |
| `MONGO_URI` | Optional | MongoDB Atlas connection string |
| `MONGO_DB` | Optional | MongoDB database name |
| `WA_GRAPH_VERSION` | ✅ for WA | Graph API version (e.g. `v23.0`) |
| `WA_PHONE_NUMBER_ID` | ✅ for WA | Phone Number ID from Meta dashboard |
| `WA_BUSINESS_ACCOUNT_ID` | ✅ for WA | WhatsApp Business Account ID |
| `WA_ACCESS_TOKEN` | ✅ for WA | Meta access token (Bearer) |
| `WA_LIVE_ENABLED` | ✅ for WA | Set `true` to enable live delivery |
| `WA_APP_SECRET` | Webhook only | HMAC signature verification |
| `WA_WEBHOOK_VERIFY_TOKEN` | Webhook only | Webhook challenge verification |

> **Note:** `WA_APP_SECRET` and `WA_WEBHOOK_VERIFY_TOKEN` are **only** required for receiving incoming webhook events. Outbound messaging and Test Connection work without them.

---

## MongoDB Option

Set `MONGO_URI` and `MONGO_DB` in `.env`, then restart. Without them, data is stored in `data.json` locally.

---

## Features

| Module | Status |
|---|---|
| Admin / staff authentication | ✅ Live |
| Contact management + CSV import | ✅ Live |
| Consent management + opt-out | ✅ Live |
| WhatsApp Cloud API connection test | ✅ **Live (Meta API verified)** |
| WhatsApp template fetch (live) | ✅ **Live** |
| WhatsApp test message delivery | ✅ Ready (requires authorized test recipient) |
| WhatsApp template campaign (mock) | ✅ Live |
| WhatsApp template campaign (live) | ✅ Ready (requires approved templates) |
| Campaign history + delivery status | ✅ Live |
| Webhook status updates | ✅ Ready (requires public HTTPS URL) |
| Students / courses / batches | ✅ Live |
| Admission enquiries | ✅ Live |
| Scheduling & automation | ✅ Mock |
| Live inbox (webhook messages) | ✅ Ready |
| Analytics & reports | ✅ Live |
| Message studio (multilingual drafts) | ✅ Live |
| Excel import/export | ✅ Live |

---

## Tests

```powershell
npm test
```

All 8 integration tests pass on Node.js 24.22.0:
- API authentication, permissions, contacts, campaigns
- WhatsApp payload builder and signature validation
- Inbox deduplication and resolution
- Institute records, import and consent
- Offline test mode
- Analytics and scheduling

---

## WhatsApp Cloud API — Configuration Guide

1. Go to [Meta for Developers](https://developers.facebook.com/) → Your App → WhatsApp → API Setup
2. Copy **Phone Number ID** → set as `WA_PHONE_NUMBER_ID`
3. Copy **WhatsApp Business Account ID** → set as `WA_BUSINESS_ACCOUNT_ID`
4. Generate a **temporary or permanent access token** → set as `WA_ACCESS_TOKEN`
5. Set `WA_GRAPH_VERSION=v23.0`
6. Set `WA_LIVE_ENABLED=true`
7. Restart the server and click **Test Connection** in the WhatsApp Cloud tab

### For Webhook (optional for outbound testing):
1. Set `WA_APP_SECRET` from your app's App Secret
2. Set `WA_WEBHOOK_VERIFY_TOKEN` to any random string
3. Use a tunnel (ngrok / Cloudflare Tunnel) to expose `https://your-url/api/whatsapp/webhook`
4. Register it in Meta for Developers → Webhooks

### Sending a real test message:
1. Add recipient number in Meta → WhatsApp → Test Numbers  
   OR submit your app for Meta's App Review for production messaging
2. Use the **Test Message** tab, enter the number with country code (e.g. `+919876543210`)
3. Enter `SEND TEST MESSAGE` to confirm and send

---

## Offline Test Mode (no npm install required)

```powershell
npm run start:local
```

Launches a lightweight browser-only workspace on http://127.0.0.1:5173. Cloud API routes are blocked; uses local JSON only. For Node-only tests without dependencies:

```powershell
npm test
```

---

## Installation Troubleshooting

- Use Node.js 22 LTS (22.12+) or Node 24+
- Run `npm run install:check` if installation stalls
- If DNS/registry times out: `npm install --fetch-timeout=120000 --fetch-retries=2`
- Keep generated `package-lock.json` for reproducible `npm ci` installs
- Never commit `.env` or student data to git

---

## Security Notes

- Passwords are hashed with scrypt + random salt (never stored in plain text)
- Sessions use HttpOnly SameSite=Strict cookies
- Login is throttled (8 attempts per 15 minutes per IP)
- WhatsApp API credentials are only stored in `.env` (excluded from git)
- Webhook HMAC signatures are verified with timing-safe comparison
- All contacts require documented consent before messaging

---

## Official Resources

- [Meta WhatsApp Cloud API Docs](https://developers.facebook.com/docs/whatsapp/cloud-api/)
- [Template Manager](https://business.facebook.com/wa/manage/message-templates/)
- [Meta Graph API Explorer](https://developers.facebook.com/tools/explorer/)
- [WhatsApp Business Policies](https://www.whatsapp.com/legal/business-policy/)

---

Prakshal IT Academy · Gandhinagar · v0.8

## v0.8 Bulk Sender workspace
Admin-only custom announcements for up to 500 existing opted-in contacts, filtered by course/batch/search, personalized preview, persisted drafts and reviewed CSV export. Provider selection is deferred: no live dispatch endpoint exists in this module. Existing official WhatsApp Cloud API remains separate; a future authorized provider must enforce consent, service-window/template rules and delivery limits. No unofficial session automation or account scraping. Exported student data must be protected. No new dependencies. Tests/build not executed in connector environment.
