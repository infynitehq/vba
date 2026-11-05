import { z } from 'zod';
import { cheatSchema } from '../lib/cheat-format';
import { data } from './db';

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
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportCheats(gameId?: string) {
  const cheats = gameId ? await data.cheats(gameId) : await data.allCheats();
  download(
    JSON.stringify(
      { format: 'pocket-gba-cheats', version: 1, cheats },
      null,
      2,
    ),
    gameId ? `pocket-gba-${gameId}-cheats.json` : 'pocket-gba-all-cheats.json',
  );
}
export async function importCheats(file: File, gameId?: string) {
  if (file.size > 4 * 1024 * 1024)
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
