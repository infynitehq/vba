import { beforeEach, describe, expect, it } from 'vitest';
import { data, type Game } from '../../src/data/db';
const game: Game = {
  id: 'game-a',
  hash: 'hash-a',
  name: 'Own game',
  filename: 'own.gba',
  blob: new Blob(['test']),
  size: 4,
  gameCode: 'TEST',
  makerCode: '01',
  version: 0,
  addedAt: 1,
  lastPlayedAt: null,
};
const cheat = {
  id: 'cheat-a',
  gameId: game.id,
  label: 'Test',
  code: '82000000 1234',
  enabled: false,
  createdAt: 1,
};
describe('IndexedDB data layer', () => {
  beforeEach(async () => {
    await data.clear();
  });
  it('round-trips games, hashes, blobs and last played', async () => {
    await data.addGame(game);
    expect((await data.game(game.id)).blob.size).toBe(4);
    expect((await data.duplicate(game.hash))?.id).toBe(game.id);
    await data.played(game.id);
    expect((await data.game(game.id)).lastPlayedAt).toBeGreaterThan(0);
    expect((await data.games()).length).toBe(1);
  });
  it('creates, edits, toggles and removes cheats', async () => {
    await data.addGame(game);
    await data.putCheat(cheat);
    await data.putCheat({ ...cheat, label: 'Edited', enabled: true });
    expect(await data.cheats(game.id)).toEqual([
      { ...cheat, label: 'Edited', enabled: true },
    ]);
    await data.removeCheat(cheat.id);
    expect(await data.cheats(game.id)).toEqual([]);
  });
  it('preserves saved timestamps when recording a play session', async () => {
    await data.addGame({ ...game, lastSavedAt: 1234 });
    await data.played(game.id);
    expect((await data.game(game.id)).lastSavedAt).toBe(1234);
  });
  it('atomically cascades game deletion but preserves other games', async () => {
    await data.addGame(game);
    await data.addGame({ ...game, id: 'game-b', hash: 'hash-b' });
    await data.putCheat(cheat);
    await data.putCheat({ ...cheat, id: 'cheat-b', gameId: 'game-b' });
    await data.removeGame(game.id);
    expect(await data.cheats(game.id)).toEqual([]);
    expect((await data.cheats('game-b')).length).toBe(1);
  });
  it('imports and updates without duplicating IDs', async () => {
    await data.addGame(game);
    await data.importCheats([cheat]);
    await data.importCheats([{ ...cheat, enabled: true }]);
    expect(await data.allCheats()).toEqual([{ ...cheat, enabled: true }]);
  });
});
