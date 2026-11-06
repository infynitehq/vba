/* Layout-only harness. Reuse the pinned native touch renderer and our toolbar,
   without constructing an emulator, fetching a ROM/core, or opening storage. */
(() => {
  const game = document.getElementById('game');
  const status = document.getElementById('preview-input');
  const api = window.PocketToolbar;
  const settings = {
    fastForward: 'disabled',
    slowMotion: 'disabled',
    'ff-ratio': '3.0',
    'sm-ratio': '2.0',
  };
  const emulator = Object.create(window.EmulatorJS.prototype);
  const bar = document.createElement('div');
  bar.className = 'ejs_menu_bar';
  game.append(bar);
  const bottomBar = {};
  const announce = (text) => {
    status.textContent = text;
  };
  const makeButton = (name, option, callback) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ejs_menu_button';
    const update = (key) => {
      const value = api.options[key];
      button.innerHTML = `${value.icon}<span class="ejs_menu_text">${value.displayName}</span>`;
      button.setAttribute('aria-label', value.displayName);
      button.title = value.displayName;
    };
    update(option);
    button.onclick = () => callback?.(update);
    bar.append(button);
    bottomBar[name] = [button];
    return button;
  };
  let paused = false;
  makeButton('pause', 'pause', (update) => {
    paused = !paused;
    update(paused ? 'play' : 'pause');
    announce(paused ? 'Paused' : 'Resumed');
  });
  let muted = false;
  const mute = makeButton('mute', 'mute', (update) => {
    muted = !muted;
    update(muted ? 'unmute' : 'mute');
    announce(muted ? 'Sound off' : 'Sound on');
  });
  const volume = document.createElement('div');
  volume.className = 'ejs_volume_parent';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.dataset.range = 'volume';
  slider.min = '0';
  slider.max = '1';
  slider.step = '0.01';
  slider.value = '1';
  slider.setAttribute('aria-label', 'Volume');
  volume.append(mute, slider);
  bar.append(volume);
  makeButton('fullscreen', 'enterFullscreen', () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else
      void game
        .requestFullscreen?.()
        .catch(() => announce('Fullscreen is unavailable'));
  });
  for (const [name, option] of [
    ['saveState', 'saveState'],
    ['loadState', 'loadState'],
    ['saveSavFiles', 'saveSavFiles'],
    ['loadSavFiles', 'loadSavFiles'],
    ['gamepad', 'gamepad'],
    ['settings', 'settings'],
  ]) {
    const button = makeButton(name, option);
    button.disabled = true; // No real save files, bindings or core settings in this harness.
  }
  makeButton('restart', 'restart', () => announce('Preview restarted'));
  makeButton('exit', 'exitEmulation');
  makeButton('contextMenu', 'settings');
  const inputNames = {
    0: 'B',
    2: 'Select',
    3: 'Start',
    4: 'Up',
    5: 'Down',
    6: 'Left',
    7: 'Right',
    8: 'A',
    10: 'L',
    11: 'R',
  };
  Object.assign(emulator, {
    config: {},
    touch: true,
    elements: { parent: game, menu: bar, bottomBar },
    getControlScheme: () => 'gba',
    localization: (text) => text,
    on: () => {},
    getSettingValue: (name) => settings[name],
    changeSettingOption: (name, value) => {
      settings[name] = value;
      if (name === 'fastForward') emulator.isFastForward = value === 'enabled';
      if (name === 'slowMotion') emulator.isSlowMotion = value === 'enabled';
    },
    gameManager: {
      simulateInput: (_player, input, value) => {
        if (value) announce(`${inputNames[input] ?? 'Button'} pressed`);
      },
    },
    menu: { toggle: () => bar.classList.toggle('ejs_menu_bar_hidden') },
  });
  emulator.setVirtualGamepad();
  emulator.toggleVirtualGamepad(true);
  api.install(emulator, {
    onOpen: () => {},
    onExit: () => announce('Layout preview — no game is running'),
  });
  emulator.elements.menuToggle.style.display = '';

  // Native touch input is identical on phones. Supply pointer feedback too,
  // so the same preview can be tried with a mouse on a narrow desktop window.
  for (const target of game.querySelectorAll('.ejs_virtualGamepad_button')) {
    target.setAttribute('role', 'button');
    target.setAttribute('aria-label', target.textContent);
    target.tabIndex = 0;
    const press = () => {
      target.classList.add('ejs_virtualGamepad_button_down');
      announce(`${target.textContent} pressed`);
    };
    const release = () =>
      target.classList.remove('ejs_virtualGamepad_button_down');
    target.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'touch') return;
      target.setPointerCapture(event.pointerId);
      press();
    });
    for (const type of [
      'pointerup',
      'pointercancel',
      'lostpointercapture',
      'blur',
    ])
      target.addEventListener(type, release);
    target.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        press();
      }
    });
    target.addEventListener('keyup', release);
  }
  const dpad = game.querySelector('.ejs_dpad_main');
  const clearDpad = () => {
    for (const direction of ['up', 'down', 'left', 'right'])
      dpad.classList.remove(`ejs_dpad_${direction}_pressed`);
  };
  const pointDpad = (event) => {
    const rect = dpad.getBoundingClientRect();
    const x = event.clientX - rect.left - rect.width / 2;
    const y = event.clientY - rect.top - rect.height / 2;
    clearDpad();
    const direction =
      Math.abs(x) > Math.abs(y)
        ? x < 0
          ? 'left'
          : 'right'
        : y < 0
          ? 'up'
          : 'down';
    dpad.classList.add(`ejs_dpad_${direction}_pressed`);
    announce(`${direction[0].toUpperCase()}${direction.slice(1)} pressed`);
  };
  dpad.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch') return;
    dpad.setPointerCapture(event.pointerId);
    pointDpad(event);
  });
  dpad.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'touch' && event.buttons) pointDpad(event);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
    dpad.addEventListener(type, clearDpad);
})();
