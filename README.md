# Prakshal Connect v0.5
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
