import { pickFile, saveFile } from '../platform';

const MAX_BYTES = 64 * 1024 * 1024;

/** The embedding route validates origin, source window and channel first. */
export function createPlayerFileRelay(
  reply: (type: string, payload: Record<string, unknown>) => void,
) {
  let busy = false;
  let disposed = false;
  const seen = new Set<string>();
  return {
    async receive(message: Record<string, unknown>) {
      const { type, requestId } = message;
      if (
        disposed ||
        (type !== 'export-file' && type !== 'import-file') ||
        typeof requestId !== 'string' ||
        !requestId ||
        requestId.length > 200 ||
        seen.has(requestId)
      )
        return;
      const resultType =
        type === 'export-file' ? 'export-result' : 'import-result';
      if (busy) {
        reply(resultType, { requestId, ok: false });
        return;
      }
      // Bound memory even if a malfunctioning player repeatedly opens dialogs.
      if (seen.size >= 1000) seen.clear();
      seen.add(requestId);
      busy = true;
      try {
        if (type === 'export-file') {
          const { name, bytes } = message;
          if (
            typeof name !== 'string' ||
            !name ||
            name.length > 200 ||
            /[/\\]/.test(name) ||
            Array.from(name).some(
              (character) => character.charCodeAt(0) < 32,
            ) ||
            !(bytes instanceof ArrayBuffer || bytes instanceof Uint8Array) ||
            !bytes.byteLength ||
            bytes.byteLength > MAX_BYTES
          )
            throw new Error('Invalid export');
          const saved = await saveFile(
            new Blob([
              new Uint8Array(
                bytes instanceof ArrayBuffer ? bytes : bytes.slice(),
              ),
            ]),
            name,
          );
          if (!disposed)
            reply(resultType, { requestId, ok: true, cancelled: !saved });
        } else {
          if (message.kind !== 'state' && message.kind !== 'battery')
            throw new Error('Invalid import');
          const file = await pickFile(message.kind);
          if (file && (!file.size || file.size > MAX_BYTES))
            throw new Error('Invalid file size');
          const bytes = file ? await file.arrayBuffer() : undefined;
          if (!disposed)
            reply(resultType, {
              requestId,
              ok: true,
              cancelled: !file,
              bytes,
              name: file?.name,
            });
        }
      } catch {
        if (!disposed) reply(resultType, { requestId, ok: false });
      } finally {
        busy = false;
      }
    },
    dispose() {
      disposed = true;
    },
  };
}
