/**
 * Region gate for subscription model calls. The public IP is resolved through
 * the same proxy path as model traffic, so the country is the one the provider
 * would see. A match against the blocked-country list rejects the step before
 * any provider socket is opened.
 */
/** ISO 3166-1 alpha-2 country code. */
export type CountryCode = string;
/** How a lookup ended. `blocked` is the only outcome that rejects a model call. */
export type RegionStatus = 'unknown' | 'allowed' | 'blocked' | 'error';
/** One lookup the composer and the pre-step gate share. */
export interface RegionSnapshot {
    status: RegionStatus;
    /** Public address the lookup saw. Absent when the lookup failed. */
    ip?: string;
    /** ISO country of that address. Absent when the lookup failed. */
    country?: CountryCode;
    /** English country name, when the lookup service returned one. */
    countryName?: string;
    /** ISO codes currently configured to block model calls. */
    blocked: CountryCode[];
    /** Epoch milliseconds of the lookup, when one completed. */
    checkedAt?: number;
    /** Failure text when `status` is `error`. */
    error?: string;
}
/** Persisted gate settings. An empty list disables the gate. */
export interface RegionSettings {
    /** Countries whose public IP must not reach a subscription model. */
    blocked: CountryCode[];
}
/** Injectable lookup, so tests never hit the network. */
export type RegionLookup = (signal: AbortSignal) => Promise<{
    ip?: string;
    country: CountryCode;
    countryName?: string;
}>;
/** Refresh often enough that a VPN region change is caught before the next send. */
export declare const REGION_CACHE_TTL_MS = 20000;
/** Hard stop so a hung geo endpoint cannot pin a model step. */
export declare const REGION_LOOKUP_TIMEOUT_MS = 8000;
/** Normalize a user-entered country list. Duplicates and invalid codes drop out. */
export declare function normalizeCountries(input: unknown): CountryCode[];
/** Read the blocked-country list. A missing file means the gate is off. */
export declare function readRegionSettings(path?: string): Promise<RegionSettings>;
/** Persist the blocked-country list. Takes effect on the next lookup. */
export declare function writeRegionSettings(settings: RegionSettings, path?: string): Promise<void>;
/**
 * Resolve the public country through ipwho.is. The request uses
 * {@link proxiedFetch}, so a configured plugin proxy is the egress the
 * provider would also use. The response carries no account or prompt.
 */
export declare function lookupPublicRegion(signal: AbortSignal): Promise<{
    ip?: string;
    country: CountryCode;
    countryName?: string;
}>;
/**
 * Shared cache for the composer warning and the pre-step reject. A blocked
 * result is never served past its TTL: a VPN hop must be re-checked before
 * the next model call is allowed through.
 */
export declare class RegionGate {
    private readonly lookup;
    private readonly now;
    private readonly path;
    private settings;
    private snapshot;
    private inflight;
    private loaded;
    constructor(lookup?: RegionLookup, now?: () => number, path?: string);
    /** Current snapshot without a network call. */
    current(): RegionSnapshot;
    /** Replace the blocked list and drop the cached verdict. */
    save(blocked: unknown): Promise<RegionSnapshot>;
    /** Whether model calls need a region check; malformed settings fail closed. */
    enabled(): Promise<boolean>;
    /**
     * Resolve the current egress country and whether it may call a model.
     * @param force - ignore the TTL.
     * @param signal - optional cancellation signal.
     * @param lookupWithoutRestrictions - perform an explicit user-requested lookup even when no countries are blocked.
     */
    refresh(force?: boolean, signal?: AbortSignal, lookupWithoutRestrictions?: boolean): Promise<RegionSnapshot>;
    private loadSettings;
    private lookupOnce;
}
