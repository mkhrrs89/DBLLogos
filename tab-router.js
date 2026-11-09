(() => {
  if (window.DBLTabRouter) return;

  const tabBar = document.querySelector('.tab-bar');
  if (!tabBar) return;

  const ACTIVE_TAB_KEY = 'zengm-companion-active-tab:v1';
  const PANEL_BY_TAB_ID = {
    homeTabBtn: 'homePanel',
    cardsTabBtn: 'cardsPanel',
    logosTabBtn: 'logosPanel',
    logosByYearTabBtn: 'logosByYearPanel',
    logosByTeamTabBtn: 'logosByTeamPanel',
    colorSchemesTabBtn: 'colorSchemesPanel',
    bannersTabBtn: 'bannersPanel',
    headshotBackgroundsTabBtn: 'headshotBackgroundsPanel',
    uniformsTabBtn: 'uniformsPanel',
    rankingsTabBtn: 'rankingsPanel',
    championGridTabBtn: 'championGridPanel',
    allTimeLeadersTabBtn: 'allTimeLeadersPanel',
    teamLeadersTabBtn: 'teamLeadersPanel',
    ratingsTabBtn: 'ratingsPanel',
    draftClassStrengthTabBtn: 'draftClassStrengthPanel',
    playersOfMonthTabBtn: 'playersOfMonthPanel',
    hallOfFameTabBtn: 'hallOfFamePanel',
    recentRetireesTabBtn: 'recentRetireesPanel',
    deadPlayersTabBtn: 'deadPlayersPanel',
    retiredNumbersTabBtn: 'retiredNumbersPanel',
    recordsTabBtn: 'recordsPanel',
    shootoutRecordsTabBtn: 'shootoutRecordsPanel',
    teamsTabBtn: 'teamsPanel',
    familiesTabBtn: 'familiesPanel',
    newsTabBtn: 'newsPanel',
    rivalsTabBtn: 'rivalsPanel',
    financesTabBtn: 'financesPanel',
    draftProspectsTabBtn: 'draftProspectsPanel',
    collegesTabBtn: 'collegesPanel',
    settingsTabBtn: 'settingsPanel',
  };

  let activeTabId = null;
  const controlsPanel = document.getElementById('leagueControlsPanel');

  function getGroups() {
    return Array.from(tabBar.querySelectorAll('.tab-group'));
  }

  function closeGroups(except = null) {
    for (const group of getGroups()) {
      if (group !== except) group.open = false;
    }
  }

  function syncActiveGroup(button) {
    for (const group of getGroups()) {
      group.classList.toggle('has-active', Boolean(button && group.contains(button)));
    }
  }

  for (const group of getGroups()) {
    group.addEventListener('toggle', () => {
      if (group.open) closeGroups(group);
    });
  }

  document.addEventListener('click', (event) => {
    if (!tabBar.contains(event.target)) closeGroups();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeGroups();
  });

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
    // Home is intentionally blank. Keep the shared league-upload controls on
    // every other view, without clearing the current league or saved settings.
    if (controlsPanel) controlsPanel.hidden = panelId === 'homePanel';
    activeTabId = button.id || null;
    syncActiveGroup(button);

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

    if (source === 'click') {
      const group = button.closest('.tab-group');
      if (group) group.open = false;
    }

    return true;
  }

  function activateById(tabId, options) {
    const button = document.getElementById(tabId);
    return activate(button, options);
  }

  function openTabAtStartup() {
    // Restore the last active tab on F5/Ctrl+R, but keep Home as the entry
    // point on a new visit. Session storage is per browser tab.
    let savedTabId = '';
    try {
      const navigation = window.performance?.getEntriesByType?.('navigation')?.[0];
      const isReload = navigation
        ? navigation.type === 'reload'
        : window.performance?.navigation?.type === 1;
      if (isReload) savedTabId = sessionStorage.getItem(ACTIVE_TAB_KEY) || '';
    } catch (_) {
      // Storage or navigation timing may be unavailable.
    }
    if (savedTabId && activateById(savedTabId, {
      persist: false, source: 'restore'
    })) return;
    // Persist the actual landing tab so refreshing Home never resurrects a
    // stale tab ID from a previous visit.
    activateById('homeTabBtn', { persist: true, source: 'startup' });
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
    closeGroups,
  };

  syncActiveGroup(tabBar.querySelector('.tab-btn.active'));
  window.queueMicrotask(openTabAtStartup);
})();
