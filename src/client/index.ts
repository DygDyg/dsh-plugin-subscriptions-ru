/**
 * Subscription OAuth login page, browser half. Registers the Subscriptions
 * settings section; every login state fact arrives through the node half's
 * `/subscriptions-auth` RPC channel — this plugin holds no credential state of its
 * own. Section copy rides the client locale service: one 'settings.subscriptions'
 * namespace with zh/en dictionaries, rebound per read so the nav label and
 * page text follow the active locale.
 */
// Type-only: pulls the `ctx.slots` Context merge (dsh-client-runtime owned it
// on rc.2; ui-renderer's augmentation carries it on the 0.1.2-alpha line).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls ui-conversation's SlotMap merge (the 'conversation.input.right' entry).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the slash-command registry contract (the /fast contribution).
import type { CommandUiContract } from '@deepseek-ai/dsh-client-ui-commands/client'
// `.js` extension: this package's tsconfig lacks the reference repo's
// allowImportingTsExtensions/rewriteRelativeImportExtensions pair; under
// nodenext the .js specifier resolves to the .tsx source (see README note).
import { SubscriptionsSection } from './SubscriptionsSection.js'
import type { SubscriptionsSectionInjected } from './SubscriptionsSection.js'
import { ImageGenerateToolview, createImageLoader } from './ImageGenerateToolview.js'
import type { ImageGenerateToolviewInjected } from './ImageGenerateToolview.js'
import { VideoGenerateToolview, createVideoLoader } from './VideoGenerateToolview.js'
import type { VideoGenerateToolviewInjected } from './VideoGenerateToolview.js'
import { SpeedSelect, createSpeedLoader, createSpeedSetter } from './SpeedSelect.js'
import type { ModelDirectoriesLike, SpeedSelectInjected } from './SpeedSelect.js'
import { SubscriptionUsageBadge, createCurrentModelReader } from './SubscriptionUsageBadge.js'
import { ModelPicker } from './ModelPicker.js'
import type { ModelPickerInjected, PickerDirectory, PickerQuota, PickerQuotaWindow } from './ModelPicker.js'
import { callSubscriptionsAuth } from './subscriptions-rpc.js'
import type { ProviderStatus, ProviderUsage, SubscriptionProvider, UsageWindow } from './SubscriptionsSection.js'
import { visibleUsageWindows } from './usage-window-filter.js'
import { SidebarUsageLauncher } from './SidebarUsageLauncher.js'
import { RegionGateNotice } from './RegionGateNotice.js'
import type { RegionGateNoticeInjected } from './RegionGateNotice.js'
import type { SubscriptionUsageBadgeInjected } from './SubscriptionUsageBadge.js'
import { en, ru, zh } from './locales.js'
import type { SubscriptionsKey } from './locales.js'
import { fastCommandDescription } from './fast-command.js'

export type { SubscriptionsSectionInjected, SubscriptionsSectionProps } from './SubscriptionsSection.js'
export type { ImageGenerateToolviewInjected, ImageGenerateToolviewProps } from './ImageGenerateToolview.js'
export type { VideoGenerateToolviewInjected, VideoGenerateToolviewProps } from './VideoGenerateToolview.js'
export type { SpeedSelectInjected, SpeedSelectProps, SpeedState, SpeedTier } from './SpeedSelect.js'
export type { SubscriptionUsageBadgeInjected, SubscriptionUsageBadgeProps } from './SubscriptionUsageBadge.js'
export type { SubscriptionsKey } from './locales.js'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Subscriptions settings page copy. */
    'settings.subscriptions': SubscriptionsKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'settings.subscriptions'

/**
 * Required services (cordis fiber inject): `slots` carries the registration
 * seat, `connection` the `/subscriptions-auth` RPC caller, and `locale` the copy
 * dictionaries.
 */
export const inject = ['slots', 'connection', 'locale']

/**
 * Register the Subscriptions section once the `settings.section` declaration
 * is on the ledger (the shell's apply order relative to this one is NOT
 * constrained; registration depends on the slot through `slots.inject()`).
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-plugin-subscriptions: copy dictionaries')
  // The host owns language definitions, including ru. Register only our
  // namespace dictionary: adding ru again throws and prevents activation.
  ctx.effect(() => ctx.locale.register(NS, 'ru', ru), 'dsh-plugin-subscriptions: ru dictionary')
  // Settings-shell nudge: the panel (nav title + header row + section body)
  // sits flush against the panel's top edge; push it down a little to leave
  // breathing room. Scoped by the settings panel's own dialog role + nav child
  // so other aria-modal dialogs (e.g. the attachment lightbox) are untouched.
  ctx.effect(() => {
    const style = document.createElement('style')
    style.setAttribute('data-plugin', 'dsh-plugin-subscriptions-ru')
    style.textContent = 'div[role="dialog"][aria-modal="true"]:has(> nav) { padding-top: 14px; }'
    document.head.appendChild(style)
    return () => style.remove()
  }, 'dsh-plugin-subscriptions: settings panel breathing room')
  // The shell's Context merge types `connection` as the host handle; in the
  // browser shell the same key holds the full client ConnectionHandle.
  const connection = ctx.get('connection') as unknown as ConnectionHandle
  const t = ctx.locale.bind(NS) as SubscriptionsSectionInjected['t']
  const injected = (): SubscriptionsSectionInjected => ({ rpc: connection.rpc, t })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'subscriptions',
    order: 90,
    // A thunk re-evaluated per read, so the nav label follows the active locale.
    label: () => t('nav'),
    inject: injected,
  }, SubscriptionsSection))

  // The image_generate keyed toolview owns how image calls render inline; its
  // gallery bytes ride the same channel through the injected loader. The
  // framework synthesizes the toolview's own `t` seat from `locale: NS`.
  const toolviewInjected = (): ImageGenerateToolviewInjected => ({ load: createImageLoader(connection.rpc) })
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview',
    key: 'image_generate',
    locale: NS,
    inject: toolviewInjected,
  }, ImageGenerateToolview))

  // The video_generate keyed toolview plays the saved MP4 inline; its bytes
  // ride the same channel's `video` endpoint through the injected loader.
  const videoToolviewInjected = (): VideoGenerateToolviewInjected => ({ loadVideo: createVideoLoader(connection.rpc) })
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview',
    key: 'video_generate',
    locale: NS,
    inject: videoToolviewInjected,
  }, VideoGenerateToolview))

  // The composer Speed toggle (codex fast tier) sits in the right tool row,
  // just left of the model selector; the framework synthesizes its `t` seat
  // from `locale: NS`, and the inject face binds each session's RPC calls.
  // The current-model read rides ui-model-selection's `modelDirectories`
  // service, resolved lazily so registration order never matters.
  const models = (): ModelDirectoriesLike | undefined =>
    ctx.get('modelDirectories') as ModelDirectoriesLike | undefined
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right',
    id: 'codex-speed',
    order: 0,
    locale: NS,
    inject: (sessionId: string): SpeedSelectInjected => ({
      loadSpeed: createSpeedLoader(connection, models, sessionId),
      setSpeed: createSpeedSetter(connection, sessionId),
    }),
  }, SpeedSelect))

  // The subscription usage badge renders a stats pill in the composer's dock
  // (conversation.composer.dock) — collapsed, the current model's provider
  // (e.g. "Codex 6d1h 25%"); clicking opens every provider's windows. A fresh
  // id means it appears beside the shipped StatsPills, never replacing them;
  // the current-model read shares the Speed toggle's `modelDirectories` path.
  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock',
    id: 'subscription-usage',
    order: 10,
    locale: NS,
    inject: (sessionId: string): SubscriptionUsageBadgeInjected => ({
      rpc: connection.rpc,
      currentModel: createCurrentModelReader(models, sessionId)!,
    }),
  }, SubscriptionUsageBadge))

  // Region warning shares the composer dock; host gates perform the rejection.
  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock',
    id: 'subscription-region-gate',
    order: 0,
    locale: NS,
    inject: (): RegionGateNoticeInjected => ({ rpc: connection.rpc }),
  }, RegionGateNotice))

  // Remaining quota for one provider group, from the same endpoints the usage
  // badge reads. Only this plugin's providers answer; other groups stay bare.
  const quotaFor = async (provider: string): Promise<PickerQuota | null> => {
    if (!['codex', 'claude', 'grok', 'copilot', 'antigravity'].includes(provider)) return null
    const id = provider as SubscriptionProvider
    const status = await callSubscriptionsAuth<{ providers: Record<SubscriptionProvider, ProviderStatus> }>(connection.rpc, 'status', {})
    const row = status.providers[id]
    const account = row?.accounts.find(candidate => candidate.isDefault) ?? row?.accounts[0]
    if (account === undefined) return null
    const usage = await callSubscriptionsAuth<ProviderUsage>(connection.rpc, 'usage', { provider: id, account: account.key })
    const windows = visibleUsageWindows(id, usage.windows, row?.visibleModels)
    if (!usage.supported || windows.length === 0) return null
    // The bar follows the shortest window the provider has — the hourly or
    // daily session lane — never the weekly one while a shorter lane exists.
    // A provider that does not label its lanes still exposes the length
    // through the next reset, so the soonest reset stands in.
    const soonest = (pool: UsageWindow[]): UsageWindow => pool.reduce((next, window) =>
      (window.resetsAt ?? Infinity) < (next.resetsAt ?? Infinity) ? window : next)
    const sessions = windows.filter(window => window.kind === 'session')
    const dated = windows.filter(window => window.kind !== 'weekly' && window.resetsAt !== undefined)
    const pool = sessions.length > 0 ? sessions
      : dated.length > 0 ? dated
        : windows.filter(window => window.kind !== 'weekly')
    const shortest = soonest(pool.length > 0 ? pool : windows)
    const weekly = windows.find(window => window.kind === 'weekly' && window.scope === undefined)
      ?? windows.find(window => window.kind === 'weekly')
    const lane = (window: UsageWindow): PickerQuotaWindow => ({
      kind: window.kind,
      ...window.scope === undefined ? {} : { scope: window.scope },
      remainingPercent: Math.round(Math.min(100, Math.max(0, 100 - window.usedPercent))),
      ...window.resetsAt === undefined ? {} : { resetsAt: window.resetsAt },
    })
    return {
      remainingPercent: lane(shortest).remainingPercent,
      windows: [lane(shortest), ...weekly !== undefined && weekly !== shortest ? [lane(weekly)] : []],
    }
  }

  // The composer model seat. priority -1 outranks the shipped selector, so
  // this plugin's picker is the one that opens; it reads the same per-session
  // directory, and subagent composers keep the host seat (available: false).
  ctx.slots.inject('conversation.input.model', () => ctx.slots.register({
    name: 'conversation.input.model',
    priority: -1,
    registrant: 'dsh-plugin-subscriptions-ru',
    locale: NS,
    inject: (sessionId: string): ModelPickerInjected => {
      try {
        const models = ctx.get('modelDirectories') as {
          directoryFor?: (id: string) => { store: PickerDirectory; load: () => Promise<unknown>; select: (selection: unknown) => Promise<unknown> }
        } | undefined
        const sessions = ctx.get('sessions') as { subagentAddress?: (id: string) => unknown } | undefined
        if (models === undefined || typeof models.directoryFor !== 'function') {
          return { available: false, directory: null, load: () => {}, select: () => Promise.resolve(false) }
        }
        const directory = models.directoryFor(sessionId)
        const available = sessions === undefined || typeof sessions.subagentAddress !== 'function'
          || sessions.subagentAddress(sessionId) === undefined
        return {
          available,
          directory: directory.store,
          quotaFor,
          load: () => { if (available) directory.load().catch(() => { /* surfaced on the store */ }) },
          select: selection => available
            ? directory.select(selection).then(() => true, () => false)
            : Promise.resolve(false),
        }
      } catch {
        return { available: false, directory: null, load: () => {}, select: () => Promise.resolve(false) }
      }
    },
  }, ModelPicker))

  // Use the host's additive sidebar foot action slot instead of querying private
  // sidebar DOM, which changed in DSH 0.2.2. The wide flag lets the launcher
  // show a text label in the expanded sidebar and an icon in the collapsed rail.
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'subscription-usage-launcher',
    order: 0,
    locale: NS,
    inject: (): SubscriptionUsageBadgeInjected => ({ rpc: connection.rpc, surface: 'account-menu' }),
  }, SidebarUsageLauncher))

  // The /fast slash command offers the same Standard/Fast choice as a popup.
  // `available` is synchronous and sees only the session id, so the command
  // stays listed everywhere; `options` throws the friendly gate when the
  // session's current model is not a fast-capable codex model (the same
  // in-popup error posture the /model contribution uses for its guards).
  ctx.inject(['commandUi'], (scope: ClientContext) => {
    const command = scope.get('commandUi') as CommandUiContract
    scope.effect(() => command.register({
      name: 'fast',
      // dsh 0.1.5-alpha made `description` a locale resolver evaluated per
      // candidate pass (commit 5d9603b76, "feat(web): localize slash command
      // descriptions"); earlier lines read the value as a plain string. The
      // bare string threw `contribution.description is not a function` inside
      // the registry's candidate pass on 0.1.5, aborting the whole `/` source
      // and hiding every host command — /plan, /model, /goal, ... — not just
      // /fast. Older lines render a function child as empty copy, no crash.
      description: fastCommandDescription(() => t('commandFast')),
      available: () => true,
      ui: {
        kind: 'popupSelect',
        options: async (session) => {
          const state = await createSpeedLoader(connection, models, session.sessionId)()
          if (!state.visible) throw new Error(t('commandFastUnavailable'))
          return ([
            { id: 'standard', label: t('speedStandard'), detail: t('speedStandardDescription') },
            { id: 'fast', label: t('speedFast'), detail: t('speedFastDescription') },
          ] as const).map(option => ({ ...option, active: option.id === state.tier }))
        },
        onSelect: async (option, session) => {
          await createSpeedSetter(connection, session.sessionId)(option.id as 'standard' | 'fast')
        },
      },
    }), 'dsh-plugin-subscriptions: /fast contribution')
  })
}
