import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { SubscriptionUsageBadge } from './SubscriptionUsageBadge.js';
export function SidebarUsageLauncher(props) {
    const [seat, setSeat] = useState(null);
    useEffect(() => {
        const container = document.createElement('div');
        container.dataset.subscriptionUsageSeat = '';
        const locate = () => {
            const launcher = document.querySelector('[data-slot="settings.launcher"]');
            const footer = launcher?.closest('[data-slot="sidebar.settings"]');
            if (footer === null || footer === undefined) {
                if (container.isConnected)
                    container.remove();
                setSeat(null);
                return;
            }
            // A dedicated row ABOVE the existing profile/settings row works both in
            // the expanded sidebar and in the narrow rail, without covering either.
            if (container.parentElement !== footer)
                footer.prepend(container);
            setSeat(previous => previous === container ? previous : container);
        };
        locate();
        const observer = new MutationObserver(locate);
        observer.observe(document.body, { childList: true, subtree: true });
        return () => {
            observer.disconnect();
            container.remove();
        };
    }, []);
    return seat === null ? null : createPortal(_jsx(SubscriptionUsageBadge, { ...props, surface: "account-menu" }), seat);
}
