# Prakshal Connect v0.7
Internal communication development prototype for Prakshal IT Academy, Gandhinagar. Mock mode by default; experimental Cloud API adapter.

## Windows setup
Install Node.js 22 LTS (22.16 or newer recommended). Open PowerShell in this folder:
```powershell
Copy-Item .env.example .env
notepad .env
```
Set ADMIN_EMAIL and a unique ADMIN_PASSWORD (12–256 characters); leave MONGO_URI blank for local JSON storage. The bootstrap credentials only apply on the first run with an empty user database.
```powershell
npm install
npm run build
npm start
```
Open http://localhost:5173 and sign in with your configured email and password. To use the Express entry point instead, run `npm run serve` instead of `npm start`. Do not run both at once. For Vite development, run `npm start` and `npm run dev` in separate terminals and open http://localhost:5174 (keep backend port 5173).

## MongoDB option
Set MONGO_URI and MONGO_DB in .env, then restart. MongoDB is an optional single-document workspace prototype using the official driver, not a scalable collection-per-entity architecture. Existing JSON data is not automatically migrated to MongoDB. Use a separate test database. Switching back to JSON uses the local file again.

## Features
React/Tailwind UI, admin/staff authentication, hashed passwords, HttpOnly SameSite sessions, login throttling, staff account creation, audit trail, contacts, CSV import, consent, simulated campaigns and report export. Admin-only staff management and contact deletion. Sessions reset on restart.

## Upgrade
Keep a backup of v0.1. For synthetic test data only, copy its data.json into this folder before first start to retain contacts and campaigns. Existing data has no encryption. Never copy real student data into this development version.

## Tests and limitations
`npm test` runs the built-in Node integration test without dependencies. Passed on Node 22.16. Package registry was inaccessible during creation, so dependency installation, React/Vite build, Express runtime and MongoDB integration are unverified. No lockfile is provided. Local-only prototype: no TLS, encrypted database, persistent sessions, password reset, account deactivation, production privacy review or production-verified WhatsApp API. Do not expose to the internet or use real student data. No actual messages sent. Next phases: normalized database, institute modules, native XLSX, official API and automation.

## Phase 3 institute modules
Create courses, then batches, then students and admission enquiries. Search, status filters, editing and admin-only deletion are provided. Student-to-contact copying never grants consent. Download the XLSX template and import using existing course and batch names; use text phone numbers and ISO dates. ExcelJS dependency must be installed. Fee status is informational only, not a payment ledger. Follow-up dates are tracked but do not send messages. Existing JSON/Mongo workspace is initialized with new arrays on startup. Back up before upgrading. Phase 3 runtime and browser tests have not been executed in this environment.

## Phase 4 Cloud integration
Use official Meta developer dashboard to configure WA_GRAPH_VERSION (a supported version), WA_PHONE_NUMBER_ID, WA_BUSINESS_ACCOUNT_ID, WA_ACCESS_TOKEN, WA_APP_SECRET and a unique WA_WEBHOOK_VERIFY_TOKEN in local .env. Keep WA_LIVE_ENABLED=false until authorized test setup and security review. Admin can test connection, load templates and simulate sends. Live mode uses approved utility/marketing templates with numbered body parameters and optional image/video/document header using an existing Meta media ID. First page of templates only; unsupported templates excluded. Max 25 recipients per manual campaign. No automatic retries. Existing mock campaign screen remains mock. Webhook endpoint /api/whatsapp/webhook verifies challenge and HMAC signature, matches account and phone ID, updates known status and revokes consent for exact STOP/UNSUBSCRIBE/OPT OUT text. Public HTTPS webhook deployment is not configured; do not expose this local prototype directly. Webhook races, durable queues, media uploads, template creation, free-form replies and full production readiness remain pending. No real messages sent during development. Official docs: https://developers.facebook.com/documentation/business-messaging/whatsapp/overview/

## Phase 5 scheduling (mock only)
Admin can schedule one-time reminders in IST, choose opted-in contacts, review fee/enquiry candidates, pause, resume, cancel and filter jobs by date. A single-process timer scans persisted jobs every 15 seconds and simulates due jobs; no automatic network delivery. Jobs overdue while offline are simulated after restart. Consent is checked again at execution. Do not run multiple app instances against the same storage. Redis/BullMQ, recurring rules, actual approved-template dispatch, birthday data and production queue recovery remain pending. Added scheduler unit test; not executed in this environment.

## Phase 6 inbox
Verified WhatsApp webhooks now store incoming message metadata and text in conversations, deduplicate provider message IDs, reopen conversations and count unread items. The Live inbox page supports search, status filters, staff assignment by admins, internal notes, local reply drafts and rule-based suggestions. Admins can simulate a synthetic incoming message without Meta credentials. Updates use 10-second polling, not Socket.IO. No outbound inbox replies, automatic chatbot messages, media downloads, business-hour automation or production retention controls are implemented. Staff share the institute workspace. Use synthetic data only until security review; do not expose the local server publicly. Phase 6 tests and build not executed here.

## Phase 7 analytics and message studio
Admin-only reports separate live outcomes from simulations. Date filters use IST and campaign creation dates; latest delivery states and current institute snapshots are labeled. Excel export uses ExcelJS; PDF is browser Print / Save PDF. Staff assignment counts are not productivity or response-time metrics. Local multilingual draft presets support English, Hindi and Gujarati, with no external AI service or credentials. No conversation data is sent to any AI provider. Generative AI, translation, conversation summarization, response rate, real fee amounts and full historical reporting remain pending. Tests added but not executed in the connector environment.

## Installation troubleshooting
Use Node.js 22 LTS (22.12+) or supported newer LTS. Run `npm run install:check` before `npm install` if installation stalls. Project `.npmrc` disables automatic audit/funding requests, prefers cached packages and bounds registry retry delays; it does not disable TLS checks. Run `npm audit` explicitly after installation. If DNS or HTTPS checks fail, verify internet, DNS, firewall and proxy settings. If package download times out on a slow connection, try `npm install --fetch-timeout=120000 --fetch-retries=2 --loglevel=verbose`. Once installation succeeds, keep the generated package-lock.json for reproducible future `npm ci` installs. No lockfile generated here because registry DNS is unavailable in the execution environment. Do not delete .env or student data.

## v0.7.1: Offline test workspace (no npm install)
With Node.js 22 LTS and a local `.env` containing ADMIN_EMAIL and a unique ADMIN_PASSWORD (12–256 characters), run `npm run start:local` or `node --env-file-if-exists=.env scripts/start-local.mjs`. Open http://127.0.0.1:5173. This explicitly launches an independent lightweight browser interface, always uses `.local-test-data.json`, and blocks WhatsApp Cloud routes. It ignores MongoDB credentials; it never silently changes the normal storage mode. Use synthetic data only. The UI supports login, contacts, course/batch/student/enquiry creation, simulated campaigns, test inbox and message drafts, and basic admin reports. Full React UI, Excel imports/exports, scheduling UI and real integrations still require `npm install` and `npm run build`. Run `npm test` without installing dependencies for Node-only tests. If port 5173 is occupied, stop the existing server or set LOCAL_TEST_PORT=5175. The test admin account persists in `.local-test-data.json`; changing .env does not reset it. Never commit secrets or test data. Normal startup reports MongoDB connection errors without echoing the URI. CI checks Windows and Ubuntu, but success must be confirmed from Actions results.
