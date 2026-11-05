export async function hashRom(buffer: ArrayBuffer) {
  if (!globalThis.crypto?.subtle)
    throw new Error(
      'Adding games requires a secure connection (HTTPS). Open the app using an HTTPS address. For local testing on your phone, use an HTTPS tunnel instead of an http:// local network address.',
    );
  const digest = await crypto.subtle.digest('SHA-1', buffer);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
