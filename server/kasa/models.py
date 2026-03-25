from pydantic import BaseModel
from typing import Optional


class EmeterData(BaseModel):
    power: float = 0.0        # watts
    voltage: float = 0.0      # volts
    current: float = 0.0      # amps
    total: float = 0.0        # cumulative kWh
    today: Optional[float] = None  # Wh today (if available from Usage module)


class KasaDeviceResponse(BaseModel):
    id: str                    # MAC address (stable ID)
    label: str                 # Device alias
    device_type: str           # plug, strip, outlet, switch, dimmer
    model: str
    parent_id: Optional[str] = None  # For strip outlets: parent MAC
    ip_address: str
    has_emeter: bool
    firmware: str
    hardware: str
    rssi: Optional[int] = None
    is_online: bool
    switch_state: str          # on/off
    brightness: Optional[int] = None  # 0-100 for dimmers
    emeter: Optional[EmeterData] = None
    children: Optional[list['KasaDeviceResponse']] = None
    runtime_today: Optional[int] = None   # minutes
    runtime_month: Optional[int] = None   # minutes


class CommandRequest(BaseModel):
    command: str               # on, off, set_brightness
    value: Optional[int] = None  # brightness 0-100


class DailyStatsResponse(BaseModel):
    year: int
    month: int
    data: dict[int, float]     # day -> Wh


class MonthlyStatsResponse(BaseModel):
    year: int
    data: dict[int, float]     # month -> Wh


class HealthResponse(BaseModel):
    status: str
    device_count: int
    online_count: int
