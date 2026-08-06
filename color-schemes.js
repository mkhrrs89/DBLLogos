(() => {
  const COLOR_SCHEMES_KEY = 'dbl-logo-color-schemes:v1';
  const ACTIVE_ONLY_KEY = 'dbl-logo-color-schemes-active-only:v1';

  const FAMILY_ORDER = [
    'Red',
    'Orange',
    'Yellow/Gold',
    'Green',
    'Blue',
    'Purple',
    'Pink',
    'Brown',
    'Black',
    'Gray',
    'White/Cream',
    'Unassigned',
  ];

  const FAMILY_COLORS = {
    Red: '#c74747',
    Orange: '#d87832',
    'Yellow/Gold': '#d5aa2f',
    Green: '#4f9157',
    Blue: '#477db8',
    Purple: '#8061a8',
    Pink: '#c86791',
    Brown: '#795548',
    Black: '#111111',
    Gray: '#858585',
    'White/Cream': '#f1eadf',
    Unassigned: 'transparent',
  };

  // Centralized tuning values for the generic color-family classifier.
  // Hue is 0-360; saturation and lightness are 0-1.
  const COLOR_CLASSIFIER_TUNING = {
    blackMaxLightness: 0.12,
    whiteMinLightness: 0.93,
    neutralWhiteMinLightness: 0.82,
    neutralWhiteMaxSaturation: 0.18,
    creamHueMin: 20,
    creamHueMax: 70,
    creamMinLightness: 0.62,
    creamMaxSaturation: 0.28,
    paleCreamMinLightness: 0.72,
    paleCreamMaxSaturation: 0.38,
    grayMaxSaturation: 0.14,
    mutedColorMaxSaturation: 0.24,
    redHueMax: 15,
    redHueMinHigh: 345,
    darkWarmRedHueMax: 26,
    darkWarmRedMaxLightness: 0.40,
    darkWarmRedMinSaturation: 0.55,
    orangeHueMax: 32,
    goldHueMax: 70,
    greenHueMax: 170,
    tealBlueHueMin: 185,
    tealBlueHueMax: 205,
    blueHueMax: 255,
    purpleHueMax: 315,
    brownHueMin: 18,
    brownHueMax: 45,
    brownMaxLightness: 0.45,
    brownMaxSaturation: 0.50,
    blueVsGreenRatio: 1.08,
    blueVsRedRatio: 1.12,
    greenDominanceRatio: 1.05,
    mutedBlueChannelLead: 8,
    softBlueChannelLead: 10,
  };

  const EXACT_FAMILY_OVERRIDES = {
    '#B15615': 'Orange',
    '#B9AA9B': 'White/Cream',
    '#D5C497': 'White/Cream',
    '#E5CB95': 'White/Cream',
    '#E9DEBB': 'White/Cream',
    '#E4DAC0': 'White/Cream',
    '#F0DFBB': 'White/Cream',
    '#657A85': 'Blue',
    '#953917': 'Red',
    '#973B03': 'Red',
    '#D38301': 'Yellow/Gold',
    '#D19D01': 'Yellow/Gold',
    '#A86D16': 'Yellow/Gold',
    '#53B6D5': 'Blue',
    '#28697A': 'Blue',
  };

  const tabBtn = document.getElementById('colorSchemesTabBtn');
  const panel = document.getElementById('colorSchemesPanel');
  const wrap = document.getElementById('colorSchemesWrap');
  const fileInput = document.getElementById('leagueFile');
  const clearBtn = document.getElementById('clearLeagueFileBtn');
  const statusMessage = document.getElementById('statusMessage');

  if (!tabBtn || !panel || !wrap) return;

  const standardPanelIds = [
    'logosPanel',
    'bannersPanel',
    'uniformsPanel',
    'rankingsPanel',
    'hallOfFamePanel',
    'recordsPanel',
  ];

  const standardTabIds = [
    'logosTabBtn',
    'bannersTabBtn',
    'uniformsTabBtn',
    'rankingsTabBtn',
    'hallOfFameTabBtn',
    'recordsTabBtn',
  ];

  const activeToggle = createActiveToggle();
  let teams = loadSavedTeams();
  let activeOnly = loadActiveOnly();
  let pendingLeagueFile = null;
  let pendingFileVersion = 0;
  let processingVersion = 0;

  if (activeToggle) activeToggle.checked = activeOnly;
  render(teams);

  tabBtn.addEventListener('click', () => {
    activateColorSchemesTab();
    render(teams);
    refreshPendingFileWhenReady();
  });

  for (const tabId of standardTabIds) {
    document.getElementById(tabId)?.addEventListener('click', deactivateColorSchemesTab);
  }

  activeToggle?.addEventListener('change', () => {
    activeOnly = activeToggle.checked;
    try {
      localStorage.setItem(ACTIVE_ONLY_KEY, String(activeOnly));
    } catch (error) {
      console.warn('Could not save the color-scheme active-team filter.', error);
    }
    render(teams);
  });

  fileInput?.addEventListener('change', (event) => {
    const [file] = event.target.files || [];
    if (!file) return;

    // app.js is already reading, decompressing, and parsing this file. Running
    // another full parse simultaneously can exhaust memory on mobile devices.
    pendingLeagueFile = file;
    pendingFileVersion += 1;

    if (!panel.hidden) {
      refreshPendingFileWhenReady();
    }
  });

  clearBtn?.addEventListener('click', () => {
    teams = [];
    pendingLeagueFile = null;
    pendingFileVersion += 1;
    try {
      localStorage.removeItem(COLOR_SCHEMES_KEY);
    } catch (error) {
      console.warn('Could not clear saved color schemes.', error);
    }
    render([]);
  });

  function activateColorSchemesTab() {
    for (const panelId of standardPanelIds) {
      const standardPanel = document.getElementById(panelId);
      if (standardPanel) standardPanel.hidden = true;
    }

    document.querySelectorAll('.tab-btn').forEach((button) => {
      button.classList.remove('active');
      button.setAttribute('aria-selected', 'false');
    });

    panel.hidden = false;
    tabBtn.classList.add('active');
    tabBtn.setAttribute('aria-selected', 'true');
  }

  function deactivateColorSchemesTab() {
    panel.hidden = true;
    tabBtn.classList.remove('active');
    tabBtn.setAttribute('aria-selected', 'false');
  }

  function createActiveToggle() {
    const header = panel.querySelector('.color-schemes-header');
    if (!header) return null;

    const existing = document.getElementById('activeColorTeamsOnlyToggle');
    if (existing) return existing;

    const label = document.createElement('label');
    label.className = 'toggle-switch';
    label.htmlFor = 'activeColorTeamsOnlyToggle';

    const input = document.createElement('input');
    input.id = 'activeColorTeamsOnlyToggle';
    input.type = 'checkbox';

    const slider = document.createElement('span');
    slider.className = 'toggle-slider';
    slider.setAttribute('aria-hidden', 'true');

    const text = document.createElement('span');
    text.className = 'toggle-label';
    text.textContent = 'Active teams only';

    label.append(input, slider, text);
    header.appendChild(label);
    return input;
  }

  function loadActiveOnly() {
    try {
      return localStorage.getItem(ACTIVE_ONLY_KEY) === 'true';
    } catch (error) {
      console.warn('Could not restore the color-scheme active-team filter.', error);
      return false;
    }
  }

  async function refreshPendingFileWhenReady() {
    if (!pendingLeagueFile) return;

    const file = pendingLeagueFile;
    const version = pendingFileVersion;
    if (processingVersion === version) return;
    processingVersion = version;

    try {
      await waitForMainLeagueLoad(file.name, version);
      if (version !== pendingFileVersion || file !== pendingLeagueFile) return;

      showLoadingState('Building color-scheme groups...');
      const league = JSON.parse(await readLeagueFile(file));
      if (version !== pendingFileVersion || file !== pendingLeagueFile) return;

      teams = buildTeams(league);
      saveTeams(file.name, teams);
      pendingLeagueFile = null;
      render(teams);
    } catch (error) {
      console.warn('Could not build color scheme groups.', error);
      if (!teams.length) {
        render([], 'Could not read team colors from that league file.');
      } else {
        render(teams);
      }
    } finally {
      if (processingVersion === version) processingVersion = 0;
    }
  }

  async function waitForMainLeagueLoad(fileName, version) {
    if (!statusMessage) return;

    const loadedText = `Loaded ${fileName}.`;
    const startedAt = Date.now();
    const timeoutMs = 60000;

    while (version === pendingFileVersion && Date.now() - startedAt < timeoutMs) {
      const text = statusMessage.textContent || '';
      const isLoading = text.startsWith('Loading ');
      const isLoaded = text.includes(loadedText);
      const isError = statusMessage.classList.contains('error');

      if (isLoaded || (!isLoading && isError)) return;
      await delay(100);
    }
  }

  function delay(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  function showLoadingState(message) {
    if (teams.length) return;
    wrap.className = 'color-schemes-wrap empty-state';
    const empty = document.createElement('div');
    empty.className = 'empty-copy';
    const paragraph = document.createElement('p');
    paragraph.textContent = message;
    empty.appendChild(paragraph);
    wrap.replaceChildren(empty);
  }

  async function readLeagueFile(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const gzip = file.name.toLowerCase().endsWith('.gz')
      || (bytes[0] === 0x1f && bytes[1] === 0x8b);

    if (gzip) {
      if (!window.pako) throw new Error('Gzip support did not load.');
      return window.pako.ungzip(bytes, { to: 'string' });
    }

    return new TextDecoder().decode(bytes);
  }

  function buildTeams(league) {
    if (!league || !Array.isArray(league.teams)) return [];

    let latestLeagueSeason = -Infinity;
    for (const team of league.teams) {
      const seasons = Array.isArray(team?.seasons) ? team.seasons : [];
      for (const season of seasons) {
        const year = Number(season?.season);
        if (Number.isFinite(year) && year > latestLeagueSeason) {
          latestLeagueSeason = year;
        }
      }
    }

    const builtTeams = [];

    for (const team of league.teams) {
      const seasons = Array.isArray(team?.seasons) ? team.seasons : [];
      let latest = null;
      let latestSeason = -Infinity;

      for (const season of seasons) {
        const year = Number(season?.season);
        if (!Number.isFinite(year) || year < latestSeason) continue;
        latestSeason = year;
        latest = season;
      }

      latest ||= {};
      const colors = normalizeHexColors(
        Array.isArray(latest.colors) && latest.colors.length
          ? latest.colors
          : team?.colors,
      );
      const families = uniqueFamilies(colors.map(classifyColorFamily));
      const region = latest.region || team?.region || 'Unknown';
      const name = latest.name || team?.name || 'Team';
      const normalizedLatestSeason = Number.isFinite(latestSeason) ? latestSeason : null;

      builtTeams.push({
        tid: Number.isFinite(team?.tid) ? team.tid : null,
        teamName: `${region} ${name}`.replace(/\s+/g, ' ').trim(),
        logoURL: normalizeUrl(
          latest.imgURL
            || team?.imgURL
            || latest.imgURLSmall
            || team?.imgURLSmall
            || '',
        ),
        colors,
        families: families.length ? families : ['Unassigned'],
        groupingFamilies: buildGroupingFamilies(families),
        latestSeason: normalizedLatestSeason,
        isActive: team?.disabled !== true
          && normalizedLatestSeason !== null
          && normalizedLatestSeason === latestLeagueSeason,
      });
    }

    return builtTeams
      .filter((team) => team.teamName)
      .sort((a, b) => a.teamName.localeCompare(b.teamName));
  }

  function normalizeHexColors(colors) {
    if (!Array.isArray(colors)) return [];
    const result = [];

    for (const value of colors) {
      if (typeof value !== 'string') continue;
      let hex = value.trim();
      if (!hex.startsWith('#')) hex = `#${hex}`;

      if (/^#[0-9a-f]{3}$/i.test(hex)) {
        hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
      } else if (/^#[0-9a-f]{8}$/i.test(hex)) {
        hex = hex.slice(0, 7);
      }

      if (!/^#[0-9a-f]{6}$/i.test(hex)) continue;
      hex = hex.toUpperCase();
      if (!result.includes(hex)) result.push(hex);
    }

    return result;
  }

  function classifyColorFamily(hex) {
    const normalized = typeof hex === 'string' ? hex.trim().toUpperCase() : '';
    if (EXACT_FAMILY_OVERRIDES[normalized]) {
      return EXACT_FAMILY_OVERRIDES[normalized];
    }

    const rgb = hexToRgb(normalized);
    if (!rgb) return 'Unassigned';

    const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const { r, g, b } = rgb;
    const t = COLOR_CLASSIFIER_TUNING;
    const warmNeutral = h >= t.creamHueMin && h <= t.creamHueMax;
    const coolBlue = h >= t.tealBlueHueMin && h < t.blueHueMax;
    const blueDominant = b >= g * t.blueVsGreenRatio && b >= r * t.blueVsRedRatio;
    const greenDominant = g >= b * t.greenDominanceRatio && g >= r * t.greenDominanceRatio;

    if (l <= t.blackMaxLightness) return 'Black';

    if (
      l >= t.whiteMinLightness
      || (l >= t.neutralWhiteMinLightness && s <= t.neutralWhiteMaxSaturation)
      || (warmNeutral && l >= t.creamMinLightness && s <= t.creamMaxSaturation)
      || (warmNeutral && l >= t.paleCreamMinLightness && s <= t.paleCreamMaxSaturation)
    ) {
      return 'White/Cream';
    }

    if (s <= t.grayMaxSaturation) {
      if (coolBlue && (blueDominant || b >= g + t.mutedBlueChannelLead)) return 'Blue';
      if (h >= t.goldHueMax && h < t.greenHueMax && greenDominant) return 'Green';
      return 'Gray';
    }

    if (
      s <= t.mutedColorMaxSaturation
      && coolBlue
      && (blueDominant || b >= g + t.softBlueChannelLead)
    ) {
      return 'Blue';
    }

    if (
      s <= t.mutedColorMaxSaturation
      && h >= t.goldHueMax
      && h < t.greenHueMax
      && greenDominant
    ) {
      return 'Green';
    }

    if (
      h >= t.brownHueMin
      && h < t.brownHueMax
      && l < t.brownMaxLightness
      && s < t.brownMaxSaturation
    ) {
      return 'Brown';
    }

    if (h < t.redHueMax || h >= t.redHueMinHigh) return 'Red';

    if (h < t.darkWarmRedHueMax) {
      return l < t.darkWarmRedMaxLightness && s >= t.darkWarmRedMinSaturation
        ? 'Red'
        : 'Orange';
    }

    if (h < t.orangeHueMax) return 'Orange';
    if (h < t.goldHueMax) return 'Yellow/Gold';
    if (h < t.greenHueMax) return 'Green';
    if (h < t.tealBlueHueMax) return blueDominant ? 'Blue' : 'Green';
    if (h < t.blueHueMax) return 'Blue';
    if (h < t.purpleHueMax) return 'Purple';
    return 'Pink';
  }

  function buildGroupingFamilies(families) {
    const unique = uniqueFamilies(families);
    const strong = unique.filter(
      (family) => !['White/Cream', 'Gray', 'Unassigned'].includes(family),
    );

    const grouped = strong.length >= 2
      ? unique.filter((family) => !['White/Cream', 'Gray', 'Unassigned'].includes(family))
      : unique.filter((family) => family !== 'Unassigned');

    return uniqueFamilies(grouped);
  }

  function uniqueFamilies(families) {
    return Array.from(new Set((families || []).filter(Boolean))).sort(
      (a, b) => FAMILY_ORDER.indexOf(a) - FAMILY_ORDER.indexOf(b),
    );
  }

  function hexToRgb(hex) {
    const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!match) return null;
    return {
      r: parseInt(match[1], 16),
      g: parseInt(match[2], 16),
      b: parseInt(match[3], 16),
    };
  }

  function rgbToHsl(r, g, b) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const delta = max - min;
    let h = 0;

    if (delta !== 0) {
      if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
      else if (max === gn) h = 60 * (((bn - rn) / delta) + 2);
      else h = 60 * (((rn - gn) / delta) + 4);
    }

    if (h < 0) h += 360;

    const l = (max + min) / 2;
    const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
    return { h, s, l };
  }

  function saveTeams(fileName, savedTeams) {
    try {
      localStorage.setItem(COLOR_SCHEMES_KEY, JSON.stringify({
        fileName,
        savedAt: new Date().toISOString(),
        teams: savedTeams,
      }));
    } catch (error) {
      console.warn('Could not save color schemes.', error);
    }
  }

  function loadSavedTeams() {
    try {
      const raw = localStorage.getItem(COLOR_SCHEMES_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed?.teams) ? parsed.teams : [];
    } catch (error) {
      console.warn('Could not restore saved color schemes.', error);
      return [];
    }
  }

  function render(allTeams, errorMessage = '') {
    wrap.replaceChildren();

    if (!Array.isArray(allTeams) || allTeams.length === 0) {
      wrap.className = 'color-schemes-wrap empty-state';
      const empty = document.createElement('div');
      empty.className = 'empty-copy';
      const paragraph = document.createElement('p');
      paragraph.textContent = errorMessage
        || 'Upload or re-upload a league file to group its teams by color scheme.';
      empty.appendChild(paragraph);
      wrap.appendChild(empty);
      return;
    }

    let newestSeason = -Infinity;
    for (const team of allTeams) {
      const season = Number(team.latestSeason);
      if (Number.isFinite(season) && season > newestSeason) newestSeason = season;
    }

    const visible = activeOnly
      ? allTeams.filter((team) => (
        team.isActive === true
        || (team.isActive === undefined && Number(team.latestSeason) === newestSeason)
      ))
      : allTeams;

    if (visible.length === 0) {
      wrap.className = 'color-schemes-wrap empty-state';
      const empty = document.createElement('div');
      empty.className = 'empty-copy';
      const paragraph = document.createElement('p');
      paragraph.textContent = 'No active teams were found in the loaded league file.';
      empty.appendChild(paragraph);
      wrap.appendChild(empty);
      return;
    }

    wrap.className = 'color-schemes-wrap';
    const groups = new Map();

    for (const team of visible) {
      const currentFamilies = uniqueFamilies(
        normalizeHexColors(team.colors).map(classifyColorFamily),
      );
      const families = currentFamilies.length
        ? buildGroupingFamilies(currentFamilies)
        : ['Unassigned'];
      const key = families.join('|');

      if (!groups.has(key)) groups.set(key, { families, teams: [] });
      groups.get(key).teams.push(team);
    }

    const sortedGroups = Array.from(groups.values()).sort((a, b) => (
      b.teams.length - a.teams.length
      || formatSchemeName(a.families).localeCompare(formatSchemeName(b.families))
    ));

    for (const group of sortedGroups) {
      wrap.appendChild(buildGroup(group));
    }
  }

  function buildGroup(group) {
    const section = document.createElement('section');
    section.className = 'color-scheme-group';

    const header = document.createElement('div');
    header.className = 'color-scheme-group-header';

    const heading = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = formatSchemeName(group.families);

    const count = document.createElement('span');
    count.className = 'color-scheme-count';
    count.textContent = `${group.teams.length} ${group.teams.length === 1 ? 'team' : 'teams'}`;
    heading.append(title, count);

    const badges = document.createElement('div');
    badges.className = 'color-family-swatches';

    for (const family of group.families) {
      const badge = document.createElement('span');
      badge.className = 'color-family-badge';

      const dot = document.createElement('span');
      dot.className = 'color-family-dot';
      dot.style.background = FAMILY_COLORS[family] || 'transparent';
      if (family === 'White/Cream' || family === 'Unassigned') {
        dot.classList.add('needs-border');
      }

      const text = document.createElement('span');
      text.textContent = family;
      badge.append(dot, text);
      badges.appendChild(badge);
    }

    header.append(heading, badges);

    const grid = document.createElement('div');
    grid.className = 'color-team-grid';
    for (const team of group.teams) {
      grid.appendChild(buildCard(team));
    }

    section.append(header, grid);
    return section;
  }

  function buildCard(team) {
    const card = document.createElement('article');
    card.className = 'color-team-card';

    const logo = document.createElement('div');
    logo.className = 'color-team-logo';

    if (team.logoURL) {
      const image = document.createElement('img');
      image.src = team.logoURL;
      image.alt = `${team.teamName} logo`;
      image.loading = 'lazy';
      image.addEventListener('error', () => {
        logo.replaceChildren(buildInitials(team.teamName));
      }, { once: true });
      logo.appendChild(image);
    } else {
      logo.appendChild(buildInitials(team.teamName));
    }

    const details = document.createElement('div');
    details.className = 'color-team-details';

    const name = document.createElement('strong');
    name.textContent = team.teamName;

    const meta = document.createElement('span');
    meta.className = 'color-team-meta';
    meta.textContent = Number.isFinite(team.tid) ? `TID ${team.tid}` : 'TID unknown';

    const swatches = document.createElement('div');
    swatches.className = 'team-hex-swatches';
    const colors = Array.isArray(team.colors) ? team.colors : [];

    for (const hex of colors) {
      const swatch = document.createElement('span');
      swatch.className = 'team-hex-swatch';
      swatch.style.background = hex;
      swatch.title = `${hex} — ${classifyColorFamily(hex)}`;
      swatch.setAttribute('aria-label', `${hex}, ${classifyColorFamily(hex)}`);
      swatches.appendChild(swatch);
    }

    if (colors.length === 0) {
      const none = document.createElement('span');
      none.className = 'color-team-meta';
      none.textContent = 'No colors assigned';
      swatches.appendChild(none);
    }

    details.append(name, meta, swatches);

    if (colors.length) {
      const hexText = document.createElement('span');
      hexText.className = 'color-hex-text';
      hexText.textContent = colors.join(' · ');
      details.appendChild(hexText);
    }

    card.append(logo, details);
    return card;
  }

  function buildInitials(teamName) {
    const element = document.createElement('span');
    element.className = 'color-team-initials';
    element.textContent = String(teamName)
      .split(/\s+/)
      .filter(Boolean)
      .slice(-2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
    return element;
  }

  function formatSchemeName(families) {
    return families.length ? families.join(' + ') : 'Unassigned';
  }

  function normalizeUrl(value) {
    return typeof value === 'string' ? value.trim() : '';
  }
})();