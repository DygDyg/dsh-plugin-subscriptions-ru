import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { SubscriptionUsageBadge } from './SubscriptionUsageBadge.js'
import type { SubscriptionUsageBadgeProps } from './SubscriptionUsageBadge.js'

// There is no additive footer slot in the current shell. Mount through the
// additive overlay seat and portal a separate row beside the existing launcher.
// Never register settings.launcher: that single slot belongs to AccountMenu.
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'shell.overlay': { kind: 'list'; scope: 'root'; owner: {} }
  }
}

export function SidebarUsageLauncher(props: SubscriptionUsageBadgeProps) {
  const [seat, setSeat] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const container = document.createElement('div')
    container.dataset.subscriptionUsageSeat = ''
    const locate = () => {
      const launcher = document.querySelector<HTMLElement>('[data-slot="settings.launcher"]')
      const footer = launcher?.closest<HTMLElement>('[data-slot="sidebar.settings"]')
      if (footer === null || footer === undefined) {
        if (container.isConnected) container.remove()
        setSeat(null)
        return
      }
      // A dedicated row ABOVE the existing profile/settings row works both in
      // the expanded sidebar and in the narrow rail, without covering either.
      if (container.parentElement !== footer) footer.prepend(container)
      setSeat(previous => previous === container ? previous : container)
    }
    locate()
    const observer = new MutationObserver(locate)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      container.remove()
    }
  }, [])
  return seat === null ? null : createPortal(<SubscriptionUsageBadge {...props} surface="account-menu" />, seat)
}
