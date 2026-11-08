import type { SubscriptionUsageBadgeProps } from './SubscriptionUsageBadge.js';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        'shell.overlay': {
            kind: 'list';
            scope: 'root';
            owner: {};
        };
    }
}
export declare function SidebarUsageLauncher(props: SubscriptionUsageBadgeProps): import("react").ReactPortal | null;
