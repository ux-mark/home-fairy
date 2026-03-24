# User Personas

> Document user personas here. When the user describes a persona, add it below.
> All agents reference these personas when making UX decisions, writing copy, or designing flows.

---

## The Homeowner
**Role/Title**: Primary user, home automation owner and administrator
**Added**: 2026-03-23
**Last updated**: 2026-03-23

### Background
Technically savvy homeowner who built and maintains the Home Fairy system. Understands the devices, the automation logic, and the underlying tech. Uses the app daily — it's the primary interface for controlling their home environment. Comfortable with configuration but values a clean, efficient UI that doesn't waste time.

### Goals
- Manage scenes and automation effortlessly from mobile while moving around the home
- Understand what's happening across all devices: energy usage, battery health, temperature trends
- Investigate specific devices when something seems off ("why is this plug drawing so much power?")
- Keep the system running smoothly — catch low batteries before they die, spot anomalies
- Track energy consumption to understand costs and identify waste
- Fine-tune automation over time based on actual usage patterns

### Pain points
- Device data exists but is buried and inaccessible — can't see power usage, battery levels, or temperature trends without digging
- No historical view — can't answer "has this been getting worse?" or "what changed last week?"
- Homepage should be fast and focused — clutter from secondary information slows down the primary tasks (scene control, subway check)

### Behaviors
- Primary device: mobile phone, used throughout the day while moving around the home
- Secondary: desktop browser for deeper configuration, investigation, and review
- Remote access: occasionally checks in via Cloudflare tunnel when away from home
- Daily: checks subway status in the morning, activates scenes throughout the day, sets night mode before bed
- Weekly: reviews device status, checks battery levels, looks at energy patterns
- Occasionally: configures new devices, edits scenes, adjusts automation settings

### Needs
- **Must-haves**: Quick scene control, subway status, energy monitoring, battery warnings, temperature overview, device investigation
- **Nice-to-haves**: Energy cost estimates, seasonal comparisons, anomaly alerts, battery replacement predictions

### Quotes
> "The most important thing for the user right now is to manage their scenes or check the subway. Everything else is secondary."
> "We get a lot of information from Hubitat regarding devices and this is not really shared with the user."
> "We should really consider a dashboard view of this kind of information AND specific device information accessible via the device as the user wants to investigate things in their household."

---

## The Guest
**Role/Title**: Visitor staying at the home
**Added**: 2026-03-23
**Last updated**: 2026-03-23

### Background
A friend, family member, or short-term visitor. Not technically inclined with home automation. Needs to interact with the home (lights, scenes) without being overwhelmed by configuration, device management, or system details. Should feel empowered, not intimidated.

### Goals
- Turn lights on and off without help
- Activate appropriate scenes for their needs (watching TV, going to bed)
- Check the subway if they're heading out
- Not break anything or accidentally change settings

### Pain points
- Too many options and screens are overwhelming
- Technical terminology (modes, automation, sensors) is confusing
- Fear of accidentally changing something they shouldn't

### Behaviors
- Uses the app briefly and infrequently during their stay
- Primarily on mobile
- Needs guidance on what to tap — clear labels, obvious actions
- Will not explore beyond what's immediately visible

### Needs
- **Must-haves**: Simple scene activation, clear on/off controls, subway status
- **Nice-to-haves**: Guided onboarding ("tap here to turn on lights"), limited view that hides admin features

### Quotes
> "The guest wants the bare minimum information."

---

## The Commuter
**Role/Title**: Household member focused on transit timing
**Added**: 2026-03-23
**Last updated**: 2026-03-23

### Background
Could be the homeowner or another household member. Their primary interaction with Home Fairy is checking the MTA subway status while getting ready in the morning. They want one answer instantly: "should I leave now?" Everything else is secondary to this moment.

### Goals
- Know at a glance whether to leave now, soon, or wait
- See the next few train arrivals for their configured stops
- Not be distracted by unrelated information when they're in a rush

### Behaviors
- Opens the app 1-2 times on weekday mornings
- Glances at the MTA card for 2-3 seconds — green/orange/red is the entire interaction
- May check from the Apple Watch view (/watch) for even faster access
- Rarely interacts with other features during this use case

### Needs
- **Must-haves**: Instant, prominent subway status on the homepage, walk-time-aware colour coding
- **Nice-to-haves**: Morning-specific view, push notification when it's time to leave

---

## The Away User
**Role/Title**: The homeowner when not physically at home
**Added**: 2026-03-23
**Last updated**: 2026-03-23

### Background
This is the homeowner accessing Home Fairy remotely via the Cloudflare tunnel. They're at work, travelling, or out for the evening. Their mindset shifts from "control" to "monitor" — they want reassurance that everything is fine at home, and the ability to act if it isn't.

### Goals
- Verify the home is in a sensible state: lights off when they should be, temperatures normal
- Check if anything needs attention: low batteries, unusual energy draw
- Remotely activate scenes if needed (e.g., turn on lights before arriving home)

### Pain points
- Can't physically check things — needs the app to be their eyes
- Latency over tunnel means the UI needs to feel responsive even with slower connections
- Uncertainty: "did the night mode actually activate?" — needs visible confirmation of state

### Behaviors
- Access via mobile browser over Cloudflare tunnel
- Checks in a few times when away, usually briefly
- Primarily reads/monitors, occasionally takes action (activate a scene, check a device)
- May have slower connection than on local network

### Needs
- **Must-haves**: Home state overview (mode, active scenes, device status), remote scene activation
- **Nice-to-haves**: Dashboard with environment and energy summary, notification if something is unusual
