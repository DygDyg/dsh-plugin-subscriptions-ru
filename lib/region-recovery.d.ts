import type { Agent } from '@deepseek-ai/dsh-agent';
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment';
import type { UserMessage } from '@deepseek-ai/dsh-llm';
import type { RegionGate } from './region-gate.js';
export interface RecoveryView {
    id: string;
    text: string;
    attachments: {
        type: 'image' | 'file';
        name: string;
    }[];
    status: 'saved' | 'submitting' | 'accepted';
}
/** Isolated per-session files avoid exposing messages from other sessions. */
export declare class RegionRecovery {
    private readonly directory;
    private readonly locks;
    constructor(directory?: string);
    private path;
    private read;
    private write;
    private locked;
    /** Only ordinary user messages are recoverable; context and prior tool work are not replayed. */
    save(sessionId: string, messages: readonly UserMessage[]): Promise<void>;
    list(sessionId: string): Promise<RecoveryView[]>;
    remove(sessionId: string, id: string): Promise<void>;
    retry(sessionId: string, id: string, agent: Agent, attachments: AttachmentStore, gate: RegionGate, signal: AbortSignal): Promise<void>;
}
