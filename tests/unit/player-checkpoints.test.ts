import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';

interface Checkpoint {
  version: number;
  state: Uint8Array;
  savedAt: number;
}
interface Checkpoints {
  save(gameId: string, state: Uint8Array): Promise<void>;
  load(gameId: string): Promise<Checkpoint | null>;
}
const source = readFileSync('public/player-checkpoints.js', 'utf8');
const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
function boot() {
  const indexedDB = new IDBFactory();
  const win = {} as { PocketCheckpoints: Checkpoints };
  runInNewContext(source, { indexedDB, window: win, Uint8Array, Date, Error });
  return { checkpoints: win.PocketCheckpoints, indexedDB };
}

describe('automatic checkpoint storage', () => {
  it('copies core memory immediately and isolates games', async () => {
    const { checkpoints } = boot();
    expect(await checkpoints.load('one')).toBeNull();
    const memory = new Uint8Array([1, 2, 3]);
    const saving = checkpoints.save('one', memory);
    memory.fill(0);
    await saving;
    expect((await checkpoints.load('one'))?.state).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(await checkpoints.load('two')).toBeNull();
  });

  it('retains the previous checkpoint and rejects empty replacements', async () => {
    const { checkpoints, indexedDB } = boot();
    await checkpoints.save('one', new Uint8Array([1]));
    await checkpoints.save('one', new Uint8Array([2]));
    await expect(checkpoints.save('one', new Uint8Array())).rejects.toThrow(
      'empty',
    );
    expect((await checkpoints.load('one'))?.state[0]).toBe(2);
    const db = await request(indexedDB.open('pocket-gba-checkpoints', 1));
    const record = await request(
      db.transaction('checkpoints').objectStore('checkpoints').get('one'),
    );
    expect(record.previous.state[0]).toBe(1);
    db.close();
  });

  it('uses the previous checkpoint if the latest record is invalid', async () => {
    const { checkpoints, indexedDB } = boot();
    await checkpoints.save('one', new Uint8Array([1]));
    await checkpoints.save('one', new Uint8Array([2]));
    const db = await request(indexedDB.open('pocket-gba-checkpoints', 1));
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('checkpoints', 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      const store = tx.objectStore('checkpoints');
      const req = store.get('one');
      req.onsuccess = () => store.put({ ...req.result, current: null }, 'one');
    });
    db.close();
    expect((await checkpoints.load('one'))?.state[0]).toBe(1);
  });

  it('never writes to the manual EmulatorJS state database', async () => {
    const { checkpoints, indexedDB } = boot();
    const open = indexedDB.open('EmulatorJS-states', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('states');
    const db = await request(open);
    await request(
      db
        .transaction('states', 'readwrite')
        .objectStore('states')
        .put(new Uint8Array([42]), 'pocket-one.gba.state'),
    );
    await checkpoints.save('one', new Uint8Array([1, 2]));
    expect(
      await request(
        db
          .transaction('states')
          .objectStore('states')
          .get('pocket-one.gba.state'),
      ),
    ).toEqual(new Uint8Array([42]));
    db.close();
  });
});
