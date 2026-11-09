(() => {
  'use strict';
  const api = window.DBLCardEngine;
  const CARDS_SUBTAB_KEY = 'dbl-cards-active-subtab:v1';
  const panel = document.getElementById('cardsPanel');
  const status = document.getElementById('cardsStatus');
  const saveStatus = document.getElementById('cardsSaveStatus');
  const packStage = document.getElementById('cardsPackStage');
  const openBtn = document.getElementById('cardsOpenPackBtn');
  const actions = document.getElementById('cardsPackActions');
  const revealBtn = document.getElementById('cardsRevealAllBtn');
  const againBtn = document.getElementById('cardsNextPackBtn');
  const counter = document.getElementById('cardsCollectionStats');
  const gallery = document.getElementById('cardsCollection');
  const galleryCount = document.getElementById('cardsCollectionCount');
  const search = document.getElementById('cardsSearch');
  const rarityFilter = document.getElementById('cardsRarityFilter');
  const teamFilter = document.getElementById('cardsTeamFilter');
  const order = document.getElementById('cardsSort');
  const loadMore = document.getElementById('cardsShowMoreBtn');
  const clearBtn = document.getElementById('cardsClearCollectionBtn');
  const allCollectionsGrid = document.getElementById('cardsAllCollectionsGrid');
  const tabs = [
    ['cardsPacksTab', 'cardsPackView'],
    ['cardsCollectionTab', 'cardsCollectionView'],
    ['cardsAllCollectionsTab', 'cardsAllCollectionsView'],
    ['cardsChecklistTab', 'cardsChecklistView']
  ].map(([tab, view]) => [document.getElementById(tab), document.getElementById(view)]);
  const checklistStats = document.getElementById('cardsChecklistStats');
  const checklistSearch = document.getElementById('cardsChecklistSearch');
  const checklistRarity = document.getElementById('cardsChecklistRarity');
  const checklistOwnership = document.getElementById('cardsChecklistOwnership');
  const checklistSort = document.getElementById('cardsChecklistSort');
  const checklistCaption = document.getElementById('cardsChecklistCaption');
  const checklistList = document.getElementById('cardsChecklistList');
  const checklistMore = document.getElementById('cardsChecklistMore');
  if (!api || !panel || !status || !saveStatus || !packStage || !openBtn ||
      !actions || !revealBtn || !againBtn || !counter || !gallery ||
      !galleryCount || !search || !rarityFilter || !teamFilter || !order || !loadMore ||
      !clearBtn || !allCollectionsGrid || tabs.some(([tab, view]) => !tab || !view) ||
      !checklistStats || !checklistSearch || !checklistRarity ||
      !checklistOwnership || !checklistSort || !checklistCaption ||
      !checklistList || !checklistMore) return;

  const ALL_COLLECTIONS_TAB_INDEX = tabs.findIndex(([tab]) => tab.id === 'cardsAllCollectionsTab');
  const CHECKLIST_TAB_INDEX = tabs.findIndex(([tab]) => tab.id === 'cardsChecklistTab');
  // Collection entries are explicit so future sets can have their own covers.
  const CARD_COLLECTIONS = [
    {
      series: 0,
      name: 'Series 0',
      subtitle: 'Original FLAGSHIP set',
      establishedIrl: 'Nov 9, 2026',
      establishedInGame: '1968'
    }
  ];
  let activeChecklistSeries = 0;
  const tierIndex = Object.fromEntries(api.rarities.map((r, i) => [r.id, i]));
  const tierMap = Object.fromEntries(api.rarities.map(r => [r.id, r]));
  // Undiscovered editions must never appear in the checklist or public
  // progress totals, even for players who meet their hidden requirements.
  const checklistTiers = api.rarities.filter(r => !r.mythical);
  const make = (tag, cls, value) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (value !== undefined) node.textContent = String(value);
    return node;
  };
  const format = (v, d = 0) => Number.isFinite(v)
    ? v.toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d})
    : '—';
  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let busy = false;
  let clearing = false;
  let packToken = 0;
  let packCards = [];
  let limit = 36;
  let lastFileState = '';
  let nameFitScheduled = false;
  let activeCardsSubtab = 0;
  let checklistLimit = 80;

  // The outer name field is a fixed-width clipping frame. The INNER text
  // is measured at its natural width, then squeezed horizontally if needed.
  // Transforming that inner text (not the outer field) prevents layout overflow.
  function fitName(name) {
    const glyphs = name.querySelector('.dbl-cards-surname-glyphs');
    if (!glyphs) return;
    glyphs.style.transform = '';
    const available = name.clientWidth;
    if (available <= 0) return; // The cards panel may still be hidden.
    const natural = glyphs.getBoundingClientRect?.().width ||
      glyphs.scrollWidth || 0;
    if (natural <= 0 || natural <= available - 2) return;
    glyphs.style.transformOrigin = 'left center';
    glyphs.style.transform = 'scaleX(' +
      Math.min(1, Math.max(.01, (available - 2) / natural)).toFixed(5) + ')';
  }
  function fitVisibleNames() {
    for (const root of [gallery, packStage]) {
      for (const name of root.querySelectorAll?.('.dbl-cards-name') || []) {
        fitName(name);
      }
    }
  }
  function scheduleNameFit() {
    if (nameFitScheduled) return;
    nameFitScheduled = true;
    const run = () => {
      nameFitScheduled = false;
      fitVisibleNames();
    };
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(run);
    } else run();
  }

  function appendStat(parent, value, heading) {
    const box = make('span', 'dbl-cards-stat');
    box.appendChild(make('strong', '', value));
    box.appendChild(make('span', '', heading));
    parent.appendChild(box);
  }
  function showCounters() {
    const s = api.status;
    counter.replaceChildren();
    // Only offer binder filters for hidden editions after the collector
    // actually owns one. Normal collection sorting and search still work.
    for (const tier of api.rarities.filter(r => r.mythical)) {
      const owned = api.items.some(card => card.rarity === tier.id);
      const option = Array.from(rarityFilter.options).find(o => o.value === tier.id);
      if (owned && !option) {
        const added = make('option', '', tier.label);
        added.value = tier.id;
        rarityFilter.appendChild(added);
      } else if (!owned && option) {
        if (rarityFilter.value === tier.id) rarityFilter.value = 'all';
        option.remove();
      }
    }
    appendStat(counter, format(s.packs), 'Packs opened');
    appendStat(counter, format(s.count), 'Total cards');
    appendStat(counter, format(s.unique), 'Unique editions');
    appendStat(counter, format(api.items.filter(c => c.rarity === 'black-label')
      .reduce((n, c) => n + c.count, 0)), 'Black Label pulls');
    const hiddenPulls = api.items.filter(c => tierMap[c.rarity]?.mythical)
      .reduce((n, c) => n + c.count, 0);
    if (hiddenPulls > 0) appendStat(counter, format(hiddenPulls), 'Mythical pulls');
    clearBtn.disabled = clearing || busy || !s.ready || s.count === 0;
    saveStatus.textContent = s.ready
      ? s.savedOK ? 'Collection saved locally in this browser.' :
        'Browser storage is unavailable. Collection may be lost after a refresh.'
      : 'Restoring your saved collection…';
  }
  function showStatus() {
    const s = api.status;
    const fileKey = [s.hasFile, s.poolSize, s.season, s.loading, s.problem].join('|');
    if (fileKey !== lastFileState) {
      lastFileState = fileKey;
      if (s.problem) status.textContent = s.problem;
      else if (!s.hasFile) status.textContent =
        'Upload a league file to open packs. Your existing collection is available below.';
      else if (s.loading) status.textContent = 'Building cards from your league player archive…';
      else if (s.poolSize) status.textContent =
        format(s.poolSize) + ' players available from the ' + s.season +
        ' export. Open packs and collect DBL legends from every era.';
      else status.textContent =
        'Open the Cards tab to load players from the uploaded league file.';
    }
    openBtn.disabled = busy || clearing || !s.ready || !s.poolSize || s.loading;
    openBtn.textContent = busy ? 'Opening pack…' : 'Open five-card pack';
  }
  // GitHub-hosted archival portraits for players without an export photo.
  // These are display-only: never store an era placeholder in saved cards.
  const ERA_CARD_PORTRAITS = [
    [1916, 1917, '1916-1917.jpg'],
    [1918, 1919, '1918-1919.jpg'],
    [1920, 1920, '1920.jpg'],
    [1921, 1923, '1921-1923.jpg'],
    [1924, 1926, '1924-1926.jpg'],
    [1927, 1929, '1927-1929.jpg'],
    [1930, 1936, '1930-1936.jpg'],
    [1937, 1939, '1937-1939.jpg'],
    [1940, 1941, '1940-1941.jpg'],
    [1942, 1945, '1942-1945.jpg'],
    [1946, 1949, '1946-1949.jpg'],
    [1950, 1959, '1950-1959.jpg'],
    [1960, 1965, '1960-1965.jpg'],
    [1966, 1966, '1966.jpg'],
    [1967, 1967, '1967.jpg'],
    [1968, 1968, '1968.jpg']
  ];
  function genericPhotoFor(card) {
    const year = Number(card?.era); // The card's peak OVR season.
    if (!Number.isInteger(year)) return '';
    const range = ERA_CARD_PORTRAITS.find(([first, last]) =>
      year >= first && year <= last);
    return range ? './assets/' + range[2] : '';
  }

  function art(card) {
    const artArea = make('span', 'dbl-cards-art');
    const initials = card.name.split(/\s+/).slice(0, 2)
      .map(x => x[0] || '').join('').toUpperCase();
    artArea.appendChild(make('span', 'dbl-cards-initials', initials));
    const customPhoto = api.findPhoto(card);
    const genericPhoto = genericPhotoFor(card);
    if (customPhoto || genericPhoto) {
      const image = make('img', 'dbl-cards-player-photo');
      image.alt = '';
      image.width = 200;
      image.height = 300;
      image.style.width = '100%';
      image.style.height = '100%';
      image.style.maxWidth = '100%';
      image.style.maxHeight = '100%';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.referrerPolicy = 'no-referrer';
      // Preserve the original image whenever it works. If its link breaks,
      // try the peak-year portrait; initials remain the last-resort fallback.
      let usingGenericPhoto = !customPhoto;
      image.addEventListener('error', () => {
        if (!usingGenericPhoto && genericPhoto) {
          usingGenericPhoto = true;
          image.src = genericPhoto;
        } else {
          image.remove();
        }
      });
      image.src = customPhoto || genericPhoto;
      artArea.appendChild(image);
    }
    return artArea;
  }
  function teamCrest(card) {
    const crest = make('span', 'dbl-cards-team-crest');
    const placeholder = make('span', 'dbl-cards-team-initials', card.team || 'DBL');
    crest.appendChild(placeholder);
    const logo = api.findTeamLogo(card);
    if (logo) {
      const img = make('img', 'dbl-cards-team-logo');
      img.alt = '';
      img.width = 40;
      img.height = 40;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('load', () => {
        placeholder.hidden = true;
      });
      img.addEventListener('error', () => {
        img.remove();
        placeholder.hidden = false;
      });
      crest.appendChild(img);
      img.src = logo;
      if (img.complete && img.naturalWidth > 0) placeholder.hidden = true;
    }
    return crest;
  }
  // Respect the export's first/last names when present. Older saved cards
  // only contain one full-name string, so reconstruct both lines for them.
  function nameParts(card) {
    const parts = api.findNameParts?.(card) || {};
    const first = String(parts.firstName || '').trim();
    const last = String(parts.lastName || '').trim();
    if (first || last) return {first: first || '', last: last || first};
    const name = String(card.name || 'Unknown player').trim();
    const breakAt = name.indexOf(' ');
    return breakAt < 0 ? {first: '', last: name} : {
      first: name.slice(0, breakAt), last: name.slice(breakAt + 1)
    };
  }
  function frontOf(card) {
    const front = make('span', 'dbl-cards-face dbl-cards-front');
    // FLAGSHIP and the peak-rating season stack in the top-left.
    const heading = make('span', 'dbl-cards-front-top');
    const edition = tierMap[card.rarity];
    heading.appendChild(make('strong', 'dbl-cards-flagship',
      edition?.mythical ? 'MYTHICAL' : 'FLAGSHIP'));
    const issue = make('span', 'dbl-cards-issue');
    issue.appendChild(make('span', 'dbl-cards-year', card.era ?? 'ARCHIVE'));
    heading.appendChild(issue);
    front.appendChild(heading);
    // Peak OVR moves to the upper-right in its original circular outline.
    const playerMetrics = make('span', 'dbl-cards-player-metrics');
    playerMetrics.appendChild(make('strong', 'dbl-cards-ovr-value',
      card.ovr ?? '—'));
    playerMetrics.title = 'Peak overall rating';
    front.appendChild(playerMetrics);
    front.appendChild(art(card));
    if (edition?.mythical) {
      const aura = make('span', 'dbl-cards-mythical-aura');
      aura.setAttribute('aria-hidden', 'true');
      front.appendChild(aura);
      const symbol = make('span', 'dbl-cards-mythical-symbol',
        card.rarity === 'mythic-eclipse' ? '◉' :
        card.rarity === 'mythic-aurora' ? '◇' : '✦');
      symbol.setAttribute('aria-hidden', 'true');
      front.appendChild(symbol);
      front.appendChild(make('span', 'dbl-cards-mythical-plaque',
        '✦  LEGENDS ETERNAL  ✦'));
    }

    // The team crest takes the former OVR slot beside the surname.
    // The peak-year jersey stays inline after the team name.
    const lower = make('span', 'dbl-cards-bottom');
    const identity = make('span', 'dbl-cards-identity');
    identity.appendChild(teamCrest(card));
    const jersey = api.findJersey?.(card);

    const details = make('span', 'dbl-cards-identity-details');
    const names = nameParts(card);
    if (names.first) details.appendChild(make('span', 'dbl-cards-first-name', names.first));
    const surname = make('strong', 'dbl-cards-name');
    surname.appendChild(make('span', 'dbl-cards-surname-glyphs',
      names.last.toLocaleUpperCase()));
    details.appendChild(surname);
    const affiliation = make('span', 'dbl-cards-affiliation');
    affiliation.appendChild(make('span', 'dbl-cards-affiliation-team',
      card.pos + ' | ' + (card.teamName || card.team)));
    if (jersey) affiliation.appendChild(make('span',
      'dbl-cards-affiliation-jersey', ' | #' + jersey));
    details.appendChild(affiliation);
    identity.appendChild(details);
    lower.appendChild(identity);

    // Premium editions retain their vertical labels; Base is unlettered.
    if (card.rarity !== 'common') {
      const rarity = make('span', 'dbl-cards-side-rarity dbl-cards-rarity-name',
        edition?.shortLabel || edition?.label.toUpperCase() || '');
      front.appendChild(rarity);
    }
    front.appendChild(lower);

    front.appendChild(make('span', 'dbl-cards-foil'));
    if (card.rarity === 'black-label') {
      for (let index = 0; index < 7; index++) {
        const sparkle = make('span', 'dbl-cards-sparkle', '✦');
        sparkle.setAttribute('aria-hidden', 'true');
        front.appendChild(sparkle);
      }
    }
    return front;
  }
  function backOf(card, sealed) {
    const back = make('span', 'dbl-cards-face dbl-cards-back');
    if (sealed) {
      back.appendChild(make('span', 'dbl-cards-back-logo', 'DBL'));
      back.appendChild(make('span', 'dbl-cards-back-ornament', '✦'));
      back.appendChild(make('strong', 'dbl-cards-back-sealed-series', 'SERIES 0'));
      back.appendChild(make('span', 'dbl-cards-back-small', 'LEGENDS NEVER FADE'));
      back.appendChild(make('span', 'dbl-cards-back-tap', 'TAP TO REVEAL'));
      return back;
    }
    // Echo the front's stacked FLAGSHIP lockup on the player profile.
    const heading = make('span', 'dbl-cards-back-heading');
    heading.appendChild(make('strong', 'dbl-cards-back-flagship',
      tierMap[card.rarity]?.mythical ? 'MYTHICAL' : 'FLAGSHIP'));
    heading.appendChild(make('span', 'dbl-cards-back-profile', 'PLAYER PROFILE'));
    back.appendChild(heading);
    back.appendChild(make('strong', 'dbl-cards-back-name', card.name));
    back.appendChild(make('span', 'dbl-cards-back-team', card.teamName));
    const metrics = make('span', 'dbl-cards-back-metrics');
    for (const [value, heading] of [
      [card.peak ?? '—', 'PEAK OVR'],
      [format(card.gp), 'CAREER GP'],
      [format(card.ppg, 1), 'CAREER PPG'],
      [format(card.ws, 1), 'WIN SHARES']
    ]) {
      const part = make('span', 'dbl-cards-back-metric');
      part.appendChild(make('strong', '', value));
      part.appendChild(make('span', '', heading));
      metrics.appendChild(part);
    }
    back.appendChild(metrics);
    const editionText = card.rarity === 'common' ? '' :
      ' · ' + (tierMap[card.rarity]?.label.toUpperCase() || '');
    back.appendChild(make('span', 'dbl-cards-back-foot',
      'SERIES ' + (card.series ?? api.currentSeries) + ' · ' +
      (card.era ?? 'DBL') + editionText));
    back.appendChild(make('span', 'dbl-cards-back-tap', 'TAP TO TURN'));
    // Keep the revealed back's foil finish, but reserve the vertical
    // rarity side-rail for the front of the card only.
    back.appendChild(make('span', 'dbl-cards-foil'));
    return back;
  }
  function showAllCollections() {
    const fragment = document.createDocumentFragment();
    for (const collection of CARD_COLLECTIONS) {
      const tile = make('button', 'dbl-cards-series-tile');
      tile.type = 'button';
      tile.setAttribute('aria-label', 'Open ' + collection.name + ' checklist');
      // Use the exact sealed reverse used in the Pack Room, not a static
      // image or a second, separately maintained copy of the design.
      const cover = make('span', 'dbl-cards-card is-sealed dbl-cards-series-cover');
      cover.setAttribute('aria-hidden', 'true');
      const inner = make('span', 'dbl-cards-inner');
      inner.appendChild(backOf({series: collection.series}, true));
      cover.appendChild(inner);
      tile.appendChild(cover);
      tile.appendChild(make('strong', 'dbl-cards-series-title', collection.name));
      tile.appendChild(make('span', 'dbl-cards-series-subtitle', collection.subtitle));
      const dates = make('span', 'dbl-cards-series-dates');
      for (const [label, value] of [
        ['IRL established', collection.establishedIrl],
        ['In-game established', collection.establishedInGame]
      ]) {
        const line = make('span', 'dbl-cards-series-date');
        line.appendChild(make('span', 'dbl-cards-series-date-label', label));
        line.appendChild(make('strong', 'dbl-cards-series-date-value', value));
        dates.appendChild(line);
      }
      tile.appendChild(dates);
      tile.addEventListener('click', () => {
        activeChecklistSeries = collection.series;
        // Open the complete checklist, rather than retaining a previous
        // rarity/search filter that could make this series look incomplete.
        checklistSearch.value = '';
        checklistRarity.value = 'all';
        checklistOwnership.value = 'all';
        checklistSort.value = 'name';
        checklistLimit = 80;
        openCardsSubtab(CHECKLIST_TAB_INDEX);
      });
      fragment.appendChild(tile);
    }
    allCollectionsGrid.replaceChildren(fragment);
  }
  function cardElement(card, sealed = false, onFirst = null) {
    const button = make('button', 'dbl-cards-card' + (sealed ? ' is-sealed' : ''));
    button.type = 'button';
    // Mystery cards have no rarity-dependent styling until flipped over.
    // Revealed cards and cards already owned use their proper rarity color.
    if (!sealed) button.dataset.rarity = card.rarity;
    button.setAttribute('aria-label', sealed ? 'Reveal mystery DBL card' :
      'View statistics for ' + card.name + ', ' + tierMap[card.rarity]?.label);
    const inner = make('span', 'dbl-cards-inner');
    inner.appendChild(frontOf(card));
    const reverse = backOf(card, sealed);
    inner.appendChild(reverse);
    button.appendChild(inner);
    let revealed = !sealed;
    button.addEventListener('click', () => {
      if (!revealed) {
        revealed = true;
        const newBack = backOf(card, false);
        reverse.replaceChildren(...Array.from(newBack.childNodes));
        button.classList.remove('is-sealed');
        button.dataset.rarity = card.rarity;
        scheduleNameFit();
        button.setAttribute('aria-label', 'View statistics for ' + card.name +
          ', ' + tierMap[card.rarity]?.label);
        if (onFirst) onFirst();
      } else {
        button.classList.toggle('is-turned');
        button.setAttribute('aria-label', button.classList.contains('is-turned')
          ? 'View front of ' + card.name : 'View statistics for ' + card.name);
      }
    });
    return button;
  }
  function newPackArt(tearing = false) {
    const pack = make('div', 'dbl-cards-pack' + (tearing ? ' is-ripping' : ''));
    pack.appendChild(make('span', 'dbl-cards-pack-crest', 'DBL / 1916'));
    pack.appendChild(make('strong', 'dbl-cards-pack-name', 'LEGACY'));
    pack.appendChild(make('span', 'dbl-cards-pack-shape', '◇'));
    pack.appendChild(make('span', 'dbl-cards-pack-series',
      'SERIES ' + api.currentSeries + ' · THE COLLECTOR SERIES'));
    pack.appendChild(make('span', 'dbl-cards-pack-guarantee', '5 CARDS · RARE+ GUARANTEED'));
    pack.appendChild(make('span', 'dbl-cards-pack-tear'));
    return pack;
  }
  function readyStage() {
    packToken++;
    busy = false;
    packCards = [];
    actions.hidden = true;
    packStage.replaceChildren(newPackArt(),
      make('p', 'dbl-cards-stage-note', 'Tap Open to tear the wrapper and reveal five cards.'));
    showStatus();
  }
  function revealAll() {
    for (const card of packCards) {
      if (card.classList.contains('is-sealed')) card.click();
    }
    revealBtn.disabled = true;
  }
  function showPulls(picks, token, ownedBeforePack) {
    if (token !== packToken) return;
    busy = false;
    packStage.replaceChildren();
    packStage.appendChild(make('p', 'dbl-cards-stage-note',
      'Five cards added to your collection · Tap each card to reveal it'));
    const spread = make('div', 'dbl-cards-pull-grid');
    packCards = picks.map((card, index) => {
      // Never identify a sealed card as new or previously owned: doing so
      // could reveal information about its hidden rarity before the flip.
      const entry = make('div', 'dbl-cards-pull-entry');
      const status = make('span', 'dbl-cards-pull-status');
      const alreadyOwned = ownedBeforePack.get(card.id) || 0;
      entry.appendChild(status);
      const element = cardElement(card, true, () => {
        status.textContent = alreadyOwned === 0 ? 'NEW CARD' :
          format(alreadyOwned) + (alreadyOwned === 1 ? ' COPY' : ' COPIES') + ' ALREADY OWNED';
        status.classList.add(alreadyOwned === 0 ? 'is-new' : 'is-owned');
        if (packCards.every(c => !c.classList.contains('is-sealed'))) revealBtn.disabled = true;
      });
      element.classList.add('dbl-cards-appearing');
      element.style.setProperty('--pack-position', index);
      entry.appendChild(element);
      spread.appendChild(entry);
      return element;
    });
    packStage.appendChild(spread);
    scheduleNameFit();
    actions.hidden = false;
    revealBtn.disabled = false;
    showStatus();
  }
  function openPack() {
    if (busy || clearing) return;
    const pulled = api.getPack();
    if (pulled.length !== 5) return;
    // Count copies of each player/rarity edition BEFORE collecting this pack.
    // The just-opened cards must not inflate the 'already owned' labels.
    const ownedBeforePack = new Map(api.items.map(card => [card.id, card.count]));
    // Save the pulls immediately. Closing the tab mid-animation cannot
    // discard a pack that was successfully opened.
    if (!api.collectPack(pulled)) return;
    busy = true;
    const token = ++packToken;
    actions.hidden = true;
    packStage.replaceChildren(newPackArt(true),
      make('p', 'dbl-cards-stage-note', 'Unsealing your collector pack…'));
    showStatus();
    window.setTimeout(() => showPulls(pulled, token, ownedBeforePack), reduced() ? 10 : 850);
  }
  function teamNameForCard(card) {
    const name = String(card.teamName || '').trim();
    // Older collection records may have a placeholder instead of a team name.
    return name && name !== 'Team unavailable' && name !== 'League archive'
      ? name : (String(card.team || '').trim() || name || 'Unknown team');
  }
  function syncTeamFilter() {
    // Only list teams represented by cards in the saved binder, not every
    // team from the uploaded league or the currently selected rarity.
    const teams = [...new Set(api.items.map(teamNameForCard))]
      .sort((a, b) => a.localeCompare(b));
    const existing = Array.from(teamFilter.options).slice(1).map(option => option.value);
    if (existing.length === teams.length &&
        existing.every((value, index) => value === teams[index])) return;
    const selected = teamFilter.value;
    const all = make('option', '', 'All teams');
    all.value = 'all';
    const options = teams.map(name => {
      const option = make('option', '', name);
      option.value = name;
      return option;
    });
    teamFilter.replaceChildren(all, ...options);
    teamFilter.value = teams.includes(selected) ? selected : 'all';
  }
  function filteredCards() {
    const q = search.value.trim().toLocaleLowerCase();
    const tier = rarityFilter.value;
    const selectedTeam = teamFilter.value;
    const result = api.items.filter(item => {
      if (tier !== 'all' && tier !== item.rarity) return false;
      if (selectedTeam !== 'all' && teamNameForCard(item) !== selectedTeam) return false;
      return !q || item.name.toLocaleLowerCase().includes(q) ||
        item.team.toLocaleLowerCase().includes(q) ||
        item.teamName.toLocaleLowerCase().includes(q);
    });
    switch (order.value) {
      case 'name': result.sort((a, b) => a.name.localeCompare(b.name)); break;
      case 'duplicates':
        result.sort((a, b) => b.count - a.count || tierIndex[b.rarity] - tierIndex[a.rarity]);
        break;
      case 'player':
        result.sort((a, b) => (b.peak ?? -1) - (a.peak ?? -1) ||
          tierIndex[b.rarity] - tierIndex[a.rarity]); break;
      default:
        result.sort((a, b) => tierIndex[b.rarity] - tierIndex[a.rarity] ||
          (b.peak ?? -1) - (a.peak ?? -1) || a.name.localeCompare(b.name));
    }
    return result;
  }
  function showGallery() {
    syncTeamFilter();
    const filtered = filteredCards();
    galleryCount.textContent = formattedCount(filtered.length) + ' card edition' +
      (filtered.length === 1 ? '' : 's') + ' shown';
    gallery.replaceChildren();
    if (!filtered.length) {
      gallery.appendChild(make('p', 'dbl-cards-empty', api.status.unique
        ? 'No cards match those filters.' :
          'Nothing in your binder yet. Open a pack to start collecting.'));
    } else {
      const fragment = document.createDocumentFragment();
      for (const card of filtered.slice(0, limit)) {
        const cell = make('div', 'dbl-cards-binder-entry');
        cell.appendChild(cardElement(card));
        cell.appendChild(make('span', 'dbl-cards-owned', 'OWNED ×' + card.count));
        fragment.appendChild(cell);
      }
      gallery.appendChild(fragment);
    }
    loadMore.hidden = filtered.length <= limit;
    loadMore.textContent = 'Show ' + Math.min(36, filtered.length - limit) + ' more';
    scheduleNameFit();
  }
  function formattedCount(n) { return n.toLocaleString('en-US'); }

  // A checklist entry represents one player/rarity edition. Collected marks
  // are read from the saved binder, not independently entered or stored.
  function checklistData() {
    // Series 0 currently owns the checklist player pool. Only count owned
    // editions from the series selected through All Collections.
    const players = activeChecklistSeries === api.currentSeries
      ? api.checklistPlayers : [];
    const owned = new Map(api.items
      .filter(card => (card.series ?? api.currentSeries) === activeChecklistSeries)
      .map(card => [card.pid + ':' + card.rarity, card]));
    const totals = Object.fromEntries(checklistTiers.map(tier =>
      [tier.id, {label: tier.label, possible: 0, collected: 0}]));
    const all = [];
    let collected = 0;
    for (const player of players) {
      for (const tier of checklistTiers) {
        if (!Number.isFinite(player.peak) || player.peak < tier.minOvr) continue;
        const id = player.pid + ':' + tier.id;
        const item = owned.get(id);
        const isOwned = !!item;
        totals[tier.id].possible++;
        if (isOwned) { totals[tier.id].collected++; collected++; }
        all.push({
          id, pid: player.pid, name: player.name,
          team: player.teamName || player.team || 'Team unavailable',
          peak: player.peak, era: player.era,
          rarity: tier.id, label: tier.label,
          owned: isOwned, copies: item?.count || 0
        });
      }
    }
    return {all, totals, collected};
  }
  function checklistCounter(parent, label, collected, possible) {
    const box = make('div', 'dbl-cards-checklist-stat');
    box.appendChild(make('strong', '', format(collected) + ' / ' + format(possible)));
    box.appendChild(make('span', '', label));
    const track = make('div', 'dbl-cards-checklist-track');
    const fill = make('span', 'dbl-cards-checklist-fill');
    fill.style.width = (possible ? collected / possible * 100 : 0).toFixed(2) + '%';
    track.appendChild(fill);
    box.appendChild(track);
    parent.appendChild(box);
  }
  function showChecklist() {
    if (activeCardsSubtab !== CHECKLIST_TAB_INDEX || panel.hidden) return;
    const s = api.status;
    checklistStats.replaceChildren();
    checklistList.replaceChildren();
    checklistMore.hidden = true;
    if (!s.ready) {
      checklistCaption.textContent = 'Restoring your collected cards…';
      return;
    }
    if (!s.hasFile) {
      checklistCaption.textContent =
        'Upload a league export to see every possible card. Your owned cards remain saved in My Collection.';
      checklistList.appendChild(make('p', 'dbl-cards-empty',
        'The complete checklist is generated from players in your league archive.'));
      return;
    }
    if (s.loading || (s.season === null && !s.problem)) {
      checklistCaption.textContent = 'Building the checklist from your league file…';
      return;
    }
    if (s.problem) {
      checklistCaption.textContent = s.problem;
      return;
    }
    const {all, totals, collected} = checklistData();
    const progress = all.length ? collected / all.length * 100 : 0;
    checklistCounter(checklistStats, 'Overall · ' + progress.toFixed(1) + '%',
      collected, all.length);
    for (const tier of checklistTiers) {
      const t = totals[tier.id];
      checklistCounter(checklistStats, t.label + ' · peak OVR ' + tier.minOvr + '+',
        t.collected, t.possible);
    }
    const query = checklistSearch.value.trim().toLocaleLowerCase();
    const rarity = checklistRarity.value;
    const ownership = checklistOwnership.value;
    const result = all.filter(card =>
      (rarity === 'all' || card.rarity === rarity) &&
      (ownership === 'all' || (ownership === 'owned') === card.owned) &&
      (!query || card.name.toLocaleLowerCase().includes(query) ||
        card.team.toLocaleLowerCase().includes(query) ||
        String(card.era ?? '').includes(query)));
    if (checklistSort.value === 'rating') {
      result.sort((a, b) => b.peak - a.peak ||
        a.name.localeCompare(b.name) || tierIndex[b.rarity] - tierIndex[a.rarity]);
    } else if (checklistSort.value === 'rarity') {
      result.sort((a, b) => tierIndex[b.rarity] - tierIndex[a.rarity] ||
        a.name.localeCompare(b.name));
    } else {
      result.sort((a, b) => a.name.localeCompare(b.name) ||
        tierIndex[a.rarity] - tierIndex[b.rarity]);
    }
    checklistCaption.textContent =
      format(collected) + ' of ' + format(all.length) + ' editions collected (' +
      progress.toFixed(1) + '%). Showing ' + format(Math.min(checklistLimit, result.length)) +
      ' of ' + format(result.length) + ' matching editions.';
    if (!result.length) {
      checklistList.appendChild(make('p', 'dbl-cards-empty',
        all.length ? 'No card editions match those filters.' :
          'No eligible players are in this league export.'));
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const card of result.slice(0, checklistLimit)) {
      const entry = make('div', 'dbl-cards-checklist-entry' +
        (card.owned ? ' is-owned' : ' is-missing'));
      entry.setAttribute('role', 'listitem');
      const mark = make('span', 'dbl-cards-checklist-mark', card.owned ? '✓' : '');
      mark.setAttribute('aria-label', card.owned ? 'Collected' : 'Not collected');
      mark.setAttribute('role', 'img');
      entry.appendChild(mark);
      const details = make('div', 'dbl-cards-checklist-player');
      details.appendChild(make('strong', '', card.name));
      details.appendChild(make('span', '', card.team +
        (card.era === null ? '' : ' · ' + card.era)));
      entry.appendChild(details);
      entry.appendChild(make('span', 'dbl-cards-checklist-ovr', 'OVR ' + card.peak));
      const edition = make('span', 'dbl-cards-checklist-edition', card.label);
      edition.dataset.rarity = card.rarity;
      entry.appendChild(edition);
      entry.appendChild(make('span', 'dbl-cards-checklist-owned-label',
        card.owned ? 'OWNED' + (card.copies > 1 ? ' ×' + card.copies : '') : 'MISSING'));
      fragment.appendChild(entry);
    }
    checklistList.appendChild(fragment);
    checklistMore.hidden = result.length <= checklistLimit;
    checklistMore.textContent = 'Show ' +
      format(Math.min(80, result.length - checklistLimit)) + ' more editions';
  }
  function openCardsSubtab(index, focus = false) {
    activeCardsSubtab = index;
    try {
      // Store a stable tab ID rather than an index: adding another card set
      // section must not change which tab an F5 refresh restores.
      sessionStorage.setItem(CARDS_SUBTAB_KEY, tabs[index][0].id);
    } catch (_) {
      // Card navigation still works without session storage.
    }
    tabs.forEach(([tab, view], i) => {
      const selected = i === index;
      tab.classList.toggle('is-active', selected);
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      view.hidden = !selected;
    });
    if (index === 1) { showGallery(); scheduleNameFit(); }
    if (index === ALL_COLLECTIONS_TAB_INDEX) showAllCollections();
    if (index === CHECKLIST_TAB_INDEX) { checklistLimit = 80; showChecklist(); }
    if (index === 0) scheduleNameFit();
    if (focus) tabs[index][0].focus();
  }

  function repaint() {
    showStatus();
    showCounters();
    if (activeCardsSubtab === 1) showGallery();
    if (activeCardsSubtab === CHECKLIST_TAB_INDEX) showChecklist();
    // A new file uploaded while Cards is already open should immediately
    // populate the new player pool, not require switching tabs twice.
    if (!panel.hidden) api.ensurePool();
  }
  api.subscribe(repaint);
  if (typeof window.ResizeObserver === 'function') {
    const nameResizeObserver = new window.ResizeObserver(scheduleNameFit);
    nameResizeObserver.observe(gallery);
    nameResizeObserver.observe(packStage);
  } else {
    window.addEventListener('resize', scheduleNameFit);
  }
  document.fonts?.ready?.then(scheduleNameFit);
  tabs.forEach(([tab], index) => {
    tab.addEventListener('click', () => openCardsSubtab(index));
    tab.addEventListener('keydown', event => {
      const next = event.key === 'ArrowRight' ?
        (index + 1) % tabs.length : event.key === 'ArrowLeft' ?
        (index + tabs.length - 1) % tabs.length : event.key === 'Home' ?
        0 : event.key === 'End' ? tabs.length - 1 : null;
      if (next === null) return;
      event.preventDefault();
      openCardsSubtab(next, true);
    });
  });
  for (const control of [checklistSearch, checklistRarity,
    checklistOwnership, checklistSort]) {
    control.addEventListener(control === checklistSearch ? 'input' : 'change', () => {
      checklistLimit = 80;
      showChecklist();
    });
  }
  checklistMore.addEventListener('click', () => {
    checklistLimit += 80;
    showChecklist();
  });
  openBtn.addEventListener('click', openPack);
  revealBtn.addEventListener('click', revealAll);
  againBtn.addEventListener('click', readyStage);
  for (const control of [rarityFilter, teamFilter, order, search]) {
    control.addEventListener(control === search ? 'input' : 'change', () => {
      limit = 36;
      showGallery();
    });
  }
  loadMore.addEventListener('click', () => { limit += 36; showGallery(); });
  clearBtn.addEventListener('click', async () => {
    if (clearing || busy || !api.status.ready || !api.status.count) return;
    const okay = window.confirm(
      'Permanently clear all collected cards, duplicates, and pack counts on this device? This cannot be undone.'
    );
    if (!okay) return;
    clearing = true;
    repaint();
    try {
      const cleared = await api.clearCollection();
      if (cleared) {
        readyStage();
        limit = 36;
        search.value = '';
        rarityFilter.value = 'all';
        teamFilter.value = 'all';
        order.value = 'rarity';
        repaint();
      } else {
        saveStatus.textContent = 'Could not clear the collection because the save failed. Your cards were kept.';
      }
    } catch (error) {
      console.warn('Could not clear card collection.', error);
      saveStatus.textContent = 'Could not clear the collection. Your cards were kept.';
    } finally {
      clearing = false;
      showStatus();
      clearBtn.disabled = !api.status.count;
    }
  });
  window.addEventListener('dbl:tab-change', event => {
    if (event.detail?.panelId === 'cardsPanel') {
      api.ensurePool();
      if (activeCardsSubtab === CHECKLIST_TAB_INDEX) showChecklist();
      if (activeCardsSubtab === 1) showGallery();
      scheduleNameFit();
    }
  });
  // Match refresh behavior of the main tab router for the nested Cards tabs.
  let startingCardsSubtab = 0;
  try {
    const navigation = window.performance?.getEntriesByType?.('navigation')?.[0];
    const isReload = navigation
      ? navigation.type === 'reload'
      : window.performance?.navigation?.type === 1;
    if (isReload) {
      const saved = sessionStorage.getItem(CARDS_SUBTAB_KEY);
      // Older versions stored numeric indices 0/1/2, with Checklist at 2.
      const legacyTabIds = ['cardsPacksTab', 'cardsCollectionTab', 'cardsChecklistTab'];
      const savedTabId = /^\d+$/.test(saved || '')
        ? legacyTabIds[Number(saved)] : saved;
      const restoredIndex = tabs.findIndex(([tab]) => tab.id === savedTabId);
      if (restoredIndex >= 0) startingCardsSubtab = restoredIndex;
    }
  } catch (_) {
    // Use Pack Room if navigation timing or storage is unavailable.
  }
  readyStage();
  openCardsSubtab(startingCardsSubtab);
  repaint();
})();