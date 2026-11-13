import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlayerFileRelay } from '../../src/player/files';
import { pickFile, saveFile } from '../../src/platform';

vi.mock('../../src/platform', () => ({ pickFile: vi.fn(), saveFile: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

describe('desktop player file relay', () => {
  it('relays binary exports and acknowledges native cancellation without an error', async () => {
    vi.mocked(saveFile).mockResolvedValue(false);
    const reply = vi.fn();
    const relay = createPlayerFileRelay(reply);
    await relay.receive({
      type: 'export-file',
      requestId: 'save',
      name: 'game.sav',
      bytes: new Uint8Array([1, 2]),
    });
    expect(saveFile).toHaveBeenCalledWith(expect.any(Blob), 'game.sav');
    expect(reply).toHaveBeenCalledWith('export-result', {
      requestId: 'save',
      ok: true,
      cancelled: true,
    });
  });

  it('returns state imports as bytes and handles cancellation', async () => {
    vi.mocked(pickFile)
      .mockResolvedValueOnce(new File(['state'], 'game.state'))
      .mockResolvedValueOnce(null);
    const reply = vi.fn();
    const relay = createPlayerFileRelay(reply);
    await relay.receive({
      type: 'import-file',
      requestId: 'load',
      kind: 'state',
    });
    expect(pickFile).toHaveBeenCalledWith('state');
    expect(reply.mock.calls[0][1].bytes).toBeInstanceOf(ArrayBuffer);
    await relay.receive({
      type: 'import-file',
      requestId: 'cancel',
      kind: 'battery',
    });
    expect(reply.mock.calls[1][1]).toMatchObject({ ok: true, cancelled: true });
  });

  it('rejects unsupported kinds, filenames, empty bytes, and large payloads', async () => {
    const reply = vi.fn();
    const relay = createPlayerFileRelay(reply);
    await relay.receive({
      type: 'import-file',
      requestId: 'kind',
      kind: 'rom',
    });
    await relay.receive({
      type: 'export-file',
      requestId: 'path',
      name: '../save.sav',
      bytes: new Uint8Array([1]),
    });
    await relay.receive({
      type: 'export-file',
      requestId: 'empty',
      name: 'save.sav',
      bytes: new Uint8Array(),
    });
    await relay.receive({
      type: 'export-file',
      requestId: 'large',
      name: 'save.state',
      bytes: new Uint8Array(64 * 1024 * 1024 + 1),
    });
    expect(pickFile).not.toHaveBeenCalled();
    expect(saveFile).not.toHaveBeenCalled();
    expect(reply.mock.calls.every(([, result]) => result.ok === false)).toBe(
      true,
    );
  });

  it('deduplicates requests, serializes dialogs, and suppresses replies after unmount', async () => {
    let resolve!: (file: File | null) => void;
    vi.mocked(pickFile).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const reply = vi.fn();
    const relay = createPlayerFileRelay(reply);
    const message = { type: 'import-file', requestId: 'one', kind: 'battery' };
    const pending = relay.receive(message);
    await relay.receive(message);
    await relay.receive({ ...message, requestId: 'two' });
    expect(pickFile).toHaveBeenCalledOnce();
    expect(reply).toHaveBeenCalledWith('import-result', {
      requestId: 'two',
      ok: false,
    });
    relay.dispose();
    resolve(null);
    await pending;
    expect(reply).toHaveBeenCalledOnce();
  });
});
