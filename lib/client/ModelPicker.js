import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Composer model picker, owned by this plugin instead of the separate
 * dsh-model-picker bundle. It takes the shipped `conversation.input.model`
 * seat and reads the same per-session ModelDirectory the host's /model popup
 * uses, so a choice made in either place is what the other shows next.
 *
 * The menu keeps a fixed height whether a provider lists two models or
 * twenty: short lists leave empty space instead of shrinking the panel.
 * Provider descriptions stay verbatim — they arrive from the provider and
 * are not part of this plugin's copy. Everything else goes through the
 * settings.subscriptions locale seat.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { en } from './locales.js';
import { usageBarColor } from './SubscriptionsSection.js';
/** English fallback for a standalone render that arrives without the locale seat. */
function fallbackTranslate(key, params) {
    return en[key].replace(/\{(\w+)\}/g, (_, name) => String(params?.[name] ?? ''));
}
/**
 * Localized label of one reasoning level. Known effort ids translate; anything
 * the provider invented keeps the name it sent.
 */
export function effortLabel(level, t) {
    switch (level.id) {
        case 'off': return t('pickerEffortOff');
        case 'minimal': return t('pickerEffortMinimal');
        case 'low': return t('pickerEffortLow');
        case 'medium': return t('pickerEffortMedium');
        case 'high': return t('pickerEffortHigh');
        case 'xhigh': return t('pickerEffortXhigh');
        case 'max': return t('pickerEffortMax');
        default: return level.name;
    }
}
const styles = {
    root: { position: 'relative', minWidth: 0 },
    trigger: {
        display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, maxWidth: 220, height: 28,
        padding: '0 4px 0 8px', border: 'none', borderRadius: 24, background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)', fontSize: 13, lineHeight: '20px', fontWeight: 500, cursor: 'pointer',
    },
    triggerLabel: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    triggerEffort: { flex: '0 0 auto', color: 'var(--dsw-alias-label-caption)' },
    // Fixed height, not a max: a provider with two models opens the same panel
    // as one with twenty, so the layout does not jump between tabs.
    menu: {
        position: 'absolute', right: 0, bottom: 'calc(100% + 8px)', zIndex: 20,
        display: 'flex', flexDirection: 'column',
        width: 'min(540px, calc(100vw - 32px))', height: 'min(460px, calc(100vh - 96px))',
        overflow: 'hidden', padding: 4, borderRadius: 12,
        border: '1px solid var(--dsw-alias-border-inverted)', background: 'var(--dsw-alias-bg-layer-2)',
        boxShadow: 'var(--dsw-shadow-lv3, var(--dsw-elevation-prominent))', color: 'var(--dsw-alias-label-primary)',
    },
    search: {
        flex: '0 0 auto', margin: '2px 2px 6px', padding: '6px 10px', borderRadius: 8,
        border: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-layer-1))',
        color: 'var(--dsw-alias-label-primary)', fontSize: 13, lineHeight: '20px', outline: 'none',
    },
    body: { display: 'flex', flex: 1, minHeight: 0, gap: 4 },
    providers: {
        flex: '0 0 168px', minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, padding: 2,
    },
    list: {
        flex: 1, minWidth: 0, minHeight: 0, overflowY: 'auto',
        borderLeft: '1px solid var(--dsw-alias-border-l1)', padding: '2px 0 2px 2px',
    },
    status: { padding: 10, color: 'var(--dsw-alias-label-tertiary)', fontSize: 13, lineHeight: '20px' },
    quota: {
        display: 'flex', flexDirection: 'column', gap: 7,
        margin: '2px 4px 6px', padding: '6px 8px', borderRadius: 8,
        background: 'var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-layer-1))',
        color: 'var(--dsw-alias-label-secondary)', fontSize: 12, lineHeight: '18px',
    },
    quotaRow: { display: 'flex', flexDirection: 'column', gap: 3 },
    quotaBar: { height: 3, borderRadius: 2, background: 'var(--dsw-alias-border-l2)', overflow: 'hidden' },
    quotaFill: { display: 'block', height: '100%', borderRadius: 2 },
    error: {
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8,
        margin: '4px 2px', padding: '7px 8px', borderRadius: 8,
        background: 'var(--dsw-alias-interactive-bg-hover-danger, var(--dsw-alias-bg-layer-3))',
        color: 'var(--dsw-alias-state-error-primary)', fontSize: 12, lineHeight: '18px',
    },
    warning: {
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8,
        margin: '4px 2px', padding: '7px 8px', borderRadius: 8,
        background: 'var(--dsw-alias-bg-module-platform, var(--dsw-alias-bg-layer-3))',
        color: 'var(--dsw-alias-state-warn-label)', fontSize: 12, lineHeight: '18px',
    },
    retry: {
        flex: '0 0 auto', padding: 0, border: 'none', background: 'transparent',
        color: 'inherit', font: 'inherit', fontWeight: 600, cursor: 'pointer',
    },
    option: {
        display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 38, padding: '6px 8px',
        border: 'none', borderRadius: 10, background: 'transparent', color: 'inherit', textAlign: 'left', cursor: 'pointer',
    },
    optionCopy: { display: 'flex', flex: 1, flexDirection: 'column', minWidth: 0 },
    modelName: {
        overflow: 'hidden', fontSize: 14, lineHeight: '20px', fontWeight: 500, textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    },
    description: {
        overflow: 'hidden', color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, lineHeight: '18px',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    },
    check: { flex: '0 0 18px', color: 'var(--dsw-alias-brand-primary)', fontSize: 13, textAlign: 'center' },
    effort: {
        display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 2, flex: '0 0 auto',
        margin: '6px 4px 2px', padding: '7px 14px 9px', borderRadius: 14,
        background: 'var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-layer-1))',
    },
    effortLabel: {
        alignSelf: 'center', color: 'var(--dsw-alias-label-primary)', fontSize: 13, lineHeight: '18px', fontWeight: 600,
    },
};
const css = `
.dsh-subscription-picker-trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dsh-subscription-picker-trigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}
.dsh-subscription-picker-trigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.dsh-subscription-picker-chevron{flex:0 0 auto;color:var(--dsw-alias-label-caption);font-size:10px;transition:transform 120ms ease}
.dsh-subscription-picker-chevron[data-open="true"]{transform:rotate(180deg)}
.dsh-subscription-picker-search::placeholder{color:var(--dsw-alias-label-tertiary)}
.dsh-subscription-picker-search:focus{border-color:var(--dsw-alias-brand-primary)}
.dsh-subscription-picker-provider{position:relative;display:flex;align-items:center;gap:6px;width:100%;min-height:30px;padding:0 8px;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;text-align:left;cursor:pointer;overflow:hidden}
.dsh-subscription-picker-provider:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-subscription-picker-provider[aria-selected="true"]{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 14%,transparent);color:var(--dsw-alias-brand-primary);font-weight:600}
.dsh-subscription-picker-providerName{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-subscription-picker-quota{position:absolute;left:0;right:0;bottom:0;height:2px;background:var(--dsw-alias-border-l2)}
.dsh-subscription-picker-quotaFill{display:block;height:100%}
.dsh-subscription-picker-count{flex:0 0 auto;padding:0 6px;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}
.dsh-subscription-picker-option:hover:not(:disabled),.dsh-subscription-picker-option:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-subscription-picker-option:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.dsh-subscription-picker-slider{position:relative;height:36px;cursor:pointer;touch-action:none}
.dsh-subscription-picker-slider:focus-visible{outline:none}
.dsh-subscription-picker-slider:focus-visible .dsh-subscription-picker-thumb{box-shadow:0 1px 2px #00000052,0 5px 12px #0000003d,0 0 0 4px color-mix(in srgb,#4c8dff 30%,transparent)}
.dsh-subscription-picker-track,.dsh-subscription-picker-fill{position:absolute;top:50%;height:20px;margin-top:-10px;border-radius:999px}
.dsh-subscription-picker-track{left:12px;right:12px;background:#3a3f49}
.dsh-subscription-picker-fill{left:12px;background:#4c8dff;transition:width 160ms cubic-bezier(.2,.7,.2,1)}
.dsh-subscription-picker-stop{position:absolute;top:50%;display:block;box-sizing:border-box;width:6px;height:6px;aspect-ratio:1;margin:-3px 0 0 -3px;border-radius:50%;background:#8d94a1;transition:background 160ms ease}
.dsh-subscription-picker-stop[data-filled="true"]{background:#fff}
.dsh-subscription-picker-thumb{position:absolute;top:50%;display:block;box-sizing:border-box;width:24px;height:24px;min-width:24px;min-height:24px;aspect-ratio:1;margin:-12px 0 0 -12px;padding:0;border-radius:50%;background:#fff;box-shadow:0 1px 2px #00000052,0 4px 10px #0000003d;transition:left 160ms cubic-bezier(.2,.7,.2,1)}
.dsh-subscription-picker-slider[data-dragging="true"] .dsh-subscription-picker-fill,.dsh-subscription-picker-slider[data-dragging="true"] .dsh-subscription-picker-thumb{transition:none}
`;
/**
 * Codex-style reasoning slider: a track with one dot per level and a thumb on
 * the current one. Clicking or dragging snaps to the nearest stop; arrow keys
 * move one stop. The provider's own hint stays as the stop's tooltip.
 */
function EffortSlider({ choices, value, label, busy, onChange }) {
    const trackRef = useRef(null);
    const [dragging, setDragging] = useState(false);
    const index = Math.max(0, choices.findIndex(choice => choice.effort === value));
    const last = Math.max(1, choices.length - 1);
    const fraction = index / last;
    const current = choices[index];
    const indexAt = (clientX) => {
        const rect = trackRef.current?.getBoundingClientRect();
        if (rect === undefined || rect.width === 0)
            return index;
        const ratio = Math.min(1, Math.max(0, (clientX - rect.left - 12) / Math.max(1, rect.width - 24)));
        return Math.round(ratio * last);
    };
    const pick = (next) => {
        const choice = choices[Math.min(last, Math.max(0, next))];
        if (choice !== undefined && choice.effort !== value)
            onChange(choice.effort);
    };
    return (_jsxs("div", { style: styles.effort, children: [_jsx("span", { style: styles.effortLabel, children: current?.label ?? label }), _jsxs("div", { ref: trackRef, className: "dsh-subscription-picker-slider", "data-dragging": dragging, role: "slider", "aria-label": label, "aria-valuemin": 0, "aria-valuemax": last, "aria-valuenow": index, "aria-valuetext": current?.label, tabIndex: 0, title: current?.description, onPointerDown: event => {
                    if (busy)
                        return;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setDragging(true);
                    pick(indexAt(event.clientX));
                }, onPointerUp: () => { setDragging(false); }, onPointerCancel: () => { setDragging(false); }, onPointerMove: event => {
                    if (busy || !event.currentTarget.hasPointerCapture(event.pointerId))
                        return;
                    pick(indexAt(event.clientX));
                }, onKeyDown: event => {
                    if (busy)
                        return;
                    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
                        event.preventDefault();
                        pick(index + 1);
                    }
                    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
                        event.preventDefault();
                        pick(index - 1);
                    }
                    else if (event.key === 'Home') {
                        event.preventDefault();
                        pick(0);
                    }
                    else if (event.key === 'End') {
                        event.preventDefault();
                        pick(last);
                    }
                }, children: [_jsx("span", { className: "dsh-subscription-picker-track" }), _jsx("span", { className: "dsh-subscription-picker-fill", style: { width: `calc((100% - 24px) * ${fraction})` } }), choices.map((choice, stop) => (_jsx("span", { className: "dsh-subscription-picker-stop", "data-filled": stop <= index, title: choice.description, style: { left: `calc(12px + (100% - 24px) * ${stop / last})` } }, choice.key))), _jsx("span", { className: "dsh-subscription-picker-thumb", style: { left: `calc(12px + (100% - 24px) * ${fraction})` } })] })] }));
}
/** Compact time until a reset, in the active locale: "6д 18ч", "1ч 58м", or "42м". */
function resetIn(resetsAt, t) {
    const minutes = Math.max(1, Math.floor(Math.max(0, resetsAt - Date.now()) / 60_000));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0)
        return t('pickerResetDays', { days, hours: hours % 24 });
    if (hours > 0)
        return t('pickerResetHours', { hours, minutes: minutes % 60 });
    return t('pickerResetMinutes', { minutes });
}
const EMPTY_SNAPSHOT = {
    current: null, groups: [], failures: [], status: 'idle', error: null,
};
export function ModelPicker({ available, directory, quotaFor, load, select, t }) {
    const translate = t ?? fallbackTranslate;
    const state = useSyncExternalStore((fn) => directory === null || directory === undefined ? () => { } : directory.subscribe(fn), () => directory === null || directory === undefined ? EMPTY_SNAPSHOT : directory.getSnapshot());
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [activeProvider, setActiveProvider] = useState(null);
    const [notice, setNotice] = useState(null);
    const [quotas, setQuotas] = useState({});
    const lastAction = useRef('load');
    const rootRef = useRef(null);
    const triggerRef = useRef(null);
    const searchRef = useRef(null);
    const q = query.trim().toLowerCase();
    const current = state.current;
    const currentChoice = useMemo(() => {
        if (current === null)
            return null;
        for (const group of state.groups) {
            if (group.id !== current.provider)
                continue;
            const model = group.models.find(candidate => candidate.id === current.model);
            if (model !== undefined)
                return { group, model };
        }
        return null;
    }, [state.groups, current]);
    const reasoning = currentChoice?.model.reasoning;
    const effectiveEffort = current === null ? undefined : (current.reasoningEffort ?? reasoning?.defaultEffort);
    const effortChoices = useMemo(() => {
        if (reasoning === undefined)
            return [];
        const rows = [];
        if (reasoning.defaultEffort === undefined) {
            rows.push({ key: 'provider-default', effort: undefined, label: translate('pickerProviderDefault') });
        }
        for (const level of reasoning.efforts) {
            rows.push({
                key: level.id, effort: level.id, label: effortLabel(level, translate),
                ...level.description === undefined ? {} : { description: level.description },
            });
        }
        return rows;
    }, [reasoning, translate]);
    const effortText = reasoning === undefined ? undefined
        : effectiveEffort === undefined ? translate('pickerProviderDefault')
            : (effortChoices.find(level => level.effort === effectiveEffort)?.label ?? String(effectiveEffort));
    const searching = q !== '';
    const results = useMemo(() => {
        if (!searching)
            return [];
        const out = [];
        for (const group of state.groups) {
            const providerMatch = group.name.toLowerCase().includes(q);
            for (const model of group.models) {
                if (providerMatch || model.name.toLowerCase().includes(q)
                    || (model.description !== undefined && model.description.toLowerCase().includes(q))) {
                    out.push({ group, model });
                }
            }
        }
        return out;
    }, [searching, q, state.groups]);
    const activeTab = activeProvider !== null && state.groups.some(group => group.id === activeProvider)
        ? activeProvider
        : current !== null && state.groups.some(group => group.id === current.provider)
            ? current.provider
            : (state.groups[0]?.id ?? null);
    const activeGroup = state.groups.find(group => group.id === activeTab) ?? null;
    const busy = state.status === 'selecting';
    const modelLabel = currentChoice === null ? translate('pickerTrigger') : currentChoice.model.name;
    const reload = () => {
        lastAction.current = 'load';
        load?.();
    };
    useEffect(() => {
        if (available)
            reload();
        // The directory is session-bound; reload when the session becomes available.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [available]);
    useEffect(() => { if (open)
        searchRef.current?.focus(); }, [open]);
    // Quota belongs to this plugin's providers only; a failed read leaves the
    // group bare rather than showing a stale or guessed number.
    useEffect(() => {
        if (!open || quotaFor === undefined)
            return;
        let live = true;
        const ids = state.groups.map(group => group.id);
        void Promise.all(ids.map(async (id) => [id, await quotaFor(id).catch(() => null)]))
            .then(rows => {
            if (!live)
                return;
            const next = {};
            for (const [id, quota] of rows) {
                if (quota !== null)
                    next[id] = quota;
            }
            setQuotas(next);
        });
        return () => { live = false; };
        // Reload when the menu opens or the provider set changes, not on every snapshot.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, quotaFor, state.groups.map(group => group.id).join('|')]);
    const close = (restoreFocus = false) => {
        setOpen(false);
        setNotice(null);
        setActiveProvider(null);
        if (restoreFocus)
            triggerRef.current?.focus();
    };
    const settle = (accepted) => {
        if (accepted) {
            close(true);
            return;
        }
        const message = directory?.getSnapshot().error ?? null;
        setNotice(message === null ? translate('pickerSelectFailed') : translate('pickerSelectFailedMsg', { message }));
    };
    const choose = (group, model) => {
        if (current !== null && current.provider === group.id && current.model === model.id) {
            close(true);
            return;
        }
        lastAction.current = 'select';
        void select?.({
            provider: group.id,
            model: model.id,
            ...(model.reasoning?.defaultEffort !== undefined ? { reasoningEffort: model.reasoning.defaultEffort } : {}),
        }).then(accepted => { settle(accepted); });
    };
    const chooseEffort = (effort) => {
        if (current === null || effectiveEffort === effort)
            return;
        lastAction.current = 'select';
        void select?.({
            provider: current.provider, model: current.model,
            ...(effort === undefined ? {} : { reasoningEffort: effort }),
        }).then(accepted => {
            if (!accepted) {
                const message = directory?.getSnapshot().error ?? null;
                setNotice(message === null ? translate('pickerSelectFailed') : translate('pickerSelectFailedMsg', { message }));
            }
        });
    };
    if (!available || directory === null || directory === undefined)
        return null;
    const option = (group, model, detail) => {
        const selected = current !== null && current.provider === group.id && current.model === model.id;
        return (_jsxs("button", { type: "button", role: "menuitemradio", "aria-checked": selected, className: "dsh-subscription-picker-option", style: styles.option, disabled: busy, onClick: () => { choose(group, model); }, children: [_jsxs("span", { style: styles.optionCopy, children: [_jsx("span", { style: styles.modelName, children: model.name }), detail !== '' && _jsx("span", { style: styles.description, children: detail })] }), _jsx("span", { style: styles.check, children: selected ? '✓' : '' })] }, `${group.id}/${model.id}`));
    };
    return (_jsxs("div", { ref: rootRef, style: styles.root, onKeyDown: event => { if (event.key === 'Escape' && open) {
            event.preventDefault();
            close(true);
        } }, onBlur: event => {
            const next = event.relatedTarget;
            if (next !== null && rootRef.current?.contains(next))
                return;
            close();
        }, children: [_jsx("style", { children: css }), _jsxs("button", { ref: triggerRef, type: "button", className: "dsh-subscription-picker-trigger", style: styles.trigger, title: effortText === undefined ? modelLabel : `${modelLabel} · ${effortText}`, "aria-label": modelLabel, "aria-haspopup": "menu", "aria-expanded": open, disabled: false, onClick: () => { if (open)
                    close();
                else {
                    setNotice(null);
                    setQuery('');
                    setOpen(true);
                    reload();
                } }, children: [_jsx("span", { style: styles.triggerLabel, children: modelLabel }), effortText !== undefined && _jsx("span", { style: styles.triggerEffort, children: effortText }), _jsx("span", { className: "dsh-subscription-picker-chevron", "data-open": open, children: "\u25BE" })] }), open && (_jsxs("div", { style: styles.menu, role: "menu", tabIndex: -1, "aria-busy": state.status === 'loading' || busy, onMouseDown: event => { event.preventDefault(); }, children: [_jsx("input", { ref: searchRef, type: "text", className: "dsh-subscription-picker-search", style: styles.search, placeholder: translate('pickerSearch'), value: query, onChange: event => { setQuery(event.target.value); } }), _jsxs("div", { style: styles.body, children: [_jsx("div", { style: styles.providers, role: "tablist", "aria-label": translate('pickerProviders'), children: state.groups.map(group => (_jsxs("button", { type: "button", role: "tab", className: "dsh-subscription-picker-provider", "aria-selected": !searching && group.id === activeTab, onClick: () => { setQuery(''); setActiveProvider(group.id); }, children: [_jsx("span", { className: "dsh-subscription-picker-providerName", children: group.name }), quotas[group.id] !== undefined && (_jsx("span", { className: "dsh-subscription-picker-quota", title: translate('pickerRemaining', { percent: quotas[group.id].remainingPercent }), "aria-label": translate('pickerRemaining', { percent: quotas[group.id].remainingPercent }), children: _jsx("span", { className: "dsh-subscription-picker-quotaFill", style: { width: `${quotas[group.id].remainingPercent}%`, background: usageBarColor(100 - quotas[group.id].remainingPercent) } }) })), _jsx("span", { className: "dsh-subscription-picker-count", children: group.models.length })] }, group.id))) }), _jsx("div", { style: styles.list, children: state.status === 'loading'
                                    ? _jsx("div", { style: styles.status, children: translate('pickerLoading') })
                                    : _jsxs(_Fragment, { children: [state.error !== null && lastAction.current === 'load' && (_jsxs("div", { style: styles.error, children: [_jsx("span", { children: state.error }), _jsx("button", { type: "button", style: styles.retry, onClick: reload, children: translate('pickerRetry') })] })), notice !== null && _jsx("div", { style: styles.error, children: _jsx("span", { children: notice }) }), !searching && activeGroup !== null && quotas[activeGroup.id] !== undefined && (_jsx("div", { style: styles.quota, children: quotas[activeGroup.id].windows.map(window => {
                                                    const name = window.kind === 'weekly' ? translate('usageWeekly')
                                                        : window.kind === 'session' ? translate('usageSession') : translate('usageWindow');
                                                    const label = window.scope === undefined ? name : `${name} · ${window.scope}`;
                                                    const reset = window.resetsAt === undefined ? undefined : resetIn(window.resetsAt, translate);
                                                    return (_jsxs("div", { style: styles.quotaRow, children: [_jsx("span", { children: reset === undefined
                                                                    ? translate('pickerQuotaNoReset', { window: label, percent: window.remainingPercent })
                                                                    : translate('pickerQuotaSummary', { window: label, percent: window.remainingPercent, reset }) }), _jsx("span", { style: styles.quotaBar, "aria-hidden": true, children: _jsx("span", { style: { ...styles.quotaFill, width: `${window.remainingPercent}%`, background: usageBarColor(100 - window.remainingPercent) } }) })] }, `${window.kind}:${window.scope ?? ''}`));
                                                }) })), !searching && state.failures.map(failure => (_jsxs("div", { style: styles.warning, children: [_jsx("span", { children: translate('pickerLoadFailed', { provider: failure.name, message: failure.message }) }), _jsx("button", { type: "button", style: styles.retry, onClick: reload, children: translate('pickerRetry') })] }, failure.id))), searching
                                                ? (results.length === 0
                                                    ? _jsx("div", { style: styles.status, children: translate('pickerNoMatch') })
                                                    : results.map(row => option(row.group, row.model, `${row.group.name}${row.model.description !== undefined ? ` · ${row.model.description}` : ''}`)))
                                                : activeGroup === null
                                                    ? (state.status === 'ready' && state.groups.length === 0
                                                        ? _jsx("div", { style: styles.status, children: translate('pickerNoModels') }) : null)
                                                    : activeGroup.models.length === 0
                                                        ? _jsx("div", { style: styles.status, children: translate('pickerProviderEmpty') })
                                                        : activeGroup.models.map(model => option(activeGroup, model, model.description ?? ''))] }) })] }), reasoning !== undefined && effortChoices.length > 0 && !searching && (_jsx(EffortSlider, { choices: effortChoices, value: effectiveEffort, label: translate('pickerEffort'), busy: busy, onChange: chooseEffort }))] }))] }));
}
