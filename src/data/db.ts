import { openDB, type DBSchema } from 'idb';
import type { Cheat } from '../lib/cheat-format';
import { hashRom } from '../lib/hash';

export interface Game {
  id: string;
  hash: string;
  name: string;
  filename: string;
  // ArrayBuffer for new imports; Blob remains readable for existing libraries.
  blob: Blob | ArrayBuffer;
  size: number;
  gameCode: string;
  makerCode: string;
  version: number;
  addedAt: number;
  lastPlayedAt: number | null;
  lastSavedAt?: number | null;
  autoSaveOnExit?: boolean;
}
interface PocketDB extends DBSchema {
  games: { key: string; value: Game; indexes: { hash: string } };
  cheats: { key: string; value: Cheat; indexes: { gameId: string } };
}
export const database = () =>
  openDB<PocketDB>('pocket-gba', 1, {
    upgrade(db) {
      db.createObjectStore('games', { keyPath: 'id' }).createIndex(
        'hash',
        'hash',
      );
      db.createObjectStore('cheats', { keyPath: 'id' }).createIndex(
        'gameId',
        'gameId',
      );
    },
  });
export const data = {
  async games() {
    return (await (await database()).getAll('games')).sort(
      (a, b) => (b.lastPlayedAt ?? b.addedAt) - (a.lastPlayedAt ?? a.addedAt),
    );
  },
  async game(id: string) {
    const game = await (await database()).get('games', id);
    if (!game) throw new Error('This game is not in your library.');
    return game;
  },
  async addGame(game: Game) {
    await (await database()).add('games', game);
    return game;
  },
  async duplicate(hash: string) {
    return (
      (await (await database()).getFromIndex('games', 'hash', hash)) ?? null
    );
  },
  async repairGame(buffer: ArrayBuffer) {
    // Match content, never a filename, so a different ROM cannot replace saves'
    // game identity. Read fresh metadata inside the write transaction.
    const hash = await hashRom(buffer);
    const db = await database();
    const tx = db.transaction('games', 'readwrite');
    const game = await tx.store.index('hash').get(hash);
    if (!game) {
      await tx.done;
      throw new Error('This game is not in your library.');
    }
    await tx.store.put({ ...game, blob: buffer, size: buffer.byteLength });
    await tx.done;
  },
  async played(id: string) {
    const db = await database();
    const tx = db.transaction('games', 'readwrite');
    const game = await tx.store.get(id);
    if (game) await tx.store.put({ ...game, lastPlayedAt: Date.now() });
    await tx.done;
  },
  async removeGame(id: string) {
    const db = await database();
    const tx = db.transaction(['games', 'cheats'], 'readwrite');
    const keys = await tx.objectStore('cheats').index('gameId').getAllKeys(id);
    await Promise.all(keys.map((key) => tx.objectStore('cheats').delete(key)));
    await tx.objectStore('games').delete(id);
    await tx.done;
  },
  async cheats(gameId: string) {
    return (
      await (await database()).getAllFromIndex('cheats', 'gameId', gameId)
    ).sort((a, b) => a.createdAt - b.createdAt);
  },
  async allCheats() {
    return (await database()).getAll('cheats');
  },
  async putCheat(cheat: Cheat) {
    const db = await database();
    const tx = db.transaction(['games', 'cheats'], 'readwrite');
    if (!(await tx.objectStore('games').get(cheat.gameId))) {
      tx.abort();
      throw new Error('Add the game before adding its cheats.');
    }
    await tx.objectStore('cheats').put(cheat);
    await tx.done;
  },
  async removeCheat(id: string) {
    await (await database()).delete('cheats', id);
  },
  async importCheats(cheats: Cheat[]) {
    const db = await database();
    const tx = db.transaction(['games', 'cheats'], 'readwrite');
    for (const cheat of cheats) {
      if (!(await tx.objectStore('games').get(cheat.gameId))) {
        tx.abort();
        throw new Error('A game in this backup is missing. Add it first.');
      }
      await tx.objectStore('cheats').put(cheat);
    }
    await tx.done;
  },
  async clear() {
    const db = await database();
    const tx = db.transaction(['games', 'cheats'], 'readwrite');
    await tx.objectStore('games').clear();
    await tx.objectStore('cheats').clear();
    await tx.done;
  },
};
export function friendlyError(error: unknown) {
  if (error instanceof Error && /quota/i.test(error.name + error.message))
    return 'Your browser storage is full. Back up your saves, then remove a game or free space on your device.';
  return error instanceof Error
    ? error.message
    : 'The action could not be completed. Try again.';
}
