import { test, expect } from '@playwright/test';
import { diagnosticRom } from './fixtures/diagnostic-rom';

test('re-import repairs an unreadable legacy ROM without losing its identity or metadata', async ({
  page,
}) => {
  const file = {
    name: 'Repair test.gba',
    mimeType: 'application/octet-stream',
    buffer: diagnosticRom(),
  };
  await page.goto('/');
  await page.getByTestId('game-upload').setInputFiles(file);
  await page.getByRole('button', { name: 'Got it' }).click();
  const id = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open('pocket-gba', 1);
      req.onsuccess = () => resolve(req.result);
    });
    const tx = db.transaction('games', 'readwrite');
    const store = tx.objectStore('games');
    let id = '';
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result!;
      const game = cursor.value;
      id = game.id;
      cursor.update({
        ...game,
        blob: new Blob([game.blob]),
        name: 'My renamed game',
        lastSavedAt: 1234,
        autoSaveOnExit: false,
      });
    };
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
    db.close();
    return id;
  });
  await page.addInitScript(() => {
    if (location.pathname.endsWith('/player.html')) {
      Blob.prototype.arrayBuffer = () =>
        Promise.reject(
          new DOMException(
            'The object can not be found here.',
            'NotFoundError',
          ),
        );
    }
  });
  await page.reload();
  await page.getByRole('link', { name: 'Play My renamed game' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Notification' }),
  ).toContainText('select the same original game file');
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.goto('/');
  await page.getByTestId('game-upload').setInputFiles(file);
  await expect(
    page.getByRole('dialog', { name: 'Notification' }),
  ).toContainText('local game file was refreshed');
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(
    page.getByRole('link', { name: 'Play My renamed game' }),
  ).toHaveCount(1);
  const repaired = await page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open('pocket-gba', 1);
      req.onsuccess = () => resolve(req.result);
    });
    const game = await new Promise<Record<string, unknown>>((resolve) => {
      const req = db.transaction('games').objectStore('games').get(id);
      req.onsuccess = () => resolve(req.result);
    });
    db.close();
    return {
      binary: game.blob instanceof ArrayBuffer,
      name: game.name,
      lastSavedAt: game.lastSavedAt,
      autoSaveOnExit: game.autoSaveOnExit,
    };
  }, id);
  expect(repaired).toEqual({
    binary: true,
    name: 'My renamed game',
    lastSavedAt: 1234,
    autoSaveOnExit: false,
  });
  await page.getByRole('link', { name: 'Play My renamed game' }).click();
  await expect(page.frameLocator('iframe').locator('canvas')).toBeVisible({
    timeout: 45_000,
  });
});
