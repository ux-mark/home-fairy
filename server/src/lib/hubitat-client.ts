import axios from 'axios'
import http from 'node:http'
import https from 'node:https'

const HUB_BASE_URL = process.env.HUB_BASE_URL || 'http://192.168.1.200/apps/api/1/devices'
const HUBITAT_TOKEN = process.env.HUBITAT_TOKEN || ''

// keepAlive reuses TCP connections between requests — saves ~10–20 ms per call
// to the LAN hub, which compounds across the device commands a scene fires.
const httpAgent = new http.Agent({ keepAlive: true })
const httpsAgent = new https.Agent({ keepAlive: true })

const hubApi = axios.create({
  baseURL: HUB_BASE_URL,
  // 2.5 s is plenty for a LAN device. The previous 10 s let one offline
  // device stall the motion handler for an entire user-visible second.
  timeout: 2500,
  params: {
    access_token: HUBITAT_TOKEN,
  },
  httpAgent,
  httpsAgent,
})

export interface HubitatDevice {
  id: number
  label: string
  name: string
  type: string
  capabilities?: string[]
  attributes?: Record<string, unknown>
}

export const hubitatClient = {
  listDevices: async (): Promise<HubitatDevice[]> => {
    const res = await hubApi.get('')
    return res.data
  },

  getDevice: async (id: number | string): Promise<HubitatDevice> => {
    const res = await hubApi.get(`/${id}`)
    return res.data
  },

  sendCommand: async (id: number | string, command: string): Promise<unknown> => {
    const res = await hubApi.get(`/${id}/${command}`)
    return res.data
  },

  sendCommandWithValue: async (
    id: number | string,
    command: string,
    value: string | number,
  ): Promise<unknown> => {
    const res = await hubApi.get(`/${id}/${command}/${value}`)
    return res.data
  },
}
