(() => {
  const tabBtn = document.getElementById('logosByYearTabBtn');
  const panel = document.getElementById('logosByYearPanel');
  const yearSelect = document.getElementById('logosByYearSelect');
  const logoBox = document.getElementById('logosByYearBox');
  const fileInput = document.getElementById('leagueFile');
  const clearBtn = document.getElementById('clearLeagueFileBtn');
  const statusMessage = document.getElementById('statusMessage');

  if (!tabBtn || !panel || !yearSelect || !logoBox) return;

  const previousYearBtn = document.createElement('button');
  previousYearBtn.type = 'button';
  previousYearBtn.className = 'logos-by-year-nav';
  previousYearBtn.setAttribute('aria-label', 'Previous year');
  previousYearBtn.textContent = '‹';

  const nextYearBtn = document.createElement('button');
  nextYearBtn.type = 'button';
  nextYearBtn.className = 'logos-by-year-nav';
  nextYearBtn.setAttribute('aria-label', 'Next year');
  nextYearBtn.textContent = '›';

  yearSelect.before(previousYearBtn);
  yearSelect.after(nextYearBtn);

  const logoCount = document.createElement('span');
  logoCount.className = 'logos-by-year-count';
  logoCount.setAttribute('aria-live', 'polite');
  nextYearBtn.after(logoCount);

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
    updateYearNavigation();
  });

  previousYearBtn.addEventListener('click', () => stepYear(-1));
  nextYearBtn.addEventListener('click', () => stepYear(1));

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

    const changed = stepYear(event.key === 'ArrowLeft' ? -1 : 1);
    if (changed) event.preventDefault();
  });

  fileInput?.addEventListener('change', () => {
    if (!panel.hidden) logoBox.replaceChildren();
  });

  clearBtn?.addEventListener('click', () => {
    selectedYear = null;
    yearSelect.replaceChildren();
    yearSelect.disabled = true;
    logoBox.replaceChildren();
    updateYearNavigation();
    updateLogoCount();
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
        updateYearNavigation();
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

  function getSortedYears() {
    const timeline = getTimeline();
    return Array.isArray(timeline?.years)
      ? timeline.years.filter(Number.isFinite).slice().sort((a, b) => a - b)
      : [];
  }

  function stepYear(direction) {
    const years = getSortedYears();
    const currentIndex = years.indexOf(selectedYear);
    if (currentIndex < 0) return false;

    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= years.length) return false;

    selectedYear = years[nextIndex];
    yearSelect.value = String(selectedYear);
    renderSelectedYear();
    updateYearNavigation();
    return true;
  }

  function updateYearNavigation() {
    const years = getSortedYears();
    const currentIndex = years.indexOf(selectedYear);
    previousYearBtn.disabled = currentIndex <= 0;
    nextYearBtn.disabled = currentIndex < 0 || currentIndex >= years.length - 1;
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
      updateYearNavigation();
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
    updateYearNavigation();
  }

  function renderSelectedYear() {
    const timeline = getTimeline();
    logoBox.replaceChildren();

    if (!timeline || !Number.isFinite(selectedYear) || !Array.isArray(timeline.rows)) {
      updateLogoCount();
      return;
    }

    // One slot per team active in the selected year. Missing or failed images
    // must not silently remove a franchise from the gallery.
    const teams = [];
    for (const row of timeline.rows) {
      const entry = row?.entriesByYear instanceof Map
        ? row.entriesByYear.get(selectedYear)
        : null;
      if (!entry) continue;

      const teamName = typeof entry.teamName === 'string' && entry.teamName.trim()
        ? entry.teamName.trim()
        : (row.latestLocation || `Team ${row.tid ?? '?'}`);

      teams.push({
        teamName,
        tid: Number.isFinite(row?.tid) ? row.tid : Number.MAX_SAFE_INTEGER,
        urls: getLogoCandidates(row, selectedYear, entry),
      });
    }

    teams.sort((a, b) => (
      a.teamName.localeCompare(b.teamName)
      || a.tid - b.tid
    ));

    const fragment = document.createDocumentFragment();
    for (const team of teams) {
      fragment.appendChild(buildLogoItem(team));
    }
    logoBox.appendChild(fragment);
    updateLogoCount();
  }

  function getLogoCandidates(row, year, currentEntry) {
    const seen = new Set();
    const urls = [];
    const add = (value) => {
      const url = normalizeUrl(value);
      if (url && !seen.has(url)) {
        seen.add(url);
        urls.push(url);
      }
    };

    // Try the selected season's full-size image, normalized fallback and small
    // image first. Then fall back to older seasons, but never future designs.
    const entries = [currentEntry];
    for (const [entryYear, entry] of [...row.entriesByYear.entries()]
      .filter(([entryYear]) => Number(entryYear) < year && Number.isFinite(Number(entryYear)))
      .sort((a, b) => Number(b[0]) - Number(a[0]))) {
      if (entry) entries.push(entry);
    }

    for (const entry of entries) {
      add(entry.primaryLogoURL);
      add(entry.fallbackLogoURL);
      add(entry.smallLogoURL);
    }
    return urls;
  }

  function buildLogoItem(team) {
    const item = document.createElement('div');
    item.className = 'logos-by-year-item';
    item.title = team.teamName;

    if (!team.urls.length) {
      showMissingLogo(item, team.teamName);
      return item;
    }

    const image = document.createElement('img');
    image.alt = `${team.teamName} logo, ${selectedYear}`;
    image.loading = 'eager';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';

    let candidateIndex = 0;
    const tryNextUrl = () => {
      if (!item.isConnected && candidateIndex > 0) return;
      if (candidateIndex >= team.urls.length) {
        image.remove();
        showMissingLogo(item, team.teamName);
        updateLogoCount();
        return;
      }
      image.src = team.urls[candidateIndex++];
    };

    image.addEventListener('error', tryNextUrl);
    item.appendChild(image);
    tryNextUrl();
    return item;
  }

  function showMissingLogo(item, teamName) {
    item.classList.add('logos-by-year-unavailable');
    item.title = `${teamName} — logo unavailable`;

    const placeholder = document.createElement('div');
    placeholder.className = 'logos-by-year-placeholder';
    placeholder.setAttribute('role', 'img');
    placeholder.setAttribute('aria-label', `${teamName}: logo unavailable`);

    const name = document.createElement('span');
    name.textContent = teamName;
    const message = document.createElement('small');
    message.textContent = 'No logo available';
    placeholder.append(name, message);
    item.appendChild(placeholder);
  }

  function updateLogoCount() {
    const total = logoBox.childElementCount;
    const unavailable = logoBox.querySelectorAll('.logos-by-year-unavailable').length;
    logoCount.textContent = total
      ? `${total - unavailable} of ${total} team logos`
      : '';
  }

  function normalizeUrl(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

})();
