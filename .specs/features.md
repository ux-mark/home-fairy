# Feature Overview

> Written from the user's perspective — what you can do, not how it's built.
> Updated: 2026-03-29

---

## 1. Home Page

### System Mode Selector
**Status**: available

Switch the system between named modes (Morning, Day, Evening, Night, etc.) by tapping a pill chip. The active mode scrolls into view automatically. Mode icons are shown from the configured icon set.

### Room Cards with Scene Control
**Status**: available

See all rooms at a glance, each with environmental data (lux, temperature, last motion). Tap a scene button inside a room card to activate or deactivate it instantly. The default scene for the current mode is visually marked. Scene buttons are filtered to the current mode and current season.

### Quick Actions
**Status**: available

Three one-tap buttons at the top:
- **All Off**: turns off all devices and clears all active scenes in every room
- **Nighttime**: activates the nighttime scene set (excludes configured rooms)
- **Guest Night**: a gentler nighttime mode that keeps guest room accessible

### MTA Subway Status
**Status**: available

Colour-coded status card (green/orange/red) for all configured subway stops. Collapsed view shows the catchable train's line, station, and minutes away. Expand to see each stop individually with walk-time-aware messaging. Colour coding accounts for your walk time to the station.

### Weather Card
**Status**: available

Current outdoor temperature, weather description, humidity, and wind speed. Temperature displays in your configured unit. Only shown when weather data is available.

### Mute All Speakers
**Status**: available

One-tap toggle to mute or unmute all Sonos speakers simultaneously. Only appears when speakers are configured.

### Auto / Manual Room Toggle
**Status**: available

Switch any room between Auto (motion-driven automation) and Manual mode directly from the room card. A lock icon appears when the room is locked by night mode.

### Night Lock Controls
**Status**: available

When night mode has locked rooms, a button appears to unlock all rooms, returning them to normal operation.

---

## 2. Rooms

### Room List
**Status**: available

Browse all rooms with counts of lights, devices, and sensors. See the current active scene and automation mode. Tap through to room detail.

### Create Room
**Status**: available

Create a new room via a dialog. Lights and automation can be configured after creation.

---

## 3. Room Detail

### Room Configuration
**Status**: available

Edit the room's name, choose an icon from the icon picker, set display order, and toggle auto mode.

### Assign Lights
**Status**: available

Assign LIFX lights to the room. Supports single and multi-select mode. Identify a light by flashing it before adding. Shows which lights are already assigned elsewhere.

### Assign Devices
**Status**: available

Assign Hubitat devices (switches, dimmers, sensors) to the room with multi-select. Each device has a "Keep on" shield toggle to protect it from All Off commands.

### Room Intelligence Panel
**Status**: available

Per-room analytics: current energy draw from linked Kasa plugs, energy cost estimates, battery levels of room sensors, temperature trend, and hourly activity pattern as a chart.

### Scene Management
**Status**: available

View all scenes assigned to the room, filter by mode, activate/deactivate scenes, and see the default scene per mode.

### Sonos Auto-Play Rules
**Status**: available

Add auto-play rules that trigger Sonos playback on mode changes. Choose a favourite, podcast feed, or "continue what's playing." Configure trigger conditions and play limits.

### Sensor List
**Status**: available

View all sensors assigned to the room with their current readings (temperature, lux, battery, motion).

---

## 4. Scenes

### Scene List with Multiple Views
**Status**: available

Browse scenes in four views:
- **By Room**: scenes grouped in collapsible room accordions with mode filter chips
- **Active**: only currently active scenes
- **Recent**: scenes sorted by last activation time
- **Stale**: scenes not activated in 90+ days

### Search Scenes
**Status**: available

Search across all scenes by name, tag, room, or mode. Works across all tabs.

### Create Scene
**Status**: available

Create a new scene and go directly to the editor.

---

## 5. Scene Editor

### Scene Metadata
**Status**: available

Edit name, choose an icon, assign to rooms and modes, and manage tags.

### Light Configuration
**Status**: available

Add LIFX lights with per-light control: power, brightness, colour (hue + saturation), colour temperature (Kelvin). Live preview applies changes to the physical bulb while editing.

### Device Commands
**Status**: available

Add commands for Hubitat devices, Twinkly lights, Fairy devices, and Kasa smart plugs. Configure on/off/dim levels per device, grouped by room.

### Scene Settings
**Status**: available

- **All Off on Activate**: optionally turn off all other devices in the room
- **Mode Change**: optionally change system mode when scene activates
- **Scene Timer**: auto-transition to another scene after a duration
- **Chain Scene**: immediately trigger another scene on activation
- **Seasonal Range**: restrict scene to a date range (e.g., Dec 1 – Jan 6 for holidays)

### Activate / Deactivate
**Status**: available

Toggle scene on/off directly from the editor, with activation count.

### Duplicate and Delete
**Status**: available

Copy a scene to create a modified variant. Delete with confirmation.

---

## 6. Devices

### Unified Device List
**Status**: available

All device types in one place: LIFX lights, Hubitat devices, Kasa plugs, Twinkly, Fairy, and Sonos speakers. Each shows on/off state and room assignment.

### Filtering and Grouping
**Status**: available

Filter by type (All, Lights, Switches, Twinkly, Fairy, Kasa, Sensors, Sonos, Deactivated). Group by room or by type.

### Search and Quick Controls
**Status**: available

Search devices by name. Toggle lights and Kasa plugs on/off directly from the list.

### Deactivated Devices
**Status**: available

Devices marked as unreachable are excluded from scenes and automations. View them in the Deactivated filter tab.

---

## 7. Device Detail

### Device Overview
**Status**: available

View label, type, status, and room assignment. Rename inline.

### At-a-Glance Insights
**Status**: available

Current power draw with comparison to average, battery level with drain chart, temperature trend, share of total home energy, and daily cost estimate.

### Historical Charts
**Status**: available

Interactive time-series charts for power, energy, battery, temperature, and lux. Period selector: 1d, 7d, 30d, 90d, 1y. Over/under average badges.

### Device Attributes
**Status**: available

Every attribute reported by the device, formatted with units. Key attributes highlighted.

### Deactivate / Reactivate
**Status**: available

Deactivate an unreachable device to remove it from automations. Reactivate when connectivity is restored. Run a connectivity check first.

---

## 8. LIFX Light Detail

### Light Controls
**Status**: available

View colour, brightness, connectivity. Toggle power. Adjust brightness with slider.

### Deactivate / Reactivate
**Status**: available

Same deactivation workflow as other devices, with connectivity check.

---

## 9. Insights Dashboard

### Attention Bar
**Status**: available

Prioritised alerts: critical battery levels, device anomalies, system warnings. Auto-expands when critical items are present.

### Energy Card
**Status**: available

Total home power draw and estimated cost. Ranked device list with per-device power, over/under-average badges, and cost estimates. Expand any device for a historical chart with period selector.

### Battery Card
**Status**: available

Fleet health summary (healthy/low/critical). Per-device battery with colour-coded progress bars. Expand for drain trend charts.

### Environment Card
**Status**: available

Outdoor weather alongside indoor environment data per room. Temperature outlier rooms flagged. Links to room detail.

### Activity Card
**Status**: available

Motion activity patterns across rooms — which rooms are most active and when.

### Sun and Mode Card
**Status**: available

Current system mode, sun schedule (sunrise, sunset, related events), active sun phase.

### Progressive Disclosure
**Status**: available

Each section is collapsible. Sections auto-expand when they contain actionable items. Users can manually override.

---

## 10. Sonos Setup

### Speaker Discovery and Room Mapping
**Status**: available

View all discovered Sonos speakers with playback state and connection status. Map speakers to rooms. Link Kasa plugs for energy tracking.

---

## 11. Sonos Speaker Detail

### Playback Controls
**Status**: available

View playback state (Playing/Paused/Stopped). Play, pause, skip, adjust volume with live slider and mute toggle.

### Auto-Play Rules
**Status**: available

Create rules for what plays when the system mode changes. Supports Sonos favourites, podcast feeds, and "continue what's playing." Configure conditions and max-plays limits.

---

## 12. Kasa Device Management

### Device List and Controls
**Status**: available

All Kasa smart plugs with on/off state, signal strength, and device type. Toggle power. Rename devices. Trigger network scan for new devices.

---

## 13. Watch View

### Minimal Scene Control
**Status**: available

Optimised for Apple Watch and wearables. Large touch targets. See all rooms, tap into a room, activate or deactivate scenes. Quick actions (All Off, Nighttime) available.

---

## 14. Authentication and Access

### Role-Based Access
**Status**: available

Three user roles with different permissions:
- **Manager**: Full access to all features and settings. Can manage users, create access links, promote/demote roles.
- **Resident**: Full access to home control (rooms, scenes, devices, dashboard). Sees a personal Account page instead of Settings. Can change their own password.
- **Guest**: Temporary access to home control. No account management or settings access. Session auto-expires based on the duration set by the manager.

### Login
**Status**: available

Email and password sign-in with session cookies (30-day expiry, daily refresh). Cookie-cached sessions for fast page loads.

### Access Links and QR Codes
**Status**: available

Managers generate shareable links from Settings > Account > Access Links. Two modes:
- **Guest link**: Pick a name and session duration (1 hour, 24 hours, weekend, 1 week). Set a device limit. Shows a QR code and copyable URL. Guest scans or taps — instantly logged in, no password needed. Session auto-expires.
- **Resident link**: Pick a name. Single-use. Recipient opens the link, sets up their own account (name, email, password), becomes a permanent household member.

Personalised invite pages with randomised welcome messages using the person's name. Fun, warm copy that rotates ("The fairies have been expecting you, Sarah"). Gradient sparkle branding on the entry screen.

### Link Previews (iMessage / WhatsApp)
**Status**: available

Invite links render rich previews when shared via messaging apps. Server-side Open Graph meta injection with personalised titles ("A little magic awaits you") and descriptions ("Sarah, tap to enter your smart home"). Custom share image with fairy branding.

### User Management (Manager only)
**Status**: available

From Settings > Account:
- View all household members with role badges (Manager, Resident, Guest)
- Add new users with name, email, password
- Reset any user's password
- Promote a Resident to Manager or demote a Manager to Resident
- Remove users
- Create and revoke access links

### Change Password
**Status**: available

Any logged-in user (Manager or Resident) can change their own password from their account page. Requires current password confirmation. Minimum 8 characters.

---

## 15. Settings

### Preferences
**Status**: available

- Theme: Light, Dark, or System
- Temperature unit: Celsius or Fahrenheit
- Energy rate and currency symbol for cost estimates

### Music (Sonos)
**Status**: available

Check Sonos connection status. Configure global auto-play defaults.

### Modes and Schedule
**Status**: available

Create, rename, delete modes with cascade safety. Add time-based triggers (with day-of-week) or sun-event triggers. Configure night mode room exclusions.

### Public Transport
**Status**: available

Add MTA subway stops with station search, direction, and walk time. Configure a LIFX light as a physical colour indicator (green/orange/red).

### Weather
**Status**: available

Configure a LIFX light to reflect weather conditions using customisable colours per condition. Test and reset to defaults.

### System
**Status**: available

- Hubitat sync
- LIFX connection status
- Active scene timers with cancel controls
- Data management: view metrics, delete history by age/source
- System health: version, uptime, database status
- System logs with category filtering
