import axios, { type AxiosInstance } from 'axios'

const SIDECAR_URL = process.env.KASA_SIDECAR_URL || 'http://127.0.0.1:3002'
const TIMEOUT = 5000

export interface KasaEmeterData {
  power: number
  voltage: number
  current: number
  total: number
  today?: number
}

export interface KasaSidecarDevice {
  id: string
  label: string
  device_type: string
  model: string
  parent_id: string | null
  ip_address: string
  has_emeter: boolean
  firmware: string
  hardware: string
  rssi: number | null
  is_online: boolean
  switch_state: string
  brightness: number | null
  emeter: KasaEmeterData | null
  children: KasaSidecarDevice[] | null
  runtime_today: number | null
  runtime_month: number | null
}

export interface KasaDailyStats {
  year: number
  month: number
  data: Record<number, number>
}

export interface KasaMonthlyStats {
  year: number
  data: Record<number, number>
}

class KasaClient {
  private api: AxiosInstance

  constructor() {
    this.api = axios.create({
      baseURL: SIDECAR_URL,
      timeout: TIMEOUT,
    })
  }

  async listDevices(): Promise<KasaSidecarDevice[]> {
    const { data } = await this.api.get<KasaSidecarDevice[]>('/devices')
    return data
  }

  async getDevice(id: string): Promise<KasaSidecarDevice> {
    const { data } = await this.api.get<KasaSidecarDevice>(`/devices/${id}`)
    return data
  }

  async sendCommand(id: string, command: string, value?: number): Promise<void> {
    await this.api.post(`/devices/${id}/command`, { command, value })
  }

  async getEmeter(id: string): Promise<KasaEmeterData> {
    const { data } = await this.api.get<KasaEmeterData>(`/devices/${id}/emeter`)
    return data
  }

  async getDailyStats(id: string, year?: number, month?: number): Promise<KasaDailyStats> {
    const params: Record<string, number> = {}
    if (year) params.year = year
    if (month) params.month = month
    const { data } = await this.api.get<KasaDailyStats>(`/devices/${id}/emeter/daily`, { params })
    return data
  }

  async getMonthlyStats(id: string, year?: number): Promise<KasaMonthlyStats> {
    const params: Record<string, number> = {}
    if (year) params.year = year
    const { data } = await this.api.get<KasaMonthlyStats>(`/devices/${id}/emeter/monthly`, { params })
    return data
  }

  async renameDevice(id: string, alias: string): Promise<void> {
    await this.api.post(`/devices/${id}/rename`, { alias })
  }

  async discover(): Promise<{ discovered: number; total: number }> {
    const { data } = await this.api.post<{ discovered: number; total: number }>('/discover')
    return data
  }

  async health(): Promise<{ status: string; device_count: number; online_count: number }> {
    const { data } = await this.api.get('/health')
    return data
  }
}

export const kasaClient = new KasaClient()
