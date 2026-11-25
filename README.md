# Prakshal Connect v0.2
Internal communication development prototype for Prakshal IT Academy, Gandhinagar. Mock messaging only; no real WhatsApp delivery.

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
`npm test` runs the built-in Node integration test without dependencies. Passed on Node 22.16. Package registry was inaccessible during creation, so dependency installation, React/Vite build, Express runtime and MongoDB integration are unverified. No lockfile is provided. Local-only prototype: no TLS, encrypted database, persistent sessions, password reset, account deactivation, production privacy review or official WhatsApp API. Do not expose to the internet or use real student data. No actual messages sent. Next phases: normalized database, institute modules, native XLSX, official API and automation.
