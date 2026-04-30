const fileInput = document.getElementById('leagueFile');
const statusMessage = document.getElementById('statusMessage');
const teamCountEl = document.getElementById('teamCount');
const yearRangeEl = document.getElementById('yearRange');
const cellCountEl = document.getElementById('cellCount');
const timelineWrap = document.getElementById('timelineWrap');
const mobileFullscreenBtn = document.getElementById('mobileFullscreenBtn');
const closeFullscreenBtn = document.getElementById('closeFullscreenBtn');
const activeTeamsOnlyToggle = document.getElementById('activeTeamsOnlyToggle');
const activeTeamsOnlyToggleFullscreen = document.getElementById('activeTeamsOnlyToggleFullscreen');
const teamSortModeSelect = document.getElementById('teamSortMode');
const timelineFullscreen = document.getElementById('timelineFullscreen');
const timelineFullscreenWrap = document.getElementById('timelineFullscreenWrap');
const SAVED_TIMELINE_KEY = 'dbl-logo-timeline:v1';
const SAVED_BANNERS_KEY = 'dbl-logo-banners:v1';
const logosTabBtn = document.getElementById('logosTabBtn');
const bannersTabBtn = document.getElementById('bannersTabBtn');
const logosPanel = document.getElementById('logosPanel');
const bannersPanel = document.getElementById('bannersPanel');
const bannersWrap = document.getElementById('bannersWrap');
let fullTimeline = null;
let currentTimeline = null;
let teamSortMode = 'alpha';
let savedBannersByYear = loadSavedBanners();

restoreSavedTimeline();
setActiveTab('logos');
renderBanners(fullTimeline);

logosTabBtn?.addEventListener('click', () => setActiveTab('logos'));
bannersTabBtn?.addEventListener('click', () => setActiveTab('banners'));

fileInput.addEventListener('change', async (event) => {
  const [file] = event.target.files || [];
  if (!file) return;

  setStatus(`Loading ${file.name}...`, 'info');

  try {
    const text = await readLeagueFile(file);
    const league = JSON.parse(text);
    const timeline = buildTimelineData(league);
    setTimeline(timeline);
    persistTimeline(file.name, timeline);
    setStatus(`Loaded ${file.name}.`, 'info');
  } catch (error) {
    console.error(error);
    if (hasSavedTimeline()) {
      setStatus(
        `Could not load ${file.name}. Keeping your currently saved timeline. ${error.message || ''}`.trim(),
        'error',
      );
    } else {
      timelineWrap.className = 'timeline-wrap empty-state';
      timelineWrap.innerHTML = '<div class="empty-copy"><p>Could not load that league file.</p></div>';
      resetStats();
      setStatus(error.message || 'Could not parse league file.', 'error');
    }
  }
});

mobileFullscreenBtn.addEventListener('click', () => {
  if (!currentTimeline) return;
  timelineFullscreen.hidden = false;
  document.body.classList.add('fullscreen-open');
  renderTimelineInto(currentTimeline, timelineFullscreenWrap);
});

activeTeamsOnlyToggle.addEventListener('change', () => {
  setActiveTeamsOnlyEnabled(activeTeamsOnlyToggle.checked);
});

teamSortModeSelect?.addEventListener('change', () => {
  teamSortMode = teamSortModeSelect.value === 'tid' ? 'tid' : 'alpha';
  if (!fullTimeline) return;
  setTimeline(fullTimeline);
});

activeTeamsOnlyToggleFullscreen?.addEventListener('change', () => {
  setActiveTeamsOnlyEnabled(activeTeamsOnlyToggleFullscreen.checked);
});

closeFullscreenBtn.addEventListener('click', closeFullscreenTimeline);
timelineFullscreen.addEventListener('click', (event) => {
  if (event.target === timelineFullscreen) {
    closeFullscreenTimeline();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !timelineFullscreen.hidden) {
    closeFullscreenTimeline();
  }
});

function setStatus(message, type = 'info') {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`;
}

function resetStats() {
  teamCountEl.textContent = '—';
  yearRangeEl.textContent = '—';
  cellCountEl.textContent = '—';
}

function persistTimeline(fileName, timeline) {
  try {
    const snapshot = {
      fileName,
      savedAt: new Date().toISOString(),
      timeline: serializeTimeline(timeline),
    };
    localStorage.setItem(SAVED_TIMELINE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    console.warn('Could not save timeline to localStorage.', error);
  }
}

function hasSavedTimeline() {
  return Boolean(localStorage.getItem(SAVED_TIMELINE_KEY));
}

function restoreSavedTimeline() {
  try {
    const raw = localStorage.getItem(SAVED_TIMELINE_KEY);
    if (!raw) return;

    const snapshot = JSON.parse(raw);
    const timeline = deserializeTimeline(snapshot?.timeline);
    if (!timeline) return;

    setTimeline(timeline);

    const savedStamp = snapshot.savedAt
      ? ` Last saved ${new Date(snapshot.savedAt).toLocaleString()}.`
      : '';
    const fileText = snapshot.fileName ? `Saved league: ${snapshot.fileName}.` : 'Restored saved league timeline.';
    setStatus(`${fileText} Upload a new league file to replace it.${savedStamp}`, 'info');
  } catch (error) {
    console.warn('Could not restore saved timeline from localStorage.', error);
    localStorage.removeItem(SAVED_TIMELINE_KEY);
  }
}

function serializeTimeline(timeline) {
  return {
    years: timeline.years,
    minYear: timeline.minYear,
    maxYear: timeline.maxYear,
    rows: timeline.rows.map((row) => ({
      tid: row.tid,
      latestLocation: row.latestLocation,
      firstSeason: row.firstSeason,
      lastSeason: row.lastSeason,
      years: row.years,
      entriesByYear: Array.from(row.entriesByYear.entries()),
    })),
  };
}

function deserializeTimeline(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.rows) || !Array.isArray(snapshot.years)) {
    return null;
  }

  return {
    years: snapshot.years,
    minYear: snapshot.minYear,
    maxYear: snapshot.maxYear,
    rows: snapshot.rows.map((row) => ({
      tid: row.tid,
      latestLocation: row.latestLocation,
      firstSeason: row.firstSeason,
      lastSeason: row.lastSeason,
      years: Array.isArray(row.years) ? row.years : [],
      entriesByYear: new Map(Array.isArray(row.entriesByYear) ? row.entriesByYear : []),
    })),
  };
}

async function readLeagueFile(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const isGzip = file.name.endsWith('.gz') || (bytes[0] === 0x1f && bytes[1] === 0x8b);

  if (isGzip) {
    if (!window.pako) {
      throw new Error('Gzip support did not load.');
    }
    return window.pako.ungzip(bytes, { to: 'string' });
  }

  return new TextDecoder().decode(bytes);
}

function buildTimelineData(league) {
  if (!league || !Array.isArray(league.teams)) {
    throw new Error('This file does not look like a valid league export.');
  }

  const rows = league.teams
    .map((team) => normalizeTeamTimeline(team))
    .filter((row) => row.years.length > 0)
    .sort((a, b) => a.firstSeason - b.firstSeason);

  if (!rows.length) {
    throw new Error('No team season history was found in this file.');
  }

  const minYear = Math.min(...rows.map((row) => row.firstSeason));
  const maxYear = Math.max(...rows.map((row) => row.lastSeason));
  const years = range(minYear, maxYear);

  return {
    years,
    rows,
    minYear,
    maxYear,
  };
}

function normalizeTeamTimeline(team) {
  const seasons = Array.isArray(team.seasons)
    ? team.seasons
        .filter((season) => Number.isFinite(season?.season))
        .sort((a, b) => a.season - b.season)
    : [];

  const years = seasons.map((season) => season.season);
  const firstSeason = years.length ? years[0] : null;
  const lastSeason = years.length ? years[years.length - 1] : null;
  const latestSeason = seasons[seasons.length - 1] || {};
  const latestLocation = latestSeason.region || team.region || 'Unknown';

  const entriesByYear = new Map();
  let lastKnownLogo = null;

  for (const season of seasons) {
    const logoURL = normalizeLogoUrl(season.imgURL || season.imgURLSmall || team.imgURL || team.imgURLSmall || '');
    if (logoURL) {
      lastKnownLogo = logoURL;
    }
    entriesByYear.set(season.season, {
      year: season.season,
      logoURL: logoURL || lastKnownLogo || '',
    });
  }

  return {
    tid: team.tid,
    latestLocation,
    firstSeason,
    lastSeason,
    years,
    entriesByYear,
  };
}

function normalizeLogoUrl(url) {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  return trimmed;
}

function renderTimeline(timeline) {
  return renderTimelineInto(timeline, timelineWrap);
}

function setTimeline(timeline) {
  fullTimeline = timeline;
  currentTimeline = getVisibleTimeline(timeline);
  renderTimeline(currentTimeline);
  renderBanners(fullTimeline);
  updateStats(currentTimeline);
  if (!timelineFullscreen.hidden) {
    renderTimelineInto(currentTimeline, timelineFullscreenWrap);
  }
}

function setActiveTab(tabName) {
  const isLogos = tabName !== 'banners';
  logosTabBtn?.classList.toggle('active', isLogos);
  bannersTabBtn?.classList.toggle('active', !isLogos);
  logosTabBtn?.setAttribute('aria-selected', String(isLogos));
  bannersTabBtn?.setAttribute('aria-selected', String(!isLogos));
  logosPanel.hidden = !isLogos;
  bannersPanel.hidden = isLogos;
}

function loadSavedBanners() {
  try {
    const raw = localStorage.getItem(SAVED_BANNERS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch (error) {
    console.warn('Could not restore saved banners from localStorage.', error);
    return {};
  }
}

function saveBanners() {
  try {
    localStorage.setItem(SAVED_BANNERS_KEY, JSON.stringify(savedBannersByYear));
  } catch (error) {
    console.warn('Could not save banners to localStorage.', error);
  }
}

function renderBanners(timeline) {
  bannersWrap.innerHTML = '';
  if (!timeline || !Array.isArray(timeline.years) || timeline.years.length === 0) {
    bannersWrap.className = 'banners-wrap empty-state';
    const empty = document.createElement('div');
    empty.className = 'empty-copy';
    empty.innerHTML = '<p>Load a league file to create banner slots.</p>';
    bannersWrap.appendChild(empty);
    return;
  }

  bannersWrap.className = 'banners-wrap banner-grid';

  for (const year of timeline.years) {
    const yearKey = String(year);
    const savedUrl = typeof savedBannersByYear[yearKey] === 'string' ? savedBannersByYear[yearKey].trim() : '';
    const card = document.createElement('article');
    card.className = 'banner-card';

    const label = document.createElement('h3');
    label.className = 'banner-year';
    label.textContent = yearKey;

    const frame = document.createElement('div');
    frame.className = 'banner-square';

    const input = document.createElement('input');
    input.className = 'banner-url-input';
    input.type = 'url';
    input.placeholder = 'https://example.com/banner.png';
    input.value = savedUrl;

    const applyUrl = (url) => {
      frame.textContent = '';
      if (!url) {
        frame.classList.add('is-empty');
        return;
      }
      frame.classList.remove('is-empty');
      const image = document.createElement('img');
      image.src = url;
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      image.alt = `DBL banner, ${yearKey}`;
      frame.appendChild(image);
    };

    input.addEventListener('input', () => {
      const value = input.value.trim();
      if (value) {
        savedBannersByYear[yearKey] = value;
      } else {
        delete savedBannersByYear[yearKey];
      }
      saveBanners();
      applyUrl(value);
    });

    applyUrl(savedUrl);
    card.append(label, frame, input);
    bannersWrap.appendChild(card);
  }
}

function getVisibleTimeline(timeline) {
  const baseRows = activeTeamsOnlyToggle?.checked
    ? timeline.rows.filter((row) => row.lastSeason === timeline.maxYear)
    : timeline.rows;

  const rows = sortRows(baseRows, teamSortMode);

  return {
    years: timeline.years,
    rows,
    minYear: timeline.minYear,
    maxYear: timeline.maxYear,
  };
}

function sortRows(rows, mode) {
  const sorted = [...rows];

  if (mode === 'tid') {
    sorted.sort((a, b) => (a.tid ?? Number.MAX_SAFE_INTEGER) - (b.tid ?? Number.MAX_SAFE_INTEGER));
    return sorted;
  }

  sorted.sort((a, b) => {
    if (a.latestLocation !== b.latestLocation) {
      return a.latestLocation.localeCompare(b.latestLocation);
    }
    return (a.tid ?? Number.MAX_SAFE_INTEGER) - (b.tid ?? Number.MAX_SAFE_INTEGER);
  });
  return sorted;
}

function setActiveTeamsOnlyEnabled(enabled) {
  activeTeamsOnlyToggle.checked = enabled;
  if (activeTeamsOnlyToggleFullscreen) {
    activeTeamsOnlyToggleFullscreen.checked = enabled;
  }
  if (!fullTimeline) return;
  setTimeline(fullTimeline);
}

function renderTimelineInto(timeline, targetWrap) {
  const { years, rows } = timeline;
  if (!rows.length) {
    targetWrap.className = 'timeline-wrap empty-state';
    targetWrap.innerHTML = '<div class="empty-copy"><p>No active teams found in this league file.</p></div>';
    return;
  }

  targetWrap.className = 'timeline-wrap';

  const table = document.createElement('table');
  table.className = 'timeline-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');

  const corner = document.createElement('th');
  corner.className = 'corner-header';
  corner.textContent = 'Franchise';
  headRow.appendChild(corner);

  for (const year of years) {
    const th = document.createElement('th');
    th.className = 'year-header';
    th.textContent = year;
    headRow.appendChild(th);
  }

  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  for (const row of rows) {
    const tr = document.createElement('tr');

    const rowHeader = document.createElement('th');
    rowHeader.className = 'row-header';
    rowHeader.scope = 'row';
    rowHeader.innerHTML = `
      <div class="row-label">
        <strong>${escapeHtml(row.latestLocation)}</strong>
        <span class="row-years">${row.firstSeason}–${row.lastSeason}</span>
      </div>
    `;
    tr.appendChild(rowHeader);

    let carryForwardLogo = '';

    for (const year of years) {
      const td = document.createElement('td');
      const seasonEntry = row.entriesByYear.get(year);
      const isActiveYear = row.entriesByYear.has(year);

      if (seasonEntry?.logoURL) {
        carryForwardLogo = seasonEntry.logoURL;
      }

      const withinFranchiseSpan = year >= row.firstSeason && year <= row.lastSeason;

      if (!withinFranchiseSpan || !isActiveYear) {
        td.className = 'empty-cell';
        td.innerHTML = '<div class="empty-card" aria-hidden="true"></div>';
      } else {
        const logoToShow = seasonEntry?.logoURL || carryForwardLogo;
        if (logoToShow) {
          td.className = 'logo-cell';
          td.innerHTML = `
            <div class="logo-card">
              <img src="${escapeAttribute(logoToShow)}" alt="${escapeAttribute(row.latestLocation)} logo, ${year}" loading="lazy" referrerpolicy="no-referrer" />
            </div>
          `;
        } else {
          td.className = 'empty-cell';
          td.innerHTML = '<div class="empty-card" aria-hidden="true"></div>';
        }
      }

      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  targetWrap.innerHTML = '';
  targetWrap.appendChild(table);
}

function closeFullscreenTimeline() {
  timelineFullscreen.hidden = true;
  document.body.classList.remove('fullscreen-open');
}

function updateStats(timeline) {
  const totalCells = timeline.rows.length * timeline.years.length;
  teamCountEl.textContent = timeline.rows.length.toLocaleString();
  yearRangeEl.textContent = `${timeline.minYear}–${timeline.maxYear}`;
  cellCountEl.textContent = totalCells.toLocaleString();
}

function range(start, end) {
  const years = [];
  for (let year = start; year <= end; year += 1) {
    years.push(year);
  }
  return years;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
