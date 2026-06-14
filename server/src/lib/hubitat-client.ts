import axios, { type AxiosInstance } from 'axios'
import http from 'node:http'
import https from 'node:https'
import { getHubitat } from './settings-store.js'

// keepAlive reuses TCP connections between requests — saves ~10–20 ms per call
// to the LAN hub, which compounds across the device commands a scene fires.
const httpAgent = new http.Agent({ keepAlive: true })
const httpsAgent = new https.Agent({ keepAlive: true })

// Cache the axios instance so keepAlive sockets survive across calls.
// Rebuild only when baseUrl or token change (e.g. user updates Settings).
let cached: { baseUrl: string; token: string; api: AxiosInstance } | null = null

function getApi(): AxiosInstance {
  const { baseUrl, token } = getHubitat()
  if (!baseUrl) {
    throw new Error('Hubitat base URL not configured — set it in Settings')
  }
  if (!token) {
    throw new Error('Hubitat token not configured — set it in Settings')
  }
  if (cached && cached.baseUrl === baseUrl && cached.token === token) {
    return cached.api
  }
  const api = axios.create({
    baseURL: baseUrl,
    // 2.5 s is plenty for a LAN device. The previous 10 s let one offline
    // device stall the motion handler for an entire user-visible second.
    timeout: 2500,
    params: {
      access_token: token,
    },
    httpAgent,
    httpsAgent,
  })
  cached = { baseUrl, token, api }
  return api
}

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
    const res = await getApi().get('')
    return res.data
  },

  getDevice: async (id: number | string): Promise<HubitatDevice> => {
    const res = await getApi().get(`/${id}`)
    return res.data
  },

  sendCommand: async (id: number | string, command: string): Promise<unknown> => {
    const res = await getApi().get(`/${id}/${command}`)
    return res.data
  },

  sendCommandWithValue: async (
    id: number | string,
    command: string,
    value: string | number,
  ): Promise<unknown> => {
    const res = await getApi().get(`/${id}/${command}/${value}`)
    return res.data
  },
}
