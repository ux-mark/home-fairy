import axios from 'axios'

const HUB_BASE_URL = process.env.HUB_BASE_URL || 'http://192.168.1.200/apps/api/1/devices'
const HUBITAT_TOKEN = process.env.HUBITAT_TOKEN || ''

const hubApi = axios.create({
  baseURL: HUB_BASE_URL,
  timeout: 10000,
  params: {
    access_token: HUBITAT_TOKEN,
  },
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
