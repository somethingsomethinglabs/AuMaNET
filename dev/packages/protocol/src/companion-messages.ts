import {parseBenchMessage, validateBenchText, type BenchMessage, type BenchRole} from './bench.js';

/** Local development storage, never an authenticated group or production queue contract. */
export const MESSAGE_WORKSPACE_SCHEMA = 'aumanet.companion-messages.v1';
export const LOCAL_HISTORY_LIMIT = 64;
export const LOCAL_PENDING_LIMIT = 16;
export const LOCAL_HIDDEN_LIMIT = 128;
export const LOCAL_DRAFT_LIMIT = 4096;
export interface PendingMessage {
  readonly id: string;
  readonly text: string;
  /** Local wall time of the send intent; not a trusted device/group timestamp. */
  readonly attemptedAt: number;
}
export interface MessageWorkspace {
  readonly schema: typeof MESSAGE_WORKSPACE_SCHEMA;
  readonly node: string;
  readonly role: BenchRole;
  readonly draft: string;
  readonly history: readonly BenchMessage[];
  readonly pending: readonly PendingMessage[];
  readonly hidden: readonly string[];
}
export function validateNodeId(node: unknown): asserts node is string {
  if (typeof node !== 'string' || !/^[a-f0-9]{12}$/.test(node)) throw new Error('Invalid node identity');
}
export function messageKey(message: Pick<BenchMessage, 'from' | 'id'>) { return message.from + message.id; }
export function emptyWorkspace(node: string, role: BenchRole): MessageWorkspace {
  validateNodeId(node);
  return {schema: MESSAGE_WORKSPACE_SCHEMA, node, role, draft: '', history: [], pending: [], hidden: []};
}
export function parseMessageWorkspace(value: unknown): MessageWorkspace {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid message workspace');
  const v = value as Record<string, unknown>;
  validateNodeId(v.node);
  if (v.schema !== MESSAGE_WORKSPACE_SCHEMA || (v.role !== 'A' && v.role !== 'B') ||
      typeof v.draft !== 'string' || v.draft.length > LOCAL_DRAFT_LIMIT ||
      !Array.isArray(v.history) || v.history.length > LOCAL_HISTORY_LIMIT ||
      !Array.isArray(v.pending) || v.pending.length > LOCAL_PENDING_LIMIT ||
      !Array.isArray(v.hidden) || v.hidden.length > LOCAL_HIDDEN_LIMIT ||
      !v.hidden.every(key => typeof key === 'string' && /^[AB][a-f0-9]{16}$/.test(key)))
    throw new Error('Invalid or incompatible message workspace');
  const history = v.history.map(parseBenchMessage);
  const pending = v.pending.map((entry: unknown): PendingMessage => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Invalid pending message');
    const p = entry as Record<string, unknown>;
    validateBenchText(p.text);
    if (typeof p.id !== 'string' || !/^[a-f0-9]{16}$/.test(p.id) ||
        typeof p.attemptedAt !== 'number' || !Number.isSafeInteger(p.attemptedAt) || p.attemptedAt < 0)
      throw new Error('Invalid pending message');
    return {id: p.id, text: p.text, attemptedAt: p.attemptedAt};
  });
  if (new Set(history.map(messageKey)).size !== history.length || new Set(pending.map(p => p.id)).size !== pending.length ||
      new Set(v.hidden).size !== v.hidden.length) throw new Error('Duplicate message records');
  // Copy only the schema fields: unknown data is never passed through storage boundaries.
  return {schema: MESSAGE_WORKSPACE_SCHEMA, node: v.node, role: v.role, draft: v.draft,
    history, pending, hidden: [...v.hidden] as string[]};
}
