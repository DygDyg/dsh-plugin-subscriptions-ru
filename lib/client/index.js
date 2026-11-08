// `.js` extension: this package's tsconfig lacks the reference repo's
// allowImportingTsExtensions/rewriteRelativeImportExtensions pair; under
// nodenext the .js specifier resolves to the .tsx source (see README note).
import { SubscriptionsSection } from './SubscriptionsSection.js';
import { ImageGenerateToolview, createImageLoader } from './ImageGenerateToolview.js';
import { VideoGenerateToolview, createVideoLoader } from './VideoGenerateToolview.js';
import { SpeedSelect, createSpeedLoader, createSpeedSetter } from './SpeedSelect.js';
import { SubscriptionUsageBadge, createCurrentModelReader } from './SubscriptionUsageBadge.js';
import { ModelPicker } from './ModelPicker.js';
import { callSubscriptionsAuth } from './subscriptions-rpc.js';
import { visibleUsageWindows } from './usage-window-filter.js';
import { SidebarUsageLauncher } from './SidebarUsageLauncher.js';
import { en, ru, zh } from './locales.js';
import { fastCommandDescription } from './fast-command.js';
/** Dictionary namespace owned by this plugin. */
const NS = 'settings.subscriptions';
/**
 * Required services (cordis fiber inject): `slots` carries the registration
 * seat, `connection` the `/subscriptions-auth` RPC caller, and `locale` the copy
 * dictionaries.
 */
export const inject = ['slots', 'connection', 'locale'];
/**
 * Register the Subscriptions section once the `settings.section` declaration
 * is on the ledger (the shell's apply order relative to this one is NOT
 * constrained; registration depends on the slot through `slots.inject()`).
 * @param ctx - client root context.
 */
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-plugin-subscriptions: copy dictionaries');
    // The host owns language definitions, including ru. Register only our
    // namespace dictionary: adding ru again throws and prevents activation.
    ctx.effect(() => ctx.locale.register(NS, 'ru', ru), 'dsh-plugin-subscriptions: ru dictionary');
    // Settings-shell nudge: the panel (nav title + header row + section body)
    // sits flush against the panel's top edge; push it down a little to leave
    // breathing room. Scoped by the settings panel's own dialog role + nav child
    // so other aria-modal dialogs (e.g. the attachment lightbox) are untouched.
    ctx.effect(() => {
        const style = document.createElement('style');
        style.setAttribute('data-plugin', 'dsh-plugin-subscriptions-ru');
        style.textContent = 'div[role="dialog"][aria-modal="true"]:has(> nav) { padding-top: 14px; }';
        document.head.appendChild(style);
        return () => style.remove();
    }, 'dsh-plugin-subscriptions: settings panel breathing room');
    // The shell's Context merge types `connection` as the host handle; in the
    // browser shell the same key holds the full client ConnectionHandle.
    const connection = ctx.get('connection');
    const t = ctx.locale.bind(NS);
    const injected = () => ({ rpc: connection.rpc, t });
    ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'subscriptions',
        order: 90,
        // A thunk re-evaluated per read, so the nav label follows the active locale.
        label: () => t('nav'),
        inject: injected,
    }, SubscriptionsSection));
    // The image_generate keyed toolview owns how image calls render inline; its
    // gallery bytes ride the same channel through the injected loader. The
    // framework synthesizes the toolview's own `t` seat from `locale: NS`.
    const toolviewInjected = () => ({ load: createImageLoader(connection.rpc) });
    ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
        name: 'tool.call.toolview',
        key: 'image_generate',
        locale: NS,
        inject: toolviewInjected,
    }, ImageGenerateToolview));
    // The video_generate keyed toolview plays the saved MP4 inline; its bytes
    // ride the same channel's `video` endpoint through the injected loader.
    const videoToolviewInjected = () => ({ loadVideo: createVideoLoader(connection.rpc) });
    ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
        name: 'tool.call.toolview',
        key: 'video_generate',
        locale: NS,
        inject: videoToolviewInjected,
    }, VideoGenerateToolview));
    // The composer Speed toggle (codex fast tier) sits in the right tool row,
    // just left of the model selector; the framework synthesizes its `t` seat
    // from `locale: NS`, and the inject face binds each session's RPC calls.
    // The current-model read rides ui-model-selection's `modelDirectories`
    // service, resolved lazily so registration order never matters.
    const models = () => ctx.get('modelDirectories');
    ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
        name: 'conversation.input.right',
        id: 'codex-speed',
        order: 0,
        locale: NS,
        inject: (sessionId) => ({
            loadSpeed: createSpeedLoader(connection, models, sessionId),
            setSpeed: createSpeedSetter(connection, sessionId),
        }),
    }, SpeedSelect));
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
        inject: (sessionId) => ({
            rpc: connection.rpc,
            currentModel: createCurrentModelReader(models, sessionId),
        }),
    }, SubscriptionUsageBadge));
    // Remaining quota for one provider group, from the same endpoints the usage
    // badge reads. Only this plugin's providers answer; other groups stay bare.
    const quotaFor = async (provider) => {
        if (!['codex', 'claude', 'grok', 'copilot', 'antigravity'].includes(provider))
            return null;
        const id = provider;
        const status = await callSubscriptionsAuth(connection.rpc, 'status', {});
        const row = status.providers[id];
        const account = row?.accounts.find(candidate => candidate.isDefault) ?? row?.accounts[0];
        if (account === undefined)
            return null;
        const usage = await callSubscriptionsAuth(connection.rpc, 'usage', { provider: id, account: account.key });
        const windows = visibleUsageWindows(id, usage.windows, row?.visibleModels);
        if (!usage.supported || windows.length === 0)
            return null;
        // The bar follows the shortest window the provider has — the hourly or
        // daily session lane — never the weekly one while a shorter lane exists.
        // A provider that does not label its lanes still exposes the length
        // through the next reset, so the soonest reset stands in.
        const soonest = (pool) => pool.reduce((next, window) => (window.resetsAt ?? Infinity) < (next.resetsAt ?? Infinity) ? window : next);
        const sessions = windows.filter(window => window.kind === 'session');
        const dated = windows.filter(window => window.kind !== 'weekly' && window.resetsAt !== undefined);
        const pool = sessions.length > 0 ? sessions
            : dated.length > 0 ? dated
                : windows.filter(window => window.kind !== 'weekly');
        const shortest = soonest(pool.length > 0 ? pool : windows);
        const weekly = windows.find(window => window.kind === 'weekly' && window.scope === undefined)
            ?? windows.find(window => window.kind === 'weekly');
        const lane = (window) => ({
            kind: window.kind,
            ...window.scope === undefined ? {} : { scope: window.scope },
            remainingPercent: Math.round(Math.min(100, Math.max(0, 100 - window.usedPercent))),
            ...window.resetsAt === undefined ? {} : { resetsAt: window.resetsAt },
        });
        return {
            remainingPercent: lane(shortest).remainingPercent,
            windows: [lane(shortest), ...weekly !== undefined && weekly !== shortest ? [lane(weekly)] : []],
        };
    };
    // The composer model seat. priority -1 outranks the shipped selector, so
    // this plugin's picker is the one that opens; it reads the same per-session
    // directory, and subagent composers keep the host seat (available: false).
    ctx.slots.inject('conversation.input.model', () => ctx.slots.register({
        name: 'conversation.input.model',
        priority: -1,
        registrant: 'dsh-plugin-subscriptions-ru',
        locale: NS,
        inject: (sessionId) => {
            try {
                const models = ctx.get('modelDirectories');
                const sessions = ctx.get('sessions');
                if (models === undefined || typeof models.directoryFor !== 'function') {
                    return { available: false, directory: null, load: () => { }, select: () => Promise.resolve(false) };
                }
                const directory = models.directoryFor(sessionId);
                const available = sessions === undefined || typeof sessions.subagentAddress !== 'function'
                    || sessions.subagentAddress(sessionId) === undefined;
                return {
                    available,
                    directory: directory.store,
                    quotaFor,
                    load: () => { if (available)
                        directory.load().catch(() => { }); },
                    select: selection => available
                        ? directory.select(selection).then(() => true, () => false)
                        : Promise.resolve(false),
                };
            }
            catch {
                return { available: false, directory: null, load: () => { }, select: () => Promise.resolve(false) };
            }
        },
    }, ModelPicker));
    // Add a quota button without replacing the shell's SINGLE profile launcher.
    ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'subscription-usage-launcher',
        locale: NS,
        inject: () => ({ rpc: connection.rpc, surface: 'account-menu' }),
    }, SidebarUsageLauncher));
    // The /fast slash command offers the same Standard/Fast choice as a popup.
    // `available` is synchronous and sees only the session id, so the command
    // stays listed everywhere; `options` throws the friendly gate when the
    // session's current model is not a fast-capable codex model (the same
    // in-popup error posture the /model contribution uses for its guards).
    ctx.inject(['commandUi'], (scope) => {
        const command = scope.get('commandUi');
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
                    const state = await createSpeedLoader(connection, models, session.sessionId)();
                    if (!state.visible)
                        throw new Error(t('commandFastUnavailable'));
                    return [
                        { id: 'standard', label: t('speedStandard'), detail: t('speedStandardDescription') },
                        { id: 'fast', label: t('speedFast'), detail: t('speedFastDescription') },
                    ].map(option => ({ ...option, active: option.id === state.tier }));
                },
                onSelect: async (option, session) => {
                    await createSpeedSetter(connection, session.sessionId)(option.id);
                },
            },
        }), 'dsh-plugin-subscriptions: /fast contribution');
    });
}
