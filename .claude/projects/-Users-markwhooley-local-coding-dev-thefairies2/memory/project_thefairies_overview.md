---
name: The Fairies - Home Automation System Overview
description: Core architecture and tech stack of The Fairies home automation system - Node.js/Express backend, LitElement frontend, MongoDB, integrates Hubitat/LIFX/Sonos/Twinkly/Spotify
type: project
---

**The Fairies 2.0** is a home automation system running on a local network (192.168.x.x).

- **Backend**: Node.js + Express (port 3001), MongoDB (local + cloud), Sentry error tracking
- **Frontend**: LitElement web components, multi-page (not SPA), served on port 80
- **Integrations**: Hubitat Elevation (primary hub), LIFX lights, Sonos speakers, Spotify (via Sonos), Twinkly decorative lights, OpenWeather, Telegram (incomplete)
- **Core concept**: Scene-based automation — scenes contain commands for multiple device types, filtered by room and mode (time of day)
- **Automation triggers**: Motion sensors, lux levels, temperature, sun position (SunCalc), timers
- **No user auth** — relies on local network trust and CORS origin whitelisting

**Why:** User is planning a greenfield rebuild to improve UX, make it mobile-first with iWatch support, and modernise the architecture.

**How to apply:** All future work should reference this as the baseline system being rebuilt. Preserve all existing functionality while improving the experience.
