---
name: Dashboard and device insights feature
description: Planning a new Dashboard page with energy monitoring, battery health, environment data, device detail views, and historical data
type: project
---

New feature in planning: a dedicated Dashboard page (separate from Homepage) providing device insights and home status.

**Key decisions (agreed 2026-03-23):**
- Dashboard is a NEW page at `/dashboard`, NOT built on the homepage
- Energy/power monitoring is high priority — many Hubitat switches report power and energy data
- Battery health card needed
- Environment card (indoor temps + outdoor weather) needed
- Security/contact sensors NOT needed (user has none currently)
- MTA card stays on homepage as-is, no changes needed
- Chart.js + react-chartjs-2 for visualizations (user prefers polished look, ~180KB cached by PWA SW)
- Historical data: keep FOREVER at full 10-minute resolution — no retention limits, no downsampling
- Device detail page at `/devices/:id` for drill-down
- Data management in Settings: show DB size, allow user to delete history by age or source, VACUUM after delete
- Personas documented: Homeowner, Guest, Commuter, Away User

**Why:** The homepage must stay focused on scene management and subway. Dashboard data is secondary and belongs on its own page. Historical data has negligible storage cost on the Pi (~100MB/year).

**How to apply:** Build Dashboard as a 6th nav item. Design it as the "investigate my home" page vs homepage being the "control my home" page. Always reference personas when making UX decisions.
