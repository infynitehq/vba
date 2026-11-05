/* Restyle the pinned EmulatorJS menu without rebuilding its settings or callbacks. */
(() => {
  function install(emulator) {
    const original = emulator.settingsMenu;
    if (!original || original.classList.contains('pocket-settings')) return;
    const content = original.querySelector('.ejs_settings_transition');
    if (!content) return;

    const dialog = document.createElement('dialog');
    dialog.className = `${original.className} pocket-settings`;
    dialog.style.cssText = original.style.cssText;
    dialog.tabIndex = -1;
    dialog.setAttribute('aria-labelledby', 'pocket-settings-title');
    const panel = document.createElement('div');
    panel.className = 'pocket-settings-panel';
    const header = document.createElement('div');
    header.className = 'pocket-settings-header';
    const title = document.createElement('h2');
    title.id = 'pocket-settings-title';
    title.textContent = 'Emulator settings';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'pocket-settings-close';
    close.setAttribute('aria-label', 'Close emulator settings');
    close.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>';
    close.onclick = () => dialog.close();
    header.append(title, close);
    panel.append(header, content);
    dialog.append(panel);
    original.replaceWith(dialog);
    emulator.elements.parent.append(dialog);
    emulator.settingsMenu = dialog;

    const focusVisibleOption = () => {
      const options = [
        ...content.querySelectorAll(
          '.ejs_settings_main_bar, .ejs_back_button, .ejs_option_row',
        ),
      ];
      options
        .find((option) => !option.closest('[hidden]'))
        ?.focus({ preventScroll: true });
    };
    const decorate = () => {
      for (const row of content.querySelectorAll('.ejs_settings_main_bar')) {
        const current = row
          .querySelector('.ejs_settings_main_bar_selected')
          ?.textContent.trim();
        if (current)
          row.setAttribute('aria-description', `Current value: ${current}`);
        if (row.dataset.pocketSetting) continue;
        row.dataset.pocketSetting = 'true';
        row.setAttribute('role', 'button');
        row.tabIndex = 0;
        const label = row.firstElementChild?.firstChild?.textContent.trim();
        if (label) row.setAttribute('aria-label', label);
        row.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            row.click();
          }
        });
        row.addEventListener('click', focusVisibleOption);
      }
      for (const option of content.querySelectorAll('.ejs_option_row')) {
        option.setAttribute('aria-label', option.textContent.trim());
        option.setAttribute(
          'aria-pressed',
          String(option.classList.contains('ejs_option_row_selected')),
        );
      }
      for (const button of content.querySelectorAll(
        '.ejs_back_button, .ejs_option_row',
      )) {
        if (button.dataset.pocketSetting) continue;
        button.dataset.pocketSetting = 'true';
        if (button.classList.contains('ejs_back_button')) {
          button.setAttribute(
            'aria-label',
            `Back from ${button.textContent.trim()}`,
          );
        }
        button.addEventListener('click', focusVisibleOption);
      }
    };
    decorate();
    // Core-specific options can be inserted after startup.
    new MutationObserver(decorate).observe(content, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });
    for (const type of ['keydown', 'keyup']) {
      dialog.addEventListener(type, (event) => event.stopPropagation());
    }
    dialog.addEventListener('close', () => emulator.closeSettingsMenu());
    new MutationObserver(() => {
      if (dialog.style.display !== 'none' && !dialog.open) {
        dialog.showModal();
        dialog.focus({ preventScroll: true });
      } else if (dialog.style.display === 'none' && dialog.open) {
        dialog.close();
      }
    }).observe(dialog, { attributes: true, attributeFilter: ['style'] });
  }
  window.PocketSettings = { install };
})();
