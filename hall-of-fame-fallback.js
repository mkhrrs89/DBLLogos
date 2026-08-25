(() => {
  const stream = window.DBLLeagueStream;
  const fileInput = document.getElementById('leagueFile');
  const hallTabBtn = document.getElementById('hallOfFameTabBtn');
  const hallPanel = document.getElementById('hallOfFamePanel');
  const hallWrap = document.getElementById('hallOfFameWrap');
  const clearBtn = document.getElementById('clearLeagueFileBtn');
  const statusMessage = document.getElementById('statusMessage');

  if (!stream || !fileInput || !hallTabBtn || !hallWrap) return;

  const PLAYER_COLLECTION_KEYS = [
    'players',
    'retiredPlayers',
    'releasedPlayers',
    'freeAgents',
  ];

  let selectedFile = null;
  let loadingFile = null;
  let loadedFile = null;
  let fileVersion = 0;

  fileInput.addEventListener('change', (event) => {
    const [file] = event.target.files || [];
    fileVersion += 1;
    selectedFile = file || null;
    loadingFile = null;
    loadedFile = null;

    // If the user loaded a file while already viewing Hall of Fame, rebuild it
    // after the lightweight main timeline finishes rather than leaving the old
    // empty state on screen.
    if (selectedFile && hallPanel && !hallPanel.hidden) {
      const version = fileVersion;
      window.setTimeout(() => ensureHallOfFameLoaded(version), 0);
    }
  });

  clearBtn?.addEventListener('click', () => {
    fileVersion += 1;
    selectedFile = null;
    loadingFile = null;
    loadedFile = null;
  });

  hallTabBtn.addEventListener('click', () => {
    const version = fileVersion;
    // Run after the normal tab-switch handler, but do not assume another
    // deferred loader will succeed. This loader is the final safety net.
    window.setTimeout(() => ensureHallOfFameLoaded(version), 0);
  });

  async function ensureHallOfFameLoaded(version = fileVersion) {
    const existingPlayers = getExistingHallPlayers();
    if (existingPlayers.length) {
      renderHallOfFame(fullTimeline);
      return;
    }

    const [inputFile] = fileInput.files || [];
    const file = selectedFile || inputFile || window.__dblLargeLeagueFile || null;
    if (!file || version !== fileVersion) return;

    // Most importantly, do not build Hall of Fame concurrently with the main
    // large-file timeline import. The main import calls setTimeline() when it
    // finishes and would otherwise replace freshly generated HOF data with the
    // lightweight timeline's empty hallOfFamePlayers array.
    await waitForMainLeagueLoad(file, version);
    if (!isCurrent(file, version)) return;

    const afterMainPlayers = getExistingHallPlayers();
    if (afterMainPlayers.length) {
      renderHallOfFame(fullTimeline);
      loadedFile = file;
      return;
    }

    // A second deferred loader may already be running. Give it a short chance
    // to finish, but never permanently bail out just because it displayed a
    // loading message.
    if ((hallWrap.textContent || '').includes('Loading Hall of Fame players')) {
      await waitForOtherHallLoader(file, version, 2500);
      if (!isCurrent(file, version)) return;
      if (getExistingHallPlayers().length) {
        renderHallOfFame(fullTimeline);
        loadedFile = file;
        return;
      }
    }

    if (loadingFile === file) return;
    if (loadedFile === file && getExistingHallPlayers().length) return;

    loadingFile = file;
    showMessage('Loading Hall of Fame players...');

    try {
      const hofPlayers = [];

      for (const collectionKey of PLAYER_COLLECTION_KEYS) {
        await stream.forEachTopLevelArrayItem(file, collectionKey, (player) => {
          if (player?.hof) hofPlayers.push(player);
        });
        if (!isCurrent(file, version)) return;
      }

      const gameAttributes = await stream.readTopLevelValue(file, 'gameAttributes');
      if (!isCurrent(file, version)) return;

      const hallOfFamePlayers = buildHallOfFamePlayers({
        players: hofPlayers,
        gameAttributes: gameAttributes || {},
      });

      if (!isCurrent(file, version)) return;

      if (!hallOfFamePlayers.length) {
        loadedFile = null;
        showMessage('No Hall of Fame players were found in this league file.');
        return;
      }

      if (fullTimeline) fullTimeline.hallOfFamePlayers = hallOfFamePlayers;
      if (currentTimeline) currentTimeline.hallOfFamePlayers = hallOfFamePlayers;
      renderHallOfFame(fullTimeline);

      try {
        if (fullTimeline) persistTimeline(file.name, fullTimeline);
      } catch (error) {
        console.warn('Could not persist fallback Hall of Fame data.', error);
      }

      loadedFile = file;
    } catch (error) {
      console.error('Could not load Hall of Fame players from the selected league file.', error);
      loadedFile = null;
      showMessage('Could not load Hall of Fame data from this file.');
    } finally {
      if (loadingFile === file) loadingFile = null;
    }
  }

  async function waitForMainLeagueLoad(file, version) {
    if (!statusMessage) return;

    const startedAt = Date.now();
    const timeoutMs = 90000;

    while (isCurrent(file, version) && Date.now() - startedAt < timeoutMs) {
      const text = statusMessage.textContent || '';
      const isLoading = text.startsWith('Loading ');
      const loadedThisFile = text.startsWith(`Loaded ${file.name}`)
        || text.includes(`Loaded ${file.name}.`);
      const failedThisFile = statusMessage.classList.contains('error') && !isLoading;

      if (loadedThisFile || failedThisFile || !isLoading) return;
      await delay(100);
    }
  }

  async function waitForOtherHallLoader(file, version, maxWaitMs) {
    const startedAt = Date.now();
    while (isCurrent(file, version) && Date.now() - startedAt < maxWaitMs) {
      if (getExistingHallPlayers().length) return;
      const text = hallWrap.textContent || '';
      if (!text.includes('Loading Hall of Fame players')) return;
      await delay(100);
    }
  }

  function getExistingHallPlayers() {
    return Array.isArray(fullTimeline?.hallOfFamePlayers)
      ? fullTimeline.hallOfFamePlayers
      : [];
  }

  function isCurrent(file, version) {
    const [inputFile] = fileInput.files || [];
    const currentFile = selectedFile || inputFile || window.__dblLargeLeagueFile || null;
    return version === fileVersion && currentFile === file;
  }

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function showMessage(message) {
    hallWrap.className = 'hof-wrap empty-state';
    const empty = document.createElement('div');
    empty.className = 'empty-copy';
    const paragraph = document.createElement('p');
    paragraph.textContent = message;
    empty.appendChild(paragraph);
    hallWrap.replaceChildren(empty);
  }
})();
