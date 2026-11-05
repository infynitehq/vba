export function parseRomHeader(buffer: ArrayBuffer) {
  if (buffer.byteLength < 192)
    throw new Error(
      'This file is too small to be a GBA game (at least 192 bytes).',
    );
  const bytes = new Uint8Array(buffer);
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...bytes.slice(start, end))
      .replace(/\0.*$/, '')
      .replace(/[^\x20-\x7e]/g, '')
      .trim();
  return {
    title: ascii(0xa0, 0xac),
    gameCode: ascii(0xac, 0xb0),
    makerCode: ascii(0xb0, 0xb2),
    version: bytes[0xbc],
    validFixedByte: bytes[0xb2] === 0x96,
  };
}
