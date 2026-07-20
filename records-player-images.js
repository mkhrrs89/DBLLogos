(() => {
  const originalBuildScoringRecords = buildScoringRecords;
  const originalRenderRecords = renderRecords;

  function buildPlayerImageMaps(league = {}) {
    const imageByPid = new Map();
    const imageByName = new Map();

    for (const players of getLeaguePlayerCollections(league)) {
      for (const player of players) {
        const imageURL = normalizeLogoUrl(player?.imgURL || '');
        if (!imageURL) continue;

        const pid = readOptionalNumber(player?.pid);
        if (pid !== null && !imageByPid.has(pid)) {
          imageByPid.set(pid, imageURL);
        }

        const playerName = getRosterPlayerName(player);
        if (playerName !== 'Unknown Player') {
          const nameKey = playerName.toLocaleLowerCase();
          if (!imageByName.has(nameKey)) {
            imageByName.set(nameKey, imageURL);
          }
        }
      }
    }

    return { imageByPid, imageByName };
  }

  buildScoringRecords = function buildScoringRecordsWithImages(league, rows) {
    const records = originalBuildScoringRecords(league, rows);
    const { imageByPid, imageByName } = buildPlayerImageMaps(league);

    for (const record of records) {
      const nameKey = String(record?.playerName || '').toLocaleLowerCase();
      record.imgURL = imageByPid.get(record?.pid) || imageByName.get(nameKey) || '';
    }

    return records;
  };

  renderRecords = function renderRecordsWithImages(timeline) {
    originalRenderRecords(timeline);

    const records = normalizeScoringRecords(timeline?.scoringRecords);
    const items = recordsWrap?.querySelectorAll('.record-item') || [];

    items.forEach((item, index) => {
      const record = records[index];
      const imageURL = normalizeLogoUrl(record?.imgURL || '');
      const details = item.querySelector('.record-details');
      if (!imageURL || !details) return;

      const photo = document.createElement('div');
      photo.className = 'record-player-photo';

      const image = document.createElement('img');
      image.src = imageURL;
      image.alt = '';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.setAttribute('aria-hidden', 'true');
      image.addEventListener('error', () => {
        photo.remove();
        details.classList.remove('has-player-photo');
        item.classList.remove('has-player-photo');
      });

      photo.appendChild(image);
      details.prepend(photo);
      details.classList.add('has-player-photo');
      item.classList.add('has-player-photo');
    });
  };

  if (fullTimeline) {
    renderRecords(fullTimeline);
  }
})();
