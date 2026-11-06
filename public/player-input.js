/* Optional eight-direction thumbstick for the native GBA touch surface.
   GBA movement is digital: the stick maps to the same four inputs as the pad. */
(() => {
  function install(emulator) {
    const pad = emulator.virtualGamepad?.querySelector('.b_dpad');
    if (!pad) return null;
    const stick = document.createElement('button');
    stick.type = 'button';
    stick.className = 'pocket-stick';
    stick.setAttribute('aria-label', 'Virtual joystick');
    stick.setAttribute(
      'aria-description',
      'Drag in any direction. Keyboard arrow keys also work.',
    );
    const thumb = document.createElement('span');
    thumb.className = 'pocket-stick-thumb';
    thumb.setAttribute('aria-hidden', 'true');
    stick.append(thumb);
    pad.append(stick);
    let mode = 'dpad';
    const preferenceKey = 'pocket-movement-controls';
    try {
      if (localStorage.getItem(preferenceKey) === 'joystick') mode = 'joystick';
    } catch {
      // Controls still work when browser storage is unavailable.
    }
    let pointer = null;
    let held = [0, 0, 0, 0];
    const keys = new Set();
    const inputs = [4, 5, 6, 7];
    const send = (next) => {
      next.forEach((value, index) => {
        if (value !== held[index])
          emulator.gameManager.simulateInput(0, inputs[index], value);
      });
      held = next;
    };
    const center = () => {
      stick.style.setProperty('--stick-x', '0px');
      stick.style.setProperty('--stick-y', '0px');
      stick.classList.remove('is-held');
      send([0, 0, 0, 0]);
    };
    const release = () => {
      const previous = pointer;
      pointer = null;
      keys.clear();
      center();
      if (previous !== null && stick.hasPointerCapture(previous))
        stick.releasePointerCapture(previous);
      // Native D-pad input can also be held when opening the menu or rotating.
      for (const direction of ['up', 'down', 'left', 'right'])
        pad
          .querySelector('.ejs_dpad_main')
          ?.classList.remove(`ejs_dpad_${direction}_pressed`);
      for (const input of inputs)
        emulator.gameManager.simulateInput(0, input, 0);
    };
    const move = (event) => {
      const rect = stick.getBoundingClientRect();
      const x = event.clientX - rect.left - rect.width / 2;
      const y = event.clientY - rect.top - rect.height / 2;
      const radius = rect.width * 0.28;
      const distance = Math.hypot(x, y);
      const scale = distance > radius ? radius / distance : 1;
      stick.style.setProperty('--stick-x', `${x * scale}px`);
      stick.style.setProperty('--stick-y', `${y * scale}px`);
      if (distance < radius * 0.2) {
        send([0, 0, 0, 0]);
        return;
      }
      // Eight sectors with a 22.5-degree diagonal boundary and a center deadzone.
      const vertical = Math.abs(y) > Math.abs(x) * Math.tan(Math.PI / 8);
      const horizontal = Math.abs(x) > Math.abs(y) * Math.tan(Math.PI / 8);
      send([
        Number(vertical && y < 0),
        Number(vertical && y > 0),
        Number(horizontal && x < 0),
        Number(horizontal && x > 0),
      ]);
    };
    stick.addEventListener('pointerdown', (event) => {
      if (
        pointer !== null ||
        (event.pointerType === 'mouse' && event.button !== 0)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      pointer = event.pointerId;
      stick.setPointerCapture(pointer);
      stick.classList.add('is-held');
      move(event);
    });
    stick.addEventListener('pointermove', (event) => {
      if (pointer === event.pointerId) {
        event.preventDefault();
        move(event);
      }
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
      stick.addEventListener(type, (event) => {
        if (pointer === event.pointerId) release();
      });
    const arrows = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    window.addEventListener(
      'keydown',
      (event) => {
        if (document.activeElement !== stick || !arrows.includes(event.key))
          return;
        event.preventDefault();
        event.stopImmediatePropagation();
        keys.add(event.key);
        send(arrows.map((key) => Number(keys.has(key))));
      },
      true,
    );
    window.addEventListener(
      'keyup',
      (event) => {
        if (!keys.has(event.key)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        keys.delete(event.key);
        send(arrows.map((key) => Number(keys.has(key))));
      },
      true,
    );
    stick.addEventListener('blur', release);
    window.addEventListener('blur', release);
    window.addEventListener('resize', release);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) release();
    });

    const settings = document.createElement('section');
    settings.className = 'pocket-option-group pocket-touch-options';
    settings.setAttribute('aria-labelledby', 'pocket-touch-title');
    settings.innerHTML =
      '<h3 id="pocket-touch-title">Movement controls</h3><div class="pocket-option-grid" role="group" aria-label="Movement controls"></div><p>Rotate your phone for portrait or landscape layout.</p>';
    const choices = settings.querySelector('.pocket-option-grid');
    for (const [value, label] of [
      ['dpad', 'D-pad'],
      ['joystick', 'Joystick'],
    ]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ejs_menu_button pocket-touch-mode';
      button.textContent = label;
      button.setAttribute('aria-pressed', String(value === mode));
      button.onclick = () => {
        release();
        mode = value;
        try {
          localStorage.setItem(preferenceKey, mode);
        } catch {
          // Keep the selected mode for this session if storage is blocked.
        }
        pad.dataset.movement = mode;
        for (const choice of choices.children)
          choice.setAttribute('aria-pressed', String(choice === button));
      };
      choices.append(button);
    }
    pad.dataset.movement = mode;
    return { settings, release };
  }
  window.PocketInput = { install };
})();
