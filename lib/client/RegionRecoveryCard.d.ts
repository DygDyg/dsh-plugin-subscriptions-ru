import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
export interface RegionRecoveryCardInjected {
    rpc: ConnectionHandle['rpc'];
    sessionId: string;
}
type Props = Partial<PropsRuntime<'conversation.input.dock'>> & Partial<RegionRecoveryCardInjected> & Partial<PropsLocale<'settings.subscriptions'>>;
/** Explicitly retry saved input; never replace the user's current draft. */
export declare function RegionRecoveryCard({ rpc, sessionId, t: locale }: Props): import("react").JSX.Element | null;
export {};
