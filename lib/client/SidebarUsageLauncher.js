import { jsx as _jsx } from "react/jsx-runtime";
import { SubscriptionUsageBadge } from './SubscriptionUsageBadge.js';
export function SidebarUsageLauncher({ wide, ...props }) {
    return _jsx(SubscriptionUsageBadge, { ...props, surface: "account-menu", wide: wide });
}
