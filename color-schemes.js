(() => {
  const COLOR_SCHEMES_KEY = 'dbl-logo-color-schemes:v1';
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

  const colorSchemesTabBtn = document.getElementById('colorSchemesTabBtn');
  const colorSchemesPanel = document.getElementById('colorSchemesPanel');
  const colorSchemesWrap = document.getElementById('colorSchemesWrap');
  const leagueFileInput = document.getElementById('leagueFile');
  const clearLeagueFileBtn = document.getElementById('clearLeagueFileBtn');

  if (!colorSchemesTabBtn || !colorSchemesPanel || !colorSchemesWrap) return;

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

  let colorSchemeTeams = loadSavedColorSchemes();
  renderColorSchemes(colorSchemeTeams);

  colorSchemesTabBtn.addEventListener('click', () => {
    activateColorSchemesTab();
    renderColorSchemes(colorSchemeTeams);
  });

  for (const tabId of standardTabIds) {
    document.getElementById(tabId)?.addEventListener('click', deactivateColorSchemesTab);
  }

  leagueFileInput?.addEventListener('change', async (event) => {
    const [file] = event.target.files || [];
    if (!file) return;

    try {
      const text = await readLeagueFileForColors(file);
      const league = JSON.parse(text);
      colorSchemeTeams = buildColorSchemeTeams(league);
      saveColorSchemes(file.name, colorSchemeTeams);
      renderColorSchemes(colorSchemeTeams);
    } catch (error) {
      console.warn('Could not build color scheme groups.', error);
      if (!colorSchemeTeams.length) {
        renderColorSchemes([], 'Could not read team colors from that league file.');
      }
    }
  });

  clearLeagueFileBtn?.addEventListener('click', () => {
    colorSchemeTeams = [];
    try {
      localStorage.removeItem(COLOR_SCHEMES_KEY);
    } catch (error) {
      console.warn('Could not clear saved color schemes.', error);
    }
    renderColorSchemes([]);
  });

  function activateColorSchemesTab() {
    for (const panelId of standardPanelIds) {
      const panel = document.getElementById(panelId);
      if (panel) panel.hidden = true;
    }

    document.querySelectorAll('.tab-btn').forEach((button) => {
      button.classList.remove('active');
      button.setAttribute('aria-selected', 'false');
    });

    colorSchemesPanel.hidden = false;
    colorSchemesTabBtn.classList.add('active');
    colorSchemesTabBtn.setAttribute('aria-selected', 'true');
  }

  function deactivateColorSchemesTab() {
    colorSchemesPanel.hidden = true;
    colorSchemesTabBtn.classList.remove('active');
    colorSchemesTabBtn.setAttribute('aria-selected', 'false');
  }

  async function readLeagueFileForColors(file) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const isGzip = file.name.toLowerCase().endsWith('.gz') || (bytes[0] === 0x1f && bytes[1] === 0x8b);

    if (isGzip) {
      if (!window.pako) throw new Error('Gzip support did not load.');
      return window.pako.ungzip(bytes, { to: 'string' });
    }

    return new TextDecoder().decode(bytes);
  }

  function buildColorSchemeTeams(league) {
    if (!league || !Array.isArray(league.teams)) return [];

    return league.teams
      .map((team) => {
        const seasons = Array.isArray(team?.seasons)
          ? team.seasons
              .filter((season) => Number.isFinite(season?.season))
              .sort((a, b) => a.season - b.season)
          : [];
        const latestSeason = seasons[seasons.length - 1] || {};
        const rawColors = normalizeHexColors(
          Array.isArray(latestSeason.colors) && latestSeason.colors.length
            ? latestSeason.colors
            : team?.colors,
        );
        const families = uniqueFamilies(rawColors.map(classifyColorFamily));
        const groupingFamilies = buildGroupingFamilies(families);
        const region = latestSeason.region || team?.region || 'Unknown';
        const name = latestSeason.name || team?.name || 'Team';
        const teamName = `${region} ${name}`.replace(/\s+/g, ' ').trim();
        const logoURL = normalizeUrl(
          latestSeason.imgURL
            || team?.imgURL
            || latestSeason.imgURLSmall
            || team?.imgURLSmall
            || '',
        );

        return {
          tid: Number.isFinite(team?.tid) ? team.tid : null,
          teamName,
          logoURL,
          colors: rawColors,
          families: families.length ? families : ['Unassigned'],
          groupingFamilies: groupingFamilies.length ? groupingFamilies : ['Unassigned'],
          latestSeason: Number.isFinite(latestSeason.season) ? latestSeason.season : null,
        };
      })
      .filter((team) => team.teamName)
      .sort((a, b) => a.teamName.localeCompare(b.teamName));
  }

  function normalizeHexColors(colors) {
    if (!Array.isArray(colors)) return [];
    const normalized = [];

    for (const color of colors) {
      if (typeof color !== 'string') continue;
      let hex = color.trim();
      if (!hex.startsWith('#')) hex = `#${hex}`;

      if (/^#[0-9a-f]{3}$/i.test(hex)) {
        hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
      } else if (/^#[0-9a-f]{8}$/i.test(hex)) {
        hex = hex.slice(0, 7);
      }

      if (!/^#[0-9a-f]{6}$/i.test(hex)) continue;
      const upperHex = hex.toUpperCase();
      if (!normalized.includes(upperHex)) normalized.push(upperHex);
    }

    return normalized;
  }

  function classifyColorFamily(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return 'Unassigned';
    const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);

    if (l <= 0.12) return 'Black';
    if (l >= 0.91 || (s <= 0.16 && l >= 0.82) || (l >= 0.84 && s <= 0.55 && h >= 20 && h <= 65)) return 'White/Cream';
    if (s <= 0.14) return 'Gray';

    if (h >= 15 && h < 50 && l < 0.42) return 'Brown';
    if (h < 15 || h >= 345) return 'Red';
    if (h < 40) return 'Orange';
    if (h < 70) return 'Yellow/Gold';
    if (h < 195) return 'Green';
    if (h < 255) return 'Blue';
    if (h < 315) return 'Purple';
    return 'Pink';
  }

  function buildGroupingFamilies(families) {
    const unique = uniqueFamilies(families);
    const substantial = unique.filter((family) => !['White/Cream', 'Gray', 'Unassigned'].includes(family));

    // White/cream and gray are usually trim colors. Once a team already has two
    // stronger color families, omit those neutrals from the group name while
    // still displaying their actual swatches on the team card.
    const grouped = substantial.length >= 2
      ? unique.filter((family) => !['White/Cream', 'Gray', 'Unassigned'].includes(family))
      : unique.filter((family) => family !== 'Unassigned');

    return uniqueFamilies(grouped);
  }

  function uniqueFamilies(families) {
    return Array.from(new Set(families.filter(Boolean))).sort(
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

  function saveColorSchemes(fileName, teams) {
    try {
      localStorage.setItem(COLOR_SCHEMES_KEY, JSON.stringify({
        fileName,
        savedAt: new Date().toISOString(),
        teams,
      }));
    } catch (error) {
      console.warn('Could not save color schemes.', error);
    }
  }

  function loadSavedColorSchemes() {
    try {
      const raw = localStorage.getItem(COLOR_SCHEMES_KEY);
      if (!raw) return [];
      const snapshot = JSON.parse(raw);
      return Array.isArray(snapshot?.teams) ? snapshot.teams : [];
    } catch (error) {
      console.warn('Could not restore saved color schemes.', error);
      return [];
    }
  }

  function renderColorSchemes(teams, errorMessage = '') {
    colorSchemesWrap.replaceChildren();

    if (!Array.isArray(teams) || teams.length === 0) {
      colorSchemesWrap.className = 'color-schemes-wrap empty-state';
      const empty = document.createElement('div');
      empty.className = 'empty-copy';
      const message = document.createElement('p');
      message.textContent = errorMessage || 'Upload or re-upload a league file to group its teams by color scheme.';
      empty.appendChild(message);
      colorSchemesWrap.appendChild(empty);
      return;
    }

    colorSchemesWrap.className = 'color-schemes-wrap';
    const groups = new Map();

    for (const team of teams) {
      // Always rebuild the family labels from the saved hex colors. This lets
      // classifier improvements take effect immediately without a new upload.
      const currentColors = normalizeHexColors(Array.isArray(team.colors) ? team.colors : []);
      const currentFamilies = uniqueFamilies(currentColors.map(classifyColorFamily));
      const families = currentFamilies.length
        ? buildGroupingFamilies(currentFamilies)
        : ['Unassigned'];
      const key = families.join('|');
      if (!groups.has(key)) groups.set(key, { families, teams: [] });
      groups.get(key).teams.push(team);
    }

    const sortedGroups = Array.from(groups.values()).sort((a, b) => {
      if (b.teams.length !== a.teams.length) return b.teams.length - a.teams.length;
      return formatSchemeName(a.families).localeCompare(formatSchemeName(b.families));
    });

    for (const group of sortedGroups) {
      colorSchemesWrap.appendChild(buildGroupSection(group));
    }
  }

  function buildGroupSection(group) {
    const section = document.createElement('section');
    section.className = 'color-scheme-group';

    const header = document.createElement('div');
    header.className = 'color-scheme-group-header';

    const headingBlock = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = formatSchemeName(group.families);
    const count = document.createElement('span');
    count.className = 'color-scheme-count';
    count.textContent = `${group.teams.length} ${group.teams.length === 1 ? 'team' : 'teams'}`;
    headingBlock.append(title, count);

    const familySwatches = document.createElement('div');
    familySwatches.className = 'color-family-swatches';
    for (const family of group.families) {
      const badge = document.createElement('span');
      badge.className = 'color-family-badge';
      const dot = document.createElement('span');
      dot.className = 'color-family-dot';
      dot.style.background = FAMILY_COLORS[family] || 'transparent';
      if (family === 'White/Cream' || family === 'Unassigned') dot.classList.add('needs-border');
      const text = document.createElement('span');
      text.textContent = family;
      badge.append(dot, text);
      familySwatches.appendChild(badge);
    }

    header.append(headingBlock, familySwatches);

    const grid = document.createElement('div');
    grid.className = 'color-team-grid';
    for (const team of group.teams) grid.appendChild(buildTeamCard(team));

    section.append(header, grid);
    return section;
  }

  function buildTeamCard(team) {
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
    if (colors.length) {
      for (const hex of colors) {
        const swatch = document.createElement('span');
        swatch.className = 'team-hex-swatch';
        swatch.style.background = hex;
        swatch.title = `${hex} — ${classifyColorFamily(hex)}`;
        swatch.setAttribute('aria-label', `${hex}, ${classifyColorFamily(hex)}`);
        swatches.appendChild(swatch);
      }
    } else {
      const none = document.createElement('span');
      none.className = 'color-team-meta';
      none.textContent = 'No colors assigned';
      swatches.appendChild(none);
    }

    const hexText = document.createElement('span');
    hexText.className = 'color-hex-text';
    hexText.textContent = colors.join(' · ');

    details.append(name, meta, swatches);
    if (colors.length) details.appendChild(hexText);
    card.append(logo, details);
    return card;
  }

  function buildInitials(teamName) {
    const initials = document.createElement('span');
    initials.className = 'color-team-initials';
    initials.textContent = String(teamName)
      .split(/\s+/)
      .filter(Boolean)
      .slice(-2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
    return initials;
  }

  function formatSchemeName(families) {
    return families.length ? families.join(' + ') : 'Unassigned';
  }

  function normalizeUrl(value) {
    return typeof value === 'string' ? value.trim() : '';
  }
})();