(() => {
  const HIDDEN_LOGOS_KEY = 'dbl-logo-logos-by-team-hidden:v1';

  const tabBtn = document.getElementById('logosByTeamTabBtn');
  const panel = document.getElementById('logosByTeamPanel');
  const teamSelect = document.getElementById('logosByTeamSelect');
  const logoBox = document.getElementById('logosByTeamBox');
  const fileInput = document.getElementById('leagueFile');
  const clearBtn = document.getElementById('clearLeagueFileBtn');
  const statusMessage = document.getElementById('statusMessage');

  if (!tabBtn || !panel || !teamSelect || !logoBox) return;

  const otherPanelIds = [
    'logosPanel',
    'logosByYearPanel',
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
    'logosByYearTabBtn',
    'colorSchemesTabBtn',
    'bannersTabBtn',
    'uniformsTabBtn',
    'rankingsTabBtn',
    'allTimeLeadersTabBtn',
    'hallOfFameTabBtn',
    'recordsTabBtn',
  ];

  let selectedTeamKey = null;
  let teamOptions = [];
  let hiddenByTeam = loadHiddenLogos();

  syncFromTimeline();

  tabBtn.addEventListener('click', () => {
    activateTab();
    syncFromTimeline();
  });

  for (const tabId of otherTabIds) {
    document.getElementById(tabId)?.addEventListener('click', deactivateTab);
  }

  teamSelect.addEventListener('change', () => {
    selectedTeamKey = teamSelect.value || null;
    renderSelectedTeam();
  });

  fileInput?.addEventListener('change', () => {
    if (!panel.hidden) logoBox.replaceChildren();
  });

  clearBtn?.addEventListener('click', () => {
    selectedTeamKey = null;
    teamOptions = [];
    teamSelect.replaceChildren();
    teamSelect.disabled = true;
    logoBox.replaceChildren();
  });

  logoBox.addEventListener('click', (event) => {
    if (event.target === logoBox) clearSelection();
  });

  if (statusMessage) {
    const observer = new MutationObserver(() => {
      const text = statusMessage.textContent || '';
      if (!panel.hidden && text.startsWith('Loaded ')) {
        syncFromTimeline();
      } else if (text.startsWith('Cleared loaded league file')) {
        selectedTeamKey = null;
        teamOptions = [];
        teamSelect.replaceChildren();
        teamSelect.disabled = true;
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
    clearSelection();
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
    if (!timeline || !Array.isArray(timeline.rows) || timeline.rows.length === 0) {
      selectedTeamKey = null;
      teamOptions = [];
      teamSelect.replaceChildren();
      teamSelect.disabled = true;
      logoBox.replaceChildren();
      return;
    }

    teamOptions = timeline.rows
      .map((row, index) => buildTeamOption(row, index))
      .filter(Boolean)
      .sort((a, b) => a.label.localeCompare(b.label) || a.sortTid - b.sortTid);

    if (!teamOptions.length) {
      selectedTeamKey = null;
      teamSelect.replaceChildren();
      teamSelect.disabled = true;
      logoBox.replaceChildren();
      return;
    }

    if (!teamOptions.some((option) => option.key === selectedTeamKey)) {
      selectedTeamKey = teamOptions[0].key;
    }

    teamSelect.replaceChildren();
    for (const optionData of teamOptions) {
      const option = document.createElement('option');
      option.value = optionData.key;
      option.textContent = optionData.label;
      option.selected = optionData.key === selectedTeamKey;
      teamSelect.appendChild(option);
    }
    teamSelect.disabled = false;

    renderSelectedTeam();
  }

  function buildTeamOption(row, index) {
    if (!row || !(row.entriesByYear instanceof Map)) return null;

    const years = Array.from(row.entriesByYear.keys())
      .map(Number)
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    if (!years.length) return null;

    let label = '';
    for (let i = years.length - 1; i >= 0; i -= 1) {
      const entry = row.entriesByYear.get(years[i]);
      if (typeof entry?.teamName === 'string' && entry.teamName.trim()) {
        label = entry.teamName.trim();
        break;
      }
    }

    if (!label) {
      label = typeof row.latestLocation === 'string' && row.latestLocation.trim()
        ? row.latestLocation.trim()
        : `Team ${Number.isFinite(row.tid) ? row.tid : index + 1}`;
    }

    const key = Number.isFinite(row.tid)
      ? `tid:${row.tid}`
      : `row:${index}:${label}`;

    return {
      key,
      label,
      row,
      sortTid: Number.isFinite(row.tid) ? row.tid : Number.MAX_SAFE_INTEGER,
    };
  }

  function renderSelectedTeam() {
    logoBox.replaceChildren();
    clearSelection();

    const selected = teamOptions.find((option) => option.key === selectedTeamKey);
    if (!selected || !(selected.row?.entriesByYear instanceof Map)) return;

    const seen = new Set();
    const logos = [];
    const entries = Array.from(selected.row.entriesByYear.entries())
      .map(([year, entry]) => ({ year: Number(year), entry }))
      .filter(({ year }) => Number.isFinite(year))
      .sort((a, b) => a.year - b.year);

    for (const { year, entry } of entries) {
      const url = normalizeUrl(entry?.primaryLogoURL);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      if (isHidden(selected.key, url)) continue;
      logos.push({ url, firstYear: year });
    }

    const fragment = document.createDocumentFragment();
    for (const logo of logos) {
      fragment.appendChild(buildLogoItem(selected.key, logo.url));
    }
    logoBox.appendChild(fragment);
  }

  function buildLogoItem(teamKey, url) {
    const item = document.createElement('div');
    item.className = 'logos-by-team-logo';
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    item.setAttribute('aria-label', 'Select logo');

    const image = document.createElement('img');
    image.src = url;
    image.alt = '';
    image.loading = 'eager';
    image.decoding = 'async';
    image.setAttribute('aria-hidden', 'true');
    image.addEventListener('error', () => item.remove(), { once: true });

    const hideButton = document.createElement('button');
    hideButton.type = 'button';
    hideButton.className = 'logos-by-team-hide-action';
    hideButton.textContent = 'Hide';

    item.addEventListener('click', (event) => {
      if (event.target === hideButton) return;
      const wasSelected = item.classList.contains('is-selected');
      clearSelection();
      if (!wasSelected) item.classList.add('is-selected');
    });

    item.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      const wasSelected = item.classList.contains('is-selected');
      clearSelection();
      if (!wasSelected) item.classList.add('is-selected');
    });

    hideButton.addEventListener('click', (event) => {
      event.stopPropagation();
      hideLogo(teamKey, url);
      item.remove();
    });

    item.append(image, hideButton);
    return item;
  }

  function clearSelection() {
    logoBox.querySelectorAll('.logos-by-team-logo.is-selected').forEach((item) => {
      item.classList.remove('is-selected');
    });
  }

  function isHidden(teamKey, url) {
    const hidden = hiddenByTeam[teamKey];
    return Array.isArray(hidden) && hidden.includes(url);
  }

  function hideLogo(teamKey, url) {
    const hidden = Array.isArray(hiddenByTeam[teamKey])
      ? hiddenByTeam[teamKey].slice()
      : [];
    if (!hidden.includes(url)) hidden.push(url);
    hiddenByTeam = {
      ...hiddenByTeam,
      [teamKey]: hidden,
    };
    saveHiddenLogos();
  }

  function loadHiddenLogos() {
    try {
      const raw = localStorage.getItem(HIDDEN_LOGOS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch (error) {
      console.warn('Could not restore hidden Logos by Team choices.', error);
      return {};
    }
  }

  function saveHiddenLogos() {
    try {
      localStorage.setItem(HIDDEN_LOGOS_KEY, JSON.stringify(hiddenByTeam));
    } catch (error) {
      console.warn('Could not save hidden Logos by Team choices.', error);
    }
  }

  function normalizeUrl(value) {
    return typeof value === 'string' ? value.trim() : '';
  }
})();
