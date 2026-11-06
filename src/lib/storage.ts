import { data } from '../data/db';
export async function storageStatus() {
  const [estimate, persistent] = await Promise.all([
    navigator.storage?.estimate?.(),
    navigator.storage?.persisted?.(),
  ]);
  return {
    usage: estimate?.usage ?? 0,
    quota: estimate?.quota ?? 0,
    persistent: persistent ?? false,
  };
}
export async function clearAllData() {
  await data.clear();
  // Remove EmulatorJS saves, states, ROM/core caches as well as app records.
  const databases = await indexedDB.databases();
  await Promise.all(
    databases
      .filter(
        (db) =>
          db.name &&
          (/^EmulatorJS/i.test(db.name) ||
            db.name === '/data/saves' ||
            db.name === 'pocket-gba-checkpoints'),
      )
      .map(
        (db) =>
          new Promise<void>((resolve, reject) => {
            const req = indexedDB.deleteDatabase(db.name!);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
            req.onblocked = () =>
              reject(
                new Error(
                  'Close other Pocket GBA tabs, then try clearing data again.',
                ),
              );
          }),
      ),
  );
  for (const key of Object.keys(localStorage))
    if (
      key.startsWith('ejs') ||
      key.startsWith('EJS') ||
      key.startsWith('EmulatorJS')
    )
      localStorage.removeItem(key);
}
