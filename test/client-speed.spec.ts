import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
import { createSpeedLoader } from '../src/client/SpeedSelect.js'

test('Speed menu uses an opaque themed surface rather than the translucent host menu token', () => {
  const source = readFileSync(new URL('../../src/client/SpeedSelect.tsx', import.meta.url), 'utf8')
  assert.match(source, /background: 'var\(--dsw-alias-bg-layer-2, var\(--dsw-alias-bg-base\)\)'/)
  assert.doesNotMatch(source, /background: 'var\(--dsw-specific-menu/)
})

test('Speed selector resolves a child default for the current model and rechecks model switches', async () => {
  const requests: unknown[] = []
  const connection = { rpc: { call: async (_channel: string, _endpoint: string, payload: { model?: string }) => {
    requests.push(payload)
    return { ok: true, value: { tier: payload.model === 'fast-model' ? 'fast' : 'standard', fastModels: ['fast-model'] } }
  } } } as unknown as ConnectionHandle
  let current = { provider: 'codex', model: 'fast-model' }
  const load = createSpeedLoader(connection, () => ({ directoryFor: id => {
    assert.equal(id, 'child')
    return { load: async () => ({ current }) }
  } }), 'child')
  assert.deepEqual(await load(), { visible: true, tier: 'fast' })
  current = { provider: 'codex', model: 'plain-model' }
  assert.deepEqual(await load(), { visible: false, tier: 'standard' })
  current = { provider: 'claude', model: 'fast-model' }
  assert.deepEqual(await load(), { visible: false, tier: 'standard' })
  assert.deepEqual(requests, [
    { sessionId: 'child', model: 'fast-model' },
    { sessionId: 'child', model: 'plain-model' },
    { sessionId: 'child' },
  ])
  assert.deepEqual(await createSpeedLoader(connection, () => undefined, 'unknown')(), { visible: false, tier: 'standard' })
})
