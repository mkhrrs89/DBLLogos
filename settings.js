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
