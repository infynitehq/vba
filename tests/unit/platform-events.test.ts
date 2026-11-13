import { afterEach, expect, it, vi } from 'vitest';

const { listen } = vi.hoisted(() => ({ listen: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.resetAllMocks();
});

it('never loads native menu listeners on the web', async () => {
  vi.stubEnv('MODE', 'production');
  const { onOpenGame } = await import('../../src/platform/events');
  onOpenGame(vi.fn(), vi.fn())();
  expect(listen).not.toHaveBeenCalled();
});

it('handles menu events only while the library listener is active', async () => {
  vi.stubEnv('MODE', 'desktop');
  const unlisten = vi.fn();
  listen.mockResolvedValue(unlisten);
  const { onOpenGame } = await import('../../src/platform/events');
  const open = vi.fn();
  const dispose = onOpenGame(open, vi.fn());
  await vi.waitFor(() => expect(listen).toHaveBeenCalledOnce());
  expect(listen.mock.calls[0][0]).toBe('desktop:open-game');
  const handler = listen.mock.calls[0][1];
  handler();
  expect(open).toHaveBeenCalledOnce();
  dispose();
  handler();
  expect(open).toHaveBeenCalledOnce();
  expect(unlisten).toHaveBeenCalledOnce();
});

it('cleans up even when unmounted before native registration finishes', async () => {
  vi.stubEnv('MODE', 'desktop');
  const unlisten = vi.fn();
  let finish!: (cleanup: () => void) => void;
  listen.mockImplementation(
    () => new Promise<() => void>((resolve) => (finish = resolve)),
  );
  const { onOpenGame } = await import('../../src/platform/events');
  const open = vi.fn();
  const dispose = onOpenGame(open, vi.fn());
  dispose();
  await vi.waitFor(() => expect(listen).toHaveBeenCalledOnce());
  listen.mock.calls[0][1]();
  expect(open).not.toHaveBeenCalled();
  finish(unlisten);
  await vi.waitFor(() => expect(unlisten).toHaveBeenCalledOnce());
});
