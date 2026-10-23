(() => {
  const tabBtn = document.getElementById('retiredNumbersTabBtn');
  const panel = document.getElementById('retiredNumbersPanel');
  const wrap = document.getElementById('retiredNumbersWrap');
  const summary = document.getElementById('retiredNumbersSummary');
  const upload = document.getElementById('leagueFile');
  const clear = document.getElementById('clearLeagueFileBtn');
  const hub = window.DBLLeagueFileHub;
  const stream = window.DBLLeagueStream;
  if (!tabBtn || !panel || !wrap || !stream) return;

  const SVG_NS = 'http://www.w3.org/2000/svg';
  let nameCurveSequence = 0;
  let currentFile = null;
  let version = 0;
  let loadedVersion = -1;
  let loadingVersion = -1;

  const getYear = (value) => {
    const year = Number(value);
    return Number.isInteger(year) && year > 0 ? year : null;
  };

  function normalizeHex(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (/^#[\da-f]{6}$/i.test(trimmed)) return trimmed.toUpperCase();
    if (/^#[\da-f]{3}$/i.test(trimmed)) {
      return '#' + trimmed.slice(1).split('').map((digit) => digit + digit).join('').toUpperCase();
    }
    return null;
  }

  function normalizeColors(values) {
    if (!Array.isArray(values)) return [];
    return values.map(normalizeHex).filter(Boolean);
  }

  function luminance(color) {
    const rgb = [1, 3, 5].map((offset) => {
      const c = parseInt(color.slice(offset, offset + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  }

  function ratio(colorA, colorB) {
    const a = luminance(colorA);
    const b = luminance(colorB);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }

  function readableNumberColor(primary, historicalSecondary) {
    // Prefer the historical accent; use neutral lettering only when it would
    // otherwise disappear against a near-matching historical primary color.
    if (historicalSecondary && ratio(primary, historicalSecondary) >= 3) {
      return historicalSecondary;
    }
    return ratio(primary, '#FFFFFF') >= ratio(primary, '#101010') ? '#FFFFFF' : '#101010';
  }

  function getTeamName(team, seasons) {
    const last = seasons[seasons.length - 1] || {};
    const region = String(last.region || team.region || '').trim();
    const name = String(last.name || team.name || '').trim();
    return (region + ' ' + name).trim() || String(team.abbrev || 'Unknown franchise');
  }

  function buildTeam(team) {
    const seasons = (Array.isArray(team?.seasons) ? team.seasons : [])
      .filter((season) => getYear(season?.season) !== null)
      .sort((a, b) => a.season - b.season);
    const history = new Map(seasons.map((season) => [getYear(season.season), season]));
    const jerseyRecords = Array.isArray(team?.retiredJerseyNumbers) ? team.retiredJerseyNumbers : [];
    const jerseys = [];

    for (const entry of jerseyRecords) {
      if (!entry || entry.number === null || entry.number === undefined) continue;
      const number = String(entry.number).trim();
      if (!number) continue;
      // BBGM's "seasonTeamInfo" is the selected historical uniform/branding
      // season; "seasonRetired" is the ceremony year and can differ greatly.
      const designatedYear = getYear(entry.seasonTeamInfo);
      const retiredYear = getYear(entry.seasonRetired);
      const season = designatedYear !== null ? history.get(designatedYear) : null;
      const colors = normalizeColors(season?.colors);
      const fallbackColors = normalizeColors(team?.colors);
      const primary = colors[0] || fallbackColors[0] || '#6D737A';
      const secondary = colors[1] || fallbackColors[1] || '#F5F1EA';
      const tertiary = colors[2] || fallbackColors[2] || secondary;
      const historicName = season
        ? (String(season.region || '').trim() + ' ' + String(season.name || '').trim()).trim()
        : '';
      jerseys.push({
        number,
        retiredYear,
        uniformYear: designatedYear,
        colors: { primary, secondary, tertiary, number: readableNumberColor(primary, secondary) },
        historicName,
        playerId: Number.isInteger(entry.pid) ? entry.pid : null,
      });
    }

    return {
      tid: Number.isInteger(team?.tid) ? team.tid : null,
      name: getTeamName(team, seasons),
      jerseys,
    };
  }

  function el(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function svgEl(tag, attributes = {}) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
    return node;
  }

  function makeJersey(team, jersey, playersById) {
    const figure = el('figure', 'retired-numbers-jersey');
    const player = playersById.get(jersey.playerId);
    const lastName = (player?.lastName || 'Unknown').toUpperCase();
    const label = [
      team.name + ' #' + jersey.number,
      player?.fullName || 'Player unknown',
      jersey.uniformYear ? 'Historical uniform year: ' + jersey.uniformYear : 'Historical uniform year unavailable',
      jersey.retiredYear ? 'Retired: ' + jersey.retiredYear : 'Retirement year unavailable',
    ].join(' • ');

    figure.title = label;
    const svg = svgEl('svg', { viewBox: '0 0 94 110', role: 'img', 'aria-label': label });
    svg.appendChild(svgEl('title'));
    svg.firstChild.textContent = label;

    // Wide sleeveless basketball singlet (50% wider torso than the original).
    // Keep recessed arm openings and the round collar, without sleeves.
    // Historical colors still come exclusively from seasonTeamInfo.
    svg.appendChild(svgEl('path', {
      d: 'M17 8 L32 5 Q47 24 62 5 L77 8 C71 20 72.5 26 84.5 38 L77 44 L77 103 L17 103 L17 44 L9.5 38 C21.5 26 23 20 17 8 Z',
      fill: jersey.colors.primary,
      stroke: jersey.colors.secondary,
      'stroke-width': 2.4,
      'stroke-linejoin': 'round',
    }));
    svg.appendChild(svgEl('path', {
      d: 'M32 5 Q47 24 62 5',
      fill: 'none',
      stroke: jersey.colors.secondary,
      'stroke-width': 4,
      'stroke-linecap': 'round',
    }));
    svg.appendChild(svgEl('path', {
      d: 'M17 8 C23 20 21.5 27 9.5 38 M77 8 C71 20 72.5 27 84.5 38',
      fill: 'none',
      stroke: jersey.colors.tertiary,
      'stroke-width': 3.2,
      'stroke-linecap': 'round',
    }));
    svg.appendChild(svgEl('path', {
      d: 'M17 96 L77 96',
      fill: 'none',
      stroke: jersey.colors.tertiary,
      'stroke-width': 2.2,
    }));

    // Follow the upward arch of a classic basketball jersey nameplate.
    // Every SVG gets a distinct path ID so repeated jerseys don't share paths.
    const nameCurveId = 'dbl-retired-name-curve-' + (++nameCurveSequence);
    const defs = svgEl('defs');
    defs.appendChild(svgEl('path', {
      id: nameCurveId,
      d: 'M20 49 Q47 24 74 49',
    }));
    svg.appendChild(defs);

    const nameSize = lastName.length > 17 ? 5.4
      : lastName.length > 13 ? 6.2
      : lastName.length > 10 ? 7
      : lastName.length > 7 ? 8
      : 9.5;
    const nameAttrs = {
      fill: jersey.colors.number,
      'font-family': 'Arial, Helvetica, sans-serif',
      'font-weight': 800,
      'font-size': nameSize,
      'text-anchor': 'middle',
      'letter-spacing': '0.15',
    };
    // Only compress text that might extend past the jersey's chest panel.
    if (lastName.length * nameSize * 0.65 > 49) {
      nameAttrs.textLength = 49;
      nameAttrs.lengthAdjust = 'spacingAndGlyphs';
    }
    const nameText = svgEl('text', nameAttrs);
    const namePath = svgEl('textPath', {
      href: '#' + nameCurveId,
      startOffset: '50%',
    });
    namePath.textContent = lastName;
    nameText.appendChild(namePath);
    svg.appendChild(nameText);

    const numberText = svgEl('text', {
      x: 47,
      y: 79,
      fill: jersey.colors.number,
      'font-family': 'Arial, Helvetica, sans-serif',
      'font-weight': 800,
      'font-size': jersey.number.length > 2 ? 23 : 31,
      'text-anchor': 'middle',
      'letter-spacing': '-1',
    });
    numberText.textContent = jersey.number;
    svg.appendChild(numberText);
    figure.appendChild(svg);

    return figure;
  }

  function showMessage(message) {
    summary.textContent = '';
    wrap.replaceChildren(el('p', 'retired-numbers-feedback', message));
  }

  function showTeams(teams, playersById = new Map()) {
    const sorted = teams.sort((a, b) =>
      b.jerseys.length - a.jerseys.length
      || a.name.localeCompare(b.name)
      || (a.tid ?? Infinity) - (b.tid ?? Infinity));
    const total = sorted.reduce((sum, team) => sum + team.jerseys.length, 0);
    const withRetirements = sorted.filter((team) => team.jerseys.length).length;
    summary.textContent = total + ' retired jerseys across ' + withRetirements
      + ' teams • ' + sorted.length + ' franchises in this file • Most retirements first';

    if (!sorted.length) {
      showMessage('No team data was found in the league file.');
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const team of sorted) {
      const section = el('section', 'retired-numbers-team');
      const header = el('div', 'retired-numbers-team-header');
      header.append(
        el('h3', 'retired-numbers-team-name', team.name),
        el('span', 'retired-numbers-team-count',
          team.jerseys.length + ' retired ' + (team.jerseys.length === 1 ? 'number' : 'numbers')),
      );
      section.appendChild(header);
      if (team.jerseys.length) {
        const gallery = el('div', 'retired-numbers-jerseys');
        for (const jersey of team.jerseys) gallery.appendChild(makeJersey(team, jersey, playersById));
        section.appendChild(gallery);
      } else {
        section.appendChild(el('div', 'retired-numbers-empty', 'No retired numbers'));
      }
      fragment.appendChild(section);
    }
    wrap.replaceChildren(fragment);
  }

  function acceptFile(file) {
    if (file === currentFile) return;
    currentFile = file || null;
    version += 1;
    loadedVersion = -1;
    loadingVersion = -1;
    if (!file) {
      showMessage('Load a league file to display retired numbers.');
    } else if (!panel.hidden) {
      void loadIfNeeded();
    } else {
      showMessage('Open this tab to load retired numbers from the league file.');
    }
  }

  async function loadIfNeeded() {
    const file = currentFile;
    const token = version;
    if (!file || loadedVersion === token || loadingVersion === token) return;
    loadingVersion = token;
    showMessage('Reading retired jersey history from the league file…');
    try {
      const teams = [];
      await stream.forEachTopLevelArrayItem(file, 'teams', (team) => {
        if (token === version && team && typeof team === 'object') {
          teams.push(buildTeam(team));
        }
      });
      if (token !== version || file !== currentFile) return;

      // Retired jerseys refer to players by PID. Read only the names needed
      // for this view; keep large exports in streaming mode instead of parsing
      // every player's career into memory.
      const neededPids = new Set(teams.flatMap((team) =>
        team.jerseys.map((jersey) => jersey.playerId).filter((pid) => pid !== null)));
      const playersById = new Map();
      if (neededPids.size) {
        try {
          await stream.forEachTopLevelArrayItem(file, 'players', (player) => {
            if (token !== version || !neededPids.has(player?.pid)) return;
            const lastName = typeof player.lastName === 'string' ? player.lastName.trim() : '';
            if (!lastName) return;
            const firstName = typeof player.firstName === 'string' ? player.firstName.trim() : '';
            playersById.set(player.pid, {
              lastName,
              fullName: [firstName, lastName].filter(Boolean).join(' '),
            });
          });
        } catch (error) {
          // Keep existing jersey data visible if a partial export lacks
          // the players array; unknown names are labeled rather than invented.
          console.warn('Could not look up retired jersey player names.', error);
        }
      }
      if (token !== version || file !== currentFile) return;
      loadedVersion = token;
      showTeams(teams, playersById);
    } catch (error) {
      if (token !== version) return;
      console.warn('Could not load retired jersey history.', error);
      showMessage('Could not read retired numbers from this league file.');
    } finally {
      if (loadingVersion === token) loadingVersion = -1;
    }
  }

  if (hub) {
    hub.subscribe(({ file }) => acceptFile(file));
  } else {
    upload?.addEventListener('change', (event) => acceptFile(event.target.files?.[0] || null));
    clear?.addEventListener('click', () => acceptFile(null));
  }

  // The centralized router dispatches this for clicks AND restored tab state.
  window.addEventListener('dbl:tab-change', (event) => {
    if (event.detail?.tabId === 'retiredNumbersTabBtn') void loadIfNeeded();
  });
  tabBtn.addEventListener('click', () => void loadIfNeeded());
})();
