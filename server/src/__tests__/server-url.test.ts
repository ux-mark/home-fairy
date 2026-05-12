/**
 * server-url tests — exercise the picker with synthetic interface maps so
 * the result is independent of the host's actual network stack.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { pickLanBaseUrl } from '../lib/server-url.js'

describe('server-url: pickLanBaseUrl', () => {
  test('typical Pi setup → returns LAN URL on the private interface', () => {
    const result = pickLanBaseUrl(
      {
        lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
        eth0: [{ address: '192.168.10.201', family: 'IPv4', internal: false }],
      },
      { PORT: '3001' },
    )
    assert.equal(result, 'http://192.168.10.201:3001')
  })

  test('loopback-only host → null', () => {
    const result = pickLanBaseUrl(
      {
        lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
      },
      { PORT: '3001' },
    )
    assert.equal(result, null)
  })

  test('no interfaces → null', () => {
    const result = pickLanBaseUrl({}, { PORT: '3001' })
    assert.equal(result, null)
  })

  test('FAIRY_PUBLIC_HOST overrides interface scan', () => {
    const result = pickLanBaseUrl(
      {
        eth0: [{ address: '192.168.10.201', family: 'IPv4', internal: false }],
      },
      { FAIRY_PUBLIC_HOST: 'home.local', PORT: '3001' },
    )
    assert.equal(result, 'http://home.local:3001')
  })

  test('FAIRY_PUBLIC_HOST wins even when no LAN interface available', () => {
    const result = pickLanBaseUrl(
      { lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }] },
      { FAIRY_PUBLIC_HOST: '192.168.10.201', PORT: '3001' },
    )
    assert.equal(result, 'http://192.168.10.201:3001')
  })

  test('PORT defaults to 3001 when not set', () => {
    const result = pickLanBaseUrl(
      {
        eth0: [{ address: '192.168.10.201', family: 'IPv4', internal: false }],
      },
      {},
    )
    assert.equal(result, 'http://192.168.10.201:3001')
  })

  test('custom PORT is honoured', () => {
    const result = pickLanBaseUrl(
      {
        eth0: [{ address: '192.168.10.201', family: 'IPv4', internal: false }],
      },
      { PORT: '4000' },
    )
    assert.equal(result, 'http://192.168.10.201:4000')
  })

  test('non-private external IPv4 is skipped', () => {
    const result = pickLanBaseUrl(
      {
        wan: [{ address: '8.8.8.8', family: 'IPv4', internal: false }],
      },
      { PORT: '3001' },
    )
    assert.equal(result, null)
  })

  test('IPv6 entries are ignored', () => {
    const result = pickLanBaseUrl(
      {
        eth0: [
          { address: 'fe80::1', family: 'IPv6', internal: false },
          { address: '192.168.1.5', family: 'IPv4', internal: false },
        ],
      },
      { PORT: '3001' },
    )
    assert.equal(result, 'http://192.168.1.5:3001')
  })

  test('10.0.0.0/8 range is recognised as private', () => {
    const result = pickLanBaseUrl(
      { eth0: [{ address: '10.5.6.7', family: 'IPv4', internal: false }] },
      { PORT: '3001' },
    )
    assert.equal(result, 'http://10.5.6.7:3001')
  })

  test('172.16.0.0/12 range is recognised as private', () => {
    const result = pickLanBaseUrl(
      { eth0: [{ address: '172.20.1.1', family: 'IPv4', internal: false }] },
      { PORT: '3001' },
    )
    assert.equal(result, 'http://172.20.1.1:3001')
  })

  test('172.15.x.x is NOT in the private 172.16.0.0/12 range', () => {
    const result = pickLanBaseUrl(
      { eth0: [{ address: '172.15.1.1', family: 'IPv4', internal: false }] },
      { PORT: '3001' },
    )
    assert.equal(result, null)
  })

  test('numeric family value (legacy Node shape) still works', () => {
    const result = pickLanBaseUrl(
      {
        eth0: [{ address: '192.168.10.201', family: 4 as unknown as 'IPv4', internal: false }],
      },
      { PORT: '3001' },
    )
    assert.equal(result, 'http://192.168.10.201:3001')
  })
})
