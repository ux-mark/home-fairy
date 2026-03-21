import axios from 'axios'

const lifxApi = axios.create({
  baseURL: 'https://api.lifx.com/v1',
  timeout: 10000,
  headers: { Authorization: `Bearer ${process.env.LIFX_TOKEN}` },
})

export const lifxClient = {
  listAll: () => lifxApi.get('/lights/all').then((r) => r.data),

  listBySelector: (sel: string) =>
    lifxApi.get(`/lights/${sel}`).then((r) => r.data),

  setState: (sel: string, state: object) =>
    lifxApi.put(`/lights/${sel}/state`, state).then((r) => r.data),

  toggle: (sel: string, duration = 1) =>
    lifxApi.post(`/lights/${sel}/toggle`, { duration }).then((r) => r.data),

  identify: (sel: string) =>
    lifxApi
      .post(`/lights/${sel}/effects/breathe`, {
        color: 'cyan',
        period: 1,
        cycles: 3,
        power_on: true,
      })
      .then((r) => r.data),

  listScenes: () => lifxApi.get('/scenes').then((r) => r.data),

  activateScene: (uuid: string, duration = 1) =>
    lifxApi
      .put(`/scenes/scene_id:${uuid}/activate`, { duration })
      .then((r) => r.data),
}
