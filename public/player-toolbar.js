/* Minimal toolbar adapter for EmulatorJS 4.2.3. Reuses native action buttons. */
(() => {
  // Lucide SVGs: https://lucide.dev · license: ./lucide-LICENSE.txt
  const paths = {
    play: '<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/>',
    pause:
      '<rect x="14" y="3" width="5" height="18" rx="1"/><rect x="5" y="3" width="5" height="18" rx="1"/>',
    sound:
      '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>',
    muted:
      '<path d="M11 4.702a.7.7 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.7.7 0 0 0 11 19.298z"/><path d="m16.5 14.5 5-5"/><path d="m16.5 9.5 5 5"/>',
    expand:
      '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
    collapse:
      '<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    restart:
      '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
    load: '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
    download:
      '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
    upload:
      '<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
    controls:
      '<path d="M10 5H3"/><path d="M12 19H3"/><path d="M14 3v4"/><path d="M16 17v4"/><path d="M21 12h-9"/><path d="M21 19h-5"/><path d="M21 5h-7"/><path d="M8 10v4"/><path d="M8 12H3"/>',
    settings:
      '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/>',
    exit: '<path d="m16 17 5-5-5-5"/><path d="M21 12H9"/><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>',
  };
  const icon = (name) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
  const options = {
    play: { icon: icon('play'), displayName: 'Resume' },
    pause: { icon: icon('pause'), displayName: 'Pause' },
    mute: { icon: icon('sound'), displayName: 'Mute' },
    unmute: { icon: icon('muted'), displayName: 'Unmute' },
    enterFullscreen: { icon: icon('expand'), displayName: 'Enter fullscreen' },
    exitFullscreen: { icon: icon('collapse'), displayName: 'Exit fullscreen' },
    restart: { icon: icon('restart'), displayName: 'Restart game' },
    saveState: { icon: icon('save'), displayName: 'Save state' },
    loadState: { icon: icon('load'), displayName: 'Load state' },
    saveSavFiles: { icon: icon('download'), displayName: 'Backup saves' },
    loadSavFiles: { icon: icon('upload'), displayName: 'Restore saves' },
    gamepad: { icon: icon('controls'), displayName: 'Control settings' },
    settings: { icon: icon('settings'), displayName: 'Emulator settings' },
    exitEmulation: { icon: icon('exit'), displayName: 'Exit game' },
    diskButton: { visible: false },
  };
  let runShortcut = () => false;

  function styleControls(emulator) {
    const original = emulator.controlMenu;
    if (!original || original.classList.contains('pocket-controls')) return;
    const body = original.querySelector('.ejs_control_body');
    const title = original.querySelector(':scope > h4');
    if (!body || !title) return;

    // Keep the native content and callbacks; a real dialog supplies focus trapping.
    const dialog = document.createElement('dialog');
    dialog.className = `${original.className} pocket-controls`;
    dialog.style.cssText = original.style.cssText;
    dialog.setAttribute('aria-labelledby', 'pocket-control-title');
    dialog.tabIndex = -1;
    while (original.firstChild) dialog.append(original.firstChild);
    original.replaceWith(dialog);
    emulator.controlMenu = dialog;

    title.id = 'pocket-control-title';
    const panel = document.createElement('div');
    panel.className = 'pocket-controls-panel';
    const header = document.createElement('div');
    header.className = 'pocket-controls-header';
    const heading = document.createElement('div');
    heading.append(title);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'pocket-controls-close';
    close.setAttribute('aria-label', 'Close control settings');
    close.innerHTML = icon('close');
    close.onclick = () => dialog.close();
    header.append(heading, close);
    const footer = document.createElement('div');
    footer.className = 'pocket-controls-footer';
    for (const action of dialog.querySelectorAll(':scope > .ejs_button')) {
      action.setAttribute('role', 'button');
      action.tabIndex = 0;
      action.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          action.click();
        }
      });
      footer.append(action);
    }
    for (const child of [...dialog.children]) {
      if (child !== body && !child.classList.contains('ejs_popup_container'))
        child.hidden = true;
    }
    title.hidden = false;
    panel.append(header, body, footer);
    dialog.prepend(panel);

    const tabs = [...body.querySelectorAll('.ejs_control_player_bar a')];
    body
      .querySelector('.ejs_control_player_bar')
      ?.setAttribute('role', 'tablist');
    body
      .querySelector('.ejs_control_player_bar')
      ?.setAttribute('aria-label', 'Player');
    const pages = [...body.lastElementChild.children];
    tabs.forEach((tab, index) => {
      const page = pages[index];
      if (page) {
        page.id = `controls-${index}`;
        page.setAttribute('role', 'tabpanel');
        page.setAttribute('aria-labelledby', tab.id);
        page.firstElementChild?.classList.add('pocket-control-devices');
        const columns = document.createElement('div');
        columns.className = 'pocket-control-columns';
        columns.setAttribute('aria-hidden', 'true');
        for (const label of ['Action', 'Key', '']) {
          const column = document.createElement('span');
          column.textContent = label;
          columns.append(column);
        }
        page.firstElementChild?.after(columns);
      }
      tab.tabIndex = index === 0 ? 0 : -1;
      tab.setAttribute('aria-selected', String(index === 0));
      tab.addEventListener('click', () =>
        tabs.forEach((item, selected) => {
          item.tabIndex = selected === index ? 0 : -1;
          item.setAttribute('aria-selected', String(selected === index));
        }),
      );
      tab.addEventListener('keydown', (event) => {
        const next =
          event.key === 'ArrowRight'
            ? (index + 1) % tabs.length
            : event.key === 'ArrowLeft'
              ? (index + tabs.length - 1) % tabs.length
              : event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? tabs.length - 1
                  : -1;
        if (next >= 0 || event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          const target = tabs[next >= 0 ? next : index];
          target.click();
          target.focus();
        }
      });
    });
    for (const select of body.querySelectorAll('.ejs_gamepad_dropdown')) {
      select.setAttribute(
        'aria-label',
        `Connected gamepad for player ${Number(select.getAttribute('index')) + 1}`,
      );
    }
    for (const checkbox of body.querySelectorAll('input[type="checkbox"]')) {
      checkbox.setAttribute('aria-label', 'Virtual gamepad');
      checkbox.addEventListener('change', () => {
        emulator.changeSettingOption(
          'virtual-gamepad',
          checkbox.checked ? 'enabled' : 'disabled',
        );
      });
    }
    for (const row of body.querySelectorAll('.ejs_control_bar')) {
      row.classList.add('pocket-binding');
      const [name, bindings, action, spacer] = row.children;
      name.classList.add('pocket-binding-name');
      bindings.classList.add('pocket-binding-inputs');
      action.classList.add('pocket-binding-action');
      spacer.hidden = true;
      const label = row.dataset.label;
      name.querySelector('label').textContent = label;
      const player = Number(row.dataset.index) + 1;
      const inputs = [...bindings.querySelectorAll('input')];
      inputs.forEach((input, index) => {
        input.setAttribute(
          'aria-label',
          `${label} ${index ? 'keyboard' : 'gamepad'} binding, player ${player}`,
        );
        input.tabIndex = -1;
        input.placeholder = '—';
        input.parentElement.dataset.bindingKind = index
          ? 'Keyboard'
          : 'Gamepad';
      });
      const set = action.querySelector('a');
      set.textContent = 'Change';
      set.setAttribute('role', 'button');
      set.setAttribute('aria-label', `Change ${label} binding`);
      set.tabIndex = 0;
      set.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        }
      });
    }

    const capture = emulator.controlPopup?.parentElement?.parentElement;
    capture?.classList.add('pocket-control-capture');
    let capturingEscape = false;
    dialog.addEventListener('keydown', (event) => {
      capturingEscape = event.key === 'Escape' && capture && !capture.hidden;
    });
    dialog.addEventListener('cancel', (event) => {
      if (capturingEscape) event.preventDefault();
      capturingEscape = false;
    });
    dialog.addEventListener('close', () => {
      dialog.style.display = 'none';
    });
    // EmulatorJS opens/closes its stored element through style.display.
    new MutationObserver(() => {
      if (dialog.style.display !== 'none' && !dialog.open) {
        dialog.showModal();
        dialog.focus({ preventScroll: true });
      } else if (dialog.style.display === 'none' && dialog.open) dialog.close();
    }).observe(dialog, { attributes: true, attributeFilter: ['style'] });
  }

  function install(emulator, { onOpen, onExit }) {
    const bar = emulator.elements.menu;
    if (bar.classList.contains('pocket-toolbar')) return;
    styleControls(emulator);
    window.PocketSettings?.install(emulator);
    bar.classList.add('pocket-toolbar');
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Game controls');
    // 4.2.3 explicitly ignores EJS_Buttons.contextMenu overrides.
    emulator.elements.bottomBar.contextMenu[0].dataset.pocketHidden = '';

    const dialog = document.createElement('dialog');
    dialog.className = 'pocket-more';
    dialog.id = 'pocket-more';
    dialog.setAttribute('aria-labelledby', 'pocket-more-title');
    dialog.tabIndex = -1;
    dialog.addEventListener('keydown', (event) => {
      // Do not let EmulatorJS's global shortcuts consume menu navigation.
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        dialog.close();
      }
    });
    dialog.addEventListener('keyup', (event) => event.stopPropagation());
    for (const type of ['pointerdown', 'mousedown', 'touchstart']) {
      dialog.addEventListener(type, (event) => event.stopPropagation());
    }
    const header = document.createElement('div');
    header.className = 'pocket-more-header';
    header.innerHTML =
      '<div><p class="pocket-more-eyebrow">Game controls</p><h2 id="pocket-more-title">More options</h2></div>';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'pocket-icon-button';
    close.setAttribute('aria-label', 'Close more options');
    close.innerHTML = icon('close');
    close.onclick = () => dialog.close();
    header.appendChild(close);
    dialog.appendChild(header);
    const actions = document.createElement('div');
    actions.className = 'pocket-more-actions';
    dialog.appendChild(actions);

    // Move the real buttons, not copies: native save/state/control behavior,
    // visibility changes and callbacks remain intact (including user gestures).
    const groups = [
      ['Save states', ['saveState', 'loadState']],
      ['Save files', ['saveSavFiles', 'loadSavFiles']],
      ['Preferences', ['gamepad', 'settings']],
      ['Session', ['restart', 'exit']],
    ];
    const flatten = (value) =>
      Array.isArray(value) ? value.flat(Infinity) : [value];
    for (const [index, [title, names]] of groups.entries()) {
      const group = document.createElement('section');
      group.className = 'pocket-option-group';
      const heading = document.createElement('h3');
      heading.id = `pocket-option-group-${index}`;
      heading.textContent = title;
      group.setAttribute('aria-labelledby', heading.id);
      const grid = document.createElement('div');
      grid.className = 'pocket-option-grid';
      group.append(heading, grid);
      for (const name of names) {
        const native = flatten(emulator.elements.bottomBar[name]).find(
          (element) => element instanceof HTMLButtonElement,
        );
        if (native) {
          native.dataset.pocketAction = name;
          grid.appendChild(native);
        }
      }
      if (grid.childElementCount) actions.appendChild(group);
    }
    const slider = bar.querySelector('input[data-range="volume"]');
    let updateVolume = () => {};
    if (slider) {
      const label = document.createElement('label');
      label.className = 'pocket-volume';
      const caption = document.createElement('span');
      caption.className = 'pocket-volume-caption';
      caption.innerHTML = `${icon('sound')}<span>Volume</span>`;
      const level = document.createElement('span');
      level.className = 'pocket-volume-value';
      level.setAttribute('aria-hidden', 'true');
      updateVolume = () => {
        const percent = Math.round(
          ((Number(slider.value) - Number(slider.min || 0)) /
            (Number(slider.max || 1) - Number(slider.min || 0))) *
            100,
        );
        level.textContent = `${percent}%`;
        slider.style.setProperty('--pocket-volume-level', `${percent}%`);
      };
      slider.addEventListener('input', updateVolume);
      updateVolume();
      label.append(caption, level, slider);
      dialog.appendChild(label);
    }
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'pocket-icon-button';
    more.setAttribute('aria-label', 'More options');
    more.setAttribute('title', 'More options');
    more.setAttribute('aria-haspopup', 'dialog');
    more.setAttribute('aria-controls', dialog.id);
    more.setAttribute('aria-expanded', 'false');
    more.innerHTML = icon('more');
    more.onclick = () => {
      onOpen();
      updateVolume();
      dialog.showModal();
      dialog.focus({ preventScroll: true });
      more.setAttribute('aria-expanded', 'true');
    };
    dialog.addEventListener('close', () =>
      more.setAttribute('aria-expanded', 'false'),
    );
    const restartPrompt = document.createElement('dialog');
    restartPrompt.className = 'pocket-confirm';
    restartPrompt.setAttribute('role', 'alertdialog');
    restartPrompt.setAttribute('aria-labelledby', 'pocket-restart-title');
    restartPrompt.setAttribute(
      'aria-describedby',
      'pocket-restart-description',
    );
    restartPrompt.innerHTML =
      '<span class="pocket-confirm-logo" aria-hidden="true"></span><h2 id="pocket-restart-title">Restart game?</h2><p id="pocket-restart-description">Any unsaved progress will be lost.</p><div class="pocket-confirm-actions"><button type="button" data-restart-cancel autofocus>Cancel</button><button type="button" data-restart-confirm>Restart game</button></div>';
    let pendingRestart = null;
    let confirmedRestart = null;
    restartPrompt.querySelector('[data-restart-cancel]').onclick = () => {
      pendingRestart = null;
      restartPrompt.close();
    };
    restartPrompt.querySelector('[data-restart-confirm]').onclick = () => {
      const native = pendingRestart;
      if (!native) return;
      pendingRestart = null;
      restartPrompt.close();
      confirmedRestart = native;
      try {
        native.click();
      } finally {
        confirmedRestart = null;
      }
    };
    for (const type of [
      'keydown',
      'keyup',
      'pointerdown',
      'mousedown',
      'touchstart',
    ]) {
      restartPrompt.addEventListener(type, (event) => event.stopPropagation());
    }
    emulator.elements.parent.append(restartPrompt);
    const exitPrompt = document.createElement('dialog');
    exitPrompt.className = 'pocket-confirm';
    exitPrompt.setAttribute('role', 'alertdialog');
    exitPrompt.setAttribute('aria-labelledby', 'pocket-exit-title');
    exitPrompt.setAttribute('aria-describedby', 'pocket-exit-description');
    exitPrompt.innerHTML =
      '<span class="pocket-confirm-logo" aria-hidden="true"></span><h2 id="pocket-exit-title">Exit game?</h2><p id="pocket-exit-description">Any unsaved progress will be lost. Return to your library?</p><div class="pocket-confirm-actions"><button type="button" data-exit-cancel autofocus>Cancel</button><button type="button" data-exit-confirm>Exit game</button></div>';
    exitPrompt.querySelector('[data-exit-cancel]').onclick = () =>
      exitPrompt.close();
    exitPrompt.querySelector('[data-exit-confirm]').onclick = () => {
      exitPrompt.close();
      dialog.close();
      onExit();
    };
    for (const type of [
      'keydown',
      'keyup',
      'pointerdown',
      'mousedown',
      'touchstart',
    ]) {
      exitPrompt.addEventListener(type, (event) => event.stopPropagation());
    }
    emulator.elements.parent.append(exitPrompt);
    dialog.addEventListener(
      'click',
      (event) => {
        if (event.target === dialog) {
          const box = dialog.getBoundingClientRect();
          if (
            event.clientX < box.left ||
            event.clientX > box.right ||
            event.clientY < box.top ||
            event.clientY > box.bottom
          )
            dialog.close();
          return;
        }
        const target =
          event.target instanceof Element
            ? event.target.closest('[data-pocket-action]')
            : null;
        if (!target) return;
        if (target.dataset.pocketAction === 'exit') {
          event.preventDefault();
          event.stopImmediatePropagation();
          exitPrompt.showModal();
          return;
        }
        if (
          target.dataset.pocketAction === 'restart' &&
          target !== confirmedRestart
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();
          pendingRestart = target;
          restartPrompt.showModal();
          return;
        }
        dialog.close(); // Close before the native handler opens its own UI.
      },
      true,
    );
    for (const native of [
      ...bar.querySelectorAll('button'),
      ...actions.querySelectorAll('button'),
    ]) {
      const label = native.querySelector('.ejs_menu_text')?.textContent;
      if (label) {
        native.setAttribute('aria-label', label);
        native.setAttribute('title', label);
        if (native.closest('.pocket-more')) native.removeAttribute('title');
      }
    }
    const muteButtons = [...bar.querySelectorAll('.ejs_volume_parent button')];
    const fullscreenButtons = flatten(
      emulator.elements.bottomBar.fullscreen,
    ).filter((element) => element instanceof HTMLButtonElement);
    for (const [buttons, key] of [
      [muteButtons, 'M'],
      [fullscreenButtons, 'F'],
    ]) {
      for (const button of buttons) {
        button.setAttribute('aria-keyshortcuts', key.toLowerCase());
        button.title = `${button.getAttribute('aria-label')} (${key})`;
      }
    }
    runShortcut = (code) => {
      if (
        document.querySelector('dialog[open]') ||
        emulator.settingsMenuOpen ||
        emulator.disksMenuOpen ||
        emulator.isPopupOpen?.()
      )
        return false;
      let button;
      if (code === 'KeyM')
        button = muteButtons.find((item) => item.style.display !== 'none');
      if (code === 'KeyF')
        button =
          fullscreenButtons[
            document.fullscreenElement || document.webkitFullscreenElement
              ? 1
              : 0
          ];
      if (!button || button.disabled) return false;
      button.click();
      updateVolume();
      return true;
    };
    const heldShortcuts = new Set();
    window.addEventListener(
      'keydown',
      (event) => {
        if (
          !['KeyF', 'KeyM'].includes(event.code) ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey
        )
          return;
        if (
          event.target instanceof Element &&
          event.target.closest(
            'input, textarea, select, [contenteditable], [role="textbox"]',
          )
        )
          return;
        if (event.repeat) {
          if (heldShortcuts.has(event.code)) {
            event.preventDefault();
            event.stopImmediatePropagation();
          }
          return;
        }
        if (runShortcut(event.code)) {
          heldShortcuts.add(event.code);
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      true,
    );
    window.addEventListener(
      'keyup',
      (event) => {
        if (heldShortcuts.delete(event.code)) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      true,
    );
    window.addEventListener('blur', () => heldShortcuts.clear());
    const touchMenu = emulator.elements.menuToggle;
    if (touchMenu) {
      // Replace the native div's two-second touch debounce with a real button.
      // The native layout/settings keep using the updated menuToggle reference.
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = touchMenu.className;
      toggle.style.cssText = touchMenu.style.cssText;
      toggle.style.opacity = '1';
      toggle.innerHTML = icon('more');
      toggle.setAttribute('aria-label', 'Show game controls');
      toggle.setAttribute('title', 'Show game controls');
      toggle.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        emulator.menu.toggle();
      });
      toggle.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          emulator.menu.toggle();
        }
      });
      touchMenu.replaceWith(toggle);
      emulator.elements.menuToggle = toggle;
    }
    bar.appendChild(more);
    emulator.elements.parent.appendChild(dialog);
  }
  window.PocketToolbar = {
    options,
    install,
    runShortcut: (code) => runShortcut(code),
  };
})();
