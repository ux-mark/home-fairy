import logging
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException
from models import (
    DailyStatsResponse,
    HealthResponse,
    MonthlyStatsResponse,
)
from device_manager import DeviceManager

logging.basicConfig(
    level=logging.INFO,
    format="[kasa] %(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("kasa-sidecar")

manager = DeviceManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start the device manager on startup, stop it on shutdown."""
    await manager.start()
    yield
    await manager.stop()


app = FastAPI(
    title="Kasa Sidecar",
    description="Local REST API for TP-Link Kasa device management via python-kasa.",
    version="1.0.0",
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# Devices
# ---------------------------------------------------------------------------


@app.get("/devices", summary="List all discovered devices")
async def list_devices() -> list[dict]:
    """Return all discovered Kasa devices with their current state.

    Strip devices include an inline `children` array of their outlets.
    State is served from the in-memory cache updated every 10 seconds.
    """
    return manager.get_all_device_dicts()


@app.get("/devices/{device_id}", summary="Get a single device")
async def get_device(device_id: str) -> dict:
    """Return a single device by MAC address (or child outlet ID).

    Child outlet IDs have the format `{PARENT_MAC}_{OUTLET_INDEX}`.
    """
    result = manager.get_device_dict(device_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"Device not found: {device_id}")
    return result


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------


@app.post("/devices/{device_id}/command", summary="Send a command to a device")
async def send_command(device_id: str, body: dict) -> dict:
    """Send a control command to a device.

    Supported commands:
    - `on` — turn the device on
    - `off` — turn the device off
    - `set_brightness` — set brightness (requires `value` 0-100, dimmers only)

    Body example: `{"command": "set_brightness", "value": 75}`
    """
    command = body.get("command")
    value = body.get("value")

    if not command:
        raise HTTPException(status_code=422, detail="Field 'command' is required")

    try:
        await manager.send_command(device_id, command, value)
        return {"success": True}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error(f"Command error for {device_id}: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# Rename
# ---------------------------------------------------------------------------


@app.post("/devices/{device_id}/rename", summary="Rename a device")
async def rename_device(device_id: str, body: dict) -> dict:
    """Set the device alias on the hardware. The new name persists on the device itself."""
    alias = body.get("alias")
    if not alias or not isinstance(alias, str) or not alias.strip():
        raise HTTPException(status_code=422, detail="Field 'alias' is required")

    try:
        await manager.rename_device(device_id, alias.strip())
        return {"success": True, "label": alias.strip()}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.error(f"Rename error for {device_id}: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# Energy meter
# ---------------------------------------------------------------------------


@app.get("/devices/{device_id}/emeter", summary="Get real-time energy data")
async def get_emeter(device_id: str) -> dict:
    """Return live energy meter readings for a device.

    Triggers a fresh device update before reading. Returns 404 if the device
    does not have an energy meter.
    """
    try:
        data = await manager.get_emeter(device_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    if data is None:
        raise HTTPException(status_code=404, detail="Device has no energy meter")

    return data


@app.get(
    "/devices/{device_id}/emeter/daily",
    summary="Get daily energy stats",
    response_model=DailyStatsResponse,
)
async def get_daily_stats(
    device_id: str,
    year: Optional[int] = None,
    month: Optional[int] = None,
) -> DailyStatsResponse:
    """Return daily energy consumption stored on the device.

    Defaults to the current year and month if not provided.
    `data` is a mapping of day number -> Wh consumed.
    """
    now = datetime.now()
    y = year or now.year
    m = month or now.month
    try:
        data = await manager.get_daily_stats(device_id, y, m)
        return DailyStatsResponse(year=y, month=m, data=data)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.error(f"Daily stats error for {device_id}: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@app.get(
    "/devices/{device_id}/emeter/monthly",
    summary="Get monthly energy stats",
    response_model=MonthlyStatsResponse,
)
async def get_monthly_stats(
    device_id: str,
    year: Optional[int] = None,
) -> MonthlyStatsResponse:
    """Return monthly energy consumption stored on the device.

    Defaults to the current year if not provided.
    `data` is a mapping of month number -> Wh consumed.
    """
    y = year or datetime.now().year
    try:
        data = await manager.get_monthly_stats(device_id, y)
        return MonthlyStatsResponse(year=y, data=data)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.error(f"Monthly stats error for {device_id}: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# Discovery
# ---------------------------------------------------------------------------


@app.post("/discover", summary="Trigger manual device discovery")
async def trigger_discover() -> dict:
    """Re-run network discovery immediately.

    Useful after adding a new device or if the polling missed a DHCP change.
    Returns the count of newly discovered root devices and the running total.
    """
    devices = await manager.discover()
    return {"discovered": len(devices), "total": len(manager.devices)}


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


@app.get(
    "/health",
    summary="Sidecar health check",
    response_model=HealthResponse,
)
async def health() -> HealthResponse:
    """Return the sidecar health status and device counts.

    `device_count` excludes child outlet entries (only top-level devices).
    `online_count` is derived from devices that responded to the last poll.
    """
    all_devices = manager.get_all_device_dicts()
    online = sum(1 for d in all_devices if d.get("is_online"))
    return HealthResponse(
        status="ok",
        device_count=len(all_devices),
        online_count=online,
    )
