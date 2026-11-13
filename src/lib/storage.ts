import { data } from '../data/db';

const emulatorDatabases = [
  'EmulatorJS-roms',
  'EmulatorJS-bios',
  'EmulatorJS-core',
  'EmulatorJS-states',
  '/data/saves',
  'pocket-gba-checkpoints',
];

export async function clearEmulatorStorage() {
  // Older webviews do not implement databases(); only delete our known stores.
  let names = emulatorDatabases;
  if (typeof indexedDB.databases === 'function') {
    try {
      const databases = await indexedDB.databases();
      names = emulatorDatabases.filter((name) =>
        databases.some((db) => db.name === name),
      );
    } catch {
      // Enumeration is best effort; the fixed list is safe on shared origins.
    }
  }
  await Promise.all(
    names.map(
      (name) =>
        new Promise<void>((resolve, reject) => {
          const req = indexedDB.deleteDatabase(name);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
          req.onblocked = () =>
            reject(
              new Error(
                'Close other Pocket GBA windows or tabs, then try clearing data again.',
              ),
            );
        }),
    ),
  );
}

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
  await clearEmulatorStorage();
  for (const key of Object.keys(localStorage))
    if (
      key.startsWith('ejs') ||
      key.startsWith('EJS') ||
      key.startsWith('EmulatorJS')
    )
      localStorage.removeItem(key);
}
