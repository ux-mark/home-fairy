---
name: Auto-restart PM2 after build
description: Always restart PM2 processes after building or merging changes — don't ask, just do it
type: feedback
---

After building or merging changes to dev, always restart the relevant PM2 processes without asking the user.

**Why:** The app runs in production on this Raspberry Pi via PM2. Built assets (server/dist/, client/dist/) are what PM2 serves. If you build but don't restart, the user is running stale code. The user doesn't want to be asked every time — just do it.

**How to apply:**
- After `npm run build` completes successfully, run `pm2 restart thefairies` (the Express backend serving built client + API)
- If Kasa sidecar Python code was changed, also run `pm2 restart kasa-sidecar`
- After restart, check `pm2 status` to confirm processes are online
- If a restart fails, check `pm2 logs thefairies --lines 20` and report the error
