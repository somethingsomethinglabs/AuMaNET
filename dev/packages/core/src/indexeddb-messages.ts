import {parseMessageWorkspace, validateNodeId, type MessageWorkspace} from '@aumanet/protocol';
import type {MessageWorkspaceStore} from './companion-messages.js';

/** Browser/WebView durable storage. Not credential storage or a native background queue. */
export class IndexedDbMessageStore implements MessageWorkspaceStore {
  private constructor(private db: IDBDatabase) {}
  static open(factory: IDBFactory, name = 'aumanet-companion-messages'): Promise<IndexedDbMessageStore> {
    return new Promise((resolve, reject) => {
      const request = factory.open(name, 1);
      let failed = false;
      request.onupgradeneeded = () => {
        request.result.createObjectStore('nodes');
        request.result.createObjectStore('metadata');
      };
      request.onblocked = () => { failed = true; reject(new Error('Close other AuMaNET tabs to open message storage.')); };
      request.onerror = () => reject(request.error ?? new Error('Message storage is unavailable'));
      request.onsuccess = () => {
        if (failed) { request.result.close(); return; }
        request.result.onversionchange = () => request.result.close();
        resolve(new IndexedDbMessageStore(request.result));
      };
    });
  }
  close() { this.db.close(); }
  private transaction<T>(storeName: string, mode: IDBTransactionMode,
    run: (store: IDBObjectStore, result: (value: T) => void) => void): Promise<T> {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, mode, mode === 'readwrite' ? {durability: 'strict'} : {});
      let value: T;
      transaction.oncomplete = () => resolve(value);
      transaction.onabort = () => reject(transaction.error ?? new Error('Message storage transaction failed. No send was started.'));
      transaction.onerror = () => {}; // onabort handles the result; never accept an uncommitted write.
      try { run(transaction.objectStore(storeName), result => { value = result; }); }
      catch (error) { transaction.abort(); reject(error); }
    });
  }
  async read(node: string) {
    validateNodeId(node);
    const value = await this.transaction<unknown>('nodes', 'readonly', (store, result) => {
      store.get(node).onsuccess = event => result((event.target as IDBRequest).result);
    });
    if (value === undefined) return undefined;
    const record = parseMessageWorkspace(value);
    if (record.node !== node) throw new Error('Stored node identity does not match');
    return record;
  }
  update(node: string, change: (current: MessageWorkspace | undefined) => MessageWorkspace) {
    validateNodeId(node);
    return new Promise<MessageWorkspace>((resolve, reject) => {
      const transaction = this.db.transaction('nodes', 'readwrite', {durability: 'strict'});
      const store = transaction.objectStore('nodes');
      let next: MessageWorkspace;
      transaction.oncomplete = () => resolve(next);
      transaction.onabort = () => reject(transaction.error ?? new Error('Could not save messages. No send was started.'));
      store.get(node).onsuccess = event => {
        try {
          const value: unknown = (event.target as IDBRequest).result;
          const current = value === undefined ? undefined : parseMessageWorkspace(value);
          if (current && current.node !== node) throw new Error('Stored node identity does not match');
          next = parseMessageWorkspace(change(current));
          if (next.node !== node) throw new Error('Cannot change message workspace identity');
          store.count().onsuccess = countEvent => {
            if (!current && (countEvent.target as IDBRequest<number>).result >= 16) {
              transaction.abort(); reject(new Error('Local storage is limited to 16 development nodes.')); return;
            }
            store.put(next, node);
          };
        } catch (error) { transaction.abort(); reject(error); }
      };
    });
  }
  async selected() {
    const node = await this.transaction<unknown>('metadata', 'readonly', (store, result) => {
      store.get('selected-node').onsuccess = event => result((event.target as IDBRequest).result);
    });
    if (node === undefined) return undefined;
    validateNodeId(node); return node;
  }
  select(node: string) {
    validateNodeId(node);
    return this.transaction<void>('metadata', 'readwrite', (store, result) => {
      store.put(node, 'selected-node'); result(undefined);
    });
  }
}
