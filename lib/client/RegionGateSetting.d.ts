import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client';
import type { SubscriptionsKey } from './locales.js';
export interface RegionGateSettingProps {
    rpc: ConnectionHandle['rpc'];
    t: (key: SubscriptionsKey, vars?: Record<string, string | number>) => string;
}
/** The blocked-region picker rendered above the proxy card. */
export declare function RegionGateSetting({ rpc, t }: RegionGateSettingProps): import("react").JSX.Element;
