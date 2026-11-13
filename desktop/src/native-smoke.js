// Injected only into explicitly opted-in DEBUG native builds. No IPC mocks:
// this exercises the bundled React app, actual WebView, mGBA WASM and IndexedDB.
(() => {
  // WKWebView can inject into its initial about:blank document. In particular,
  // new URL(path, "null") cannot deliver a report from that document.
  const local =
    (location.protocol === 'tauri:' && location.hostname === 'localhost') ||
    (['http:', 'https:'].includes(location.protocol) &&
      location.hostname === 'tauri.localhost') ||
    (location.protocol === 'http:' &&
      location.hostname === '127.0.0.1' &&
      location.port === '1420');
  if (!local || location.pathname.startsWith('/__smoke_')) return;
  if (window !== window.top) {
    const reportFrameError = (error) =>
      parent.postMessage(
        {
          source: 'pocket-gba-native-smoke',
          name: String(error?.name ?? ''),
          message: String(error?.message ?? error),
          stack: String(error?.stack ?? ''),
        },
        location.origin,
      );
    addEventListener('error', (event) =>
      reportFrameError(event.error ?? event.message),
    );
    addEventListener('unhandledrejection', (event) =>
      reportFrameError(event.reason),
    );
    return;
  }
  const stageKey = 'pocket-gba-native-smoke';
  let stage = 'initializing';
  const errors = [];
  const addError = (error) => {
    const text = String(error?.stack || error?.message || error).slice(0, 1000);
    if (errors.length < 8 && !errors.includes(text)) errors.push(text);
  };
  addEventListener('error', (event) => addError(event.error ?? event.message));
  addEventListener('unhandledrejection', (event) => addError(event.reason));
  addEventListener('message', (event) => {
    if (
      event.origin !== location.origin ||
      event.source !== document.querySelector('iframe')?.contentWindow
    )
      return;
    const data = event.data;
    if (
      (data?.source === 'pocket-gba-player' && data.type === 'error') ||
      data?.source === 'pocket-gba-native-smoke'
    ) {
      const message = [
        data.source,
        data.name,
        data.phase,
        data.message,
        data.stack,
      ]
        .filter(Boolean)
        .join('\n');
      addError(message);
    }
  });
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const wait = async (test, label) => {
    stage = label;
    for (let i = 0; i < 480; i++) {
      const value = await test();
      if (value) return value;
      await sleep(100);
    }
    throw new Error(`Timed out: ${label}`);
  };
  const request = (req) =>
    new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  const snapshot = () => {
    const frame = document.querySelector('iframe');
    let player;
    try {
      const win = frame?.contentWindow;
      player = frame && {
        url: win.location.href,
        readyState: win.document.readyState,
        message: win.document
          .querySelector('#message')
          ?.textContent?.slice(0, 500),
        started: Boolean(win.EJS_emulator?.started),
        dom: win.document.body?.innerHTML.slice(0, 1800),
      };
    } catch (error) {
      player = { error: String(error) };
    }
    return {
      stage,
      capturedAt: new Date().toISOString(),
      errors: [...errors],
      url: location.href,
      readyState: document.readyState,
      root: document.querySelector('#root')?.innerHTML.slice(0, 1800),
      dialogs: [
        ...document.querySelectorAll(
          '[role="dialog"], [role="alertdialog"], dialog[open]',
        ),
      ]
        .slice(0, 3)
        .map((node) => node.textContent.slice(0, 500)),
      player,
      userAgent: navigator.userAgent,
    };
  };
  const deliver = (path, result) => {
    const url = new URL(path, location.href);
    url.searchParams.set('result', JSON.stringify(result));
    // Native navigation intercepts and cancels this URL: the document stays
    // alive, including its iframe, timers, and ephemeral IndexedDB.
    location.assign(url.href);
  };
  let finished = false;
  const heartbeat = () => {
    // A navigation cancelled during the initial document load can abort parsing
    // and leave WKWebView blank. Only send diagnostics after loading completes.
    if (!finished && document.readyState === 'complete')
      deliver('/__smoke_progress', snapshot());
  };
  const heartbeatTimer = setInterval(heartbeat, 1000);
  const report = (result) => {
    finished = true;
    clearInterval(heartbeatTimer);
    sessionStorage.removeItem(stageKey);
    deliver('/__smoke_report', {
      ...snapshot(),
      ...result,
      ok: result.ok === true && errors.length === 0,
    });
  };
  const button = (text) =>
    [...document.querySelectorAll('button')].find(
      (node) =>
        node.textContent.trim() === text ||
        node.getAttribute('aria-label') === text,
    );
  const transaction = (db, store, operation) =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      operation(tx.objectStore(store));
      tx.oncomplete = resolve;
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
  const rom = () => {
    const bytes = new Uint8Array(1024);
    const words = new DataView(bytes.buffer);
    words.setUint32(0, 0xea00002e, true);
    for (const [offset, text] of [
      [0xa0, 'DISPLAY TEST'],
      [0xac, 'TEST'],
      [0xb0, '00'],
    ]) {
      bytes.set(new TextEncoder().encode(text), offset);
    }
    bytes[0xb2] = 0x96;
    let checksum = 0;
    for (let i = 0xa0; i <= 0xbc; i++) checksum -= bytes[i];
    bytes[0xbd] = (checksum - 0x19) & 255;
    [
      0xe59f0024,
      0xe3a01c04,
      0xe2811003,
      0xe1c010b0,
      0xe59f0018,
      0xe3a0101f,
      0xe59f2014,
      0xe0c010b2,
      0xe2522001,
      0x1afffffc,
      0xeafffffe,
      0x04000000,
      0x06000000,
      240 * 160,
    ].forEach((word, index) => words.setUint32(0xc0 + index * 4, word, true));
    return bytes;
  };
  (async () => {
    await wait(
      () => document.querySelector('#root')?.children.length,
      'React mounted',
    );
    let game = JSON.parse(sessionStorage.getItem(stageKey) || 'null');
    if (!game) {
      stage = 'seed original diagnostic ROM';
      const bytes = rom();
      const digest = await crypto.subtle.digest('SHA-1', bytes);
      const hash = [...new Uint8Array(digest)]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      const db = await request(indexedDB.open('pocket-gba', 1));
      const existing = await request(
        db.transaction('games').objectStore('games').index('hash').get(hash),
      );
      if (existing)
        throw new Error(
          'Diagnostic ROM already exists; use a fresh native test profile',
        );
      game = {
        id: crypto.randomUUID(),
        hash,
        name: 'Native smoke diagnostic',
        filename: 'Native smoke diagnostic.gba',
        blob: bytes.buffer,
        size: bytes.length,
        gameCode: 'TEST',
        makerCode: '00',
        version: 0,
        addedAt: Date.now(),
        lastPlayedAt: null,
        autoSaveOnExit: true,
      };
      await transaction(db, 'games', (store) => store.add(game));
      db.close();
      sessionStorage.setItem(stageKey, JSON.stringify({ id: game.id, hash }));
      location.reload();
      return;
    }
    (
      await wait(
        () => document.querySelector(`a[href="/play/${game.id}"]`),
        'Library diagnostic entry',
      )
    ).click();
    const emulator = await wait(() => {
      const frame = document.querySelector('iframe');
      const value = frame?.contentWindow?.EJS_emulator;
      return value?.started && value.gameManager ? value : null;
    }, 'real EmulatorJS started');
    const frames = await wait(() => {
      const frame = emulator.gameManager.getFrameNum();
      return frame > 120 ? frame : null;
    }, 'mGBA advanced beyond 120 frames');
    const stateBytes = emulator.gameManager.getState().byteLength;
    if (stateBytes < 1024)
      throw new Error(`Unexpected mGBA state size: ${stateBytes}`);
    (await wait(() => button('Library'), 'Library safe-exit control')).click();
    (await wait(() => button('Exit game'), 'Exit game confirmation')).click();
    await wait(
      () =>
        !document.querySelector('iframe') &&
        document.querySelector(`a[href="/play/${game.id}"]`),
      'safe exit completed',
    );
    const db = await request(indexedDB.open('pocket-gba-checkpoints', 1));
    const checkpoint = await request(
      db.transaction('checkpoints').objectStore('checkpoints').get(game.id),
    );
    db.close();
    const current = checkpoint?.current;
    if (
      current?.version !== 1 ||
      current.state?.byteLength < 1024 ||
      !current.savedAt
    ) {
      throw new Error('No real persisted checkpoint after safe exit');
    }
    // Remove only this harness's own game/checkpoint, never user data.
    const games = await request(indexedDB.open('pocket-gba', 1));
    await transaction(games, 'games', (store) => store.delete(game.id));
    games.close();
    const checkpoints = await request(
      indexedDB.open('pocket-gba-checkpoints', 1),
    );
    await transaction(checkpoints, 'checkpoints', (store) =>
      store.delete(game.id),
    );
    checkpoints.close();
    report({
      ok: true,
      frames,
      stateBytes,
      checkpointBytes: current.state.byteLength,
    });
  })().catch((error) =>
    report({ ok: false, error: String(error?.stack || error) }),
  );
})();
