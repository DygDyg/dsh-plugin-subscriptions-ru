import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { SubscriptionsKey } from './locales.js';
/** One reasoning level as the host directory reports it. */
interface EffortLevel {
    id: string;
    name: string;
    description?: string;
}
/** One model row of a provider group. */
interface PickerModel {
    id: string;
    name: string;
    description?: string;
    reasoning?: {
        efforts: EffortLevel[];
        defaultEffort?: string;
    };
}
/** One provider column entry. */
interface PickerGroup {
    id: string;
    name: string;
    models: PickerModel[];
}
/** The session's effective selection, when one exists. */
interface PickerSelection {
    provider: string;
    model: string;
    reasoningEffort?: string;
}
/** A provider whose catalog failed to load, reported beside the list. */
interface PickerFailure {
    id: string;
    name: string;
    message: string;
}
/**
 * The slice of ui-model-selection's per-session directory this picker reads.
 * Mirrored structurally: cross-plugin value imports are forbidden, and both
 * host lines expose this shape.
 */
export interface PickerDirectory {
    subscribe(fn: () => void): () => void;
    getSnapshot(): {
        current: PickerSelection | null;
        groups: PickerGroup[];
        failures: PickerFailure[];
        status: string;
        error: string | null;
    };
}
/** One quota lane of a subscription provider: the short window, or the weekly one. */
export interface PickerQuotaWindow {
    kind: 'session' | 'weekly' | 'other';
    /** Model lane, when the window belongs to one model rather than the account. */
    scope?: string;
    remainingPercent: number;
    /** Epoch millis of the next reset, when the provider reports one. */
    resetsAt?: number;
}
/** Remaining quota of one subscription provider, as this plugin reports it. */
export interface PickerQuota {
    /** Remaining share of the shortest window; drives the group's edge bar. */
    remainingPercent: number;
    /** The short window first, then the weekly one when the provider has both. */
    windows: PickerQuotaWindow[];
}
/** What the slot inject face hands the picker, already bound to one session. */
export interface ModelPickerInjected {
    /** False for subagent composers, which keep the host's own seat. */
    available: boolean;
    directory: PickerDirectory | null;
    /**
     * Remaining quota of one provider group, or null when the group is not one
     * of this plugin's providers or reports no windows. Absent on older hosts.
     */
    quotaFor?: (provider: string) => Promise<PickerQuota | null>;
    /** (Re)load the directory; failures surface on the store, not here. */
    load: () => void;
    /** Apply one selection; resolves false when the write was rejected. */
    select: (selection: PickerSelection) => Promise<boolean>;
}
/** Props the slot outlet delivers: the session kit, the inject face, the locale seat. */
export type ModelPickerProps = PropsRuntime<'conversation.input.model'> & Partial<ModelPickerInjected> & Partial<PropsLocale<'settings.subscriptions'>>;
type Translate = (key: SubscriptionsKey, params?: Record<string, unknown>) => string;
/**
 * Localized label of one reasoning level. Known effort ids translate; anything
 * the provider invented keeps the name it sent.
 */
export declare function effortLabel(level: EffortLevel, t: Translate): string;
export declare function ModelPicker({ available, directory, quotaFor, load, select, t }: ModelPickerProps): import("react").JSX.Element | null;
export {};
