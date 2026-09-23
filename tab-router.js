(() => {
  if (window.DBLTabRouter) return;

  const tabBar = document.querySelector('.tab-bar');
  if (!tabBar) return;

  const ACTIVE_TAB_KEY = 'zengm-companion-active-tab:v1';
  const PANEL_BY_TAB_ID = {
    logosTabBtn: 'logosPanel',
    logosByYearTabBtn: 'logosByYearPanel',
    logosByTeamTabBtn: 'logosByTeamPanel',
    colorSchemesTabBtn: 'colorSchemesPanel',
    bannersTabBtn: 'bannersPanel',
    uniformsTabBtn: 'uniformsPanel',
    rankingsTabBtn: 'rankingsPanel',
    allTimeLeadersTabBtn: 'allTimeLeadersPanel',
    hallOfFameTabBtn: 'hallOfFamePanel',
    recordsTabBtn: 'recordsPanel',
    newsTabBtn: 'newsPanel',
    rivalsTabBtn: 'rivalsPanel',
    draftProspectsTabBtn: 'draftProspectsPanel',
    settingsTabBtn: 'settingsPanel',
  };

  let activeTabId = null;
  let restoreObserver = null;

  function getPanelId(button) {
    if (!(button instanceof HTMLElement)) return '';
    return button.dataset.panelId || PANEL_BY_TAB_ID[button.id] || '';
  }

  function activate(button, { persist = true, source = 'click' } = {}) {
    if (!(button instanceof HTMLElement)) return false;

    const panelId = getPanelId(button);
    const panel = panelId ? document.getElementById(panelId) : null;
    if (!panel) return false;

    document.querySelectorAll('.page > .panel[id]').forEach((section) => {
      section.hidden = section !== panel;
    });

    document.querySelectorAll('.tab-btn').forEach((tabButton) => {
      const selected = tabButton === button;
      tabButton.classList.toggle('active', selected);
      tabButton.setAttribute('aria-selected', selected ? 'true' : 'false');
    });

    panel.hidden = false;
    activeTabId = button.id || null;

    if (persist && activeTabId) {
      try {
        sessionStorage.setItem(ACTIVE_TAB_KEY, activeTabId);
      } catch (error) {
        // Navigation still works without session storage.
      }
    }

    window.dispatchEvent(new CustomEvent('dbl:tab-change', {
      detail: {
        tabId: activeTabId,
        panelId,
        source,
      },
    }));

    return true;
  }

  function activateById(tabId, options) {
    const button = document.getElementById(tabId);
    return activate(button, options);
  }

  function restoreSavedTab() {
    let savedTabId = '';
    try {
      savedTabId = sessionStorage.getItem(ACTIVE_TAB_KEY) || '';
    } catch (error) {
      savedTabId = '';
    }

    if (!savedTabId || savedTabId === 'logosTabBtn') return;
    if (activateById(savedTabId, { persist: false, source: 'restore' })) return;

    if (restoreObserver) restoreObserver.disconnect();
    restoreObserver = new MutationObserver(() => {
      if (!activateById(savedTabId, { persist: false, source: 'restore' })) return;
      restoreObserver.disconnect();
      restoreObserver = null;
    });
    restoreObserver.observe(tabBar, { childList: true, subtree: true });

    window.setTimeout(() => {
      restoreObserver?.disconnect();
      restoreObserver = null;
    }, 5000);
  }

  tabBar.addEventListener('click', (event) => {
    const button = event.target.closest('.tab-btn');
    if (!button || !tabBar.contains(button)) return;

    // Existing feature scripts can continue doing their tab-specific refresh
    // work. This runs after those target listeners and normalizes the final UI.
    window.queueMicrotask(() => {
      activate(button, { persist: true, source: 'click' });
    });
  });

  window.DBLTabRouter = {
    activate,
    activateById,
    getActiveTabId: () => activeTabId,
  };

  window.queueMicrotask(restoreSavedTab);
})();
