import { z } from 'zod';
import { cheatSchema } from '../lib/cheat-format';
import { data } from './db';
import { saveFile } from '../platform';

const MAX_BACKUP_BYTES = 4 * 1024 * 1024;
const backupSchema = z.object({
  format: z.literal('pocket-gba-cheats'),
  version: z.literal(1),
  cheats: z.array(cheatSchema).max(10000),
});
export function download(
  content: BlobPart,
  filename: string,
  type = 'application/json',
) {
  return saveFile(new Blob([content], { type }), filename);
}
export async function exportCheats(gameId?: string) {
  const cheats = gameId ? await data.cheats(gameId) : await data.allCheats();
  const backup = { format: 'pocket-gba-cheats', version: 1, cheats };
  if (!backupSchema.safeParse(backup).success)
    throw new Error(
      'This cheat backup exceeds the 10,000-cheat limit or contains invalid cheats. Export smaller per-game backups, or correct or remove cheats before exporting.',
    );
  const content = JSON.stringify(backup, null, 2);
  if (new TextEncoder().encode(content).byteLength > MAX_BACKUP_BYTES)
    throw new Error(
      'This cheat backup exceeds 4 MB. Export smaller per-game backups, or reduce the cheats in this game before exporting.',
    );
  return download(
    content,
    gameId ? `pocket-gba-${gameId}-cheats.json` : 'pocket-gba-all-cheats.json',
  );
}
export async function importCheats(file: File, gameId?: string) {
  if (file.size > MAX_BACKUP_BYTES)
    throw new Error('Choose a cheat backup smaller than 4 MB.');
  const parsed = backupSchema.safeParse(JSON.parse(await file.text()));
  if (!parsed.success)
    throw new Error(
      'This is not a valid Pocket GBA cheat backup. Export a new JSON backup and try again.',
    );
  const games = await data.games();
  const cheats = parsed.data.cheats.map((cheat) => {
    // Game IDs are content hashes, so all-game backups work across devices.
    if (!gameId && !games.some((game) => game.id === cheat.gameId))
      throw new Error(
        'A game in this backup is missing. Add the same game file first, or import from a game’s cheat sheet.',
      );
    return {
      ...cheat,
      gameId: gameId ?? cheat.gameId,
      id:
        gameId && gameId !== cheat.gameId ? `${gameId}-${cheat.id}` : cheat.id,
    };
  });
  await data.importCheats(cheats);
  return cheats.length;
}
