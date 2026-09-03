(() => {
  const STORAGE_KEY = 'dbl-logo-rivals:v1';
  const tabBtn = document.getElementById('rivalsTabBtn');
  const panel = document.getElementById('rivalsPanel');
  const wrap = document.getElementById('rivalsWrap');
  const statusMessage = document.getElementById('statusMessage');

  if (!tabBtn || !panel || !wrap) return;

  let rivalMap = loadSavedRivals();
  let teams = [];

  tabBtn.addEventListener('click', () => {
    activateTab();
    syncFromTimeline();
  });

  document.querySelectorAll('.tab-btn').forEach((button) => {
    if (button === tabBtn) return;
    button.addEventListener('click', () => {
      panel.hidden = true;
      tabBtn.classList.remove('active');
      tabBtn.setAttribute('aria-selected', 'false');
    });
  });

  if (statusMessage) {
    const observer = new MutationObserver(() => {
      const text = statusMessage.textContent || '';
      if (!panel.hidden && text.startsWith('Loaded ')) syncFromTimeline();
      if (text.startsWith('Cleared loaded league file')) renderEmpty();
    });
    observer.observe(statusMessage, { childList: true, characterData: true, subtree: true });
  }

  function activateTab() {
    document.querySelectorAll('.page > .panel[id]').forEach((section) => {
      if (section !== panel && section.id !== '') section.hidden = true;
    });
    document.querySelectorAll('.tab-btn').forEach((button) => {
      button.classList.remove('active');
      button.setAttribute('aria-selected', 'false');
    });
    panel.hidden = false;
    tabBtn.classList.add('active');
    tabBtn.setAttribute('aria-selected', 'true');
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
    if (!timeline || !Array.isArray(timeline.rows) || !timeline.rows.length) {
      teams = [];
      renderEmpty();
      return;
    }

    teams = timeline.rows
      .map((row, index) => buildTeam(row, index))
      .filter(Boolean)
      .sort((a, b) => a.label.localeCompare(b.label) || a.sortTid - b.sortTid);

    render();
  }

  function buildTeam(row, index) {
    if (!row || !(row.entriesByYear instanceof Map)) return null;
    const years = Array.from(row.entriesByYear.keys())
      .map(Number)
      .filter(Number.isFinite)
      .sort((a, b) => b - a);
    if (!years.length) return null;

    let label = '';
    for (const year of years) {
      const entry = row.entriesByYear.get(year);
      if (typeof entry?.teamName === 'string' && entry.teamName.trim()) {
        label = entry.teamName.trim();
        break;
      }
    }
    if (!label) label = row.latestLocation || `Team ${index + 1}`;

    const tid = Number.isFinite(row.tid) ? row.tid : null;
    return {
      key: tid === null ? `row:${index}:${label}` : `tid:${tid}`,
      label,
      sortTid: tid === null ? Number.MAX_SAFE_INTEGER : tid,
    };
  }

  function render() {
    wrap.replaceChildren();
    if (!teams.length) {
      renderEmpty();
      return;
    }

    wrap.className = 'rivals-wrap';
    const list = document.createElement('div');
    list.className = 'rivals-list';

    for (const team of teams) {
      const row = document.createElement('div');
      row.className = 'rivals-row';

      const name = document.createElement('div');
      name.className = 'rivals-team';
      name.textContent = team.label;
      row.appendChild(name);

      const saved = normalizeSelections(team.key);
      const selections = saved.slice();
      selections.push('');

      selections.forEach((value, index) => {
        row.appendChild(buildSelect(team, selections, index, value));
      });

      list.appendChild(row);
    }

    wrap.appendChild(list);
  }

  function buildSelect(team, rowSelections, index, currentValue) {
    const select = document.createElement('select');
    select.className = 'sort-select rivals-select';
    select.setAttribute('aria-label', `${team.label} rival ${index + 1}`);

    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = index === 0 ? 'Select rival…' : 'Add another rival…';
    select.appendChild(blank);

    const alreadyChosen = new Set(rowSelections.filter(Boolean));
    alreadyChosen.delete(currentValue);

    for (const candidate of teams) {
      if (candidate.key === team.key) continue;
      if (alreadyChosen.has(candidate.key)) continue;
      const option = document.createElement('option');
      option.value = candidate.key;
      option.textContent = candidate.label;
      option.selected = candidate.key === currentValue;
      select.appendChild(option);
    }

    select.value = currentValue || '';
    select.addEventListener('change', () => {
      const current = normalizeSelections(team.key);
      const nextValue = select.value;

      if (index < current.length) {
        if (nextValue) current[index] = nextValue;
        else current.splice(index, 1);
      } else if (nextValue) {
        current.push(nextValue);
      }

      rivalMap[team.key] = uniqueValidSelections(team.key, current);
      if (!rivalMap[team.key].length) delete rivalMap[team.key];
      saveRivals();
      render();
    });

    return select;
  }

  function uniqueValidSelections(teamKey, selections) {
    const validKeys = new Set(teams.map((team) => team.key));
    const seen = new Set();
    const result = [];
    for (const value of Array.isArray(selections) ? selections : []) {
      if (!validKeys.has(value) || value === teamKey || seen.has(value)) continue;
      seen.add(value);
      result.push(value);
    }
    return result;
  }

  function normalizeSelections(teamKey) {
    return uniqueValidSelections(teamKey, rivalMap[teamKey]);
  }

  function renderEmpty() {
    wrap.className = 'rivals-wrap empty-state';
    wrap.replaceChildren();
    const empty = document.createElement('div');
    empty.className = 'empty-copy';
    const paragraph = document.createElement('p');
    paragraph.textContent = 'Load a league file to assign team rivals.';
    empty.appendChild(paragraph);
    wrap.appendChild(empty);
  }

  function loadSavedRivals() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      console.warn('Could not restore saved rivals.', error);
      return {};
    }
  }

  function saveRivals() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rivalMap));
    } catch (error) {
      console.warn('Could not save rivals.', error);
    }
  }
})();

(() => {
  if (document.querySelector('script[data-dbl-draft-loader]')) return;
  const script = document.createElement('script');
  script.src = './draft-prospects-loader.js?v=20260903-draft-prospects-persistent';
  script.dataset.dblDraftLoader = 'true';
  document.body.append(script);
})();
