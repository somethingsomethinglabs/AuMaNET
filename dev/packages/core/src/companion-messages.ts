import {emptyWorkspace, messageKey, parseBluetoothSnapshot, parseMessageWorkspace, validateBenchText,
  LOCAL_HISTORY_LIMIT, LOCAL_PENDING_LIMIT, LOCAL_HIDDEN_LIMIT, LOCAL_DRAFT_LIMIT,
  type BluetoothSnapshot, type MessageWorkspace, type PendingMessage} from '@aumanet/protocol';

/** update must atomically read, validate, transform and commit a single node record. */
export interface MessageWorkspaceStore {
  read(node: string): Promise<MessageWorkspace | undefined>;
  update(node: string, change: (current: MessageWorkspace | undefined) => MessageWorkspace): Promise<MessageWorkspace>;
  selected(): Promise<string | undefined>;
  select(node: string): Promise<void>;
}
export interface MessageTransport {
  send(id: string, text: string): Promise<BluetoothSnapshot>;
}
function checkScope(current: MessageWorkspace, snapshot: BluetoothSnapshot) {
  if (current.node !== snapshot.node || current.role !== snapshot.role) throw new Error('Node identity or role changed. Local messages were not modified.');
}
/** Foreground-only, explicit sends. No scheduling or automatic replay of a lost response. */
export class CompanionMessages {
  constructor(private store: MessageWorkspaceStore,
    private newId = () => crypto.randomUUID().replaceAll('-', '').slice(0, 16),
    private now = () => Date.now()) {}
  async restore() {
    const node = await this.store.selected();
    return node ? this.store.read(node) : undefined;
  }
  async observe(value: unknown): Promise<MessageWorkspace> {
    const snapshot = parseBluetoothSnapshot(value);
    const record = await this.store.update(snapshot.node, current => {
      const saved = current ?? emptyWorkspace(snapshot.node, snapshot.role);
      checkScope(saved, snapshot);
      const history = [...saved.history];
      for (const message of snapshot.messages) {
        const key = messageKey(message);
        if (saved.hidden.includes(key)) continue;
        const index = history.findIndex(old => messageKey(old) === key);
        const old = history[index];
        if (old && old.text !== message.text) throw new Error('A message ID has conflicting content. History was not changed.');
        // A delayed unconfirmed observation must not downgrade a peer acknowledgement.
        const next = old?.state === 'delivered_to_peer' ? old : message;
        if (index < 0) history.push(next); else history[index] = next;
      }
      const pending = saved.pending.filter(p => {
        const observed = snapshot.messages.find(m => m.from === snapshot.role && m.id === p.id);
        if (observed && observed.text !== p.text) throw new Error('Pending message ID has conflicting content');
        return observed?.state !== 'delivered_to_peer';
      });
      return parseMessageWorkspace({...saved, history: history.slice(-LOCAL_HISTORY_LIMIT), pending});
    });
    await this.store.select(snapshot.node);
    return record;
  }
  saveDraft(node: string, draft: string) {
    if (draft.length > LOCAL_DRAFT_LIMIT) throw new Error(`Draft is limited to ${LOCAL_DRAFT_LIMIT} characters`);
    return this.store.update(node, current => {
      if (!current) throw new Error('Select a node before writing a draft');
      return {...current, draft};
    });
  }
  async send(snapshot: BluetoothSnapshot, transport: MessageTransport, retryId?: string) {
    snapshot = parseBluetoothSnapshot(snapshot);
    let pending: PendingMessage | undefined;
    // Persist the immutable intent BEFORE any transport side effect. Even process death is ambiguous.
    await this.store.update(snapshot.node, current => {
      if (!current) throw new Error('Load node history before sending');
      checkScope(current, snapshot);
      if (!snapshot.radio_started || !snapshot.storage_ready) throw new Error('Start the radio and verify node storage before sending');
      const text = current.draft.trim();
      pending = retryId ? current.pending.find(p => p.id === retryId) : current.pending.find(p => p.text === text);
      if (retryId && !pending) throw new Error('This message no longer needs retrying');
      if (!pending) {
        validateBenchText(text);
        if (current.pending.length >= LOCAL_PENDING_LIMIT) throw new Error('Resolve or cancel an unconfirmed message before sending more');
        pending = {id: this.newId(), text, attemptedAt: this.now()};
        if (current.history.some(m => m.from === current.role && m.id === pending!.id) ||
            current.hidden.includes(current.role + pending.id) || current.pending.some(p => p.id === pending!.id))
          throw new Error('Message ID already exists. No message was sent.');
      }
      return parseMessageWorkspace({...current,
        draft: current.draft.trim() === pending.text ? '' : current.draft,
        pending: current.pending.some(p => p.id === pending!.id) ? current.pending : [...current.pending, pending]});
    });
    const response = await transport.send(pending!.id, pending!.text);
    checkScope(emptyWorkspace(snapshot.node, snapshot.role), response);
    return this.observe(response);
  }
  cancel(node: string, id: string) {
    return this.store.update(node, current => {
      if (!current) throw new Error('No local workspace');
      return {...current, pending: current.pending.filter(p => p.id !== id)};
    });
  }
  clearHistory(node: string) {
    return this.store.update(node, current => {
      if (!current) throw new Error('No local workspace');
      const hidden = [...new Set([...current.hidden, ...current.history.map(messageKey)])].slice(-LOCAL_HIDDEN_LIMIT);
      return {...current, history: [], hidden};
    });
  }
}
export type {MessageWorkspace, PendingMessage} from '@aumanet/protocol';
