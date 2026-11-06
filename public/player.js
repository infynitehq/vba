/* EmulatorJS 4.2.3 adapter. Intentionally isolated from the React window. */
(() => {
  const params = new URLSearchParams(location.search);
  const gameId = params.get('gameId');
  const channel = params.get('channel');
  const send = (type, payload = {}) =>
    parent.postMessage(
      { source: 'pocket-gba-player', channel, type, ...payload },
      location.origin,
    );
  let db,
    gameUrl,
    started = false,
    pendingCheats = [];
  let saveTask = Promise.resolve();
  let launchedCheats;
  let previousSave;
  let autoSaveOnExit = true;
  let checkpointPending = false;
  let checkpointReadable = true;
  let checkpointReady = Promise.resolve();
  let flushTask = Promise.resolve();
  let exitTask;
  let exiting = false;
  const message = document.getElementById('message');
  const report = (error) => {
    message.hidden = false;
    message.textContent =
      error instanceof Error ? error.message : String(error);
    send('error', { message: message.textContent });
  };
  // The pinned core stores this promise without awaiting it or attaching a
  // rejection handler. Safari's denial is just "Permission was denied", so it
  // cannot safely be identified by the global error handler below. Handle the
  // optional request at its source, while preserving its result for callers.
  // This navigator belongs to the player frame; React owns the app's wake lock.
  if (navigator.wakeLock?.request) {
    const wakeLock = navigator.wakeLock;
    const requestWakeLock = wakeLock.request.bind(wakeLock);
    wakeLock.request = (...args) => {
      const result = requestWakeLock(...args);
      void result.catch(() => {});
      return result;
    };
  }
  const request = (req) =>
    new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  let keyboardHeld = false,
    appHeld = false;
  const doubleTapMs = 300;
  let pressedAt = null,
    lastTapAt = null;
  function updateSpeedHold(source, held) {
    const previous = source === 'keyboard' ? keyboardHeld : appHeld;
    if (previous === held) return;
    if (source === 'keyboard') keyboardHeld = held;
    else appHeld = held;
    const now = performance.now();
    if (held) {
      pressedAt = now;
    } else if (pressedAt !== null) {
      const tapped = now - pressedAt <= doubleTapMs;
      pressedAt = null;
      if (tapped && lastTapAt !== null && now - lastTapAt <= doubleTapMs) {
        lastTapAt = null;
        const emulator = window.EJS_emulator;
        try {
          const enabled = emulator.getSettingValue('fastForward') === 'enabled';
          emulator.changeSettingOption('slowMotion', 'disabled');
          if (!enabled) emulator.changeSettingOption('ff-ratio', '3.0');
          emulator.changeSettingOption(
            'fastForward',
            enabled ? 'disabled' : 'enabled',
          );
        } catch {
          send('speed-error', {
            message:
              'Fast forward could not be changed. Your game is still running. Try again.',
          });
        }
      } else {
        lastTapAt = tapped ? now : null;
      }
    }
    refreshSpeed();
  }
  function refreshSpeed() {
    if (!started) return;
    const emulator = window.EJS_emulator;
    const enabled =
      keyboardHeld ||
      appHeld ||
      emulator.getSettingValue('fastForward') === 'enabled';
    try {
      const slow =
        !enabled && emulator.getSettingValue('slowMotion') === 'enabled';
      if (Boolean(emulator.isSlowMotion) !== slow) {
        emulator.gameManager.toggleSlowMotion(slow ? 1 : 0);
        emulator.isSlowMotion = slow;
      }
      if (Boolean(emulator.isFastForward) === enabled) return;
      // Temporarily change the native speed without changing the user's menu
      // preference. Release restores whichever mode that menu currently selects.
      emulator.gameManager.toggleFastForward(enabled ? 1 : 0);
      emulator.isFastForward = enabled;
    } catch {
      send('speed-error', {
        message:
          'Fast forward could not be changed. Your game is still running. Try again.',
      });
    }
  }
  function releaseSpeed() {
    keyboardHeld = false;
    appHeld = false;
    pressedAt = null;
    lastTapAt = null;
    refreshSpeed();
  }
  window.addEventListener(
    'keydown',
    (event) => {
      if (
        !started ||
        event.code !== 'Space' ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      )
        return;
      if (
        event.target instanceof Element &&
        event.target.closest(
          'input, textarea, select, button, a, summary, [contenteditable], [role="button"]',
        )
      )
        return;
      // Leave Space's normal behavior intact in the native settings/popups.
      if (
        window.EJS_emulator.settingsMenu.style.display !== 'none' ||
        window.EJS_emulator.isPopupOpen() ||
        document.querySelector('dialog[open]')
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat && !keyboardHeld) {
        updateSpeedHold('keyboard', true);
      }
    },
    true,
  );
  window.addEventListener(
    'keyup',
    (event) => {
      if (event.code === 'Space' && keyboardHeld) {
        event.preventDefault();
        event.stopImmediatePropagation();
        updateSpeedHold('keyboard', false);
      }
    },
    true,
  );
  window.addEventListener('blur', releaseSpeed);
  function applyCheats(cheats) {
    pendingCheats = cheats;
    if (!started) return;
    const enabled = cheats.filter((cheat) => cheat.enabled);
    const codes = enabled.map((cheat) => cheat.code.replace(/\n/g, '+'));
    const signature = JSON.stringify(codes);
    if (launchedCheats !== undefined) {
      send('cheats-pending', { pending: signature !== launchedCheats });
      return;
    }
    // The pinned mGBA reset path frees master-code hooks without restoring
    // their ROM instructions. Reinstalling a hook can execute a breakpoint as
    // its own original instruction and hang the browser. Never reset/rebuild
    // live cheats. A fresh player applies the selected codes once, in order.
    // One call also avoids frontend reapplication between individual entries.
    launchedCheats = signature;
    try {
      if (codes.length)
        window.EJS_emulator.gameManager.setCheat(0, true, codes.join('+'));
    } catch (error) {
      for (const cheat of enabled)
        send('cheat-error', { label: cheat.label, message: String(error) });
      return;
    }
    send('cheats-applied', { count: enabled.length });
  }
  function trackSave(save) {
    if (!save?.length) return;
    const snapshot = new Uint8Array(save);
    saveTask = saveTask
      .then(async () => {
        if (
          previousSave?.length === snapshot.length &&
          snapshot.every((byte, index) => byte === previousSave[index])
        )
          return;
        const manager = window.EJS_emulator.gameManager;
        await new Promise((resolve, reject) =>
          manager.FS.syncfs(false, (error) =>
            error ? reject(error) : resolve(),
          ),
        );
        // Only timestamp a nonempty save after the filesystem confirms persistence.
        await new Promise((resolve, reject) => {
          const transaction = db.transaction('games', 'readwrite');
          const store = transaction.objectStore('games');
          const read = store.get(gameId);
          read.onsuccess = () => {
            if (read.result)
              store.put({ ...read.result, lastSavedAt: Date.now() });
          };
          transaction.oncomplete = resolve;
          transaction.onabort = () => reject(transaction.error);
          transaction.onerror = () => reject(transaction.error);
        });
        previousSave = snapshot;
        send('saved');
      })
      .catch(() => {
        // Preserve the previous timestamp on failure; retry on the next save.
      });
  }
  function flush({ checkpoint = false } = {}) {
    if (!started || exiting) return flushTask;
    const manager = window.EJS_emulator.gameManager;
    let state;
    let captureError;
    // Capture synchronously: pagehide/visibilitychange cannot wait for a queue.
    try {
      manager.saveSaveFiles();
    } catch (error) {
      captureError = error;
    }
    if (checkpoint) {
      try {
        if (!checkpointReadable)
          throw new Error('The previous checkpoint could not be loaded.');
        if (!window.PocketCheckpoints)
          throw new Error('Checkpoint support did not load. Reload the app.');
        state = new Uint8Array(manager.getState());
        if (!state.byteLength) throw new Error('The checkpoint is empty.');
      } catch (error) {
        captureError = error;
      }
    }
    // Queue writes so an earlier background save cannot replace an exit save.
    const task = flushTask
      .catch(() => {})
      .then(async () => {
        const battery = (async () => {
          await saveTask;
          await new Promise((resolve, reject) =>
            manager.FS.syncfs(false, (error) =>
              error ? reject(error) : resolve(),
            ),
          );
        })();
        // A failed battery flush must not prevent the independent snapshot backup.
        const results = await Promise.allSettled([
          battery,
          state ? window.PocketCheckpoints.save(gameId, state) : undefined,
        ]);
        const failure = results.find((result) => result.status === 'rejected');
        if (captureError) throw captureError;
        if (failure) throw failure.reason;
      });
    flushTask = task;
    return task;
  }
  async function prepareCheckpoint() {
    if (!autoSaveOnExit || !window.PocketCheckpoints) return;
    checkpointPending = true;
    const emulator = window.EJS_emulator;
    let resumePlayback = false;
    try {
      // Don't capture the title screen while a previous checkpoint is offered.
      const checkpoint = await window.PocketCheckpoints.load(gameId);
      if (!checkpoint) return;
      resumePlayback = !emulator.paused;
      emulator.pause();
      if (await window.PocketCheckpoints.offerResume(emulator, checkpoint)) {
        emulator.gameManager.loadState(checkpoint.state);
        emulator.displayMessage('Automatic checkpoint loaded');
      }
    } catch {
      checkpointReadable = false;
      send('error', {
        message:
          'Your automatic checkpoint could not be loaded. It has been kept unchanged. Turn off Save checkpoint on exit to play without replacing it.',
      });
    } finally {
      checkpointPending = false;
      if (resumePlayback) emulator.play();
    }
  }
  function exitGame() {
    if (exitTask) return exitTask;
    exitTask = (async () => {
      releaseSpeed();
      await checkpointReady;
      const emulator = window.EJS_emulator;
      const resumePlayback = started && !emulator.paused;
      if (started) emulator.pause();
      message.hidden = false;
      message.textContent = 'Saving before exit…';
      try {
        await flush({ checkpoint: autoSaveOnExit });
        exiting = true;
        send('request-exit');
      } catch {
        message.hidden = true;
        send('error', {
          message:
            'Progress could not be saved. Your game is still open. Free browser storage or back up your saves, then try exiting again.',
        });
        if (resumePlayback) emulator.play();
      } finally {
        exitTask = undefined;
      }
    })();
    return exitTask;
  }
  function saveInBackground() {
    releaseSpeed();
    if (checkpointPending || exiting) return flushTask.catch(() => {});
    return flush({ checkpoint: autoSaveOnExit }).catch(() => {
      send('error', {
        message:
          'The background save failed. Keep this game open and back up your progress before closing the app.',
      });
    });
  }
  async function changeAutoSave(enabled) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('games', 'readwrite');
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
      const store = tx.objectStore('games');
      const req = store.get(gameId);
      req.onsuccess = () => {
        if (req.result) store.put({ ...req.result, autoSaveOnExit: enabled });
        else tx.abort();
      };
    });
    autoSaveOnExit = enabled;
  }
  window.addEventListener('message', async (event) => {
    if (
      event.origin !== location.origin ||
      event.source !== parent ||
      event.data?.source !== 'pocket-gba-app' ||
      event.data.channel !== channel
    )
      return;
    if (event.data.type === 'apply-cheats' && Array.isArray(event.data.cheats))
      applyCheats(event.data.cheats);
    if (
      event.data.type === 'fast-forward-held' &&
      typeof event.data.held === 'boolean'
    ) {
      updateSpeedHold('app', event.data.held);
    }
    if (event.data.type === 'exit') {
      await exitGame();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      void saveInBackground();
    }
  });
  window.addEventListener('pagehide', () => {
    // Keep the app database open until pending save timestamps are committed.
    void saveInBackground().finally(() => db?.close());
    if (gameUrl) URL.revokeObjectURL(gameUrl);
  });
  window.addEventListener('error', (event) =>
    report(
      new Error(
        event.message ||
          'The emulator could not load. Return to the library and try again.',
      ),
    ),
  );
  window.addEventListener('unhandledrejection', (event) => {
    // The native core also requests a wake lock without handling denial.
    // React manages the optional wake lock and handles denied requests.
    if (/wake lock/i.test(String(event.reason?.message ?? event.reason))) {
      event.preventDefault();
      return;
    }
    report(event.reason);
  });
  (async () => {
    if (!gameId)
      throw new Error('No game was selected. Return to your library.');
    const open = indexedDB.open('pocket-gba', 1);
    open.onupgradeneeded = () => {
      open.transaction.abort();
    };
    db = await request(open);
    const game = await request(
      db.transaction('games').objectStore('games').get(gameId),
    );
    if (!game) throw new Error('This game is not in your library.');
    autoSaveOnExit = game.autoSaveOnExit !== false;
    pendingCheats = await request(
      db
        .transaction('cheats')
        .objectStore('cheats')
        .index('gameId')
        .getAll(gameId),
    );
    pendingCheats.sort((a, b) => a.createdAt - b.createdAt);
    gameUrl = URL.createObjectURL(game.blob);
    // Always self-hosted. Neither query parameters nor a CDN can redirect the runtime.
    const path = new URL('./emulatorjs/', location.href).href;
    Object.assign(window, {
      EJS_player: '#game',
      EJS_core: 'gba',
      EJS_gameUrl: gameUrl,
      // Stable content hash makes save identity survive re-imports and renames.
      EJS_gameName: `pocket-${game.id}.gba`,
      EJS_gameID: parseInt(game.hash.slice(0, 8), 16),
      EJS_pathtodata: path,
      EJS_startOnLoaded: true,
      EJS_color: '#d64024',
      EJS_language: 'en-US',
      // 4.2.3 loader checks !== false (opposite the current docs).
      EJS_disableAutoLang: false,
      EJS_threads: false,
      EJS_disableLocalStorage: true,
      EJS_defaultOptions: {
        'save-state-location': 'browser',
        'save-save-interval': '30',
      },
      EJS_Buttons: {
        ...window.PocketToolbar.options,
        cheat: { visible: false }, // Pocket GBA owns enabled state; no competing menu.
        netplay: { visible: false },
        cacheManager: { visible: false },
        exitEmulation: {
          ...window.PocketToolbar.options.exitEmulation,
          visible: true,
          callback: exitGame,
        },
      },
      // The native UI submits every configured code before onGameStart, even
      // unchecked ones. mGBA ignores that enabled flag, so a disabled bad code
      // can crash startup before our enabled-only reconciliation runs.
      // Pocket owns cheats; submit them only through applyCheats after startup.
      EJS_cheats: [],
      EJS_ready: () => {
        message.hidden = true;
        const emulator = window.EJS_emulator;
        // A tap on the library belongs to the parent document, not this frame.
        // On iOS, create the core's audio context during a real player gesture,
        // after downloads finish, rather than auto-starting with blocked audio.
        if (emulator.isSafari && emulator.isMobile) {
          const startGame = emulator.startGame.bind(emulator);
          emulator.startGame = () => {
            const gate = document.getElementById('start-gate');
            const button = document.getElementById('start-game');
            gate.hidden = false;
            button.addEventListener(
              'click',
              () => {
                gate.hidden = true;
                emulator.startGame = startGame;
                startGame();
              },
              { once: true },
            );
          };
        }
        const original = emulator.startGameError.bind(emulator);
        emulator.startGameError = (text) => {
          report(new Error(text));
          return original(text);
        };
      },
      EJS_onGameStart: () => {
        started = true;
        message.hidden = true;
        // The settings menu is rebuilt during core startup, after EJS_ready.
        // Reconcile temporary holds with permanent native-menu changes.
        const emulator = window.EJS_emulator;
        emulator.on('saveSaveFiles', trackSave);
        // 4.2.3 passes missing browser states to the core, producing an
        // unhandled rejection and a permanent fatal-error overlay.
        emulator.on('loadState', async () => {
          try {
            const fromBrowser =
              emulator.getSettingValue('save-state-location') === 'browser' &&
              emulator.saveInBrowserSupported();
            const state = fromBrowser
              ? await emulator.storage.states.get(
                  `${emulator.getBaseFileName()}.state`,
                )
              : new Uint8Array(
                  await (await emulator.selectFile()).arrayBuffer(),
                );
            if (!state?.byteLength) {
              send('error', {
                message: 'There is no saved state yet. Save a state first.',
              });
              return;
            }
            emulator.gameManager.loadState(state);
            if (fromBrowser)
              emulator.displayMessage(
                emulator.localization('SAVE LOADED FROM BROWSER'),
              );
          } catch {
            send('error', {
              message: 'The saved state could not be loaded. Try again.',
            });
          }
        });
        window.PocketToolbar.install(emulator, {
          onOpen: releaseSpeed,
          onSpeedError: () =>
            send('speed-error', {
              message: 'Game speed could not be changed. Try again.',
            }),
          onExit: exitGame,
          autoSaveOnExit,
          onAutoSaveChange: changeAutoSave,
        });
        const changeSetting = emulator.changeSettingOption.bind(emulator);
        emulator.changeSettingOption = (...args) => {
          const result = changeSetting(...args);
          if (
            ['fastForward', 'ff-ratio', 'slowMotion', 'sm-ratio'].includes(
              args[0],
            )
          )
            refreshSpeed();
          return result;
        };
        applyCheats(pendingCheats);
        checkpointReady = prepareCheckpoint();
        send('ready');
      },
      EJS_onSaveSave: ({ save }) => {
        if (!save?.length) {
          send('error', {
            message:
              'There is no battery save to back up yet. Save inside your game first.',
          });
          return;
        }
        const url = URL.createObjectURL(new Blob([save]));
        const link = document.createElement('a');
        link.href = url;
        link.download = `${game.name.replace(/[^a-z0-9 _-]/gi, '_')}.sav`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
    });
    const loader = document.createElement('script');
    loader.src = `${path}loader.js`;
    loader.onerror = () =>
      report(
        new Error(
          'The emulator files are missing. Connect to the internet and try again, or ask the host to run pnpm fetch-emulator.',
        ),
      );
    document.body.appendChild(loader);
  })().catch(report);
})();
