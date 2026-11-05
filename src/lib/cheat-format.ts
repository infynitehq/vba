import { z } from 'zod';

export const normalizeCode = (code: string) =>
  code
    .trim()
    .toUpperCase()
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .join('\n');
export const codeSchema = z
  .string()
  .max(16000, 'Keep each cheat under 16,000 characters.')
  .transform(normalizeCode)
  .refine(
    (value) =>
      value.length > 0 &&
      value
        .split('\n')
        .every((line) =>
          /^[0-9A-F]{8} (?:[0-9A-F]{8}|[0-9A-F]{4})$/.test(line),
        ),
    'Each line needs two groups of hex characters: 8 + 8 (GameShark / Action Replay) or 8 + 4 (CodeBreaker).',
  );
export const cheatFormSchema = z.object({
  label: z.string().trim().min(1, 'Give this cheat a name.').max(100),
  code: codeSchema,
  gameCode: z
    .string()
    .trim()
    .toUpperCase()
    .refine(
      (value) => !value || /^[A-Z0-9]{4}$/.test(value),
      'Use a four-character game code, or leave blank.',
    ),
  version: z
    .string()
    .trim()
    .refine(
      (value) => !value || (/^\d+$/.test(value) && Number(value) <= 255),
      'Use a version from 0 to 255, or leave blank.',
    ),
});
export type CheatFormValues = z.input<typeof cheatFormSchema>;
export const cheatSchema = z.object({
  id: z.string().min(1),
  gameId: z.string().min(1),
  label: z.string().trim().min(1).max(100),
  code: codeSchema,
  enabled: z.boolean(),
  createdAt: z.number().finite(),
  gameCode: z
    .string()
    .regex(/^[A-Z0-9]{4}$/)
    .optional(),
  version: z.number().int().min(0).max(255).optional(),
});
export type Cheat = z.infer<typeof cheatSchema>;
export function mismatch(
  cheat: Cheat,
  game: { gameCode: string; version: number },
) {
  return (
    (cheat.gameCode !== undefined && cheat.gameCode !== game.gameCode) ||
    (cheat.version !== undefined && cheat.version !== game.version)
  );
}
