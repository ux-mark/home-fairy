/**
 * sonos-http-api-restarter tests.
 *
 * Verifies the cooldown so a flapping speaker can't kick off a restart
 * loop (each restart drops Sonos control for ~2-3 s).
 */

import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const { requestSonosHttpApiRestart, _test } = await import('../lib/sonos-http-api-restarter.js')

type ExecCall = { cmd: string }

function installExecStub(): { calls: ExecCall[] } {
  const calls: ExecCall[] = []
  _test.setExec((cmd, cb) => {
    calls.push({ cmd })
    cb(null, '', '')
  })
  return { calls }
}

describe('sonos-http-api-restarter', () => {
  beforeEach(() => {
    _test.reset()
    _test.restoreExec()
  })

  test('first call fires pm2 restart and returns true', () => {
    const { calls } = installExecStub()
    const fired = requestSonosHttpApiRestart('test: first IP change')
    assert.equal(fired, true)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].cmd, 'pm2 restart sonos-http-api')
  })

  test('second call within cooldown is suppressed', () => {
    const { calls } = installExecStub()
    assert.equal(requestSonosHttpApiRestart('first'), true)
    assert.equal(requestSonosHttpApiRestart('second-immediately-after'), false)
    assert.equal(calls.length, 1, 'exec must not be called again within cooldown')
  })

  test('exec failure does not throw and does not reset cooldown', () => {
    const calls: ExecCall[] = []
    _test.setExec((cmd, cb) => {
      calls.push({ cmd })
      cb(new Error('pm2 not found'), '', 'pm2: command not found')
    })
    assert.doesNotThrow(() => requestSonosHttpApiRestart('first'))
    assert.equal(requestSonosHttpApiRestart('second'), false, 'cooldown should still suppress after exec failure')
    assert.equal(calls.length, 1)
  })

  test('cooldown duration matches documented 10 minutes', () => {
    assert.equal(_test.cooldownMs, 10 * 60 * 1000)
  })
})
