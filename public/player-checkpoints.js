/* Automatic checkpoints are separate from EmulatorJS's manual save-state slot. */
(() => {
  const request = (req) =>
    new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  async function open() {
    const req = indexedDB.open('pocket-gba-checkpoints', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('checkpoints');
    };
    return request(req);
  }
  const valid = (checkpoint) =>
    checkpoint?.version === 1 && checkpoint.state?.byteLength > 0;
  async function load(gameId) {
    const db = await open();
    try {
      const record = await request(
        db.transaction('checkpoints').objectStore('checkpoints').get(gameId),
      );
      if (!record) return null;
      if (valid(record.current)) return record.current;
      if (valid(record.previous)) return record.previous;
      throw new Error('The automatic checkpoint could not be read.');
    } finally {
      db.close();
    }
  }
  async function save(gameId, state) {
    if (!state?.byteLength) throw new Error('The checkpoint is empty.');
    // Core memory can change while IndexedDB is opening. Own the bytes now.
    const snapshot = new Uint8Array(state);
    const db = await open();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('checkpoints', 'readwrite');
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error || new Error('Checkpoint aborted.'));
        tx.onerror = () => reject(tx.error);
        const store = tx.objectStore('checkpoints');
        const req = store.get(gameId);
        req.onsuccess = () => {
          const old = req.result;
          store.put(
            {
              current: { version: 1, state: snapshot, savedAt: Date.now() },
              previous: valid(old?.current) ? old.current : old?.previous,
            },
            gameId,
          );
        };
      });
    } finally {
      db.close();
    }
  }
  function offerResume(emulator, checkpoint) {
    return new Promise((resolve) => {
      const dialog = document.createElement('dialog');
      dialog.className = 'pocket-confirm';
      dialog.setAttribute('aria-labelledby', 'checkpoint-title');
      dialog.setAttribute('aria-describedby', 'checkpoint-description');
      dialog.innerHTML =
        '<span class="pocket-confirm-logo" aria-hidden="true"></span><h2 id="checkpoint-title">Resume last checkpoint?</h2><p id="checkpoint-description"></p><div class="pocket-confirm-actions"><button type="button" data-checkpoint-fresh>Start from game save</button><button type="button" data-checkpoint-resume autofocus>Resume checkpoint</button></div>';
      dialog.querySelector('#checkpoint-description').textContent =
        `Your exact game position was saved ${new Date(checkpoint.savedAt).toLocaleString()}. Your manual save state is separate.`;
      let resume = false;
      dialog.querySelector('[data-checkpoint-resume]').onclick = () => {
        resume = true;
        dialog.close();
      };
      dialog.querySelector('[data-checkpoint-fresh]').onclick = () =>
        dialog.close();
      // Escape must not silently choose an older in-game save.
      dialog.addEventListener('cancel', (event) => event.preventDefault());
      for (const type of [
        'keydown',
        'keyup',
        'pointerdown',
        'mousedown',
        'touchstart',
      ])
        dialog.addEventListener(type, (event) => event.stopPropagation());
      dialog.addEventListener(
        'close',
        () => {
          dialog.remove();
          resolve(resume);
        },
        { once: true },
      );
      emulator.elements.parent.appendChild(dialog);
      dialog.showModal();
    });
  }
  window.PocketCheckpoints = { load, save, offerResume };
})();
