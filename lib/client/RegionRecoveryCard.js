import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from 'react';
import { callSubscriptionsAuth } from './subscriptions-rpc.js';
import { en } from './locales.js';
function fallback(key, vars) {
    let text = en[key];
    if (vars)
        for (const [name, value] of Object.entries(vars))
            text = text.replaceAll(`{${name}}`, String(value));
    return text;
}
const card = {
    padding: '10px 12px', borderRadius: 'var(--dsw-radius-lg, 16px)',
    border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-layer-2)',
    color: 'var(--dsw-alias-label-primary)', fontSize: 13, lineHeight: '20px',
};
const button = {
    border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 'var(--dsw-radius-sm, 8px)',
    color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-bg-layer-1)',
    font: 'inherit', padding: '4px 8px', cursor: 'pointer',
};
/** Explicitly retry saved input; never replace the user's current draft. */
export function RegionRecoveryCard({ rpc, sessionId, t: locale }) {
    const t = locale ?? fallback;
    const [items, setItems] = useState([]);
    const [itemsSession, setItemsSession] = useState(sessionId);
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);
    const currentSession = useRef(sessionId);
    const generation = useRef(0);
    if (currentSession.current !== sessionId) {
        currentSession.current = sessionId;
        generation.current++;
    }
    const refresh = useCallback(async () => {
        if (!rpc || !sessionId)
            return;
        const version = generation.current;
        const next = await callSubscriptionsAuth(rpc, 'regionRecoveryList', { sessionId });
        if (currentSession.current === sessionId && generation.current === version)
            setItems(next);
    }, [rpc, sessionId]);
    useEffect(() => {
        let active = true;
        let inflight = false;
        setItems([]);
        setItemsSession(sessionId);
        setBusy(null);
        setError(null);
        const version = generation.current;
        const load = () => {
            if (!rpc || !sessionId || inflight)
                return;
            inflight = true;
            void callSubscriptionsAuth(rpc, 'regionRecoveryList', { sessionId }).then(next => { if (active && version === generation.current)
                setItems(next); }, () => { if (active && version === generation.current)
                setError(t('recoveryFailure', { message: 'unavailable' })); }).finally(() => { inflight = false; });
        };
        load();
        const timer = setInterval(load, 3000);
        return () => { active = false; clearInterval(timer); };
    }, [rpc, sessionId, t]);
    if (!rpc || !sessionId || itemsSession !== sessionId || (items.length === 0 && error === null))
        return null;
    const act = async (item, remove) => {
        if (busy !== null)
            return;
        if (remove && !window.confirm(t('recoveryConfirm')))
            return;
        const version = generation.current;
        setBusy(item.id);
        setError(null);
        try {
            await callSubscriptionsAuth(rpc, remove ? 'regionRecoveryRemove' : 'regionRecoveryRetry', { sessionId, id: item.id });
            if (generation.current === version)
                await refresh();
        }
        catch (err) {
            if (generation.current === version) {
                setError(t('recoveryFailure', { message: err instanceof Error ? err.message : String(err) }));
                await refresh().catch(() => { });
            }
        }
        finally {
            if (generation.current === version)
                setBusy(null);
        }
    };
    return _jsxs("div", { style: { display: 'grid', gap: 8 }, children: [items.map(item => _jsxs("section", { style: card, "aria-label": t('recoveryTitle'), children: [_jsx("strong", { children: t('recoveryTitle') }), _jsx("p", { style: { margin: '4px 0', color: 'var(--dsw-alias-label-secondary)' }, children: item.status === 'accepted' ? t('recoveryAccepted') : item.status === 'submitting' ? t('recoveryUncertain') : t('recoveryHint') }), item.text && _jsx("div", { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 120, overflowY: 'auto' }, children: item.text }), item.attachments.length > 0 && _jsx("ul", { style: { margin: '4px 0', paddingInlineStart: 20 }, children: item.attachments.map((attachment, index) => _jsx("li", { children: attachment.name }, index)) }), _jsxs("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }, children: [item.status === 'saved' && _jsx("button", { type: "button", style: button, disabled: busy !== null, onClick: () => { void act(item, false); }, children: busy === item.id ? t('recoveryBusy') : t('recoveryRetry') }), _jsx("button", { type: "button", style: button, disabled: busy !== null, onClick: () => { void act(item, true); }, children: t('recoveryRemove') })] })] }, item.id)), error && _jsx("p", { role: "status", style: { ...card, color: 'var(--dsw-alias-state-error-primary)' }, children: error })] });
}
