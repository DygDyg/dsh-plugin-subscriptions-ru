import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
export interface RegionSnapshot {
    status: 'unknown' | 'allowed' | 'blocked' | 'error';
    ip?: string;
    country?: string;
    countryName?: string;
    blocked: string[];
    error?: string;
}
export interface RegionGateNoticeInjected {
    rpc: ConnectionHandle['rpc'];
}
export type RegionGateNoticeProps = Partial<PropsRuntime<'conversation.composer.dock'>> & Partial<RegionGateNoticeInjected> & Partial<PropsLocale<'settings.subscriptions'>>;
/** Dock notice. Renders nothing while the current region is allowed. */
export declare function RegionGateNotice(props: RegionGateNoticeProps): import("react").JSX.Element | null;
