import { jsx as _jsx } from "react/jsx-runtime";
/**
 * Composer warning for a blocked or unverified public region. Renders in the
 * dock under the input so the user sees the stop before pressing send. The
 * host gate is what actually rejects the model call; this view only reports it.
 */
import { useEffect, useState } from 'react';
import { callSubscriptionsAuth } from './subscriptions-rpc.js';
import { en } from './locales.js';
/** How often the dock re-reads the verdict while a VPN may be changing region. */
const POLL_MS = 20_000;
function fallbackT(key, vars) {
    let text = en[key];
    if (vars)
        for (const [name, value] of Object.entries(vars))
            text = text.replaceAll(`{${name}}`, String(value));
    return text;
}
const box = {
    margin: '8px 0 0',
    padding: '8px 12px',
    borderRadius: 'var(--dsw-radius-lg, 16px)',
    border: '0.5px solid var(--dsw-alias-state-error-primary)',
    background: 'var(--dsw-alias-bg-layer-2)',
    color: 'var(--dsw-alias-state-error-primary)',
    fontSize: 13,
    lineHeight: '20px',
};
/** Dock notice. Renders nothing while the current region is allowed. */
export function RegionGateNotice(props) {
    const { rpc } = props;
    const t = props.t ?? fallbackT;
    const [snapshot, setSnapshot] = useState(undefined);
    useEffect(() => {
        if (rpc === undefined)
            return undefined;
        let alive = true;
        const load = () => {
            void callSubscriptionsAuth(rpc, 'regionGate', {}).then(next => {
                if (alive)
                    setSnapshot(next);
            }, () => {
                if (alive)
                    setSnapshot(current => current ?? { status: 'unknown', blocked: [] });
            });
        };
        load();
        const timer = setInterval(load, POLL_MS);
        return () => {
            alive = false;
            clearInterval(timer);
        };
    }, [rpc]);
    if (snapshot === undefined || snapshot.status === 'allowed' || snapshot.status === 'unknown')
        return null;
    if (snapshot.status !== 'error' && snapshot.blocked.length === 0)
        return null;
    const country = snapshot.countryName ?? snapshot.country ?? '—';
    const text = snapshot.status === 'blocked'
        ? t('composerRegionBlocked', { country })
        : t('composerRegionError', { message: snapshot.error ?? 'unknown' });
    return _jsx("p", { role: "alert", style: box, children: text });
}
