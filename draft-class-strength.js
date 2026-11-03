(() => {
  const panel = document.getElementById('draftClassStrengthPanel');
  const list = document.getElementById('draftClassStrengthList');
  const summary = document.getElementById('draftClassStrengthSummary');
  const orderSelect = document.getElementById('draftClassStrengthOrder');
  const hub = window.DBLLeagueFileHub;
  const stream = window.DBLLeagueStream;
  if (!panel || !list || !summary || !orderSelect || !hub?.subscribe ||
      !stream?.forEachTopLevelArrayItem || !stream?.readTopLevelValue) return;

  let activeFile = null;
  let fileVersion = 0;
  let loadingVersion = -1;
  let loadedFile = null;
  let classes = [];

  const num = value => {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  const int = value => {
    const n = num(value);
    return n !== null && Number.isInteger(n) ? n : null;
  };
  const text = (tag, cls, content) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (content !== undefined) node.textContent = String(content);
    return node;
  };
  const display = value => value === null ? '—' : value.toFixed(1);
  function valueOfAttr(value) {
    // BBGM occasionally stores season-dependent game attributes as timelines.
    if (Array.isArray(value) && value.length &&
        value.every(row => row && typeof row === 'object' && 'value' in row)) {
      return value[value.length - 1].value;
    }
    return value;
  }
  function latestRatings(player) {
    let latest = null, year = -Infinity;
    for (const rating of Array.isArray(player?.ratings) ? player.ratings : []) {
      if (!rating || typeof rating !== 'object') continue;
      const season = num(rating.season) ?? -Infinity;
      if (!latest || season >= year) {
        latest = rating;
        year = season;
      }
    }
    return latest;
  }
  function playerSummary(player, year) {
    const ratings = latestRatings(player);
    return {
      pid: int(player.pid),
      name: [player.firstName, player.lastName].filter(Boolean).join(' ').trim() ||
        String(player.name || 'Unnamed prospect'),
      pos: String(ratings?.pos || player.pos || '—'),
      ovr: num(ratings?.ovr),
      pot: num(ratings?.pot),
      classYear: year
    };
  }
  const average = rows => rows.length
    ? rows.reduce((total, n) => total + n, 0) / rows.length : null;
  const median = rows => {
    if (!rows.length) return null;
    const middle = Math.floor(rows.length / 2);
    return rows.length % 2 ? rows[middle] : (rows[middle - 1] + rows[middle]) / 2;
  };
  // BBGM potential/overall scores cluster near the middle. Narrow 1.5-point
  // grade bands let meaningful scouting differences show through without
  // forcing a bell curve or guaranteeing an A/F in every set of classes.
  // These are fixed thresholds, independent of how many classes were uploaded.
  const GRADE_BANDS = [
    [64, 'A+'], [62.5, 'A'], [61, 'A-'], [59.5, 'B+'],
    [58, 'B'], [56.5, 'B-'], [55, 'C+'], [53.5, 'C'],
    [52, 'C-'], [50.5, 'D+'], [49, 'D'], [47.5, 'D-']
  ];
  function grade(score) {
    if (score === null || !Number.isFinite(score)) return 'N/A';
    return GRADE_BANDS.find(([threshold]) => score >= threshold)?.[1] || 'F';
  }
  function analyze(year, players) {
    const potSorted = players.filter(p => p.pot !== null)
      .sort((a, b) => b.pot - a.pot || (b.ovr ?? -1) - (a.ovr ?? -1) || a.name.localeCompare(b.name));
    const potValues = potSorted.map(p => p.pot);
    const ovrValues = players.filter(p => p.ovr !== null)
      .map(p => p.ovr).sort((a, b) => b - a);
    const top5 = average(potValues.slice(0, 5));
    const top20 = average(potValues.slice(0, 20));
    const med = median(potValues);
    const topOvr = average(ovrValues.slice(0, 5));
    // Fixed, reproducible 0–100 rating scale. A class with too few rated
    // players is explicitly provisional, rather than receiving a fake F.
    const score = top5 === null ? null :
      Number((0.42 * top5 + 0.33 * top20 + 0.15 * med +
        0.10 * (topOvr ?? top5)).toFixed(1));
    const elite = potValues.filter(v => v >= 75).length;
    const strong = potValues.filter(v => v >= 65).length;
    const dataLimited = potValues.length < 5 || ovrValues.length < 5;
    return {
      year, count: players.length, rated: potValues.length, ovrRated: ovrValues.length,
      score, grade: grade(score), provisional: score !== null && dataLimited,
      top5, top20, median: med, topOvr, elite, strong,
      standout: potSorted.slice(0, 3)
    };
  }
  function description(info, medianScore) {
    if (info.score === null) {
      return 'Potential ratings are unavailable for this class, so its strength cannot be graded yet.';
    }
    const top = info.top5 >= 75 ? 'Exceptional top-end potential'
      : info.top5 >= 68 ? 'Strong top-end potential'
        : info.top5 >= 60 ? 'Promising top prospects' : 'Limited high-end potential';
    const depth = info.top20 >= 65 ? 'deep talent pool'
      : info.top20 >= 57 ? 'solid supporting depth' : 'thin supporting depth';
    const elite = info.elite > 0
      ? info.elite + ' elite-potential prospect' + (info.elite === 1 ? '' : 's') + ' (75+ POT)'
      : 'no 75+ POT prospects yet';
    let relative = '';
    if (medianScore !== null) {
      const difference = info.score - medianScore;
      if (difference >= 2) relative = ' · Above the upcoming-class median';
      else if (difference <= -2) relative = ' · Below the upcoming-class median';
    }
    return top + ', ' + depth + ', and ' + elite + relative + '.';
  }
  function showMessage(message) {
    list.replaceChildren(text('p', 'draft-strength-message', message));
  }
  function detail(label, value) {
    const box = text('div', 'draft-strength-metric');
    box.appendChild(text('span', 'draft-strength-metric-label', label));
    box.appendChild(text('strong', 'draft-strength-metric-value', value));
    return box;
  }
  function card(info, medianScore) {
    const article = text('article', 'draft-strength-card');
    const header = text('div', 'draft-strength-card-head');
    const heading = text('div', 'draft-strength-card-heading');
    heading.appendChild(text('h3', '', info.year + ' Draft Class'));
    heading.appendChild(text('p', 'draft-strength-card-count',
      info.count + ' prospect' + (info.count === 1 ? '' : 's') +
      (info.provisional ? ' · Provisional grade' : '')));
    header.appendChild(heading);
    const result = text('div', 'draft-strength-grade');
    result.appendChild(text('strong', 'draft-strength-letter', info.grade));
    result.appendChild(text('span', 'draft-strength-score',
      info.score === null ? 'Insufficient data' : info.score.toFixed(1) + ' / 100'));
    header.appendChild(result);
    article.appendChild(header);
    article.appendChild(text('p', 'draft-strength-analysis', description(info, medianScore)));
    const metrics = text('div', 'draft-strength-metrics');
    for (const [label, value] of [
      ['Top 5 POT', display(info.top5)],
      ['Top 20 POT', display(info.top20)],
      ['Median POT', display(info.median)],
      ['Top 5 OVR', display(info.topOvr)],
      ['POT 65+', String(info.strong)],
      ['POT 75+', String(info.elite)]
    ]) metrics.appendChild(detail(label, value));
    article.appendChild(metrics);
    if (info.standout.length) {
      const best = text('div', 'draft-strength-top');
      best.appendChild(text('h4', '', 'Leading prospects'));
      const entries = text('ol', 'draft-strength-top-list');
      for (const p of info.standout) {
        const entry = text('li', '');
        entry.appendChild(text('strong', '', p.name));
        entry.appendChild(text('span', '', ' · ' + p.pos + ' · POT ' + p.pot +
          ' / OVR ' + (p.ovr ?? '—')));
        entries.appendChild(entry);
      }
      best.appendChild(entries);
      article.appendChild(best);
    }
    if (info.provisional) article.appendChild(text('p', 'draft-strength-caution',
      'Provisional: fewer than five players have complete OVR/POT ratings.'));
    return article;
  }
  function render() {
    if (!loadedFile) return;
    const rows = classes.slice();
    if (orderSelect.value === 'strength') rows.sort((a, b) =>
      (b.score ?? -Infinity) - (a.score ?? -Infinity) || a.year - b.year);
    else if (orderSelect.value === 'weakest') rows.sort((a, b) =>
      (a.score ?? Infinity) - (b.score ?? Infinity) || a.year - b.year);
    else rows.sort((a, b) => a.year - b.year);
    const graded = classes.map(c => c.score).filter(Number.isFinite).sort((a, b) => a - b);
    const medianScore = median(graded);
    const best = classes.filter(c => c.score !== null)
      .sort((a, b) => b.score - a.score || a.year - b.year)[0];
    summary.textContent = classes.length + ' upcoming draft class' +
      (classes.length === 1 ? '' : 'es') +
      (best ? ' · Strongest: ' + best.year + ' (' + best.grade + ')' : '') +
      ' · Grades reflect ratings in the uploaded file';
    if (!rows.length) {
      showMessage('No upcoming undrafted classes were found in this league export.');
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const row of rows) fragment.appendChild(card(row, medianScore));
    list.replaceChildren(fragment);
  }
  async function load(file, version) {
    loadingVersion = version;
    const current = () => fileVersion === version && activeFile === file;
    showMessage('Reading future draft classes and evaluating their talent…');
    summary.textContent = 'Analyzing draft prospects…';
    try {
      const attrs = await stream.readTopLevelValue(file, 'gameAttributes') || {};
      if (!current()) return;
      const season = int(valueOfAttr(attrs.season));
      const phase = int(valueOfAttr(attrs.phase));
      if (season === null) {
        showMessage('The file does not include a valid current season.');
        return;
      }
      // Include the current class only while its draft is still upcoming;
      // after the draft starts, list strictly future seasons.
      const minYear = phase !== null && phase <= 4 ? season : season + 1;
      const byClass = new Map();
      await stream.forEachTopLevelArrayItem(file, 'players', player => {
        if (!current() || int(player?.tid) !== -2) return;
        const year = int(player?.draft?.year);
        if (year === null || year < minYear) return;
        const group = byClass.get(year) || [];
        group.push(playerSummary(player, year));
        byClass.set(year, group);
      });
      if (!current()) return;
      classes = [...byClass].map(([year, players]) => analyze(year, players))
        .sort((a, b) => a.year - b.year);
      loadedFile = file;
      render();
    } catch (error) {
      if (!current()) return;
      console.warn('Could not analyze future draft classes.', error);
      summary.textContent = '';
      showMessage('Could not read draft prospects from this league file. Try uploading it again.');
    } finally {
      if (current()) loadingVersion = -1;
    }
  }
  function ensureLoaded() {
    const file = activeFile || hub.getCurrentFile?.();
    if (!file) {
      summary.textContent = '';
      showMessage('Upload a league file to see future draft class grades.');
      return;
    }
    if (loadedFile === file || loadingVersion === fileVersion) return;
    void load(file, fileVersion);
  }
  function receive(file) {
    if (file === activeFile) return;
    activeFile = file || null;
    fileVersion++;
    loadingVersion = -1;
    loadedFile = null;
    classes = [];
    summary.textContent = '';
    showMessage(file
      ? 'Open Draft Class Strength to analyze upcoming draft classes.'
      : 'Upload a league file to see future draft class grades.');
    if (file && !panel.hidden) ensureLoaded();
  }
  orderSelect.addEventListener('change', render);
  window.addEventListener('dbl:tab-change', event => {
    if (event.detail?.panelId === 'draftClassStrengthPanel') ensureLoaded();
  });
  hub.subscribe(({ file }) => receive(file));
  receive(hub.getCurrentFile?.() || null);
  window.DBLDraftClassStrength = Object.freeze({ grade, analyze });
})();