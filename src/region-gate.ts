/**
 * Region gate for subscription model calls. The public IP is resolved through
 * the same proxy path as model traffic, so the country is the one the provider
 * would see. A match against the blocked-country list rejects the step before
 * any provider socket is opened.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { describeFetchError, proxiedFetch } from './http.js'

/** ISO 3166-1 alpha-2 country code. */
export type CountryCode = string

/** How a lookup ended. `blocked` is the only outcome that rejects a model call. */
export type RegionStatus = 'unknown' | 'allowed' | 'blocked' | 'error'

/** One lookup the composer and the pre-step gate share. */
export interface RegionSnapshot {
  status: RegionStatus
  /** Public address the lookup saw. Absent when the lookup failed. */
  ip?: string
  /** ISO country of that address. Absent when the lookup failed. */
  country?: CountryCode
  /** English country name, when the lookup service returned one. */
  countryName?: string
  /** ISO codes currently configured to block model calls. */
  blocked: CountryCode[]
  /** Epoch milliseconds of the lookup, when one completed. */
  checkedAt?: number
  /** Failure text when `status` is `error`. */
  error?: string
}

/** Persisted gate settings. An empty list disables the gate. */
export interface RegionSettings {
  /** Countries whose public IP must not reach a subscription model. */
  blocked: CountryCode[]
}

/** Injectable lookup, so tests never hit the network. */
export type RegionLookup = (signal: AbortSignal) => Promise<{
  ip?: string
  country: CountryCode
  countryName?: string
}>

const CODE = /^[A-Z]{2}$/
/** Refresh often enough that a VPN region change is caught before the next send. */
export const REGION_CACHE_TTL_MS = 20_000
/** Hard stop so a hung geo endpoint cannot pin a model step. */
export const REGION_LOOKUP_TIMEOUT_MS = 8_000

/** Normalize a user-entered country list. Duplicates and invalid codes drop out. */
export function normalizeCountries(input: unknown): CountryCode[] {
  if (!Array.isArray(input)) throw new Error('blocked regions must be an array of country codes')
  const seen = new Set<CountryCode>()
  for (const item of input) {
    if (typeof item !== 'string') throw new Error('blocked regions must be an array of country codes')
    const code = item.trim().toUpperCase()
    if (!CODE.test(code)) throw new Error(`invalid country code "${item}"`)
    seen.add(code)
  }
  return [...seen]
}

function settingsPath(): string {
  return dshHomePath('plugins', 'subscriptions', 'region-gate.json')
}

/** Read the blocked-country list. A missing file means the gate is off. */
export async function readRegionSettings(path = settingsPath()): Promise<RegionSettings> {
  try {
    const raw = JSON.parse(await readFile(path, 'utf8')) as { blocked?: unknown }
    return { blocked: normalizeCountries(raw.blocked ?? []) }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { blocked: [] }
    throw new Error(`Cannot read region gate settings at ${path}`, { cause: error })
  }
}

/** Persist the blocked-country list. Takes effect on the next lookup. */
export async function writeRegionSettings(settings: RegionSettings, path = settingsPath()): Promise<void> {
  const blocked = normalizeCountries(settings.blocked)
  await mkdir(dirname(path), { recursive: true })
  const temp = `${path}.${process.pid}.tmp`
  await writeFile(temp, `${JSON.stringify({ blocked }, null, 2)}\n`, { mode: 0o600 })
  await rename(temp, path)
}

/**
 * Resolve the public country through ipwho.is. The request uses
 * {@link proxiedFetch}, so a configured plugin proxy is the egress the
 * provider would also use. The response carries no account or prompt.
 */
export async function lookupPublicRegion(signal: AbortSignal): Promise<{
  ip?: string
  country: CountryCode
  countryName?: string
}> {
  const response = await proxiedFetch('https://ipwho.is/', {
    method: 'GET',
    headers: { accept: 'application/json' },
    signal,
  })
  if (!response.ok) throw new Error(`region lookup failed: HTTP ${response.status}`)
  const body = await response.json() as {
    success?: boolean
    message?: string
    ip?: string
    country_code?: string
    country?: string
  }
  if (body.success === false) throw new Error(body.message || 'region lookup failed')
  const country = typeof body.country_code === 'string' ? body.country_code.trim().toUpperCase() : ''
  if (!CODE.test(country)) throw new Error('region lookup returned no country')
  return {
    ...typeof body.ip === 'string' && body.ip !== '' ? { ip: body.ip } : {},
    country,
    ...typeof body.country === 'string' && body.country !== '' ? { countryName: body.country } : {},
  }
}

/**
 * Shared cache for the composer warning and the pre-step reject. A blocked
 * result is never served past its TTL: a VPN hop must be re-checked before
 * the next model call is allowed through.
 */
export class RegionGate {
  private settings: RegionSettings = { blocked: [] }
  private snapshot: RegionSnapshot = { status: 'unknown', blocked: [] }
  private inflight: Promise<RegionSnapshot> | undefined
  private loaded = false

  constructor(
    private readonly lookup: RegionLookup = lookupPublicRegion,
    private readonly now: () => number = Date.now,
    private readonly path = settingsPath(),
  ) {}

  /** Current snapshot without a network call. */
  current(): RegionSnapshot {
    return this.snapshot
  }

  /** Replace the blocked list and drop the cached verdict. */
  async save(blocked: unknown): Promise<RegionSnapshot> {
    const settings = { blocked: normalizeCountries(blocked) }
    await writeRegionSettings(settings, this.path)
    this.settings = settings
    this.loaded = true
    this.snapshot = { status: 'unknown', blocked: settings.blocked }
    return this.refresh(true, undefined, true)
  }

  /** Whether model calls need a region check; malformed settings fail closed. */
  async enabled(): Promise<boolean> {
    if (!await this.loadSettings()) return true
    return this.settings.blocked.length > 0
  }

  /**
   * Resolve the current egress country and whether it may call a model.
   * @param force - ignore the TTL.
   * @param signal - optional cancellation signal.
   * @param lookupWithoutRestrictions - perform an explicit user-requested lookup even when no countries are blocked.
   */
  async refresh(force = false, signal?: AbortSignal, lookupWithoutRestrictions = false): Promise<RegionSnapshot> {
    if (!await this.loadSettings()) return this.snapshot
    if (this.settings.blocked.length === 0 && !lookupWithoutRestrictions) {
      this.snapshot = { ...this.snapshot, status: 'allowed', blocked: [] }
      return this.snapshot
    }
    const fresh = this.snapshot.checkedAt !== undefined
      && this.now() - this.snapshot.checkedAt < REGION_CACHE_TTL_MS
      && this.snapshot.status !== 'unknown'
    if (!force && fresh) return this.snapshot
    if (this.inflight !== undefined && !force) return this.inflight
    const run = this.lookupOnce(signal)
    this.inflight = run
    try {
      return await run
    } finally {
      if (this.inflight === run) this.inflight = undefined
    }
  }

  private async loadSettings(): Promise<boolean> {
    if (this.loaded) return true
    try {
      this.settings = await readRegionSettings(this.path)
      this.loaded = true
      this.snapshot = { ...this.snapshot, blocked: this.settings.blocked }
      return true
    } catch (error) {
      // A corrupt settings file must never silently disable the safety gate.
      this.snapshot = {
        status: 'error',
        blocked: [],
        checkedAt: this.now(),
        error: error instanceof Error ? error.message : String(error),
      }
      return false
    }
  }

  private async lookupOnce(parent?: AbortSignal): Promise<RegionSnapshot> {
    const signal = AbortSignal.any([
      AbortSignal.timeout(REGION_LOOKUP_TIMEOUT_MS),
      ...parent === undefined ? [] : [parent],
    ])
    try {
      const found = await this.lookup(signal)
      const blocked = this.settings.blocked.includes(found.country)
      this.snapshot = {
        status: blocked ? 'blocked' : 'allowed',
        ...found.ip === undefined ? {} : { ip: found.ip },
        country: found.country,
        ...found.countryName === undefined ? {} : { countryName: found.countryName },
        blocked: [...this.settings.blocked],
        checkedAt: this.now(),
      }
    } catch (error) {
      // Fail closed: an unknown egress must not open a provider connection.
      this.snapshot = {
        status: 'error',
        blocked: [...this.settings.blocked],
        checkedAt: this.now(),
        error: describeFetchError(error),
      }
    }
    return this.snapshot
  }
}
