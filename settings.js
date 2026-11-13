(() => {
  const STORAGE_KEY = 'zengm-companion-theme:v1';
  const THEMES = new Set(['orange', 'newspaper', 'dark-newspaper']);
  const tabBtn = document.getElementById('settingsTabBtn');
  const panel = document.getElementById('settingsPanel');
  const tabBar = document.querySelector('.tab-bar');
  const themeButtons = Array.from(document.querySelectorAll('[data-theme-choice]'));

  if (!tabBtn || !panel || !tabBar || !themeButtons.length) return;

  applyTheme(normalizeTheme(document.documentElement.dataset.theme), false);

  tabBtn.addEventListener('click', () => {
    activateSettings();
  });

  tabBar.addEventListener('click', (event) => {
    const button = event.target.closest('.tab-btn');
    if (!button || button === tabBtn) return;
    panel.hidden = true;
    tabBtn.classList.remove('active');
    tabBtn.setAttribute('aria-selected', 'false');
  });

  themeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      applyTheme(button.dataset.themeChoice, true);
    });
  });

  // Card-value preferences remain separate from card ownership and league
  // files. Edit can update both fields; PID changes move a rule atomically.
  const market = window.DBLCardMarket;
  const cards = window.DBLCardEngine;
  const valueForm = document.getElementById('settingsCardValueForm');
  const pidInput = document.getElementById('settingsCardPid');
  const multiplierInput = document.getElementById('settingsCardMultiplier');
  const valueSave = document.getElementById('settingsCardValueSave');
  const cancelEditButton = document.getElementById('settingsCardValueCancel');
  const valueStatus = document.getElementById('settingsCardValueStatus');
  const valueList = document.getElementById('settingsCardValueList');
  let editingPid = null;
  let refreshMultiplierNames = () => {};
  let ensureMultiplierNames = () => {};

  if (market?.setPlayerMultiplier && market?.updatePlayerMultiplier &&
      market?.listPlayerMultipliers && market?.removePlayerMultiplier &&
      valueForm && pidInput && multiplierInput && valueSave &&
      cancelEditButton && valueStatus && valueList) {
    const report = (message, isError = false) => {
      valueStatus.textContent = message;
      valueStatus.classList.toggle('is-error', isError);
    };
    const exitEdit = () => {
      editingPid = null;
      pidInput.value = '';
      multiplierInput.value = '';
      valueSave.textContent = 'Save multiplier';
      cancelEditButton.hidden = true;
    };
    const renderMultipliers = () => {
      const rows = market.listPlayerMultipliers();
      if (editingPid !== null && !rows.some(row => row.pid === editingPid))
        exitEdit();
      const fragment = document.createDocumentFragment();
      if (!rows.length) {
        const empty = document.createElement('p');
        empty.className = 'settings-card-value-empty';
        empty.textContent = 'No custom player multipliers saved yet.';
        fragment.appendChild(empty);
      } else {
        for (const {pid, multiplier} of rows) {
          const row = document.createElement('div');
          row.className = 'settings-card-value-entry';
          row.classList.toggle('is-editing', editingPid === pid);
          const caption = document.createElement('span');
          caption.className = 'settings-card-value-entry-caption';
          const pidLabel = document.createElement('span');
          pidLabel.textContent = 'PID ' + pid;
          caption.appendChild(pidLabel);
          const name = cards?.findPlayerName?.(pid);
          const playerName = document.createElement('span');
          playerName.className = 'settings-card-value-player-name';
          playerName.textContent = name || 'Name unavailable';
          caption.appendChild(playerName);
          const amount = document.createElement('strong');
          amount.textContent = multiplier + '×';
          caption.appendChild(amount);

          const actions = document.createElement('span');
          actions.className = 'settings-card-value-entry-actions';
          const edit = document.createElement('button');
          edit.className = 'action-btn settings-card-value-edit';
          edit.type = 'button';
          edit.textContent = 'Edit';
          edit.setAttribute('aria-label', 'Edit value multiplier for PID ' + pid);
          edit.addEventListener('click', () => {
            editingPid = pid;
            pidInput.value = String(pid);
            multiplierInput.value = String(multiplier);
            valueSave.textContent = 'Update multiplier';
            cancelEditButton.hidden = false;
            report('Editing PID ' + pid + '. Change the PID or multiplier, then save.');
            renderMultipliers();
            multiplierInput.focus();
          });
          const remove = document.createElement('button');
          remove.className = 'action-btn settings-card-value-remove';
          remove.type = 'button';
          remove.textContent = 'Remove';
          remove.setAttribute('aria-label', 'Remove card value multiplier for PID ' + pid);
          remove.addEventListener('click', () => {
            const result = market.removePlayerMultiplier(pid);
            if (!result.ok) {
              report(result.error || 'Could not remove multiplier.', true);
              return;
            }
            if (editingPid === pid) exitEdit();
            report('PID ' + pid + ' is back to its normal card values.');
            renderMultipliers();
          });
          actions.append(edit, remove);
          row.append(caption, actions);
          fragment.appendChild(row);
        }
      }
      valueList.replaceChildren(fragment);
    };
    refreshMultiplierNames = renderMultipliers;
    ensureMultiplierNames = () => {
      if (market.listPlayerMultipliers().length && cards?.status?.hasFile)
        cards.ensurePool?.();
    };
    cancelEditButton.addEventListener('click', () => {
      exitEdit();
      report('Editing cancelled; your saved multipliers were not changed.');
      renderMultipliers();
    });
    valueForm.addEventListener('submit', event => {
      event.preventDefault();
      const previousPid = editingPid;
      const result = previousPid === null
        ? market.setPlayerMultiplier(pidInput.value, multiplierInput.value)
        : market.updatePlayerMultiplier(previousPid, pidInput.value, multiplierInput.value);
      if (!result.ok) {
        report(result.error || 'Please check the PID and multiplier.', true);
        return;
      }
      report(result.removed
        ? 'PID ' + (previousPid ?? result.pid) + ' restored to its normal card values.'
        : (previousPid === null ? 'Saved: ' : 'Updated: ') +
          'every valued player card for PID ' + result.pid +
          ' is now worth ' + result.multiplier + '× its normal estimate.');
      exitEdit();
      renderMultipliers();
      ensureMultiplierNames();
    });
    window.addEventListener('dbl:card-values-changed', renderMultipliers);
    cards?.subscribe?.(() => {
      if (!panel.hidden) renderMultipliers();
    });
    // If a different league file is uploaded while Settings is open, resolve
    // names from the new roster without requiring a trip to the Cards tab.
    window.DBLLeagueFileHub?.subscribe?.(({file}) => {
      if (file && !panel.hidden) ensureMultiplierNames();
    }, {immediate:false});
    renderMultipliers();
  }

  function activateSettings() {
    document.querySelectorAll('.page > .panel[id]').forEach((section) => {
      section.hidden = section !== panel;
    });

    document.querySelectorAll('.tab-btn').forEach((button) => {
      const active = button === tabBtn;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    panel.hidden = false;
    ensureMultiplierNames();
    refreshMultiplierNames();
  }

  function normalizeTheme(value) {
    return THEMES.has(value) ? value : 'orange';
  }

  function applyTheme(value, persist) {
    const theme = normalizeTheme(value);
    document.documentElement.dataset.theme = theme;

    themeButtons.forEach((button) => {
      const active = button.dataset.themeChoice === theme;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    if (!persist) return;

    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (error) {
      console.warn('Could not save theme preference.', error);
    }
  }
})();
