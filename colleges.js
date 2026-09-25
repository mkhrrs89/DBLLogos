(() => {
  const STORAGE_KEY = 'zengm-companion-college-locations:v1';
  const tabBtn = document.getElementById('collegesTabBtn');
  const panel = document.getElementById('collegesPanel');
  const wrap = document.getElementById('collegesWrap');
  const fileInput = document.getElementById('leagueFile');
  const fileHub = window.DBLLeagueFileHub;
  const stream = window.DBLLeagueStream;
  const clearBtn = document.getElementById('clearLeagueFileBtn');
  const statusMessage = document.getElementById('statusMessage');

  if (!tabBtn || !panel || !wrap || !stream) return;

  const LOCATIONS = [
    'Alabama',
    'Alaska',
    'Arizona',
    'Arkansas',
    'California',
    'Colorado',
    'Connecticut',
    'Delaware',
    'Florida',
    'Georgia',
    'Hawaii',
    'Idaho',
    'Illinois',
    'Indiana',
    'Iowa',
    'Kansas',
    'Kentucky',
    'Louisiana',
    'Maine',
    'Maryland',
    'Massachusetts',
    'Michigan',
    'Minnesota',
    'Mississippi',
    'Missouri',
    'Montana',
    'Nebraska',
    'Nevada',
    'New Hampshire',
    'New Jersey',
    'New Mexico',
    'New York',
    'North Carolina',
    'North Dakota',
    'Ohio',
    'Oklahoma',
    'Oregon',
    'Pennsylvania',
    'Rhode Island',
    'South Carolina',
    'South Dakota',
    'Tennessee',
    'Texas',
    'Utah',
    'Vermont',
    'Virginia',
    'Washington',
    'West Virginia',
    'Wisconsin',
    'Wyoming',
    'International',
  ];

  let assignments = loadAssignments();
  let colleges = [];
  let pendingFile = null;
  let fileVersion = 0;
  let loadedVersion = -1;
  let loadingVersion = -1;

  tabBtn.addEventListener('click', () => {
    if (colleges.length && loadedVersion === fileVersion) {
      render();
    } else {
      void buildColleges();
    }
  });

  window.addEventListener('dbl:tab-change', (event) => {
    if (event.detail?.panelId !== 'collegesPanel') return;
    if (colleges.length && loadedVersion === fileVersion) {
      render();
    } else {
      void buildColleges();
    }
  });

  const acceptLeagueFile = (file) => {
    if (!file || pendingFile === file) return;
    pendingFile = file;
    fileVersion += 1;
    loadedVersion = -1;
    loadingVersion = -1;
    colleges = [];

    if (!panel.hidden) {
      void buildColleges();
    }
  };

  if (fileHub) {
    fileHub.subscribe(({ file }) => acceptLeagueFile(file));
  } else {
    fileInput?.addEventListener('change', (event) => {
      const [file] = event.target.files || [];
      acceptLeagueFile(file);
    });
  }

  clearBtn?.addEventListener('click', () => {
    pendingFile = null;
    fileVersion += 1;
    loadedVersion = -1;
    loadingVersion = -1;
    colleges = [];
    renderEmpty('Load a league file to list its colleges. Your saved college locations are preserved.');
  });

  async function buildColleges() {
    const version = fileVersion;
    if (loadingVersion === version) return;

    const file = pendingFile
      || fileHub?.getCurrentFile?.()
      || fileInput?.files?.[0]
      || window.__dblLargeLeagueFile
      || null;

    if (!file) {
      if (colleges.length && loadedVersion === fileVersion) {
        render();
      } else {
        renderEmpty('Load a league file to list its colleges.');
      }
      return;
    }

    loadingVersion = version;
    renderEmpty('Reading colleges from player records…', true);

    try {
      await waitForMainLoad(version);
      if (!isCurrent(file, version)) return;

      const names = new Set();
      let playerCount = 0;

      await stream.forEachTopLevelArrayItem(file, 'players', (player) => {
        if (!isCurrent(file, version)) return;
        playerCount += 1;
        addCollege(names, player?.college);
      });

      // Some older/custom exports may split players into separate collections.
      // Avoid extra full-file passes for normal Basketball GM exports, where
      // the main players array already contains active and historical players.
      if (playerCount === 0) {
        for (const key of ['retiredPlayers', 'releasedPlayers', 'freeAgents']) {
          await stream.forEachTopLevelArrayItem(file, key, (player) => {
            if (!isCurrent(file, version)) return;
            addCollege(names, player?.college);
          });
          if (!isCurrent(file, version)) return;
        }
      }

      if (!isCurrent(file, version)) return;

      colleges = Array.from(names).sort((a, b) => (
        a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
      ));
      loadedVersion = version;
      render();
    } catch (error) {
      if (!isCurrent(file, version)) return;
      console.error('Could not build Colleges.', error);
      renderEmpty('Could not read colleges from this league file.');
    } finally {
      if (loadingVersion === version) loadingVersion = -1;
    }
  }

  function addCollege(target, value) {
    if (typeof value !== 'string') return;
    const college = value.trim();
    if (college) target.add(college);
  }

  async function waitForMainLoad(version) {
    const startedAt = Date.now();
    while (version === fileVersion && Date.now() - startedAt < 90000) {
      const text = statusMessage?.textContent?.trim() || '';
      if (!/^(Loading|Restoring)\b/i.test(text)) return;
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
  }

  function isCurrent(file, version) {
    return version === fileVersion && file === (
      pendingFile
      || fileHub?.getCurrentFile?.()
      || fileInput?.files?.[0]
      || window.__dblLargeLeagueFile
      || null
    );
  }

  function render() {
    wrap.className = 'colleges-wrap';
    wrap.replaceChildren();

    if (!colleges.length) {
      renderEmpty('No colleges were found in the loaded league file.');
      return;
    }

    const assignedCount = colleges.reduce(
      (total, college) => total + (isValidLocation(assignments[college]) ? 1 : 0),
      0,
    );

    const summary = document.createElement('div');
    summary.className = 'colleges-summary';

    const count = document.createElement('p');
    count.className = 'colleges-count';
    count.textContent = `${colleges.length.toLocaleString()} colleges · ${assignedCount.toLocaleString()} assigned · ${(colleges.length - assignedCount).toLocaleString()} unassigned`;
    summary.appendChild(count);
    wrap.appendChild(summary);

    const list = document.createElement('div');
    list.className = 'colleges-list';

    for (const college of colleges) {
      const row = document.createElement('div');
      row.className = 'college-row';

      const name = document.createElement('strong');
      name.className = 'college-name';
      name.textContent = college;

      const select = document.createElement('select');
      select.className = 'sort-select college-location-select';
      select.setAttribute('aria-label', `Location for ${college}`);

      const unassigned = document.createElement('option');
      unassigned.value = '';
      unassigned.textContent = 'Unassigned';
      select.appendChild(unassigned);

      for (const location of LOCATIONS) {
        const option = document.createElement('option');
        option.value = location;
        option.textContent = location;
        select.appendChild(option);
      }

      select.value = isValidLocation(assignments[college]) ? assignments[college] : '';
      select.addEventListener('change', () => {
        if (isValidLocation(select.value)) {
          assignments[college] = select.value;
        } else {
          delete assignments[college];
        }
        saveAssignments();
        render();
      });

      row.append(name, select);
      list.appendChild(row);
    }

    wrap.appendChild(list);
  }

  function isValidLocation(value) {
    return LOCATIONS.includes(value);
  }

  function loadAssignments() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      console.warn('Could not restore college locations.', error);
      return {};
    }
  }

  function saveAssignments() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments));
    } catch (error) {
      console.warn('Could not save college locations.', error);
    }
  }

  function renderEmpty(message, loading = false) {
    wrap.className = 'colleges-wrap empty-state';
    wrap.replaceChildren();

    const empty = document.createElement('div');
    empty.className = 'empty-copy';
    const text = document.createElement('p');
    text.textContent = message;
    if (loading) text.setAttribute('aria-live', 'polite');
    empty.appendChild(text);
    wrap.appendChild(empty);
  }
})();
