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

  function makeJersey(team, jersey) {
    const figure = el('figure', 'retired-numbers-jersey');
    const label = [
      team.name + ' #' + jersey.number,
      jersey.uniformYear ? 'Historical uniform year: ' + jersey.uniformYear : 'Historical uniform year unavailable',
      jersey.retiredYear ? 'Retired: ' + jersey.retiredYear : 'Retirement year unavailable',
    ].join(' • ');

    figure.title = label;
    const svg = svgEl('svg', { viewBox: '0 0 94 110', role: 'img', 'aria-label': label });
    svg.appendChild(svgEl('title'));
    svg.firstChild.textContent = label;

    // Vector jersey silhouette; all historical colors come from the season
    // selected by seasonTeamInfo, rather than the current franchise palette.
    svg.appendChild(svgEl('path', {
      d: 'M29 9 L37 4 Q47 13 57 4 L65 9 L88 24 L78 43 L68 37 L68 103 L26 103 L26 37 L16 43 L6 24 Z',
      fill: jersey.colors.primary,
      stroke: jersey.colors.secondary,
      'stroke-width': 2.4,
      'stroke-linejoin': 'round',
    }));
    svg.appendChild(svgEl('path', {
      d: 'M36 6 Q47 26 58 6',
      fill: 'none',
      stroke: jersey.colors.secondary,
      'stroke-width': 4.5,
    }));
    svg.appendChild(svgEl('path', {
      d: 'M8 29 L17 37 L26 31 M86 29 L77 37 L68 31',
      fill: 'none',
      stroke: jersey.colors.tertiary,
      'stroke-width': 4.2,
      'stroke-linejoin': 'round',
    }));
    svg.appendChild(svgEl('path', {
      d: 'M27 96 L67 96',
      fill: 'none',
      stroke: jersey.colors.tertiary,
      'stroke-width': 2.2,
    }));

    const numberText = svgEl('text', {
      x: 47,
      y: 72,
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

    const caption = el('figcaption', null, jersey.uniformYear ? String(jersey.uniformYear) : 'Year unknown');
    caption.title = 'Uniform design/color year';
    figure.appendChild(caption);
    return figure;
  }

  function showMessage(message) {
    summary.textContent = '';
    wrap.replaceChildren(el('p', 'retired-numbers-feedback', message));
  }

  function showTeams(teams) {
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
        for (const jersey of team.jerseys) gallery.appendChild(makeJersey(team, jersey));
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
      loadedVersion = token;
      showTeams(teams);
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
