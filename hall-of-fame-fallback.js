(() => {
  const stream = window.DBLLeagueStream;
  const fileInput = document.getElementById('leagueFile');
  const hallTabBtn = document.getElementById('hallOfFameTabBtn');
  const hallWrap = document.getElementById('hallOfFameWrap');
  const clearBtn = document.getElementById('clearLeagueFileBtn');

  if (!stream || !fileInput || !hallTabBtn || !hallWrap) return;

  const PLAYER_COLLECTION_KEYS = [
    'players',
    'retiredPlayers',
    'releasedPlayers',
    'freeAgents',
  ];

  let loadingFile = null;
  let loadedFile = null;

  fileInput.addEventListener('change', () => {
    loadingFile = null;
    loadedFile = null;
  });

  clearBtn?.addEventListener('click', () => {
    loadingFile = null;
    loadedFile = null;
  });

  hallTabBtn.addEventListener('click', () => {
    // Let the normal/deferred Hall of Fame handlers run first. This fallback
    // only takes over when they leave the panel in its empty state.
    window.setTimeout(() => {
      maybeLoadHallOfFame();
    }, 50);
  });

  async function maybeLoadHallOfFame() {
    const existingPlayers = Array.isArray(fullTimeline?.hallOfFamePlayers)
      ? fullTimeline.hallOfFamePlayers
      : [];
    if (existingPlayers.length) return;

    const text = hallWrap.textContent || '';
    if (text.includes('Loading Hall of Fame players')) return;

    const [selectedFile] = fileInput.files || [];
    const file = selectedFile || window.__dblLargeLeagueFile || null;
    if (!file || loadingFile === file || loadedFile === file) return;

    loadingFile = file;
    showMessage('Loading Hall of Fame players...');

    try {
      const hofPlayers = [];

      for (const collectionKey of PLAYER_COLLECTION_KEYS) {
        await stream.forEachTopLevelArrayItem(file, collectionKey, (player) => {
          if (player?.hof) hofPlayers.push(player);
        });
      }

      const gameAttributes = await stream.readTopLevelValue(file, 'gameAttributes');
      const hallOfFamePlayers = buildHallOfFamePlayers({
        players: hofPlayers,
        gameAttributes: gameAttributes || {},
      });

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
      showMessage('Could not load Hall of Fame data from this file.');
    } finally {
      if (loadingFile === file) loadingFile = null;
    }
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
