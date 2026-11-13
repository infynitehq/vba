import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../../src/components/ErrorPage', () => ({ RouteError: () => null }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function renderStatus(
  status: { ready: boolean; error: string },
  mode = 'production',
) {
  vi.stubEnv('MODE', mode);
  const { Shell } = await import('../../src/components/Shell');
  const { OfflineContext } =
    await import('../../src/components/OfflineContext');
  return renderToStaticMarkup(
    createElement(
      OfflineContext.Provider,
      { value: status },
      createElement(Shell, { children: 'Library', fitViewport: true }),
    ),
  );
}

it('announces web offline readiness', async () => {
  expect(await renderStatus({ ready: true, error: '' })).toContain(
    '<span role="status">Ready offline</span>',
  );
});

it('announces offline preparation', async () => {
  expect(await renderStatus({ ready: false, error: '' })).toContain(
    '<span role="status">Preparing offline…</span>',
  );
});

it('keeps offline setup errors accessible instead of claiming readiness', async () => {
  const html = await renderStatus({
    ready: true,
    error: 'Browser storage is unavailable.',
  });
  expect(html).toContain('Offline setup unavailable');
  expect(html).toContain(
    'aria-label="Offline setup unavailable: Browser storage is unavailable."',
  );
  expect(html).not.toContain('Ready offline');
});

it('describes desktop assets as bundled', async () => {
  expect(await renderStatus({ ready: true, error: '' }, 'desktop')).toContain(
    '<span role="status">Bundled for offline play</span>',
  );
});
