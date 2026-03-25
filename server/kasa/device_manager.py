import asyncio
import logging
from typing import Optional

# python-kasa class names vary by version:
#   < 0.5  : SmartStrip
#   >= 0.5 : IotStrip (SmartStrip may remain as an alias, but IotStrip is canonical)
# We import defensively so the module works across versions.
try:
    from kasa import Discover, SmartDevice, SmartPlug
    try:
        from kasa import IotStrip as SmartStrip  # preferred in >= 0.5
    except ImportError:
        from kasa import SmartStrip  # fallback for older versions
except ImportError as exc:
    raise ImportError(
        "python-kasa is not installed. Run: pip install python-kasa>=0.10.0"
    ) from exc

logger = logging.getLogger("kasa-sidecar")


class DeviceManager:
    """Manages discovery, connections, and polling of Kasa devices."""

    def __init__(self):
        self.devices: dict[str, SmartDevice] = {}  # MAC / child-ID -> device
        self._device_locks: dict[str, asyncio.Lock] = {}  # Per-device locks for safe concurrent access
        self._discovery_lock = asyncio.Lock()
        self._poll_task: Optional[asyncio.Task] = None
        self._rediscover_task: Optional[asyncio.Task] = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self):
        """Start device discovery and polling loops."""
        await self.discover()
        self._poll_task = asyncio.create_task(self._poll_loop())
        self._rediscover_task = asyncio.create_task(self._rediscover_loop())
        logger.info(f"Device manager started with {len(self.devices)} devices")

    async def stop(self):
        """Stop polling loops gracefully."""
        if self._poll_task:
            self._poll_task.cancel()
            try:
                await self._poll_task
            except asyncio.CancelledError:
                pass
        if self._rediscover_task:
            self._rediscover_task.cancel()
            try:
                await self._rediscover_task
            except asyncio.CancelledError:
                pass

    # ------------------------------------------------------------------
    # Discovery
    # ------------------------------------------------------------------

    async def discover(self) -> list[SmartDevice]:
        """Discover all Kasa devices on the local network."""
        async with self._discovery_lock:
            logger.info("Starting device discovery...")
            try:
                found: dict[str, SmartDevice] = await Discover.discover(timeout=10)
            except Exception as exc:
                logger.error(f"Discovery failed: {exc}")
                return []

            for ip, device in found.items():
                try:
                    await device.update()
                except Exception as exc:
                    logger.warning(f"Could not update {ip} after discovery: {exc}")
                    continue

                mac = self._get_mac(device)
                if not mac:
                    logger.warning(f"Could not determine MAC for device at {ip}, skipping")
                    continue

                self.devices[mac] = device
                logger.info(
                    f"Discovered: {device.alias!r} ({getattr(device, 'model', 'unknown')}) "
                    f"at {ip} [MAC: {mac}]"
                )

                # Register child outlets for strips
                if self._is_strip(device) and hasattr(device, "children"):
                    for idx, child in enumerate(device.children):
                        child_id = self._child_id(mac, child, idx)
                        self.devices[child_id] = child
                        logger.info(f"  Outlet: {child.alias!r} [ID: {child_id}]")

            logger.info(
                f"Discovery complete: {len(found)} root devices, "
                f"{len(self.devices)} total (including outlets)"
            )
            return list(found.values())

    # ------------------------------------------------------------------
    # Device access
    # ------------------------------------------------------------------

    def get_device(self, device_id: str) -> Optional[SmartDevice]:
        """Return a device by MAC address or child outlet ID (case-insensitive)."""
        return self.devices.get(device_id.upper())

    def get_all_devices(self) -> dict[str, SmartDevice]:
        """Return a shallow copy of the full device map."""
        return self.devices.copy()

    # ------------------------------------------------------------------
    # Commands
    # ------------------------------------------------------------------

    async def send_command(
        self, device_id: str, command: str, value: Optional[int] = None
    ):
        """Send a command to a device and refresh its state."""
        device = self.get_device(device_id)
        if not device:
            raise ValueError(f"Device not found: {device_id}")

        async with self._get_lock(device_id):
            if command == "on":
                await device.turn_on()
            elif command == "off":
                await device.turn_off()
            elif command == "set_brightness":
                if value is None:
                    raise ValueError("set_brightness requires a value (0-100)")
                if not (hasattr(device, "set_brightness") and callable(device.set_brightness)):
                    raise ValueError(f"Device {device_id} does not support brightness control")
                await device.set_brightness(int(value))
            else:
                raise ValueError(
                    f"Unknown command: {command!r}. Valid commands: on, off, set_brightness"
                )

            # Refresh cached state so the next read reflects the change
            try:
                await device.update()
            except Exception as exc:
                logger.warning(f"Post-command update failed for {device_id}: {exc}")

    # ------------------------------------------------------------------
    # Rename
    # ------------------------------------------------------------------

    async def rename_device(self, device_id: str, new_alias: str):
        """Rename a device on the hardware (persisted on the device itself)."""
        device = self.get_device(device_id)
        if not device:
            raise ValueError(f"Device not found: {device_id}")

        async with self._get_lock(device_id):
            await device.set_alias(new_alias)
            await device.update()
            logger.info(f"Renamed {device_id} to {new_alias!r}")

    # ------------------------------------------------------------------
    # Energy meter
    # ------------------------------------------------------------------

    async def get_emeter(self, device_id: str) -> Optional[dict]:
        """Return real-time energy meter data, or None if device has no emeter."""
        device = self.get_device(device_id)
        if not device:
            raise ValueError(f"Device not found: {device_id}")

        if not getattr(device, "has_emeter", False):
            return None

        # Refresh before reading (locked to prevent concurrent access)
        async with self._get_lock(device_id):
            try:
                await device.update()
            except Exception as exc:
                logger.warning(f"Update before emeter read failed for {device_id}: {exc}")

        emeter = getattr(device, "emeter_realtime", None)
        result: dict = {
            "power": float(getattr(emeter, "power", 0) or 0),
            "voltage": float(getattr(emeter, "voltage", 0) or 0),
            "current": float(getattr(emeter, "current", 0) or 0),
            "total": float(getattr(emeter, "total", 0) or 0),
            "today": None,
        }

        # Try to get today's consumption from the Usage module
        modules = getattr(device, "modules", {}) or {}
        usage_mod = modules.get("Usage")
        if usage_mod:
            result["today"] = getattr(usage_mod, "usage_today", None)

        return result

    async def get_daily_stats(
        self, device_id: str, year: int, month: int
    ) -> dict[int, float]:
        """Return daily energy stats stored on the device (day -> Wh)."""
        device = self.get_device(device_id)
        if not device or not getattr(device, "has_emeter", False):
            raise ValueError(f"Device not found or has no energy meter: {device_id}")

        raw = await device.get_emeter_daily(year=year, month=month)
        return {int(k): float(v) for k, v in raw.items()}

    async def get_monthly_stats(
        self, device_id: str, year: int
    ) -> dict[int, float]:
        """Return monthly energy stats stored on the device (month -> Wh)."""
        device = self.get_device(device_id)
        if not device or not getattr(device, "has_emeter", False):
            raise ValueError(f"Device not found or has no energy meter: {device_id}")

        raw = await device.get_emeter_monthly(year=year)
        return {int(k): float(v) for k, v in raw.items()}

    # ------------------------------------------------------------------
    # Serialisation
    # ------------------------------------------------------------------

    def _device_to_dict(
        self, device: SmartDevice, parent_mac: Optional[str] = None, index: int = 0
    ) -> dict:
        """Convert a SmartDevice to a JSON-serialisable dict."""
        mac = self._get_mac(device) or "unknown"
        device_id = mac if parent_mac is None else f"{parent_mac}_{index}"

        # Determine device type
        if self._is_strip(device):
            device_type = "strip"
        elif parent_mac is not None:
            device_type = "outlet"
        elif self._is_dimmable(device):
            device_type = "dimmer"
        else:
            device_type = "plug"

        # Firmware / hardware strings differ across kasa versions
        hw_info = getattr(device, "hw_info", None) or {}
        firmware = (
            hw_info.get("sw_ver")
            or str(getattr(device, "software_version", ""))
            or ""
        )
        hardware = (
            hw_info.get("hw_ver")
            or str(getattr(device, "hardware_version", ""))
            or ""
        )

        result: dict = {
            "id": device_id,
            "label": getattr(device, "alias", None) or "Unknown",
            "device_type": device_type,
            "model": getattr(device, "model", "Unknown") or "Unknown",
            "parent_id": parent_mac,
            "ip_address": str(getattr(device, "host", "") or ""),
            "has_emeter": bool(getattr(device, "has_emeter", False)),
            "firmware": firmware,
            "hardware": hardware,
            "rssi": getattr(device, "rssi", None),
            # If we can read is_on without raising, the device responded — treat as online
            "is_online": True,
            "switch_state": "on" if getattr(device, "is_on", False) else "off",
            "brightness": (
                getattr(device, "brightness", None)
                if self._is_dimmable(device)
                else None
            ),
            "emeter": None,
            "children": None,
            "runtime_today": None,
            "runtime_month": None,
        }

        # Emeter snapshot (uses already-cached data — no extra network call)
        if result["has_emeter"]:
            emeter = getattr(device, "emeter_realtime", None)
            if emeter is not None:
                result["emeter"] = {
                    "power": float(getattr(emeter, "power", 0) or 0),
                    "voltage": float(getattr(emeter, "voltage", 0) or 0),
                    "current": float(getattr(emeter, "current", 0) or 0),
                    "total": float(getattr(emeter, "total", 0) or 0),
                    "today": None,
                }

        # Runtime from Usage module
        modules = getattr(device, "modules", {}) or {}
        usage_mod = modules.get("Usage")
        if usage_mod:
            result["runtime_today"] = getattr(usage_mod, "usage_today", None)
            result["runtime_month"] = getattr(usage_mod, "usage_this_month", None)
            if result["emeter"] and result["runtime_today"] is not None:
                result["emeter"]["today"] = result["runtime_today"]

        # Children for strip devices
        if self._is_strip(device) and hasattr(device, "children"):
            result["children"] = [
                self._device_to_dict(child, parent_mac=mac, index=i)
                for i, child in enumerate(device.children)
            ]

        return result

    def get_device_dict(self, device_id: str) -> Optional[dict]:
        """Return a single device as a serialisable dict, or None if not found."""
        key = device_id.upper()
        device = self.devices.get(key)
        if not device:
            return None

        # Determine whether this is a child outlet
        if "_" in key:
            parts = key.split("_", 1)
            parent_mac = parts[0]
            try:
                index = int(parts[1])
            except ValueError:
                index = 0
            return self._device_to_dict(device, parent_mac=parent_mac, index=index)

        return self._device_to_dict(device)

    def get_all_device_dicts(self) -> list[dict]:
        """Return all top-level devices as dicts (strips embed their children inline)."""
        result = []
        for mac, device in self.devices.items():
            # Skip child-outlet entries — they appear inside the parent's children array
            if "_" in mac:
                continue
            result.append(self._device_to_dict(device))
        return result

    # ------------------------------------------------------------------
    # Background loops
    # ------------------------------------------------------------------

    async def _poll_loop(self):
        """Refresh all root devices every 10 seconds."""
        while True:
            try:
                await asyncio.sleep(10)
                for mac, device in list(self.devices.items()):
                    if "_" in mac:
                        # Child devices are refreshed as part of the parent update
                        continue
                    try:
                        async with self._get_lock(mac):
                            await device.update()
                    except Exception as exc:
                        logger.warning(
                            f"Poll failed for {getattr(device, 'alias', mac)!r} ({mac}): {exc}"
                        )
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error(f"Poll loop error: {exc}")
                await asyncio.sleep(10)

    async def _rediscover_loop(self):
        """Re-run discovery every 5 minutes to handle DHCP address changes."""
        while True:
            try:
                await asyncio.sleep(300)
                await self.discover()
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error(f"Rediscovery error: {exc}")
                await asyncio.sleep(300)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _get_lock(self, device_id: str) -> asyncio.Lock:
        """Return the per-device lock, creating one if needed."""
        key = device_id.upper()
        if key not in self._device_locks:
            self._device_locks[key] = asyncio.Lock()
        return self._device_locks[key]

    def _get_mac(self, device: SmartDevice) -> Optional[str]:
        """Return a normalised, uppercase MAC address for the device."""
        mac = getattr(device, "mac", None)
        if mac:
            return mac.replace(":", "").replace("-", "").upper()
        # Fallback: some devices expose device_id (UUID-style string)
        device_id = getattr(device, "device_id", None)
        if device_id:
            return device_id.upper()
        return None

    def _is_strip(self, device: SmartDevice) -> bool:
        """Return True if the device is a smart power strip."""
        return isinstance(device, SmartStrip)

    def _is_dimmable(self, device: SmartDevice) -> bool:
        """Return True if the device supports brightness control."""
        return bool(getattr(device, "is_dimmable", False))

    def _child_id(self, parent_mac: str, child: SmartDevice, fallback_index: int) -> str:
        """Build a stable child-outlet ID from the parent MAC and outlet index."""
        index = getattr(child, "index", fallback_index)
        return f"{parent_mac}_{index}"
