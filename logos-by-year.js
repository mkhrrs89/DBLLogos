(() => {
  const tabBtn = document.getElementById('logosByYearTabBtn');
  const panel = document.getElementById('logosByYearPanel');
  const yearSelect = document.getElementById('logosByYearSelect');
  const logoBox = document.getElementById('logosByYearBox');
  const fileInput = document.getElementById('leagueFile');
  const clearBtn = document.getElementById('clearLeagueFileBtn');
  const statusMessage = document.getElementById('statusMessage');

  if (!tabBtn || !panel || !yearSelect || !logoBox) return;

  const otherPanelIds = [
    'logosPanel',
    'colorSchemesPanel',
    'bannersPanel',
    'uniformsPanel',
    'rankingsPanel',
    'allTimeLeadersPanel',
    'hallOfFamePanel',
    'recordsPanel',
  ];

  const otherTabIds = [
    'logosTabBtn',
    'colorSchemesTabBtn',
    'bannersTabBtn',
    'uniformsTabBtn',
    'rankingsTabBtn',
    'allTimeLeadersTabBtn',
    'hallOfFameTabBtn',
    'recordsTabBtn',
  ];

  let selectedYear = null;

  syncFromTimeline();

  tabBtn.addEventListener('click', () => {
    activateTab();
    syncFromTimeline();
  });

  for (const tabId of otherTabIds) {
    document.getElementById(tabId)?.addEventListener('click', deactivateTab);
  }

  yearSelect.addEventListener('change', () => {
    const year = Number(yearSelect.value);
    selectedYear = Number.isFinite(year) ? year : null;
    renderSelectedYear();
  });

  document.addEventListener('keydown', (event) => {
    if (panel.hidden || !window.matchMedia('(min-width: 681px)').matches) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

    const target = event.target;
    if (
      target instanceof HTMLInputElement
      || target instanceof HTMLSelectElement
      || target instanceof HTMLTextAreaElement
      || target?.isContentEditable
    ) {
      return;
    }

    const timeline = getTimeline();
    const years = Array.isArray(timeline?.years)
      ? timeline.years.filter(Number.isFinite).slice().sort((a, b) => a - b)
      : [];
    const currentIndex = years.indexOf(selectedYear);
    if (currentIndex < 0) return;

    const nextIndex = event.key === 'ArrowLeft'
      ? currentIndex - 1
      : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= years.length) return;

    event.preventDefault();
    selectedYear = years[nextIndex];
    yearSelect.value = String(selectedYear);
    renderSelectedYear();
  });

  fileInput?.addEventListener('change', () => {
    if (!panel.hidden) logoBox.replaceChildren();
  });

  clearBtn?.addEventListener('click', () => {
    selectedYear = null;
    yearSelect.replaceChildren();
    yearSelect.disabled = true;
    logoBox.replaceChildren();
  });

  if (statusMessage) {
    const observer = new MutationObserver(() => {
      const text = statusMessage.textContent || '';
      if (!panel.hidden && text.startsWith('Loaded ')) {
        syncFromTimeline();
      } else if (text.startsWith('Cleared loaded league file')) {
        selectedYear = null;
        yearSelect.replaceChildren();
        yearSelect.disabled = true;
        logoBox.replaceChildren();
      }
    });

    observer.observe(statusMessage, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  function activateTab() {
    for (const panelId of otherPanelIds) {
      const otherPanel = document.getElementById(panelId);
      if (otherPanel) otherPanel.hidden = true;
    }

    document.querySelectorAll('.tab-btn').forEach((button) => {
      button.classList.remove('active');
      button.setAttribute('aria-selected', 'false');
    });

    panel.hidden = false;
    tabBtn.classList.add('active');
    tabBtn.setAttribute('aria-selected', 'true');
  }

  function deactivateTab() {
    panel.hidden = true;
    tabBtn.classList.remove('active');
    tabBtn.setAttribute('aria-selected', 'false');
  }

  function getTimeline() {
    try {
      return typeof fullTimeline !== 'undefined' ? fullTimeline : null;
    } catch (error) {
      return null;
    }
  }

  function syncFromTimeline() {
    const timeline = getTimeline();
    const years = Array.isArray(timeline?.years)
      ? timeline.years.filter(Number.isFinite)
      : [];

    if (!timeline || years.length === 0) {
      selectedYear = null;
      yearSelect.replaceChildren();
      yearSelect.disabled = true;
      logoBox.replaceChildren();
      return;
    }

    const sortedYears = years.slice().sort((a, b) => a - b);
    if (!sortedYears.includes(selectedYear)) {
      selectedYear = sortedYears[sortedYears.length - 1];
    }

    yearSelect.replaceChildren();
    for (const year of sortedYears) {
      const option = document.createElement('option');
      option.value = String(year);
      option.textContent = String(year);
      option.selected = year === selectedYear;
      yearSelect.appendChild(option);
    }
    yearSelect.disabled = false;

    renderSelectedYear();
  }

  function renderSelectedYear() {
    const timeline = getTimeline();
    logoBox.replaceChildren();

    if (!timeline || !Number.isFinite(selectedYear) || !Array.isArray(timeline.rows)) {
      return;
    }

    const logos = [];
    for (const row of timeline.rows) {
      const entry = row?.entriesByYear instanceof Map
        ? row.entriesByYear.get(selectedYear)
        : null;
      const url = normalizeUrl(entry?.primaryLogoURL);
      if (!entry || !url) continue;

      logos.push({
        url,
        teamName: typeof entry.teamName === 'string' ? entry.teamName : '',
        tid: Number.isFinite(row?.tid) ? row.tid : Number.MAX_SAFE_INTEGER,
      });
    }

    logos.sort((a, b) => (
      a.teamName.localeCompare(b.teamName)
      || a.tid - b.tid
    ));

    const fragment = document.createDocumentFragment();
    for (const logo of logos) {
      const image = document.createElement('img');
      image.src = logo.url;
      image.alt = '';
      image.loading = 'eager';
      image.decoding = 'async';
      image.setAttribute('aria-hidden', 'true');
      image.addEventListener('error', () => image.remove(), { once: true });
      fragment.appendChild(image);
    }

    logoBox.appendChild(fragment);
  }

  function normalizeUrl(value) {
    return typeof value === 'string' ? value.trim() : '';
  }
})();
