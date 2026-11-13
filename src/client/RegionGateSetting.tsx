/**
 * Settings card for the countries whose public IP must not reach a model.
 * Saving replaces the host list and immediately re-checks the current egress.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
import { callSubscriptionsAuth } from './subscriptions-rpc.js'
import { REGION_COUNTRIES } from './region-countries.js'
import { en } from './locales.js'
import type { SubscriptionsKey } from './locales.js'
import type { RegionSnapshot } from './RegionGateNotice.js'

export interface RegionGateSettingProps {
  rpc: ConnectionHandle['rpc']
  t: (key: SubscriptionsKey, vars?: Record<string, string | number>) => string
}

const card: CSSProperties = {
  padding: '12px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}
const hint: CSSProperties = {
  margin: 0,
  fontSize: 12,
  lineHeight: '18px',
  color: 'var(--dsw-alias-label-tertiary)',
}
const dropdown: CSSProperties = { position: 'relative' }
const dropdownButton: CSSProperties = {
  width: '100%', minHeight: 36, display: 'flex', alignItems: 'center', gap: 8,
  padding: '7px 10px', textAlign: 'left', color: 'var(--dsw-alias-label-primary)',
  background: 'var(--dsw-alias-bg-layer-1)', border: '0.5px solid var(--dsw-alias-border-l2)',
  borderRadius: 'var(--dsw-radius-md, 10px)', cursor: 'pointer',
}
const dropdownPanel: CSSProperties = {
  position: 'absolute', zIndex: 20, top: 'calc(100% + 4px)', left: 0, right: 0,
  display: 'flex', flexDirection: 'column', gap: 6, padding: 8,
  background: 'var(--dsw-alias-bg-layer-2)', border: '0.5px solid var(--dsw-alias-border-l2)',
  borderRadius: 'var(--dsw-radius-lg, 16px)', boxShadow: 'var(--dsw-shadow-popover, 0 8px 24px rgba(0,0,0,.22))',
}
const dropdownOptions: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 220, overflowY: 'auto',
}
const option: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, minHeight: 30, padding: '4px 6px',
  borderRadius: 'var(--dsw-radius-sm, 8px)', color: 'var(--dsw-alias-label-primary)',
  fontSize: 13, lineHeight: '20px', cursor: 'pointer',
}
const row: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function displayCountry(code: string): string {
  try {
    const language = typeof navigator === 'undefined' ? 'en' : navigator.language
    const label = new Intl.DisplayNames([language], { type: 'region' }).of(code)
    return label && label !== code ? `${label} (${code})` : code
  } catch {
    return code
  }
}

/** The blocked-region picker rendered above the proxy card. */
export function RegionGateSetting({ rpc, t }: RegionGateSettingProps) {
  const [snapshot, setSnapshot] = useState<RegionSnapshot | undefined>(undefined)
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [countryDraft, setCountryDraft] = useState('')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | undefined>(undefined)

  const apply = useCallback((next: RegionSnapshot): void => {
    setSnapshot(next)
    setSelected(next.blocked)
    setLoaded(true)
    setMessage(undefined)
  }, [])

  useEffect(() => {
    let alive = true
    void callSubscriptionsAuth<RegionSnapshot>(rpc, 'regionGate', { force: true }).then(next => {
      if (alive) apply(next)
    }, error => {
      if (alive) setMessage({ tone: 'error', text: messageOf(error) })
    })
    return () => { alive = false }
  }, [rpc, apply])

  useEffect(() => {
    if (!open) return undefined
    const dismiss = (event: PointerEvent): void => {
      if (event.target instanceof Node && !dropdownRef.current?.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const toggle = (code: string): void => {
    setSelected(current => current.includes(code) ? current.filter(item => item !== code) : [...current, code])
  }

  const save = async (): Promise<void> => {
    setBusy(true)
    setMessage(undefined)
    try {
      apply(await callSubscriptionsAuth<RegionSnapshot>(rpc, 'setRegionGate', { blocked: selected }))
      setMessage({ tone: 'success', text: t('regionSaved') })
    } catch (error) {
      setMessage({ tone: 'error', text: t('regionSaveFailed', { message: messageOf(error) }) })
    } finally {
      setBusy(false)
    }
  }

  const refresh = async (): Promise<void> => {
    setChecking(true)
    try {
      const next = await callSubscriptionsAuth<RegionSnapshot>(rpc, 'regionGate', { force: true })
      setSnapshot(next)
      if (!loaded) {
        setSelected(next.blocked)
        setLoaded(true)
      }
      setMessage(undefined)
    } catch (error) {
      setMessage({ tone: 'error', text: messageOf(error) })
    } finally {
      setChecking(false)
    }
  }

  const addCountryCodes = (): void => {
    const codes = countryDraft.split(/[\\s,;]+/).filter(Boolean).map(code => code.toUpperCase())
    if (codes.length === 0 || codes.some(code => !/^[A-Z]{2}$/.test(code))) {
      setMessage({ tone: 'error', text: t('regionInvalidCodes') })
      return
    }
    setSelected(current => [...new Set([...current, ...codes])])
    setCountryDraft('')
    setMessage(undefined)
  }

  const countryOptions = [...new Set([...REGION_COUNTRIES, ...selected])]
    .sort((a, b) => displayCountry(a).localeCompare(displayCountry(b), undefined, { sensitivity: 'base' }))
  const filteredCountries = countryOptions.filter(code => {
    const query = search.trim().toLocaleLowerCase()
    return query === '' || code.toLocaleLowerCase().includes(query) || displayCountry(code).toLocaleLowerCase().includes(query)
  })

  const current = snapshot === undefined
    ? t('regionCurrentUnknown')
    : snapshot.country
      ? t('regionCurrent', { country: snapshot.countryName ?? snapshot.country, ip: snapshot.ip ?? '—' })
      : snapshot.error
        ? t('regionCheckFailed', { message: snapshot.error })
        : t('regionCurrentUnknown')

  return (
    <div style={card}>
      <span style={{ fontWeight: 500, fontSize: 14, lineHeight: '22px' }}>{t('regionTitle')}</span>
      <p style={hint}>{t('regionHint')}</p>
      <p style={{
        ...hint,
        color: snapshot?.status === 'blocked' || snapshot?.status === 'error'
          ? 'var(--dsw-alias-state-error-primary)'
          : 'var(--dsw-alias-label-secondary)',
      }} role="status">
        {snapshot?.status === 'blocked'
          ? t('regionBlockedNow', { country: snapshot.countryName ?? snapshot.country ?? '—' })
          : current}
      </p>
      {!loaded && <p style={hint} role="status">{t('regionLoading')}</p>}
      <div ref={dropdownRef} style={dropdown}>
        <button
          type="button"
          style={dropdownButton}
          disabled={!loaded || busy}
          aria-expanded={open}
          aria-controls="dsh-region-country-options"
          onClick={() => setOpen(value => !value)}
        >
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selected.length === 0 ? t('regionNone') : t('regionSelectedCount', { count: selected.length })}
          </span>
          <span aria-hidden="true">{open ? '▴' : '▾'}</span>
        </button>
        {open && (
          <div id="dsh-region-country-options" style={dropdownPanel}>
            <input
              autoFocus
              type="search"
              value={search}
              placeholder={t('regionSearch')}
              aria-label={t('regionSearch')}
              onChange={event => setSearch(event.target.value)}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
            <div style={dropdownOptions}>
              {filteredCountries.length === 0
                ? <p style={hint}>{t('regionNoMatches')}</p>
                : filteredCountries.map(code => (
                  <label key={code} style={option}>
                    <input
                      type="checkbox"
                      checked={selected.includes(code)}
                      disabled={busy}
                      onChange={() => toggle(code)}
                    />
                    <span>{displayCountry(code)}</span>
                  </label>
                ))}
            </div>
            <p style={hint}>{t('regionCountryCodeHint')}</p>
            <div style={row}>
              <input
                type="text"
                value={countryDraft}
                placeholder={t('regionCountryCodePlaceholder')}
                aria-label={t('regionCountryCodeHint')}
                disabled={busy}
                onChange={event => setCountryDraft(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addCountryCodes() } }}
                style={{ flex: '1 1 120px', minWidth: 0 }}
              />
              <button type="button" disabled={busy} onClick={addCountryCodes}>{t('regionAddCodes')}</button>
            </div>
          </div>
        )}
      </div>
      <div style={row}>
        <button type="button" disabled={!loaded || busy} onClick={() => { void save() }}>
          {busy ? t('regionSaving') : t('regionSave')}
        </button>
        <button type="button" disabled={checking} onClick={() => { void refresh() }}>
          {checking ? t('regionChecking') : t('regionRefresh')}
        </button>
        {selected.length === 0 && <span style={hint}>{t('regionNone')}</span>}
      </div>
      {message && (
        <p style={{ ...hint, color: message.tone === 'error' ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-state-success-primary)' }}>
          {message.text}
        </p>
      )}
    </div>
  )
}
