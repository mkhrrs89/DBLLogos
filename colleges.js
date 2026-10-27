(() => {
  const STORAGE_KEY = 'zengm-companion-college-locations:v1';
  // Clearing a recognized school must stay cleared on subsequent imports.
  // Keep this separate from the existing user-assignment storage.
  const AUTO_EXCLUSIONS_KEY = 'zengm-companion-college-auto-exclusions:v1';
  const HIDE_ASSIGNED_KEY = 'zengm-companion-colleges-hide-assigned:v1';
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
    'District of Columbia',
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
  let autoExclusions = loadAutoExclusions();
  let recentlyAutoAssigned = 0;
  let hideAssigned = loadHideAssigned();
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
    recentlyAutoAssigned = 0;

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
    recentlyAutoAssigned = 0;
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
      // Only fill previously unassigned names. Saved/manual choices and
      // schools explicitly cleared by the user always take precedence.
      recentlyAutoAssigned = applyAutomaticLocations(colleges);
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
    count.textContent = `${colleges.length.toLocaleString()} colleges · ${assignedCount.toLocaleString()} assigned · ${(colleges.length - assignedCount).toLocaleString()} unassigned` +
      (recentlyAutoAssigned ? ` · ${recentlyAutoAssigned.toLocaleString()} automatically matched` : '');
    summary.appendChild(count);
    wrap.appendChild(summary);

    const groupedAssignments = buildGroupedAssignments();
    if (groupedAssignments) {
      wrap.appendChild(groupedAssignments);
    }

    // This filter applies ONLY to the editable state-selection rows below.
    // The totals above and the complete state-grouped summary stay untouched.
    const visibleColleges = hideAssigned
      ? colleges.filter(college => !isValidLocation(assignments[college]))
      : colleges;

    const toolbar = document.createElement('div');
    toolbar.className = 'colleges-list-toolbar';

    const filterLabel = document.createElement('label');
    filterLabel.className = 'colleges-filter-label';
    const filterToggle = document.createElement('input');
    filterToggle.type = 'checkbox';
    filterToggle.checked = hideAssigned;
    filterToggle.id = 'hideAssignedCollegesToggle';
    const filterText = document.createElement('span');
    filterText.textContent = 'Hide assigned colleges';
    filterLabel.append(filterToggle, filterText);
    filterToggle.addEventListener('change', () => {
      hideAssigned = filterToggle.checked;
      saveHideAssigned();
      render();
    });

    const shownCount = document.createElement('span');
    shownCount.className = 'colleges-filter-count';
    shownCount.textContent = `Showing ${visibleColleges.length.toLocaleString()} of ${colleges.length.toLocaleString()} colleges`;
    toolbar.append(filterLabel, shownCount);
    wrap.appendChild(toolbar);

    const list = document.createElement('div');
    list.className = 'colleges-list';

    for (const college of visibleColleges) {
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
          // Manual selection takes precedence over any automatic match.
          if (autoExclusions.delete(college)) saveAutoExclusions();
        } else {
          delete assignments[college];
          // Remember explicit unassignment so another file load doesn't
          // immediately undo the user's choice.
          if (window.DBLKnownCollegeStates?.lookup(college)) {
            autoExclusions.add(college);
            saveAutoExclusions();
          }
        }
        saveAssignments();
        render();
      });

      row.append(name, select);
      list.appendChild(row);
    }

    if (!visibleColleges.length) {
      const empty = document.createElement('p');
      empty.className = 'college-list-empty';
      empty.textContent = hideAssigned
        ? 'Every college has a location assigned. Turn off “Hide assigned colleges” to review or change assignments.'
        : 'No colleges to display.';
      list.appendChild(empty);
    }

    wrap.appendChild(list);
  }

  function buildGroupedAssignments() {
    const grouped = new Map(LOCATIONS.map((location) => [location, []]));

    for (const [college, location] of Object.entries(assignments)) {
      if (!college || !isValidLocation(location)) continue;
      grouped.get(location).push(college);
    }

    const populated = LOCATIONS
      .map((location) => ({
        location,
        colleges: grouped.get(location).sort((a, b) => (
          a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
        )),
      }))
      .filter((group) => group.colleges.length > 0);

    if (!populated.length) return null;

    const section = document.createElement('section');
    section.className = 'college-groups';

    const heading = document.createElement('h3');
    heading.className = 'college-groups-title';
    heading.textContent = 'Assigned Colleges by Location';
    section.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'college-groups-grid';

    for (const group of populated) {
      const block = document.createElement('section');
      block.className = 'college-state-group';

      const stateHeading = document.createElement('h4');
      stateHeading.textContent = group.location;

      const divider = document.createElement('div');
      divider.className = 'college-state-divider';
      divider.setAttribute('aria-hidden', 'true');

      const list = document.createElement('ul');
      list.className = 'college-state-list';

      for (const college of group.colleges) {
        const item = document.createElement('li');
        item.textContent = college;
        list.appendChild(item);
      }

      block.append(stateHeading, divider, list);
      grid.appendChild(block);
    }

    section.appendChild(grid);
    return section;
  }

  function isValidLocation(value) {
    return LOCATIONS.includes(value);
  }

  function applyAutomaticLocations(availableColleges) {
    const lookup = window.DBLKnownCollegeStates?.lookup;
    if (typeof lookup !== 'function') return 0;
    let added = 0;
    for (const college of availableColleges) {
      // Object.hasOwnProperty.call avoids false positives for school names
      // such as "constructor" or "toString".
      if (Object.prototype.hasOwnProperty.call(assignments, college)
          || autoExclusions.has(college)) continue;
      const location = lookup(college);
      if (!isValidLocation(location)) continue;
      assignments[college] = location;
      added++;
    }
    if (added) saveAssignments(); // One write for the entire loaded league.
    return added;
  }

  function loadAutoExclusions() {
    try {
      const parsed = JSON.parse(localStorage.getItem(AUTO_EXCLUSIONS_KEY) || '[]');
      return new Set(Array.isArray(parsed)
        ? parsed.filter(name => typeof name === 'string' && name.trim()) : []);
    } catch (error) {
      console.warn('Could not restore excluded automatic colleges.', error);
      return new Set();
    }
  }

  function saveAutoExclusions() {
    try {
      localStorage.setItem(AUTO_EXCLUSIONS_KEY, JSON.stringify([...autoExclusions]));
    } catch (error) {
      console.warn('Could not save automatic college exclusions.', error);
    }
  }

  function loadHideAssigned() {
    try {
      return localStorage.getItem(HIDE_ASSIGNED_KEY) === 'true';
    } catch (error) {
      return false;
    }
  }

  function saveHideAssigned() {
    try {
      localStorage.setItem(HIDE_ASSIGNED_KEY, String(hideAssigned));
    } catch (error) {
      // Filtering still works for this session if storage is unavailable.
    }
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
