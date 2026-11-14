import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Source-level guards for the single-slot regression. Real pointer/geometry
// behavior still needs a Desktop UI check; these do not simulate a browser.
const source = (name: string) => readFileSync(new URL(`../../src/client/${name}`, import.meta.url), 'utf8')
// Tests run from lib-test/test, so reach the repository's source, not emitted JS.
const registration = source('index.ts')
const badge = source('SubscriptionUsageBadge.tsx')
const launcher = source('SidebarUsageLauncher.tsx')

test('quota contribution uses the additive sidebar footer action slot', () => {
  assert.doesNotMatch(registration, /slots\.register\(\{\s*name: 'settings\.launcher'/)
  assert.match(registration, /slots\.inject\('sidebar\.footer\.action'[\s\S]*?name: 'sidebar\.footer\.action',[\s\S]*?id: 'subscription-usage-launcher'/)
  assert.doesNotMatch(registration, /name: 'shell\.overlay'/)
  assert.doesNotMatch(launcher, /MutationObserver|document\.querySelector|createPortal/)
  assert.match(launcher, /wide=\{wide\}/)
})

test('sidebar usage action stays labeled in the wide sidebar and accessible in the rail', () => {
  assert.match(badge, /aria-label=\{translate\('usageBadgeTitle'\)\}/)
  assert.match(badge, /title=\{translate\('usageBadgeTitle'\)\}/)
  assert.match(badge, /wide && <span>\{translate\('usageBadgeTitle'\)\}<\/span>/)
})

test('sidebar launcher remains visible without usage data and reports loading or empty state', () => {
  assert.doesNotMatch(badge, /if \(menuSurface && displays\.length === 0/)
  assert.match(badge, /displays\.length === 0 && usageLoading/)
  assert.match(badge, /displays\.length === 0 && !usageLoading && !usageError/)
  assert.match(badge, /translate\('usageEmpty'\)/)
})

test('sidebar summary opens from an accessible button into a body portal', () => {
  assert.match(badge, /className="dsh-subscription-sidebar-button"/)
  assert.match(badge, /aria-haspopup="dialog" aria-expanded=\{open\}/)
  assert.match(badge, /\{open && createPortal\(/)
  assert.match(badge, /ref=\{panelRef\} role="dialog"/)
  assert.match(badge, /event\.key === 'Escape'/)
})

test('remaining bar length is inverse usage, but warning color follows used quota', () => {
  assert.match(badge, /width: `\$\{100 - usedPercent\(window\)\}%`, background: usageBarColor\(usedPercent\(window\)\)/)
  assert.doesNotMatch(badge, /usageBarColor\(100 - usedPercent/)
})

test('hiding the composer badge does not hide or stop the separate sidebar summary', () => {
  assert.match(badge, /surface === 'dock' && displayMode === 'hidden'/)
  assert.match(badge, /if \(!menuSurface && \(displayMode === 'hidden'/)
})
