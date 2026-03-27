# Data Journey Plan

> Product vision document for how data flows through Home Fairy, how users discover it, and how they shape it to understand their home.

---

## Section 1: Design Principles

### "Help the user find and understand their own data."

Every data point in Home Fairy exists to answer a question the user has -- or a question they didn't know to ask. The system's job is to surface the right data at the right depth at the right moment.

**Progressive disclosure.** Information reveals itself as the user focuses in. The homepage whispers; the room detail speaks; the insights page explains; the device detail page opens the books. The user never sees more than they need, but always has a path to see more.

**Every number tells a story.** A bare number is meaningless. "142W" means nothing. "142W -- 18% above your usual for this hour" tells a story. Every metric must be accompanied by context: comparison to a baseline, a trend direction, or a human-readable assessment.

**Visual signals on summary surfaces.** The homepage is for glancing. Colour, shape, and iconography communicate state. Numbers are for detail surfaces. The user looks at the homepage and knows if anything needs attention without reading a single digit.

**Contextualised numbers on detail surfaces.** The room page and insights page show numbers, but every number earns its place by explaining itself. "1.42 today -- about 43/month, 18% higher than usual" is a complete thought. "1.42" is not.

**Full exploration on deep surfaces.** The device detail page and chart views are for investigation. Period selectors, overlays, comparisons, raw data. The user who drills this deep is asking "why?" and the system must let them find the answer.

**Consistency.** The same metric uses the same visual language everywhere. The OverUnderBadge component is the canonical way to show deviation from normal. The same colour thresholds apply whether you're looking at energy, temperature, or battery drain. Green means below or normal. Amber means elevated. Red means high.

---

## Section 2: The Data Landscape

### 2.1 Energy Data

**Source:** Kasa smart plugs and strips (TP-Link hardware) via python-kasa sidecar
**Tables:** `kasa_devices` (live attributes), `device_history` (time series)
**Capture frequency:** 10 seconds (kasa-poller syncs to SQLite), 10 minutes (history-collector snapshots to device_history)
**Retention:** Indefinite at 10-minute resolution

| Metric | Source column | `device_history.source` | Unit | Notes |
|--------|-------------|------------------------|------|-------|
| Power | `kasa_devices.attributes -> $.power` | `power` | W | Real-time wattage draw |
| Energy | `kasa_devices.attributes -> $.energy` | `energy` | kWh | Cumulative energy counter |
| Voltage | `kasa_devices.attributes -> $.voltage` | `voltage` | V | Mains voltage |
| Current | `kasa_devices.attributes -> $.current` | `current` | A | Amperage draw |
| Daily kWh | Kasa hardware memory | via `kasaClient.getDailyStats()` | Wh | Per-day totals stored on device |
| Monthly kWh | Kasa hardware memory | via `kasaClient.getMonthlyStats()` | Wh | Per-month totals stored on device |
| Runtime today | `kasa_devices.attributes -> runtime_today` | (not historised) | minutes | How long device has been on today |
| Runtime month | `kasa_devices.attributes -> runtime_month` | (not historised) | minutes | How long device has been on this month |

**Current display locations:**
- `DashboardPage > EnergyCard` -- total watts, per-device breakdown, anomalies, inline 24h trend charts
- `DeviceDetailPage` -- per-device power/energy/voltage/current history charts with period selector
- `RoomDetailPage > RoomIntelligence > EnergyRow` -- room total watts, per-device breakdown
- `HomeSummaryStrip` -- (no energy pill currently)

**Comparisons possible today:**
- Current hour vs 7-day hourly average (OverUnderBadge on EnergyCard)
- Per-device anomaly detection (>2x normal for current hour)
- 7-day daily kWh history bar chart
- Peak usage hours (top 3)

**Comparisons possible from existing data but not yet surfaced:**
- Actual daily cost vs same day last week (`dailyOverUnderPercent` -- computed in backend, not in frontend type)
- Month-to-date cost vs last month (`monthOverMonthPercent` -- computed in backend, not in frontend type)
- Device cost ranking (`deviceCostRanking` -- computed in backend, not in frontend type)
- Room cost ranking (`roomCostRanking` -- computed in backend, not in frontend type)
- Projected daily cost (`projectedDailyCost` -- computed in backend, not in frontend type)
- Actual daily cost from hardware memory (`actualDailyCost` -- computed in backend, not in frontend type)

### 2.2 Temperature Data

**Source:** Hubitat sensors (motion sensors with temperature capability) via hub_devices
**Tables:** `hub_devices` (live attributes via `$.temperature`), `device_history` (time series)
**Capture frequency:** Real-time via Hubitat webhook, 10 minutes (history-collector)
**Retention:** Indefinite

| Metric | Source column | `device_history.source` | Unit |
|--------|-------------|------------------------|------|
| Temperature | `hub_devices.attributes -> $.temperature` | `temperature` | degrees C |

**Current display locations:**
- `HomePage > RoomCard` -- raw number with thermometer icon
- `DashboardPage > EnvironmentCard` -- house average, trend (warming/cooling/stable), room outliers, multi-room overlay chart (24h), over/under badge vs 30-day average
- `DashboardPage > HomeSummaryStrip > TemperaturePill` -- house average + trend arrow
- `RoomDetailPage > RoomIntelligence > EnvironmentRow` -- room temp + 24h sparkline
- `DeviceDetailPage` -- sensor temperature history chart

**Comparisons possible today:**
- House average vs 30-day average
- Room vs house average (outlier detection, >2 degree deviation)
- Indoor vs outdoor delta
- 2-hour vs 4-6-hour trend (warming/cooling/stable)
- Multi-room overlay on 24h chart

### 2.3 Illuminance (Lux) Data

**Source:** Hubitat sensors (motion sensors with illuminance capability) via hub_devices
**Tables:** `hub_devices` (live attributes via `$.illuminance`), `device_history` (time series)
**Capture frequency:** Real-time via Hubitat webhook, 10 minutes (history-collector)
**Retention:** Indefinite

| Metric | Source column | `device_history.source` | Unit |
|--------|-------------|------------------------|------|
| Lux | `hub_devices.attributes -> $.illuminance` | `lux` | lux |

**Brightness thresholds (from `insights-engine.ts`):**
- < 10 lux = dark
- 10-49 lux = dim
- 50-199 lux = moderate
- 200-499 lux = bright
- 500+ lux = very bright

**Current display locations:**
- `HomePage > RoomCard` -- raw number with sun icon
- `DashboardPage > EnvironmentCard` -- brightness level label, house average lux, over/under badge vs 7-day hourly average, multi-room overlay chart (24h)
- `DashboardPage > HomeSummaryStrip > BrightnessPill` -- brightness level + lux average
- `RoomDetailPage > RoomIntelligence > EnvironmentRow` -- raw lux number

**Comparisons possible today:**
- House average vs 7-day hourly average
- Room ranking by lux
- Multi-room lux overlay on 24h chart

### 2.4 Battery Data

**Source:** Hubitat battery-powered devices (sensors, remotes) via hub_devices
**Tables:** `hub_devices` (live attributes via `$.battery`), `device_history` (time series)
**Capture frequency:** Real-time via Hubitat webhook, 10 minutes (history-collector)
**Retention:** Indefinite

| Metric | Source column | `device_history.source` | Unit |
|--------|-------------|------------------------|------|
| Battery level | `hub_devices.attributes -> $.battery` | `battery` | % |

**Status thresholds:**
- < 5% = critical
- 5-14% = low
- 15%+ = ok

**Current display locations:**
- `DashboardPage > BatteryCard` -- fleet health summary, urgency bands (attention/monitor/healthy), per-device drain rate and predicted days remaining, 30-day trend chart per device
- `DashboardPage > HomeSummaryStrip > BatteryPill` -- healthy/total count, worst status
- `DashboardPage > AttentionBar` -- critical and low battery alerts, anomalous drain alerts
- `RoomDetailPage > RoomIntelligence > BatteryRow` -- per-device bars with drain rate
- `DeviceDetailPage` -- battery history chart

**Comparisons possible today:**
- 14-day drain rate calculation (max - min over days)
- Predicted days remaining
- Anomalous drain detection (>2x fleet average)
- Fleet health segmentation

### 2.5 Activity (Motion) Data

**Source:** Hubitat motion sensors, recorded on motion_active/motion_inactive events
**Tables:** `room_activity` (event log, not `device_history`)
**Capture frequency:** Real-time, one row per motion event
**Retention:** Indefinite (no pruning configured for room_activity)
**Columns:** `room_name`, `sensor_name`, `event_type` (motion_active/motion_inactive), `recorded_at`
**Index:** `idx_room_activity_lookup` on `(room_name, recorded_at)`

| Metric | Table | Query pattern |
|--------|-------|---------------|
| Events in last 24h | `room_activity` | `COUNT(*) WHERE event_type = 'motion_active' AND recorded_at > datetime('now', '-1 day')` |
| Hourly pattern (7d) | `room_activity` | `GROUP BY strftime('%H', recorded_at)` |
| Daily trend (7d) | `room_activity` | `GROUP BY date(recorded_at)` |
| Room ranking | `room_activity` | Per-room event counts |

**Current display locations:**
- `HomePage > RoomCard` -- "last active" timestamp
- `RoomDetailPage > RoomIntelligence > ActivityRow` -- 24h event count, hourly bar chart (7-day pattern)
- `DashboardPage > ActivityCard` -- Frontend component exists but never renders because the backend `/summary` endpoint does not compute `ActivityInsights`

**What is NOT yet built:**
- The backend `computeInsights()` function does not compute activity insights
- The `/summary` endpoint does not return activity data
- The `ActivityCard` on the Insights page has never rendered with real data
- Activity is not available as an overlay on any chart
- House-level activity aggregation does not exist
- Weekday vs weekend activity patterns are not computed

### 2.6 Device State (On/Off)

**Source:** Kasa devices (`kasa_devices.attributes -> $.switch`), Hub devices (`hub_devices.attributes -> $.switch`)
**Capture:** Real-time via 10-second Kasa poller and Hubitat webhooks
**Historised:** Not directly -- power history implicitly captures on/off (0W = off)

**Current display:** On/off dot indicator in EnergyCard device rows, device detail attributes section

### 2.7 Weather (Outdoor)

**Source:** OpenWeather API via `weather-client.ts`
**Tables:** `device_history` (source = `weather_temp`, `weather_humidity`)
**Capture frequency:** 10 minutes (history-collector)
**Retention:** Indefinite

| Metric | `device_history.source` | `source_id` | Unit |
|--------|------------------------|-------------|------|
| Outdoor temp | `weather_temp` | `outdoor` | degrees C |
| Outdoor humidity | `weather_humidity` | `outdoor` | % |

**Also available live (not historised):** `description`, `icon`, `wind_speed`

**Current display locations:**
- `HomePage > WeatherCard` -- conditions, temp, humidity, wind
- `DashboardPage > EnvironmentCard > OutdoorSection` -- temp, humidity, wind, description

### 2.8 Sonos Energy Use

**Reframing:** Sonos data is best understood through the lens of "what does this cost me?" rather than playback state. The value comes from linking Sonos speakers to Kasa smart plugs via the `device_links` table and surfacing energy cost attribution.

**Source:** node-sonos-http-api via sonos-client (playback state); Kasa plugs via device_links (energy cost)
**Tables:** `sonos_speakers` (configuration), `sonos_auto_play` (rules), `device_links` (speaker-to-plug associations)
**Historised:** Playback state is transient. Energy data is historised via the linked Kasa plug's device_history entries.

**Multi-speaker rooms:** A room can have multiple speakers (surround sound). The energy model must support multiple Kasa devices linked to speakers in the same room -- sum their linked plug costs to get the room's total Sonos energy use.

**Current display:** SonosDetail page (with new "Power source" section showing linked plug energy cost), Sonos tab on Devices page, Music section in Settings

**Drill-down path:** Room-level Sonos energy total → individual speaker detail → linked Kasa plug detail with full energy history charts

### 2.9 Mode Transitions

**Source:** `current_state` table (key = `mode`), `mode_triggers` table
**Historised:** Not stored in device_history. The `current_state` table only holds the current value.
**Future potential:** Mode transitions could be logged to correlate energy/activity with time-of-day modes.

### 2.10 Notifications and Device Health

**Source:** `notifications` table, `device_health` table
**Tables:** `notifications` (alerts), `device_health` (failure tracking)
**Display:** `DashboardPage > AttentionBar` -- stacked alert cards for critical/warning/info items

---

## Section 3: The Four Zoom Levels

### Level 1 -- Homepage (Glance: "Is anything unusual?")

**User mindset:** "I have 3 seconds. Is everything fine, or do I need to look at something?"

**What the user sees today:**
- Room cards with: room name/icon, scene buttons, raw temperature number, raw lux number, "last active" timestamp
- Mode selector
- Weather card
- MTA subway card

**What the user should see (vision):**

The homepage stays focused on scenes and subway -- that is the primary task. The environmental data on room cards should use iconography paired with the RIGHT numbers -- not all numbers, but the ones that are powerful and meaningful at a glance.

**Room card environmental indicators:**
- **Temperature:** The number stays (people understand degrees) with comfort-zone colour tinting. Cool blue below 18 degrees, neutral green for 18-24, warm amber above 24, red above 28. Icon + number together.
- **Lux:** The lux number stays, paired with a dynamic brightness icon. Sun (bright/very bright), cloud-sun (moderate), cloud (dim), moon (dark). The icon communicates the feeling; the number gives precision. Both together.
- **Activity:** A small presence indicator dot (green/yellow/grey) paired with the relative time ("8m ago"). Visual signal + human-readable context together.
- **Energy:** Show percentage of power usage with an appropriate icon -- not raw watts (which are meaningless to most users), but a contextual percentage that communicates whether this room is drawing more or less than usual. Currency symbol MUST always accompany any cost figure.
- **Cost badge:** Only appears when the room's energy cost today is above normal (>5% over baseline). Right-aligned, small, coloured using OverUnderBadge logic. Shows the percentage above normal with the currency symbol (e.g., "↑18% · €1.42"). If everything is normal, nothing shows -- silence is the success state.
- **Drill-down:** Every metric on the card is tappable. Temperature taps to room environment. Lux taps to room environment. Energy badge taps to room energy section. The homepage is a gateway, not a dead end.

**HomeSummaryStrip enhancement:**
The HomeSummaryStrip currently shows Temperature, Brightness, and Battery pills that scroll to the Insights page cards. This is a navigation aid, not homepage data. It should remain on the Insights page, not the homepage. The homepage does not need a summary strip -- room cards ARE the summary.

**Critical alerts:**
If an AttentionBar item with severity `critical` exists, a slim banner at the top of the homepage should surface it. One line: "Hallway Motion Sensor battery critical -- 2% remaining". Tapping navigates to the Insights page attention section. Non-critical items stay on the Insights page only.

**Navigation from homepage:**
- Tap room card name/icon -> Room Detail page
- Tap room card temperature -> Room Detail page (environment section scrolled into view)
- Tap room card lux icon -> Room Detail page (environment section)
- Tap room card energy badge -> Room Detail page (energy section)
- Tap critical alert banner -> Insights page (attention section)

### Level 2 -- Room Detail (Focus: "What's happening in this room?")

**User mindset:** "I tapped into this room. Show me what's going on here."

**What exists today:**
- `RoomIntelligence` accordion with: Environment (temp + sparkline + lux), Energy (total watts + device list), Activity (24h events + hourly bar chart), Battery (per-device bars + drain rates)
- Light assignments, device assignments, scene management, Sonos controls

**What it should become (vision):**

The Room Intelligence section should be open by default (not collapsed in an accordion) and presented with full contextualised numbers.

**Environment section:**
- Temperature: "21.3 degrees -- stable over the last 2 hours, 0.8 degrees warmer than house average"
- Lux: "142 lux -- moderate brightness" (using the same threshold labels as the insights engine)
- 24h temperature chart remains, but add the house average as a faint reference line so the user can see how this room compares

**Energy section:**
- Room total: "This room is using 87W right now"
- Daily cost: "Today's cost so far: 0.42 -- about 13/month at this rate" (requires `roomCostRanking` data from backend)
- Per-device breakdown sorted by power draw, each row showing: device name (link to device detail), current watts, percentage of room total
- Over/under badge if room cost is above/below normal
- 24h room power chart (aggregated from all devices in room)

**Activity section:**
- "34 motion events today -- most active between 8am and 10am"
- Hourly bar chart stays
- Add a "this week vs last week" comparison line: "12% more activity this week than last"

**Battery section:**
- Per-device: "Hallway Sensor -- 67%, draining 0.8% per day, about 84 days remaining"
- Urgency colouring matching the Insights page bands

**Navigation from room detail:**
- Tap any device name -> Device Detail page
- Tap "View in insights" link -> Insights page (scrolled to relevant card)
- Tap Sonos speaker -> Sonos Detail page

### Level 3 -- Insights Page (Analyse: "What's the big picture?")

**User mindset:** "Show me the whole house. Where is my money going? What patterns emerge?"

**What exists today:**
- `AttentionBar` -- stacked alert cards
- `HomeSummaryStrip` -- 3 stat pills (temperature, brightness, battery)
- `EnergyCard` -- total watts, OverUnderBadge, narrative text, peak hours, anomaly band + all devices band, inline 24h trend per device
- `EnvironmentCard` -- outdoor weather, indoor temperature summary + outliers + multi-room temp chart + multi-room lux chart
- `BatteryCard` -- fleet health, urgency bands, 30-day trend per device
- `SunModeCard` -- current mode, sun schedule
- `ActivityCard` -- component exists but never renders (backend doesn't compute house-level activity)

**What it should become (vision):**

**Energy section (enhanced):**
The EnergyCard should surface the cost intelligence that the backend already computes:

- Headline: "Your home costs X.XX today so far" (actualDailyCost from Kasa hardware)
- Sub-headline: "Projected: about XX this month" (monthToDateCost extrapolated)
- Comparison: "That's X% more/less than last month" (monthOverMonthPercent)
- Daily over/under: "Today is X% above/below the same day last week" (dailyOverUnderPercent)
- **Room cost ranking table:** rooms sorted by monthToDateCost, each row showing room name (link), daily cost, month-to-date cost, device count
- **Device cost ranking table:** devices sorted by monthlyCost, each row showing device name (link), monthly kWh, monthly cost, daily average cost
- Period selector: today / this week / this month / custom range
- Charts: daily kWh bar chart (already exists), add monthly cost trend line

**Environment section (enhanced):**
- Add room temperature ranking table (warmest to coolest)
- Add room brightness ranking table
- Temperature outlier cards with "why" context (e.g., "Bedroom is 3 degrees warmer than the rest of the house")

**Activity section (new -- needs backend work):**
- House-level activity summary: "Your home had 247 motion events today across all rooms"
- Room ranking by activity: most active to quietest
- Daily trend bar chart (7 days)
- Most active room callout with peak hours
- Weekday vs weekend comparison

**Battery section (unchanged):**
The current BatteryCard implementation is comprehensive and well-designed.

**Period selectors:**
Every chart and ranking on the Insights page should support at least: 24h, 7d, 30d. Energy charts should additionally support: this month, last month, custom range. This is the surface where the user shapes their data.

### Level 4 -- Device Detail (Investigate: "What is this specific device doing?")

**User mindset:** "Something is off with this device. Show me everything."

**What exists today:**
- Device attributes table (all key-value pairs from hub_devices or kasa_devices)
- Power insights: current watts, 7-day average, OverUnderBadge, % of total house, daily cost impact
- Battery insights: current level, drain per day, predicted days remaining
- Temperature insights: current temp, 30-day average
- History charts: selectable source (power/energy/battery/temperature/lux), period selector (24h/7d/30d)
- Room assignments, scene usage context
- Kasa devices: rename, on/off control, strip child outlets

**What it should become (vision):**

**Cost attribution:**
- "This device costs you X.XX per month" (from deviceCostRanking data)
- "That's X% of your total energy cost"
- Monthly cost trend (from Kasa monthly stats -- hardware memory)
- Daily cost trend (from Kasa daily stats -- hardware memory)

**Comparison to self:**
- "This device is using X% more/less power than its 7-day average" (already exists)
- Add: "This device used X.XX last month vs X.XX this month" (from monthly stats)
- Add: "Runtime today: X hours, typical: Y hours" (from runtime_today vs average)

**Linked device context (future -- requires device_links table):**
- "This plug powers your Living Room Sonos speaker"
- "Your Living Room speaker costs X.XX per month to run"
- "Turn off plug -> speaker will stop"

**Enhanced charts:**
- Dual-axis support: overlay activity bars on power line chart to see correlation
- Period comparison: "show last week as ghost line" overlay on current period
- Custom date range picker
- Voltage and current charts for power-user investigation

---

## Section 4: Cross-Comparison -- The User Shapes Their Data

### 4.1 Time Comparisons

The user wants to answer: "Is this normal? Is it getting better or worse?"

| Comparison | Data source | Existing API support | Frontend support |
|-----------|-------------|---------------------|------------------|
| Today vs yesterday | Kasa daily stats | Yes (`getDailyStats`) | No |
| Today vs same day last week | Kasa daily stats | Yes (computed in `insights-engine.ts` as `dailyOverUnderPercent`) | No |
| This week vs last week | Kasa daily stats | Partial (can compute from daily data) | No |
| This month vs last month | Kasa monthly stats | Yes (computed as `monthOverMonthPercent`) | No |
| Custom range vs custom range | `device_history` | Partial (period param supports 24h/7d/30d/1y/all) | No |

**UI pattern -- time period toggle:**
Charts should have a row of period buttons: `24h | 7d | 30d | 3m | 1y`. The `device_history` API already supports these periods. The frontend `TimeSeriesChart` already handles both intra-day (HH:MM) and multi-day (MM/DD) formatting based on data span.

**UI pattern -- "compare to" overlay:**
A "Compare to" dropdown on charts that overlays a second dataset as a semi-transparent ghost line. Options: "Same period last week", "Same period last month", "Custom". This requires fetching a second history query with an offset and rendering it as an additional Chart.js dataset with reduced opacity.

### 4.2 Room Comparisons

The user wants to answer: "Which room costs most? Which is warmest? Where are people spending time?"

| Comparison | Data available | API endpoint | Frontend |
|-----------|---------------|-------------|---------|
| Room cost ranking | Yes (roomCostRanking in insights) | `/dashboard/summary` | Not yet |
| Room temperature ranking | Yes (from rooms[].temperature) | `/dashboard/summary` | Partial (outliers shown, no full ranking) |
| Room brightness ranking | Yes (luxInsights.roomRanking) | `/dashboard/summary` | Not shown as ranking table |
| Room activity ranking | Yes (room_activity table) | Not at house level | `ActivityCard` exists but doesn't render |

**UI pattern -- ranking tables:**
Sorted lists with the highest-value room at top. Each row links to the Room Detail page. Use a subtle bar visualisation (like battery bars) to show relative magnitude.

**UI pattern -- multi-room overlay:**
The `EnvironmentCard` already implements multi-room overlay charts using `MultiLineChart` with a shared colour palette (`ROOM_PALETTE`). This same pattern should be extended to energy and activity charts. Up to 6 rooms, colour-coded, with shared x-axis.

### 4.3 Device Comparisons

The user wants to answer: "Which device draws the most? Is any device getting worse?"

| Comparison | Data available | API endpoint | Frontend |
|-----------|---------------|-------------|---------|
| Device power ranking | Yes (power[].power sorted) | `/dashboard/summary` | EnergyCard shows sorted list |
| Device cost ranking | Yes (deviceCostRanking) | `/dashboard/summary` | Not yet |
| Device battery drain ranking | Yes (batteryInsights.deviceDrainRates) | `/dashboard/summary` | BatteryCard shows urgency bands |
| Device vs own average | Yes (7d average in device insights) | `/dashboard/device/:id/insights` | DeviceDetailPage shows OverUnderBadge |
| Device month-over-month | Yes (Kasa monthly stats) | `/kasa/devices/:id/energy/monthly` | Not yet |

**UI pattern -- "is this device getting worse?":**
On the Device Detail page, show a trend indicator. Compare this month's average daily power to last month's. If the device is using 15%+ more, flag it: "This device is drawing more power than last month. Average daily cost increased from X.XX to Y.YY." This uses Kasa hardware memory stats, no extra history collection needed.

### 4.4 Cross-Metric Correlation

This is the most powerful capability. The user wants to discover relationships between different types of data.

| Correlation | Question it answers | Data sources | Difficulty |
|------------|-------------------|-------------|-----------|
| Activity vs energy | "When I'm home more, does it cost more?" | `room_activity` + `device_history(power)` | Medium -- need dual-axis chart |
| Temperature vs energy | "Does heating/cooling drive my cost?" | `device_history(temperature)` + `device_history(power)` | Medium -- same time series, different scales |
| Activity vs time of day | "When are people home?" | `room_activity` grouped by hour | Easy -- already shown at room level |
| Weekday vs weekend | "Do weekends cost more?" | `device_history(power)` grouped by weekday | Medium -- need day-of-week aggregation |
| Mode vs energy | "Which mode is most expensive?" | Mode transitions + `device_history(power)` | Hard -- mode transitions not historised |
| Weather vs energy | "Does cold weather increase my energy cost?" | `device_history(weather_temp)` + `device_history(power)` | Medium -- dual-axis chart |

**UI pattern -- dual-axis chart:**
A chart with two y-axes: primary metric as a line (e.g., power in watts), secondary metric as bars or a differently-styled line (e.g., activity events per hour). Both share the same x-axis (time). Chart.js supports this natively with `yAxisID`.

**UI pattern -- "overlay" toggle:**
On any chart, an "Overlay" button that opens a dropdown: "Activity", "Temperature", "Weather". Selecting one fetches the secondary dataset for the same time period and renders it on a second y-axis. Deselecting removes it.

**UI pattern -- correlation insight cards:**
Pre-computed correlation insights displayed as natural language:
- "Your busiest day this week (Tuesday, 89 motion events) was also your most expensive (3.21)"
- "Energy usage is 23% higher on weekdays than weekends"
- "When outdoor temperature drops below 5 degrees, your energy usage increases by about 35%"

These require new backend computation but use existing data.

---

## Section 5: Activity as First-Class Metric

The `room_activity` table is uniquely powerful. Unlike sensor readings that are sampled periodically, motion events capture the exact moments a room becomes occupied. This data answers questions no other metric can.

### What activity data enables

**Occupancy patterns:**
- "Time in house" = count of distinct hours with at least one motion event across any room
- "Time in room" = count of distinct hours with motion events in a specific room
- Daily/weekly occupancy heat map: rows = hours of day, columns = days of week, colour = event density

**Cost correlation:**
- "I was home more this week. Did it cost more?" -- overlay weekly activity total on weekly energy cost
- "The living room costs the most. Is it because I spend the most time there?" -- per-room activity vs per-room cost

**Anomaly detection:**
- "The bedroom had motion events at 3am for the last three nights" -- unusual activity at unusual hours
- "The hallway hasn't had any motion in 48 hours" -- sensor may have died

### Where activity should appear

**Homepage (Level 1):**
- Presence dot on room card (green = motion in last 5 min, fading to grey)

**Room Detail (Level 2):**
- 24h event count with contextualised narrative
- Hourly bar chart (already exists)
- This week vs last week comparison
- Activity timeline: actual motion events as a timeline strip

**Insights Page (Level 3):**
- **Charts are the primary presentation** — not ranked lists, not tables. Activity data is inherently visual: where are people, when, and how much?
- House-level daily activity trend (7-day bar chart)
- Room activity as a **horizontal bar chart** (rooms on y-axis, event counts on x-axis) — not a numbered list. The chart communicates relative magnitude instantly; a list forces the user to read numbers.
- Hourly activity pattern as a **24-hour bar chart** showing house-wide motion distribution across hours of the day (7-day average). This answers "when is the house most active?" at a glance.
- Most active/quietest room callout as a concise headline above the charts
- Activity overlay available on energy charts

**Device Detail (Level 4):**
- For motion sensors: event log, daily event count, detection pattern analysis

### Backend work needed

The `insights-engine.ts` `computeInsights()` function must be extended to compute `ActivityInsights`:

```
ActivityInsights {
  roomRanking: Array<{ room, events24h, peakHours }>
  dailyTrend: Array<{ day, totalEvents }>
  mostActiveRoom: { room, events24h } | null
  quietestRoom: { room, events24h } | null
}
```

The frontend `ActivityInsights` type already exists in `client/src/lib/api.ts` (line 379). The `ActivityCard` component already exists in `client/src/components/dashboard/ActivityCard.tsx` and handles empty state, room ranking, and daily trend chart. The only missing piece is the backend computation and wiring it into the `/dashboard/summary` response.

---

## Section 6: Contextual Data Presentation Rules

### Metric presentation matrix

| Metric | Homepage (Level 1) | Room Detail (Level 2) | Insights Page (Level 3) | Device Detail (Level 4) |
|--------|-------------------|----------------------|------------------------|------------------------|
| **Energy cost** | % of power usage with icon + cost badge when above normal. Badge shows "↑18% · €1.42" (ALWAYS include currency symbol). Nothing shown when normal. | "€1.42 today so far -- about €43/month, 18% higher than last week" with OverUnderBadge. Tappable → per-device breakdown. | House total: "Your home costs €2.87 today -- projected €87/month, 12% more than last month (€78)." Room ranking table. Device ranking table. All tappable. | "This device costs €4.50/month -- 8% of your total energy spend." Full cost history chart. |
| **Sonos energy** | Not shown on homepage | Room Sonos energy total (sum of linked plug costs). "Speakers in this room cost €3.20/month." | Sonos energy ranking by room. | Per-speaker cost via linked Kasa plug. Drill into plug history. Multi-speaker rooms sum all linked plugs. |
| **Power (W)** | Not shown as raw number. Use % of usual instead. | Room total: "87W total" with per-device breakdown (sorted by watts). Tappable devices → device detail. | Total house watts in energy card header with OverUnderBadge. Anomaly list. Interactive chart -- toggle devices on/off. | Full timeline with period selector. "Currently 45W -- average 38W, 18% above normal." Toggle comparison overlays. |
| **Temperature** | Number with comfort colour tint (cool/neutral/warm) + thermometer icon. Number stays -- people understand degrees. | "21.3°C -- stable, 0.8° warmer than house average." 24h chart with house average reference line. Chart toggles: show/hide rooms. | House average + trend arrow + over/under badge. Room outlier cards. Multi-room overlay chart with toggleable room lines. | Sensor history chart with period selector and comparison overlay. |
| **Lux** | Number with dynamic brightness icon (sun/cloud-sun/cloud/moon). Number stays alongside icon. | Number + brightness label: "142 lux -- moderate". Chart with room comparison. | Room brightness ranking. Multi-room overlay chart with toggleable lines. | Sensor history chart. |
| **Battery** | Not shown unless critical (then appears in critical alert banner at top) | Per-device bars with drain rate and predicted days remaining. | Fleet health summary. Urgency bands (attention/monitor/healthy). 30-day trend per device. | Full drain history chart. Drain rate computation. "0.8% per day -- about 84 days remaining" |
| **Activity** | Presence dot on room card (green fading to grey based on recency) | "34 events today, most active 8-10am." Hourly bar chart. "12% more active than last week." | House-level daily trend. Room ranking. Most/quietest callouts. Available as overlay on energy charts. | Motion event log. Daily event count. Pattern analysis. |
| **Weather** | Existing weather card (conditions, temp, humidity, wind) | Not shown separately (indoor/outdoor delta in insights engine) | Outdoor section in EnvironmentCard. Indoor/outdoor delta. Available as overlay on energy charts. | Not applicable |

### Formatting rules

**Currency (CRITICAL -- never omit):**
- **ALWAYS** prefix cost values with `pref_currency_symbol` from `current_state` table (default: `€`)
- Every cost figure in every context MUST show the symbol: "€2.87" not "2.87"
- This applies to: headlines, badges, table cells, chart tooltips, narratives, empty state examples
- Daily values: 2 decimal places (e.g., "€2.87")
- Monthly values: nearest whole number when > 10, 2 decimal places when < 10 (e.g., "€87" or "€4.50")
- Cost per device per month: 2 decimal places always (e.g., "€4.50/month")
- Omitting the currency symbol is a bug. Agents must always use `formatCost()` utility which prepends the symbol.

**Over/under badges (OverUnderBadge component):**
- Within +/-5%: green, "Normal"
- 5-30% above: amber, "X% above normal"
- 30%+ above: red, "X% above normal"
- 5-30% below: green, "X% below normal"
- 30%+ below: blue, "X% below normal"

**Time display:**
- < 5 minutes ago: "Just now"
- 5 minutes to 24 hours: relative ("8 min ago", "3 hours ago")
- 1-7 days: day name ("Tuesday at 14:32")
- > 7 days: date ("Mar 15")
- Full datetime on hover/tooltip ("Tue 15 Mar, 14:32")

**Charts (visual first, interactive where helpful):**
- Charts and graphs are the PRIMARY way to present data — not tables, not numbers
- Dark theme: consistent with app theme (`slate-900` background, `slate-400` ticks)
- `GRID_COLOR = 'rgba(148, 163, 184, 0.15)'` (already standardised)
- `TICK_COLOR = 'rgb(148, 163, 184)'` (already standardised)
- Room colour palette: green, blue, amber, red, violet, pink (already defined in `EnvironmentCard.tsx` as `ROOM_PALETTE`)
- Tooltips: dark background with light text, full timestamp, value with unit, ALWAYS include currency on cost tooltips
- Responsive: `maintainAspectRatio: false`, container determines height
- No animations (`animation: false`) for performance on Pi
- **Interactive toggles:** On multi-line charts, let users tap legend items to show/hide individual data series. Chart.js supports this natively via legend onClick.
- **Overlay toggles:** "Overlay activity" or "Overlay cost" buttons on charts let users cross-reference data types on the same timeline
- **Period selectors:** 1d / 7d / 30d / 90d / 1y tabs on all detail-level charts. Custom range picker for power users.

**Drill-down rules (MANDATORY):**
- Every cumulative or aggregate metric MUST be tappable to its constituent data
- Room-level cost → per-device cost breakdown
- House-level energy chart → room-level charts → device-level charts
- Room card metric → room detail page scrolled to relevant section
- Device row in any table → device detail page
- Room row in any table → room detail page
- Chart data point → relevant detail view where feasible
- If a high-level metric is a sum of lower-level data, the user must be able to reach the lower level in one tap

**Empty states:**
- Energy: "No power-monitoring devices detected. Smart plugs that report energy usage will appear here." (already exists)
- Temperature: "No temperature data available. Temperature sensors and weather will appear here." (already exists)
- Activity: "Activity tracking has started. Room patterns will appear as motion data is collected." (already exists)
- Battery: "No battery-powered devices detected." (already exists)
- Cost: "No cost data yet -- assign Kasa devices to rooms to track cost per room."

---

## Section 7: Navigation and Linking Map

```
HOMEPAGE
|
|-- [Room Card - name/icon]  ----------->  ROOM DETAIL
|-- [Room Card - temperature]  ---------->  Room Detail > Environment (scroll target)
|-- [Room Card - lux icon]  ------------>  Room Detail > Environment (scroll target)
|-- [Room Card - energy badge]  -------->  Room Detail > Energy (scroll target)
|-- [Room Card - presence dot]  -------->  Room Detail > Activity (scroll target)
|-- [Critical alert banner]  ----------->  INSIGHTS PAGE > Attention section
|-- [Weather card]  --------------------> (no drill-down)
|-- [MTA card]  ------------------------> (no drill-down)
|
ROOM DETAIL
|
|-- [Device name in energy list]  ------>  DEVICE DETAIL (hub or kasa)
|-- [Device name in battery list]  ----->  DEVICE DETAIL (hub)
|-- [Sonos speaker name]  ------------->  SONOS DETAIL
|-- ["View in insights" link]  -------->  INSIGHTS PAGE (scroll to relevant card)
|-- [Room overview temperature]  ------> (inline, no drill-down)
|-- [Room overview activity chart]  ---> (inline, no drill-down)
|
INSIGHTS PAGE
|
|-- [AttentionBar > "View device"]  --->  DEVICE DETAIL (hub/kasa/lifx)
|-- [EnergyCard > device row]  -------->  DEVICE DETAIL
|-- [EnergyCard > room ranking row]  -->  ROOM DETAIL
|-- [EnvironmentCard > room row]  ----->  ROOM DETAIL
|-- [BatteryCard > device link]  ------>  DEVICE DETAIL
|-- [ActivityCard > room link]  ------->  ROOM DETAIL
|-- [HomeSummaryStrip pills]  --------->  Scroll to corresponding card on same page
|
DEVICE DETAIL
|
|-- [Room assignment link]  ----------->  ROOM DETAIL
|-- [Parent strip link]  ------------->  DEVICE DETAIL (strip parent)
|-- ["View room energy" link]  ------->  ROOM DETAIL > Energy section
|-- [Linked Sonos speaker]  ----------> SONOS DETAIL (future, requires device_links)
```

---

## Section 8: What Exists vs What Needs Building

### Data pipeline status

| Capability | Data in DB | Backend API | Frontend UI | Gap description |
|-----------|-----------|------------|-------------|----------------|
| Real-time power per device | Yes (`kasa_devices.attributes`) | Yes (`/dashboard/summary` power array) | Yes (EnergyCard, DeviceDetail) | Complete |
| Actual daily cost from hardware | Yes (Kasa device memory) | Yes (`actualDailyCost` in insights-engine) | No -- frontend type missing these fields | Frontend types + EnergyCard enhancement |
| Projected daily cost | Yes (computed) | Yes (`projectedDailyCost`) | Partial (`dailyCostEstimate` used, deprecated alias) | Update frontend to use new field name |
| Month-to-date cost | Yes (Kasa device memory) | Yes (`monthToDateCost`) | No | Frontend types + EnergyCard enhancement |
| Last month cost | Yes (Kasa device memory) | Yes (`lastMonthCost`) | No | Frontend types + EnergyCard enhancement |
| Month-over-month comparison | Yes (computed) | Yes (`monthOverMonthPercent`) | No | Frontend types + EnergyCard enhancement |
| Daily over/under vs last week | Yes (computed) | Yes (`dailyOverUnderPercent`) | No | Frontend types + EnergyCard enhancement |
| Device cost ranking | Yes (computed) | Yes (`deviceCostRanking` array) | No | Frontend types + new ranking table in EnergyCard |
| Room cost ranking | Yes (computed) | Yes (`roomCostRanking` array) | No | Frontend types + new ranking table in EnergyCard |
| Per-device daily stats chart | Yes (Kasa hardware) | Yes (`/kasa/devices/:id/energy/daily`) | No | New chart component on DeviceDetail |
| Per-device monthly stats chart | Yes (Kasa hardware) | Yes (`/kasa/devices/:id/energy/monthly`) | No | New chart component on DeviceDetail |
| Visual lux indicator (icon) | Yes (lux in hub_devices) | Yes (sent in rooms array) | No (raw number shown on homepage) | New icon component for room cards |
| Temperature comfort colour | Yes (temp in hub_devices) | Yes (sent in rooms array) | No (plain number) | Colour logic on room card temp display |
| Activity presence dot | Yes (room.last_active) | Yes (sent in rooms array) | Partial (text timestamp shown) | Replace text with visual dot |
| House-level activity insights | Yes (room_activity table) | No -- not computed in insights-engine | Component exists but never renders | Backend: add computeActivityInsights, wire to /summary |
| Activity overlay on charts | Yes (room_activity) | Partial (per-room hourly data exists) | No | New API for house-level hourly activity + dual-axis chart |
| Cross-metric correlation | Yes (all data in DB) | No | No | New backend computation + dual-axis chart component |
| Time period comparison overlay | Yes (device_history) | Partial (period param) | Partial (24h/7d/30d tabs on DeviceDetail) | "Compare to" dropdown + ghost line rendering |
| Custom date range picker | Yes (data exists for all time) | Partial (1y/all periods, no arbitrary range) | No | New date range API param + date picker UI |
| Room cost on room card | Yes (roomCostRanking) | Yes (computed) | No | Surface badge on homepage room cards |
| Weekday vs weekend patterns | Yes (can compute from timestamps) | No | No | New backend aggregation + chart view |
| Mode transition history | No (only current mode stored) | No | No | Need to log mode changes to device_history |
| Sonos-Kasa cost attribution | No (no device_links table) | No | No | Full stack: new table, link UI, cost computation |
| Homepage critical alert banner | Yes (attention items) | Yes (in insights) | No (AttentionBar only on Insights page) | New slim banner component for homepage |

### Suggested implementation order

**Workstream 1: Surface existing backend data in frontend (no backend changes)**
Priority: High. The backend already computes rich cost intelligence that the frontend doesn't display.
1. Update `EnergyInsights` type in `client/src/lib/api.ts` to include all fields the backend sends
2. Enhance `EnergyCard` to show: actual daily cost, month-to-date, projected month, month-over-month comparison, daily over/under
3. Add device cost ranking table to EnergyCard
4. Add room cost ranking table to EnergyCard
5. Add Kasa daily/monthly stats charts to DeviceDetailPage

**Workstream 2: Homepage visual indicators (frontend-only)**
Priority: High. Transforms the homepage from "raw numbers" to "visual signals" per the design philosophy.
1. Lux icon component (sun/cloud-sun/cloud/moon based on thresholds)
2. Temperature comfort colour tint
3. Activity presence dot (replacing "last active" text)
4. Room energy cost badge (conditionally shown when above normal)
5. Critical alert banner at top of homepage

**Workstream 3: Activity as first-class metric (backend + frontend)**
Priority: Medium. Unlocks the ActivityCard on the Insights page and activity overlays.
1. Backend: add `computeActivityInsights()` to insights-engine.ts
2. Backend: wire activity insights into `/dashboard/summary` response
3. Frontend: ActivityCard will render automatically (component already exists)
4. Backend: add house-level hourly activity endpoint for chart overlays
5. Frontend: "Overlay activity" toggle on energy charts

**Workstream 4: Cross-comparison infrastructure (backend + frontend)**
Priority: Medium. Enables the user to shape their own data.
1. "Compare to" ghost line overlay on TimeSeriesChart (frontend chart enhancement)
2. Custom date range parameter on `/dashboard/history/:source/:sourceId` endpoint
3. Date range picker component
4. Dual-axis chart component (for cross-metric overlays)
5. Weekday vs weekend aggregation endpoint

**Workstream 5: Deep device intelligence (backend + frontend)**
Priority: Low. Enhances the device detail experience for power users.
1. Device cost attribution from Kasa monthly stats
2. Runtime analysis (today vs typical)
3. Month-over-month device comparison
4. "Is this device getting worse?" trend indicator
5. Device links table for Sonos-Kasa cost attribution (future)

---

*This document is the product vision for Home Fairy's data journey. It is not a technical implementation spec -- it describes what the user should experience at each level of the product. Implementation details (file paths, component names, API shapes) are included as reference for the building agents that will execute this vision across multiple sessions.*
