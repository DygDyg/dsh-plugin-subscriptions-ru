/** Best-effort recovery for user input claimed before a region gate rejects. */
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
/** Isolated per-session files avoid exposing messages from other sessions. */
export class RegionRecovery {
    directory;
    locks = new Map();
    constructor(directory = dshHomePath('plugins', 'subscriptions', 'region-recovery')) {
        this.directory = directory;
    }
    path(sessionId) {
        return join(this.directory, `${createHash('sha256').update(sessionId).digest('hex')}.json`);
    }
    async read(sessionId) {
        try {
            const parsed = JSON.parse(await readFile(this.path(sessionId), 'utf8'));
            if (!Array.isArray(parsed) || parsed.some(row => !row || typeof row !== 'object' || row.sessionId !== sessionId || typeof row.id !== 'string' || !row.message || !row.retryMessage || !['saved', 'submitting', 'accepted'].includes(row.status))) {
                throw new Error('invalid recovery data');
            }
            return parsed;
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return [];
            throw error;
        }
    }
    async write(sessionId, rows) {
        await mkdir(this.directory, { recursive: true, mode: 0o700 });
        const target = this.path(sessionId);
        const temporary = `${target}.${randomUUID()}.tmp`;
        try {
            await writeFile(temporary, JSON.stringify(rows), { mode: 0o600, flag: 'wx' });
            await rename(temporary, target);
        }
        finally {
            await rm(temporary, { force: true });
        }
    }
    async locked(sessionId, operation) {
        const previous = this.locks.get(sessionId) ?? Promise.resolve();
        let release;
        const current = new Promise(resolve => { release = resolve; });
        this.locks.set(sessionId, current);
        await previous;
        try {
            return await operation();
        }
        finally {
            release();
            if (this.locks.get(sessionId) === current)
                this.locks.delete(sessionId);
        }
    }
    /** Only ordinary user messages are recoverable; context and prior tool work are not replayed. */
    async save(sessionId, messages) {
        const users = messages.filter(message => message.source.kind === 'user' && message.content.length > 0);
        if (users.length === 0)
            return;
        await this.locked(sessionId, async () => {
            const rows = await this.read(sessionId);
            for (const message of users) {
                const replayed = rows.find(row => row.retryMessage.id === message.id);
                if (replayed) {
                    replayed.status = 'saved';
                    replayed.retryMessage = createUserMessage({ content: message.content, source: { kind: 'user' } });
                    continue;
                }
                if (rows.some(row => row.message.id === message.id && row.status !== 'accepted'))
                    continue;
                rows.push({
                    id: randomUUID(), sessionId, message,
                    retryMessage: createUserMessage({ content: message.content, source: { kind: 'user' } }),
                    createdAt: Date.now(), status: 'saved',
                });
            }
            await this.write(sessionId, rows);
        });
    }
    async list(sessionId) {
        return (await this.read(sessionId)).map(row => ({
            id: row.id,
            text: row.message.content.filter(part => part.type === 'text').map(part => part.text).join('\n'),
            attachments: row.message.content.flatMap(part => part.type === 'image' || part.type === 'file'
                ? [{ type: part.type, name: part.attachment.name ?? (part.type === 'image' ? 'image' : 'file') }]
                : []),
            status: row.status,
        }));
    }
    async remove(sessionId, id) {
        await this.locked(sessionId, async () => {
            const rows = await this.read(sessionId);
            await this.write(sessionId, rows.filter(item => item.id !== id));
        });
    }
    async retry(sessionId, id, agent, attachments, gate, signal) {
        await this.locked(sessionId, async () => {
            const rows = await this.read(sessionId);
            const row = rows.find(item => item.id === id);
            if (!row)
                throw new Error('Saved request was not found');
            if (row.status === 'accepted')
                return;
            if (row.status === 'submitting')
                throw new Error('The outcome of the previous attempt is unknown; do not resend automatically');
            if (agent.id !== sessionId || agent.session.header.origin === 'subagent' || agent.status !== 'idle' || agent.inbox.nextTurn.length || agent.inbox.nextStep.length) {
                throw new Error('Wait until the agent is idle and its queue is empty');
            }
            const verdict = await gate.refresh(true, signal);
            if (verdict.status !== 'allowed')
                throw new Error(verdict.status === 'blocked' ? `Region ${verdict.country ?? ''} is blocked` : `Region check failed: ${verdict.error ?? 'unknown error'}`);
            for (const part of row.message.content) {
                signal.throwIfAborted();
                if (part.type === 'image')
                    await attachments.readImage(part.attachment, signal);
                if (part.type === 'file')
                    for await (const _chunk of attachments.readFileStream(part.attachment, signal)) { /* verify all bytes */ }
            }
            signal.throwIfAborted();
            row.status = 'submitting';
            await this.write(sessionId, rows);
            // After the last await re-check synchronously: no competing JS callback
            // can insert work between this check and followup's synchronous enqueue.
            if (signal.aborted || agent.status !== 'idle' || agent.inbox.nextTurn.length || agent.inbox.nextStep.length) {
                row.status = 'saved';
                await this.write(sessionId, rows);
                throw new Error('The agent is no longer idle or the request was cancelled; try again');
            }
            try {
                agent.followup(row.retryMessage);
            }
            catch (error) {
                // The inbox splice may already have committed; keep the uncertain state.
                throw error;
            }
            row.status = 'accepted';
            await this.write(sessionId, rows);
        });
    }
}
