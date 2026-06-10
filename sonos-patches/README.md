# sonos-patches

Patches applied to the third-party `node-sonos-http-api` install at `~/node-sonos-http-api/` during `deploy-to-pi.sh`. We keep them here so home-fairy is the single source of truth for everything it needs to run.

## How they get applied

`deploy-to-pi.sh` clones [jishi/node-sonos-http-api](https://github.com/jishi/node-sonos-http-api) (upstream, unmodified), copies the `*.patch` files in this folder into `~/node-sonos-http-api/patches/`, installs [`patch-package`](https://github.com/ds300/patch-package) as a devDependency there, and wires a `postinstall` hook. From then on, every `npm install` in `~/node-sonos-http-api/` automatically re-applies these patches.

If a future upstream release changes a file the patch touches, `patch-package` will fail loudly during `npm install` with a clear "patch could not be applied" message — that's the signal to rewrite the patch against the new file.

## Current patches

### `sonos-discovery+1.8.0.patch`

Fixes a family of `undefined.coordinator` crashes in `sonos-discovery` that fire during Sonos topology changes (when speakers join/leave groups, or a Sonos Roam re-joins the network after sleeping). Without it:

- Grouped-speaker `/state` queries return 500s
- `Player.toJSON` crashes during webhook serialisation
- The post-volume-change `recalculateGroupVolume` notification handler throws
- Stale-IP subscriptions never recover and spam ECONNREFUSED forever

Root cause: `SonosSystem.topologyChange` (`lib/SonosSystem.js:91`) overwrites `member.coordinator` with `playerCache[zone.$attrs.coordinator]`, which is `undefined` when a topology event references a coordinator UUID that hasn't been added to `playerCache` yet (same-batch race). The patch:

1. Stops overwriting a valid coordinator with `undefined` (falls back to prior reference, then to the member itself — matches the constructor default `_this.coordinator = _this`).
2. Adds belt-and-braces guards at each consumer in `Player.js` (`state` getter, `recalculateGroupVolume` call, `toJSON`) and in `lib/prototypes/Player/recalculateGroupVolume.js` (handles the orthogonal "zone-not-in-zones-list" race).
