import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { callSubscriptionsAuth } from './subscriptions-rpc.js'
import { en } from './locales.js'
import type { SubscriptionsKey } from './locales.js'

interface RecoveryView {
  id: string
  text: string
  attachments: { type: 'image' | 'file'; name: string }[]
  status: 'saved' | 'submitting' | 'accepted'
}
export interface RegionRecoveryCardInjected { rpc: ConnectionHandle['rpc']; sessionId: string }
type Props = Partial<PropsRuntime<'conversation.input.dock'>> & Partial<RegionRecoveryCardInjected> & Partial<PropsLocale<'settings.subscriptions'>>

function fallback(key: SubscriptionsKey, vars?: Record<string, string | number>): string {
  let text: string = en[key]
  if (vars) for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, String(value))
  return text
}

const card: CSSProperties = {
  padding: '10px 12px', borderRadius: 'var(--dsw-radius-lg, 16px)',
  border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-layer-2)',
  color: 'var(--dsw-alias-label-primary)', fontSize: 13, lineHeight: '20px',
}
const button: CSSProperties = {
  border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 'var(--dsw-radius-sm, 8px)',
  color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-bg-layer-1)',
  font: 'inherit', padding: '4px 8px', cursor: 'pointer',
}

/** Explicitly retry saved input; never replace the user's current draft. */
export function RegionRecoveryCard({ rpc, sessionId, t: locale }: Props) {
  const t = locale ?? fallback
  const [items, setItems] = useState<RecoveryView[]>([])
  const [itemsSession, setItemsSession] = useState(sessionId)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const currentSession = useRef(sessionId)
  const generation = useRef(0)
  if (currentSession.current !== sessionId) {
    currentSession.current = sessionId
    generation.current++
  }
  const refresh = useCallback(async () => {
    if (!rpc || !sessionId) return
    const version = generation.current
    const next = await callSubscriptionsAuth<RecoveryView[]>(rpc, 'regionRecoveryList', { sessionId })
    if (currentSession.current === sessionId && generation.current === version) setItems(next)
  }, [rpc, sessionId])
  useEffect(() => {
    let active = true
    let inflight = false
    setItems([])
    setItemsSession(sessionId)
    setBusy(null)
    setError(null)
    const version = generation.current
    const load = () => {
      if (!rpc || !sessionId || inflight) return
      inflight = true
      void callSubscriptionsAuth<RecoveryView[]>(rpc, 'regionRecoveryList', { sessionId }).then(
        next => { if (active && version === generation.current) setItems(next) },
        () => { if (active && version === generation.current) setError(t('recoveryFailure', { message: 'unavailable' })) },
      ).finally(() => { inflight = false })
    }
    load()
    const timer = setInterval(load, 3000)
    return () => { active = false; clearInterval(timer) }
  }, [rpc, sessionId, t])
  if (!rpc || !sessionId || itemsSession !== sessionId || (items.length === 0 && error === null)) return null
  const act = async (item: RecoveryView, remove: boolean) => {
    if (busy !== null) return
    if (remove && !window.confirm(t('recoveryConfirm'))) return
    const version = generation.current
    setBusy(item.id)
    setError(null)
    try {
      await callSubscriptionsAuth(rpc, remove ? 'regionRecoveryRemove' : 'regionRecoveryRetry', { sessionId, id: item.id })
      if (generation.current === version) await refresh()
    } catch (err) {
      if (generation.current === version) {
        setError(t('recoveryFailure', { message: err instanceof Error ? err.message : String(err) }))
        await refresh().catch(() => {})
      }
    } finally { if (generation.current === version) setBusy(null) }
  }
  return <div style={{ display: 'grid', gap: 8 }}>
    {items.map(item => <section key={item.id} style={card} aria-label={t('recoveryTitle')}>
      <strong>{t('recoveryTitle')}</strong>
      <p style={{ margin: '4px 0', color: 'var(--dsw-alias-label-secondary)' }}>
        {item.status === 'accepted' ? t('recoveryAccepted') : item.status === 'submitting' ? t('recoveryUncertain') : t('recoveryHint')}
      </p>
      {item.text && <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 120, overflowY: 'auto' }}>{item.text}</div>}
      {item.attachments.length > 0 && <ul style={{ margin: '4px 0', paddingInlineStart: 20 }}>
        {item.attachments.map((attachment, index) => <li key={index}>{attachment.name}</li>)}
      </ul>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        {item.status === 'saved' && <button type="button" style={button} disabled={busy !== null} onClick={() => { void act(item, false) }}>
          {busy === item.id ? t('recoveryBusy') : t('recoveryRetry')}
        </button>}
        <button type="button" style={button} disabled={busy !== null} onClick={() => { void act(item, true) }}>{t('recoveryRemove')}</button>
      </div>
    </section>)}
    {error && <p role="status" style={{ ...card, color: 'var(--dsw-alias-state-error-primary)' }}>{error}</p>}
  </div>
}
