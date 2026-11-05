import { describe, it, expect } from 'vitest';
import {
  codeSchema,
  cheatFormSchema,
  mismatch,
} from '../../src/lib/cheat-format';
describe('cheat validation', () => {
  it.each([
    '01234567 89ABCDEF',
    '82000000 1234',
    '01234567 89abcdef\r\n  12345678   abcdef00 ',
  ])('accepts %s', (code) =>
    expect(codeSchema.safeParse(code).success).toBe(true),
  );
  it('normalizes multiline whitespace and case', () =>
    expect(codeSchema.parse(' abcd1234\t1234abcd \r\n 82000000  abcd ')).toBe(
      'ABCD1234 1234ABCD\n82000000 ABCD',
    ));
  it.each([
    '',
    '1234567 12345678',
    '12345678 1234567',
    'ZZZZZZZZ 12345678',
    '12345678',
    '12345678 12345678\n\n12345678 1234',
    '1234567812345678',
  ])('rejects %s', (code) =>
    expect(codeSchema.safeParse(code).success).toBe(false),
  );
  it('validates tags including v0', () => {
    expect(
      cheatFormSchema.parse({
        label: ' Test ',
        code: '82000000 1234',
        gameCode: 'bpre',
        version: '0',
      }).gameCode,
    ).toBe('BPRE');
    expect(
      cheatFormSchema.safeParse({
        label: '',
        code: '82000000 1234',
        gameCode: 'BP',
        version: '256',
      }).success,
    ).toBe(false);
  });
  it('warns on version zero mismatches', () => {
    const cheat = {
      id: 'a',
      gameId: 'g',
      label: 'Test',
      code: '82000000 1234',
      enabled: true,
      createdAt: 0,
      version: 0,
    };
    expect(mismatch(cheat, { gameCode: 'BPRE', version: 1 })).toBe(true);
    expect(mismatch(cheat, { gameCode: 'BPRE', version: 0 })).toBe(false);
  });
});
