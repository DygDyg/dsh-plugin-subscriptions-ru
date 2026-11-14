import type { SubscriptionUsageBadgeProps } from './SubscriptionUsageBadge.js';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        'sidebar.footer.action': {
            kind: 'list';
            scope: 'root';
            owner: {
                wide: boolean;
            };
        };
    }
}
type SidebarUsageLauncherProps = SubscriptionUsageBadgeProps & {
    wide: boolean;
};
export declare function SidebarUsageLauncher({ wide, ...props }: SidebarUsageLauncherProps): import("react").JSX.Element;
export {};
