import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import type { RegionGate } from '../src/region-gate.js'
import { RegionRecovery } from '../src/region-recovery.js'

const signal = () => new AbortController().signal
const message = () => createUserMessage({ content: [
  { type: 'text' as const, text: 'hello' },
  { type: 'file' as const, attachment: { attachmentId: 'sha256:abc' as never, name: 'notes.txt', bytes: 3 } },
], source: { kind: 'user' as const } })

async function fixture(t: import('node:test').TestContext) {
  const dir = await mkdtemp(join(tmpdir(), 'region-recovery-test-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return new RegionRecovery(dir)
}

function mocks() {
  const sent: ReturnType<typeof message>[] = []
  const read: string[] = []
  const agent = { id: 'session', status: 'idle', session: { header: {} }, inbox: { nextTurn: [], nextStep: [] },
    followup: (value: ReturnType<typeof message>) => { sent.push(value) } } as unknown as Agent
  const attachments = { readFileStream: async function* () { read.push('file'); yield new Uint8Array([1, 2, 3]) } } as unknown as AttachmentStore
  const gate = { refresh: async () => ({ status: 'allowed', blocked: [] }) } as unknown as RegionGate
  return { sent, read, agent, attachments, gate }
}

test('blocked input and attachment references survive reload and retry only once', async t => {
  const store = await fixture(t)
  const input = message()
  await store.save('session', [input])
  await store.save('session', [input])
  const [row] = await store.list('session')
  assert.equal((await store.list('session')).length, 1)
  assert.equal(row?.text, 'hello')
  assert.deepEqual(row?.attachments, [{ type: 'file', name: 'notes.txt' }])
  const { agent, attachments, gate, sent, read } = mocks()
  await Promise.all([store.retry('session', row!.id, agent, attachments, gate, signal()), store.retry('session', row!.id, agent, attachments, gate, signal())])
  assert.equal(sent.length, 1)
  assert.deepEqual(sent[0]!.content, input.content)
  assert.notEqual(sent[0]!.id, input.id)
  assert.deepEqual(read, ['file'])
  assert.equal((await store.list('session'))[0]?.status, 'accepted')
})

test('blocked retry and missing attachment never dispatch the saved message', async t => {
  const store = await fixture(t)
  await store.save('session', [message()])
  const id = (await store.list('session'))[0]!.id
  const { agent, attachments, sent } = mocks()
  const blocked = { refresh: async () => ({ status: 'blocked', country: 'US', blocked: ['US'] }) } as unknown as RegionGate
  await assert.rejects(store.retry('session', id, agent, attachments, blocked, signal()), /blocked/)
  const broken = { readFileStream: async function* () { throw new Error('missing file') } } as unknown as AttachmentStore
  const allowed = { refresh: async () => ({ status: 'allowed', blocked: [] }) } as unknown as RegionGate
  await assert.rejects(store.retry('session', id, agent, broken, allowed, signal()), /missing file/)
  assert.equal(sent.length, 0)
  assert.equal((await store.list('session'))[0]?.status, 'saved')
})

test('a repeat region block restores the existing card and never replays prior messages', async t => {
  const store = await fixture(t)
  await store.save('session', [message()])
  const id = (await store.list('session'))[0]!.id
  const { agent, attachments, gate, sent } = mocks()
  await store.retry('session', id, agent, attachments, gate, signal())
  await store.save('session', [sent[0]!])
  const rows = await store.list('session')
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.id, id)
  assert.equal(rows[0]?.status, 'saved')
})

test('image attachments are verified and preserved in the replay', async t => {
  const store = await fixture(t)
  const image = { attachmentId: 'sha256:image' as never, mediaType: 'image/png' as const, bytes: 10, width: 1, height: 1, name: 'photo.png' }
  const input = createUserMessage({ content: [{ type: 'text' as const, text: 'describe' }, { type: 'image' as const, attachment: image }], source: { kind: 'user' as const } })
  await store.save('session', [input])
  const row = (await store.list('session'))[0]!
  assert.deepEqual(row.attachments, [{ type: 'image', name: 'photo.png' }])
  const { agent, gate, sent } = mocks()
  let checked = false
  const attachments = { readImage: async (ref: unknown) => { assert.deepEqual(ref, image); checked = true } } as unknown as AttachmentStore
  await store.retry('session', row.id, agent, attachments, gate, signal())
  assert.equal(checked, true)
  assert.deepEqual(sent[0]!.content, input.content)
})

test('uncertain followup outcome is not sent again automatically', async t => {
  const store = await fixture(t)
  await store.save('session', [message()])
  const id = (await store.list('session'))[0]!.id
  const { agent, attachments, gate } = mocks()
  agent.followup = () => { throw new Error('unknown outcome') }
  await assert.rejects(store.retry('session', id, agent, attachments, gate, signal()), /unknown outcome/)
  assert.equal((await store.list('session'))[0]?.status, 'submitting')
  await assert.rejects(store.retry('session', id, agent, attachments, gate, signal()), /unknown/)
})
