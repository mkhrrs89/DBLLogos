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

  // Optional card-value controls: separate browser-local preferences from
  // saved cards, so existing collection backups and ownership are untouched.
  const market = window.DBLCardMarket;
  const valueForm = document.getElementById('settingsCardValueForm');
  const pidInput = document.getElementById('settingsCardPid');
  const multiplierInput = document.getElementById('settingsCardMultiplier');
  const valueStatus = document.getElementById('settingsCardValueStatus');
  const valueList = document.getElementById('settingsCardValueList');

  if (market?.setPlayerMultiplier && market?.listPlayerMultipliers &&
      market?.removePlayerMultiplier && valueForm && pidInput &&
      multiplierInput && valueStatus && valueList) {
    const report = (message, isError = false) => {
      valueStatus.textContent = message;
      valueStatus.classList.toggle('is-error', isError);
    };
    const renderMultipliers = () => {
      const rows = market.listPlayerMultipliers();
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
          const caption = document.createElement('span');
          caption.className = 'settings-card-value-entry-caption';
          caption.append('PID ' + pid + ' · ');
          const amount = document.createElement('strong');
          amount.textContent = multiplier + '×';
          caption.appendChild(amount);
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
            report('PID ' + pid + ' is back to its normal card values.');
            renderMultipliers();
          });
          row.append(caption, remove);
          fragment.appendChild(row);
        }
      }
      valueList.replaceChildren(fragment);
    };
    valueForm.addEventListener('submit', event => {
      event.preventDefault();
      const result = market.setPlayerMultiplier(pidInput.value, multiplierInput.value);
      if (!result.ok) {
        report(result.error || 'Please check the PID and multiplier.', true);
        return;
      }
      report(result.removed
        ? 'PID ' + result.pid + ' restored to its regular card values.'
        : 'Saved: every valued player card for PID ' + result.pid +
          ' is now worth ' + result.multiplier + '× its normal estimate.');
      pidInput.value = '';
      multiplierInput.value = '';
      renderMultipliers();
    });
    window.addEventListener('dbl:card-values-changed', renderMultipliers);
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
