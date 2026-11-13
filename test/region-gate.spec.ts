import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RegionGate, normalizeCountries } from '../src/region-gate.js'

test('normalizeCountries uppercases and deduplicates ISO codes, and rejects invalid input', () => {
  assert.deepEqual(normalizeCountries([' us ', 'US', 'ca']), ['US', 'CA'])
  assert.throws(() => normalizeCountries(['USA']), /invalid country code/)
  assert.throws(() => normalizeCountries('US'), /must be an array/)
})

test('manual region check returns the current egress even when the blocklist is empty', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-region-gate-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  let lookups = 0
  const gate = new RegionGate(async () => {
    lookups++
    return { ip: '203.0.113.10', country: 'US', countryName: 'United States' }
  }, Date.now, join(dir, 'region-gate.json'))

  assert.equal(await gate.enabled(), false)
  assert.equal((await gate.refresh(true)).country, undefined, 'agent gate skips checks with no restrictions')
  assert.equal(lookups, 0)

  const current = await gate.refresh(true, undefined, true)
  assert.equal(current.status, 'allowed')
  assert.equal(current.country, 'US')
  assert.equal(current.ip, '203.0.113.10')
  assert.equal(lookups, 1)
})

test('saving a blocked region persists it and checks before allowing model calls', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-region-gate-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  let lookups = 0
  const gate = new RegionGate(async () => {
    lookups++
    return { country: 'US', countryName: 'United States' }
  }, Date.now, join(dir, 'region-gate.json'))

  const snapshot = await gate.save(['us'])
  assert.equal(snapshot.status, 'blocked')
  assert.deepEqual(snapshot.blocked, ['US'])
  assert.equal(await gate.enabled(), true)
  assert.equal(lookups, 1)
})

test('an unavailable region lookup fails closed when blocking is enabled', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-region-gate-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const gate = new RegionGate(async () => { throw new Error('lookup unavailable') }, Date.now, join(dir, 'region-gate.json'))

  const snapshot = await gate.save(['US'])
  assert.equal(snapshot.status, 'error')
  assert.deepEqual(snapshot.blocked, ['US'])
  assert.match(snapshot.error ?? '', /lookup unavailable/)
})
