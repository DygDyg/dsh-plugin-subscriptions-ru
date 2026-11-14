import { SubscriptionUsageBadge } from './SubscriptionUsageBadge.js'
import type { SubscriptionUsageBadgeProps } from './SubscriptionUsageBadge.js'

// DSH 0.2.2 added an additive sidebar footer-action slot, so this launcher no
// longer needs to locate and portal into private sidebar DOM.
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'sidebar.footer.action': { kind: 'list'; scope: 'root'; owner: { wide: boolean } }
  }
}

type SidebarUsageLauncherProps = SubscriptionUsageBadgeProps & { wide: boolean }

export function SidebarUsageLauncher({ wide, ...props }: SidebarUsageLauncherProps) {
  return <SubscriptionUsageBadge {...props} surface="account-menu" wide={wide} />
}
