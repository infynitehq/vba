import { describe, it, expect } from 'vitest';
import { parseRomHeader } from '../../src/lib/rom-header';
describe('GBA header', () => {
  it('parses exact offsets and preserves version zero', () => {
    const bytes = new Uint8Array(192);
    bytes.set(new TextEncoder().encode('POCKET TEST'), 0xa0);
    bytes.set(new TextEncoder().encode('BPRE01'), 0xac);
    bytes[0xb2] = 0x96;
    bytes[0xbc] = 0;
    expect(parseRomHeader(bytes.buffer)).toEqual({
      title: 'POCKET TEST',
      gameCode: 'BPRE',
      makerCode: '01',
      version: 0,
      validFixedByte: true,
    });
  });
  it('parses all 12 title bytes and nonzero revision', () => {
    const bytes = new Uint8Array(192);
    bytes.set(new TextEncoder().encode('ABCDEFGHIJKL'), 0xa0);
    bytes[0xbc] = 7;
    expect(parseRomHeader(bytes.buffer).title).toBe('ABCDEFGHIJKL');
    expect(parseRomHeader(bytes.buffer).version).toBe(7);
  });
  it('rejects truncated input, flags but does not reject nonstandard headers', () => {
    expect(() => parseRomHeader(new ArrayBuffer(191))).toThrow('too small');
    expect(parseRomHeader(new ArrayBuffer(192)).validFixedByte).toBe(false);
  });
});
