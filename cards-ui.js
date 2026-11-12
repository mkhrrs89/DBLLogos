(() => {
  'use strict';
  const api = window.DBLCardEngine;
  const CARDS_SUBTAB_KEY = 'dbl-cards-active-subtab:v1';
  const panel = document.getElementById('cardsPanel');
  const status = document.getElementById('cardsStatus');
  const saveStatus = document.getElementById('cardsSaveStatus');
  const packStage = document.getElementById('cardsPackStage');
  const packsOpenedTotal = document.getElementById('cardsPacksOpenedTotal');
  const openBtn = document.getElementById('cardsOpenPackBtn');
  const actions = document.getElementById('cardsPackActions');
  const revealBtn = document.getElementById('cardsRevealAllBtn');
  const againBtn = document.getElementById('cardsNextPackBtn');
  const counter = document.getElementById('cardsCollectionStats');
  const gallery = document.getElementById('cardsCollection');
  const galleryCount = document.getElementById('cardsCollectionCount');
  const selectToggle = document.getElementById('cardsSelectToggleBtn');
  const selectionActions = document.getElementById('cardsSelectionActions');
  const selectionCount = document.getElementById('cardsSelectionCount');
  const selectVisibleBtn = document.getElementById('cardsSelectVisibleBtn');
  const deselectAllBtn = document.getElementById('cardsDeselectAllBtn');
  const deleteSelectedBtn = document.getElementById('cardsDeleteSelectedBtn');
  const cancelSelectionBtn = document.getElementById('cardsCancelSelectionBtn');
  const selectionFeedback = document.getElementById('cardsSelectionFeedback');
  const search = document.getElementById('cardsSearch');
  const rarityFilter = document.getElementById('cardsRarityFilter');
  const teamFilter = document.getElementById('cardsTeamFilter');
  const favoritesFilter = document.getElementById('cardsFavoritesFilter');
  const mixedPackType = document.getElementById('cardsMixedPackType');
  const toppsPackType = document.getElementById('cardsToppsPackType');
  const backgroundPackType = document.getElementById('cardsBackgroundPackType');
  const order = document.getElementById('cardsSort');
  const loadMore = document.getElementById('cardsShowMoreBtn');
  const clearBtn = document.getElementById('cardsClearCollectionBtn');
  const exportBtn = document.getElementById('cardsExportCollectionBtn');
  const mergeBtn = document.getElementById('cardsMergeCollectionBtn');
  const mergeFile = document.getElementById('cardsImportCollectionFile');
  const mergeFeedback = document.getElementById('cardsMergeFeedback');
  const allCollectionsGrid = document.getElementById('cardsAllCollectionsGrid');
  const tabs = [
    ['cardsPacksTab', 'cardsPackView'],
    ['cardsCollectionTab', 'cardsCollectionView'],
    ['cardsAllCollectionsTab', 'cardsAllCollectionsView'],
    ['cardsChecklistTab', 'cardsChecklistView'],
    ['cardsBackgroundTestTab', 'cardsBackgroundTestView']
  ].map(([tab, view]) => [document.getElementById(tab), document.getElementById(view)]);
  const checklistStats = document.getElementById('cardsChecklistStats');
  const checklistFranchises = document.getElementById('cardsChecklistFranchises');
  const checklistSearch = document.getElementById('cardsChecklistSearch');
  const checklistRarity = document.getElementById('cardsChecklistRarity');
  const checklistOwnership = document.getElementById('cardsChecklistOwnership');
  const checklistSort = document.getElementById('cardsChecklistSort');
  const checklistCaption = document.getElementById('cardsChecklistCaption');
  const checklistSeriesContext = document.getElementById('cardsChecklistSeriesContext');
  const checklistDescription = document.getElementById('cardsChecklistDescription');
  const checklistFranchiseDescription = document.getElementById('cardsChecklistFranchiseDescription');
  const checklistNote = document.getElementById('cardsChecklistNote');
  const checklistList = document.getElementById('cardsChecklistList');
  const checklistMore = document.getElementById('cardsChecklistMore');
  if (!api || !panel || !status || !saveStatus || !packStage || !packsOpenedTotal || !openBtn ||
      !actions || !revealBtn || !againBtn || !counter || !gallery ||
      !galleryCount || !selectToggle || !selectionActions || !selectionCount ||
      !selectVisibleBtn || !deselectAllBtn || !deleteSelectedBtn ||
      !cancelSelectionBtn || !selectionFeedback ||
      !search || !rarityFilter || !teamFilter ||
      !favoritesFilter || !mixedPackType || !toppsPackType || !backgroundPackType || !order || !loadMore ||
      !clearBtn || !exportBtn || !mergeBtn || !mergeFile || !mergeFeedback ||
      !allCollectionsGrid || tabs.some(([tab, view]) => !tab || !view) ||
      !checklistStats || !checklistFranchises || !checklistSearch || !checklistRarity ||
      !checklistOwnership || !checklistSort || !checklistCaption ||
      !checklistList || !checklistMore || !checklistSeriesContext ||
      !checklistDescription || !checklistFranchiseDescription || !checklistNote) return;

  const ALL_COLLECTIONS_TAB_INDEX = tabs.findIndex(([tab]) => tab.id === 'cardsAllCollectionsTab');
  const CHECKLIST_TAB_INDEX = tabs.findIndex(([tab]) => tab.id === 'cardsChecklistTab');
  const BACKGROUND_TEST_TAB_INDEX = tabs.findIndex(([tab]) => tab.id === 'cardsBackgroundTestTab');
  // Collection entries are explicit so future sets can have their own covers.
  const CARD_COLLECTIONS = [
    {
      series: 0,
      name: 'Series 0',
      subtitle: 'Original FLAGSHIP set',
      establishedIrl: 'Nov 9, 2026',
      establishedInGame: '1968'
    },
    {
      series: 1,
      name: '1968 Topps',
      subtitle: '1968 test issue · Base, rookies & uniform inserts',
      establishedIrl: 'Nov 10, 2026',
      establishedInGame: '1968'
    },
    {
      series: 2,
      name: 'Background Test',
      subtitle: 'On-device background removal · Current OVR 50+ · Plain packs',
      establishedIrl: 'Nov 12, 2026',
      establishedInGame: 'Current season'
    }
  ];
  let activeChecklistSeries = 0;
  const tierIndex = Object.fromEntries(api.rarities.map((r, i) => [r.id, i]));
  // Inserts are rarer than Refractors but less scarce than Black Label.
  // Do not rank them above the intentionally hidden rarest editions.
  tierIndex['team-season'] = 2.5;
  tierIndex['topps-1968'] = 1.5;
  tierIndex['topps-1968-uniform'] = 2.6;
  tierIndex['background-test'] = 1;
  const tierMap = Object.fromEntries(api.rarities.map(r => [r.id, r]));
  // Undiscovered editions must never appear in the checklist or public
  // progress totals, even for players who meet their hidden requirements.
  const checklistTiers = api.rarities.filter(r => !r.mythical && !r.insert);
  const insertTier = api.rarities.find(r => r.insert);
  const completionTiers = insertTier ? [...checklistTiers, insertTier] : checklistTiers;
  const toppsCompletionTiers = api.rarities.filter(r =>
    r.id === 'topps-1968' || r.id === 'topps-1968-uniform');
  const activeCompletionTiers = () => activeChecklistSeries === 1
    ? toppsCompletionTiers : completionTiers;
  const isTeamSeason = card => card?.type === 'team-season';
  // Refractor treatment is an honor for verified champion team-seasons,
  // not a new rarity/pull category and never a clue on sealed backs.
  const isChampionTeam = card => isTeamSeason(card) && card.finishKind === 'champion';
  const isToppsPlayer = card => card?.type === 'topps-player';
  const isToppsUniform = card => card?.type === 'topps-uniform';
  const isBackgroundTest = card => card?.type === 'background-test';
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
  let transferBusy = false;
  let selectionMode = false;
  let deletingSelected = false;
  const selectedCardIds = new Set();
  let packToken = 0;
  let packCards = [];
  let packType = 'mixed';
  let limit = 36;
  let lastFileState = '';
  let nameFitScheduled = false;
  let activeCardsSubtab = 0;
  let checklistLimit = 80;
  let franchiseSortKey = 'franchise';
  let franchiseSortDirection = 'asc';

  // The outer name field clips nothing except true overflow; squeeze the
  // actual surname letters horizontally to fit. Measure LAYOUT width here,
  // not getBoundingClientRect(): pack entrance effects and 3D card flips
  // transform that visual rectangle and falsely report narrower text.
  function fitName(name) {
    const glyphs = name.querySelector('.dbl-cards-surname-glyphs');
    if (!glyphs) return;
    const available = name.clientWidth;
    if (available <= 0) return; // The cards panel may still be hidden.
    // scrollWidth/offsetWidth ignore transient transforms and remain reliable
    // while the sealed back rotates away to reveal the front.
    const natural = Math.max(glyphs.scrollWidth || 0, glyphs.offsetWidth || 0);
    if (natural <= 0) return;
    const innerWidth = Math.max(1, available - 7); // breathing room at right edge
    glyphs.style.transformOrigin = 'left center';
    glyphs.style.transform = natural > innerWidth
      ? 'scaleX(' + Math.min(1, innerWidth / natural).toFixed(5) + ')'
      : '';
  }
  // The 1968 Topps uniform title uses the same upright display font as
  // player names. Compress only the GLYPHS, not the printed card or photo.
  // Keep a one-line, centered wordmark even for very long franchise names.
  function fitUniformName(name) {
    const glyphs = name.querySelector('.dbl-topps-uniform-name-glyphs');
    if (!glyphs) return;
    const available = name.clientWidth;
    if (available <= 0) return;
    // Layout widths avoid distortion from pack-flip and entrance transforms.
    const natural = Math.max(glyphs.scrollWidth || 0, glyphs.offsetWidth || 0);
    if (natural <= 0) return;
    const innerWidth = Math.max(1, available - 6);
    glyphs.style.transformOrigin = 'center center';
    glyphs.style.transform = natural > innerWidth
      ? 'scaleX(' + Math.min(1, innerWidth / natural).toFixed(5) + ')'
      : '';
  }
  function uniformName(text, cls) {
    const name = make('strong', cls + ' dbl-topps-uniform-fit-name');
    name.appendChild(make('span', 'dbl-topps-uniform-name-glyphs', text));
    return name;
  }
  function fitVisibleNames() {
    for (const root of [gallery, packStage]) {
      for (const name of root.querySelectorAll?.('.dbl-cards-name') || []) {
        fitName(name);
      }
      for (const name of root.querySelectorAll?.('.dbl-topps-uniform-fit-name') || []) {
        fitUniformName(name);
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
  function marketMoney(value) {
    return '$' + format(value, 2);
  }
  function marketTag(card) {
    const tag = make('span', 'dbl-cards-market-value');
    tag.appendChild(make('span', 'dbl-cards-market-caption', 'EST. VALUE'));
    tag.appendChild(make('strong', 'dbl-cards-market-price',
      marketMoney(api.marketValue(card))));
    tag.title = 'Fictional DBL card market estimate; not real money';
    return tag;
  }
  function showCounters() {
    const s = api.status;
    // Reuse the same saved lifetime total displayed in My Collection.
    packsOpenedTotal.textContent = s.ready ? format(s.packs) : '—';
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
    appendStat(counter, marketMoney(api.items.reduce((total, card) =>
      total + api.marketValue(card) * card.count, 0)),
      'Est. collection value');
    appendStat(counter, format(api.items.filter(c => c.series === 1)
      .reduce((n, c) => n + c.count, 0)), '1968 Topps pulls');
    appendStat(counter, format(api.items.filter(c => isBackgroundTest(c))
      .reduce((n, c) => n + c.count, 0)), 'Background Test pulls');
    appendStat(counter, format(api.items.filter(c => isTeamSeason(c))
      .reduce((n, c) => n + c.count, 0)), 'Team Season inserts');
    appendStat(counter, format(api.items.filter(c => c.rarity === 'black-label')
      .reduce((n, c) => n + c.count, 0)), 'Black Label pulls');
    const hiddenPulls = api.items.filter(c => tierMap[c.rarity]?.mythical)
      .reduce((n, c) => n + c.count, 0);
    if (hiddenPulls > 0) appendStat(counter, format(hiddenPulls), 'Mythical pulls');
    clearBtn.disabled = clearing || busy || transferBusy || deletingSelected ||
      s.merging || s.deletingCards || !s.ready || s.count === 0;
    exportBtn.disabled = !s.ready || clearing || transferBusy || deletingSelected ||
      s.merging || s.deletingCards;
    mergeBtn.disabled = !s.ready || busy || clearing || transferBusy || deletingSelected ||
      s.merging || s.deletingCards;
    updateSelectionControls();
    saveStatus.textContent = s.ready
      ? s.savedOK ? 'Collection saved locally in this browser.' :
        'Browser storage is unavailable. Collection may be lost after a refresh.'
      : 'Restoring your saved collection…';
  }
  function showStatus() {
    const s = api.status;
    const fileKey = [s.hasFile, s.poolSize, s.toppsPoolSize,
      s.backgroundTestPoolSize, s.season,
      s.loading, s.problem, packType].join('|');
    if (fileKey !== lastFileState) {
      lastFileState = fileKey;
      if (s.problem) status.textContent = s.problem;
      else if (!s.hasFile) status.textContent =
        'Upload a league file to open packs. Your existing collection is available below.';
      else if (s.loading) status.textContent = 'Building cards from your league player archive…';
      else if (packType === 'background-test' && !s.backgroundTestPoolSize) status.textContent =
        'No current players with OVR 50+ are available for Background Test packs.';
      else if (packType === 'background-test') status.textContent =
        format(s.backgroundTestPoolSize) + ' current OVR 50+ players available. Open a Background Test-only pack.';
      else if (packType === 'topps-1968' && !s.toppsPoolSize) status.textContent =
        'No 1968 Topps cards are available. Upload a league export that includes the 1968 season.';
      else if (packType === 'topps-1968') status.textContent =
        format(s.toppsPoolSize) + ' 1968 Topps editions available. Open a five-card Topps-only pack.';
      else if (s.poolSize) status.textContent =
        format(s.poolSize) + ' players available from the ' + s.season +
        ' export. Open packs and collect DBL legends from every era.';
      else status.textContent =
        'Open the Cards tab to load players from the uploaded league file.';
    }
    const canOpenSelected = packType === 'topps-1968'
      ? s.toppsPoolSize > 0 : packType === 'background-test'
        ? s.backgroundTestPoolSize > 0 : s.poolSize > 0;
    openBtn.disabled = busy || clearing || transferBusy || deletingSelected ||
      s.merging || s.deletingCards ||
      !s.ready || !canOpenSelected || s.loading;
    openBtn.textContent = busy ? 'Opening pack…' :
      packType === 'topps-1968' ? 'Open 1968 Topps pack' :
      packType === 'background-test' ? 'Open Background Test pack' : 'Open five-card pack';
    mixedPackType.classList.toggle('is-selected', packType === 'mixed');
    toppsPackType.classList.toggle('is-selected', packType === 'topps-1968');
    backgroundPackType.classList.toggle('is-selected', packType === 'background-test');
    mixedPackType.setAttribute('aria-pressed', String(packType === 'mixed'));
    toppsPackType.setAttribute('aria-pressed', String(packType === 'topps-1968'));
    backgroundPackType.setAttribute('aria-pressed', String(packType === 'background-test'));
    mixedPackType.disabled = busy;
    toppsPackType.disabled = busy;
    backgroundPackType.disabled = busy;
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
  // Decide which *historical Team Season* logos need dark silhouette ink.
  // Sample only visible pixels, skipping transparent logo padding. Cache by
  // image source so repeated seasons and duplicate pulls stay inexpensive.
  const teamLogoToneCache = new Map();
  function measureTeamLogoTone(image) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 48;
      canvas.height = 48;
      const ctx = canvas.getContext('2d', {willReadFrequently: true});
      if (!ctx) return null;
      ctx.drawImage(image, 0, 0, 48, 48);
      const data = ctx.getImageData(0, 0, 48, 48).data;
      let visible = 0, totalLight = 0, lightArea = 0, tanArea = 0;
      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3] / 255;
        if (alpha < .08) continue;
        const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
        const light = .2126 * r + .7152 * g + .0722 * b;
        visible += alpha;
        totalLight += alpha * light;
        if (light >= .73) lightArea += alpha;
        // Catch muted cream/gold/tan marks that disappear on the tan stock.
        if (light >= .48 && light < .83 && r >= g && g >= b * .93 &&
            r - g <= .28 && g - b <= .29) tanArea += alpha;
      }
      if (visible < 1) return false;
      const average = totalLight / visible;
      return average >= .68 || lightArea / visible >= .47 ||
        (average >= .51 && (lightArea / visible >= .28 ||
          tanArea / visible >= .48));
    } catch {
      // Cross-origin images without permission cannot be sampled.
      return null;
    }
  }
  function detectTeamLogoTone(image, source) {
    const apply = result => {
      // A result of null means unreadable, not that the logo is dark.
      image.classList.toggle('is-light-logo', result === true);
    };
    if (teamLogoToneCache.has(source)) {
      const saved = teamLogoToneCache.get(source);
      if (saved && typeof saved.then === 'function') void saved.then(apply);
      else apply(saved);
      return;
    }
    const immediate = measureTeamLogoTone(image);
    if (immediate !== null) {
      teamLogoToneCache.set(source, immediate);
      apply(immediate);
      return;
    }
    // Try an isolated CORS-enabled image for externally hosted logos.
    // Never alter the already-working displayed image or block its loading.
    if (!/^https?:\/\//i.test(source) || typeof window.Image !== 'function') {
      teamLogoToneCache.set(source, null);
      return;
    }
    const pending = new Promise(resolve => {
      const probe = new window.Image();
      probe.crossOrigin = 'anonymous';
      probe.onload = () => resolve(measureTeamLogoTone(probe));
      probe.onerror = () => resolve(null);
      probe.src = source;
    });
    teamLogoToneCache.set(source, pending);
    void pending.then(result => {
      teamLogoToneCache.set(source, result);
      apply(result);
    });
  }
  function teamCrest(card, inspectColor = false) {
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
        if (inspectColor) detectTeamLogoTone(img, logo);
      });
      img.addEventListener('error', () => {
        img.remove();
        placeholder.hidden = false;
      });
      crest.appendChild(img);
      img.src = logo;
      if (img.complete && img.naturalWidth > 0) {
        placeholder.hidden = true;
        if (inspectColor) detectTeamLogoTone(img, logo);
      }
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
  // Plain-paper 1968 Topps test card fronts and statistics reverse.
  function toppsIdentity(card) {
    const num = api.findJersey?.(card);
    return make('span', 'dbl-topps-identity',
      (card.pos || '—') + ' | ' + (card.teamName || card.team || 'DBL') +
      (num ? ' | #' + num : ''));
  }
  function toppsPlayerFront(card) {
    const front = make('span', 'dbl-cards-face dbl-cards-front dbl-topps-front dbl-topps-player-front');
    if (card.rookie) front.classList.add('is-rookie');
    const portrait = art(card);
    portrait.classList.add('dbl-topps-photo');
    front.appendChild(portrait);
    if (card.rookie)
      front.appendChild(make('span', 'dbl-topps-rookie-rail', 'ROOKIE'));
    front.appendChild(make('strong', 'dbl-topps-player-name', card.name));
    front.appendChild(toppsIdentity(card));
    return front;
  }
  // Uniform assets are ordinary files in the public GitHub Pages site:
  // assets/uniforms/1968/<historical-team>-home|away.png/webp/jpg.
  // Read the public GitHub directory once so filenames and extensions
  // (including uppercase .PNG) are matched exactly. An unavailable listing
  // gracefully falls back to checking the conventional asset paths.
  const uniformDirectoryUrl =
    'https://api.github.com/repos/mkhrrs89/DBLLogos/contents/assets/uniforms/1968?ref=main';
  const uniformAssetRoot = './assets/uniforms/1968/';
  const uniformImageResults = new Map();
  let uniformDirectoryPromise = null;
  function uniformKey(text) {
    return String(text || '').normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  function uniformDirectory() {
    if (uniformDirectoryPromise) return uniformDirectoryPromise;
    if (typeof window.fetch !== 'function') {
      uniformDirectoryPromise = Promise.resolve(null);
      return uniformDirectoryPromise;
    }
    uniformDirectoryPromise = window.fetch(uniformDirectoryUrl, {
      headers: {'Accept': 'application/vnd.github+json'}
    }).then(response => {
      if (!response.ok) return null;
      return response.json();
    }).then(entries => {
      if (!Array.isArray(entries)) return null;
      const found = new Map();
      for (const entry of entries) {
        if (entry?.type !== 'file') continue;
        const name = String(entry.name || '');
        // Never create paths from arbitrary GitHub API input.
        if (!/^[a-z0-9][a-z0-9_.-]*\.(png|webp|jpe?g)$/i.test(name)) continue;
        const match = /^(.+)-(home|away)\.(png|webp|jpe?g)$/i.exec(name);
        if (!match) continue;
        found.set(uniformKey(match[1]) + ':' + match[2].toLowerCase(),
          uniformAssetRoot + encodeURIComponent(name));
      }
      return found;
    }).catch(() => null);
    return uniformDirectoryPromise;
  }
  function uniformFallbackUrls(card) {
    const name = String(card.teamName || '').normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ').trim();
    const words = name.split(/\s+/).filter(Boolean);
    if (!words.length || !/^(home|away)$/i.test(card.uniform || '')) return [];
    const side = card.uniform.toLowerCase();
    // Most artwork uses compact city names: sanfrancisco-zephyrs-home.png.
    // Also recognize standard hyphenated names: san-francisco-zephyrs.
    const stems = [...new Set([
      words.slice(0, -1).join('') + '-' + words[words.length - 1],
      words.join('-')
    ])].filter(stem => /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(stem));
    const urls = [];
    for (const stem of stems) {
      for (const ext of ['png', 'PNG', 'webp', 'jpg', 'jpeg'])
        urls.push(uniformAssetRoot + stem + '-' + side + '.' + ext);
    }
    return urls;
  }
  function applyUniformImage(artwork, card) {
    const side = String(card.uniform || '').toLowerCase();
    if (side !== 'home' && side !== 'away') return;
    const key = uniformKey(card.teamName) + ':' + side;
    const cached = uniformImageResults.get(key);
    if (cached === null && !card.uniformImage) return;
    const addImage = candidates => {
      const urls = [...new Set(candidates.filter(Boolean))];
      if (!urls.length) return;
      const img = make('img', 'dbl-topps-uniform-image');
      img.alt = side.toUpperCase() + ' uniform for ' + card.teamName;
      img.loading = 'lazy';
      img.decoding = 'async';
      let index = 0;
      img.addEventListener('load', () => {
        uniformImageResults.set(key, img.src);
        artwork.classList.add('has-image');
      });
      img.addEventListener('error', () => {
        artwork.classList.remove('has-image');
        if (index < urls.length) img.src = urls[index++];
        else {
          uniformImageResults.set(key, null);
          img.remove();
        }
      });
      artwork.appendChild(img);
      img.src = urls[index++];
    };
    if (typeof cached === 'string') {
      addImage([card.uniformImage, cached]);
      return;
    }
    void uniformDirectory().then(directory => {
      const found = directory?.get(key);
      // If the directory was successfully listed and the team was absent,
      // don't generate a wave of unnecessary 404s for placeholder cards.
      addImage([
        card.uniformImage,
        found,
        ...(directory === null ? uniformFallbackUrls(card) : [])
      ]);
    });
  }

  function toppsUniformFront(card) {
    const front = make('span', 'dbl-cards-face dbl-cards-front dbl-topps-front dbl-topps-uniform-front');
    // A single period-style headline leaves more room for the jersey art.
    front.appendChild(make('span', 'dbl-topps-uniform-heading',
      '1968 UNIFORM CARD | ' + (card.uniform || 'home').toUpperCase()));
    const artwork = make('span', 'dbl-topps-uniform-art');
    // Artwork overlays the jersey only after the actual image loads.
    // Missing files keep the default sleeveless basketball mockup.
    applyUniformImage(artwork, card);
    // Replaceable jersey placeholder: no image assets are required yet.
    const jersey = make('span', 'dbl-topps-placeholder-jersey');
    jersey.dataset.uniform = card.uniform || 'home';
    jersey.appendChild(make('span', 'dbl-topps-placeholder-collar'));
    const parts = (card.teamName || '').split(' ');
    jersey.appendChild(make('strong', 'dbl-topps-placeholder-wordmark',
      parts.length > 1 ? parts.slice(0, -1).join(' ') : card.team || 'DBL'));
    jersey.appendChild(make('span', 'dbl-topps-placeholder-number', '00'));
    artwork.appendChild(jersey);
    front.appendChild(artwork);
    front.appendChild(uniformName(card.teamName,
      'dbl-topps-uniform-name'));
    return front;
  }
  // A real button on the revealed reverse; the surrounding card is a
  // focusable group instead of a button, so nested controls remain valid.
  function favoriteAction(card) {
    const button = make('button', 'dbl-cards-favorite-action');
    button.type = 'button';
    button.dataset.cardId = card.id;
    // The reverse is hidden when the card faces forward. Do not leave
    // invisible favorite buttons in the keyboard Tab sequence.
    button.tabIndex = -1;
    const sync = () => {
      const selected = api.isFavorite(card.id);
      button.classList.toggle('is-favorite', selected);
      button.textContent = selected ? '♥' : '♡';
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('aria-label',
        (selected ? 'Remove ' : 'Add ') + card.name +
        (selected ? ' from favorites' : ' to favorites'));
      button.title = selected ? 'Remove from favorites' : 'Add to favorites';
    };
    button.addEventListener('click', event => {
      // The heart is a separate action; don't also flip the parent card.
      event.stopPropagation();
      api.setFavorite(card.id, !api.isFavorite(card.id));
    });
    sync();
    return button;
  }
  function toppsBack(card) {
    const back = make('span', 'dbl-cards-face dbl-cards-back dbl-topps-back');
    const uniform = isToppsUniform(card);
    // The uniform team name uses the same upright groovy print as the player
    // name; long names are fit horizontally on the front and reverse.
    if (uniform) {
      back.appendChild(uniformName(card.teamName,
        'dbl-topps-back-name dbl-topps-back-uniform-name'));
    } else {
      back.appendChild(make('strong',
        'dbl-topps-back-name dbl-topps-back-player-name', card.name));
    }
    back.appendChild(make('span', 'dbl-topps-back-identity',
      uniform ? ((card.uniform || 'home').toUpperCase() + ' UNIFORM') :
        (card.pos || '—') + ' | ' + (card.teamName || card.team) +
        (api.findJersey?.(card) ? ' | #' + api.findJersey(card) : '')));
    const circle = make('span', 'dbl-topps-back-logo-circle');
    circle.appendChild(teamCrest(card));
    back.appendChild(circle);
    const stats = make('span', 'dbl-topps-back-stats');
    if (uniform) {
      stats.appendChild(make('strong', 'dbl-topps-back-stats-title', 'TEAM UNIFORM'));
      stats.appendChild(make('span', 'dbl-topps-uniform-note',
        '1968 ' + (card.uniform || 'home').toUpperCase() +
        ' · HISTORIC UNIFORM EDITION'));
    } else {
      stats.appendChild(make('strong', 'dbl-topps-back-stats-title', '1968 SEASON'));
      for (const [value, label] of [
        [format(card.gp), 'GAMES'],
        [format(card.ppg, 1), 'PTS / GAME'],
        [format(card.rpg, 1), 'REB / GAME'],
        [format(card.apg, 1), 'AST / GAME']
      ]) {
        const entry = make('span', 'dbl-topps-back-stat');
        entry.appendChild(make('strong', '', value));
        entry.appendChild(make('span', '', label));
        stats.appendChild(entry);
      }
    }
    back.appendChild(stats);
    back.appendChild(make('span', 'dbl-topps-back-footer', '1968 TOPPS'));
    back.appendChild(marketTag(card));
    back.appendChild(favoriteAction(card));
    return back;
  }

  function teamSeasonFront(card) {
    const front = make('span', 'dbl-cards-face dbl-cards-front dbl-cards-team-season-front');
    front.appendChild(make('span', 'dbl-cards-team-season-masthead', 'HISTORIC TEAMS OF THE DBL'));
    front.appendChild(make('strong', 'dbl-cards-team-season-year', card.era ?? '—'));
    const emblem = make('span', 'dbl-cards-team-season-emblem');
    emblem.appendChild(teamCrest(card, true));
    front.appendChild(emblem);
    front.appendChild(make('span', 'dbl-cards-team-season-name', card.teamName));
    const known = Number.isFinite(card.won) && Number.isFinite(card.lost);
    const record = known ? format(card.won) + ' – ' + format(card.lost) +
      (Number.isFinite(card.tied) && card.tied > 0 ? ' – ' + format(card.tied) : '') :
      'SEASON ARCHIVE';
    front.appendChild(make('span', 'dbl-cards-team-season-record', record));
    // The season result replaces the old Series 0 footer: show it exactly
    // once, as unboxed lettering matching the rest of the vintage card.
    const finish = make('span', 'dbl-cards-team-season-foot dbl-cards-team-season-finish',
      card.finish || 'SEASON FINISH UNAVAILABLE');
    finish.dataset.finish = card.finishKind || 'unknown';
    front.appendChild(finish);
    if (isChampionTeam(card))
      front.appendChild(make('span', 'dbl-cards-foil'));
    return front;
  }

  function teamSeasonBack(card, back) {
    const heading = make('span', 'dbl-cards-back-heading');
    heading.appendChild(make('strong', 'dbl-cards-back-flagship', 'TEAM SEASON'));
    heading.appendChild(make('span', 'dbl-cards-back-profile', 'FRANCHISE ARCHIVE'));
    back.appendChild(heading);
    back.appendChild(make('strong', 'dbl-cards-back-name', String(card.era) + ' ' + card.teamName));
    back.appendChild(make('span', 'dbl-cards-back-team', card.team));
    const finish = make('span', 'dbl-cards-team-season-back-finish',
      card.finish || 'SEASON FINISH UNAVAILABLE');
    finish.dataset.finish = card.finishKind || 'unknown';
    back.appendChild(finish);
    const metrics = make('span', 'dbl-cards-back-metrics');
    const games = Number.isFinite(card.won) && Number.isFinite(card.lost)
      ? card.won + card.lost + (Number.isFinite(card.tied) ? card.tied : 0) : null;
    const pct = games > 0 && Number.isFinite(card.won)
      ? (card.won / games * 100).toFixed(1) + '%' : '—';
    for (const [value, label] of [
      [format(card.won), 'WINS'], [format(card.lost), 'LOSSES'],
      [pct, 'WIN %'], [Number.isFinite(card.playoffRoundsWon) &&
        card.playoffRoundsWon >= 0 ? format(card.playoffRoundsWon) : '—', 'PLAYOFF ROUNDS']
    ]) {
      const metric = make('span', 'dbl-cards-back-metric');
      metric.appendChild(make('strong', '', value));
      metric.appendChild(make('span', '', label));
      metrics.appendChild(metric);
    }
    back.appendChild(metrics);
    back.appendChild(make('span', 'dbl-cards-back-foot',
      'SERIES ' + (card.series ?? api.currentSeries) + ' · HISTORIC TEAM · ' + card.era));
    back.appendChild(make('span', 'dbl-cards-back-tap', 'TAP TO TURN'));
    if (isChampionTeam(card))
      back.appendChild(make('span', 'dbl-cards-foil'));
    back.appendChild(marketTag(card));
    back.appendChild(favoriteAction(card));
    return back;
  }

  function backgroundTestFront(card) {
    const front = make('span', 'dbl-cards-face dbl-cards-front dbl-bgtest-pack-front');
    front.appendChild(make('span', 'dbl-bgtest-pack-header', 'DBL · BACKGROUND TEST'));
    const frame = make('span', 'dbl-bgtest-pack-frame');
    const rawSources = [api.findPhoto(card),
      api.findBackgroundPhotoFallback?.(card)].filter(Boolean);
    const isVideoUrl = url => /\.(?:mp4|mov|m4v)(?:[?#]|$)/i.test(url) ||
      /^data:video\//i.test(url);
    const videoOnly = rawSources.length > 0 && rawSources.every(isVideoUrl);
    const sources = [...new Set(rawSources.filter(url => !isVideoUrl(url)))];
    const missing = make('span', 'dbl-bgtest-pack-empty',
      videoOnly ? 'VIDEO NEEDS FRAME PROCESSING' : 'PHOTO UNAVAILABLE');
    missing.hidden = sources.length > 0;
    frame.appendChild(missing);
    // Always include an img so an image without a usable remote URL can be
    // supplied temporarily from the user's device without changing a save.
    const image = make('img', 'dbl-bgtest-pack-image');
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.hidden = sources.length === 0;
    image._bgtestSources = sources;
    image._bgtestFailedLoad = new Set();
    image._bgtestTriedMasks = new Set();
    const status = make('button', 'dbl-bgtest-pack-mask-status',
      sources.length ? 'ORIGINAL PHOTO' :
        videoOnly ? 'MOV/MP4 NOT YET SUPPORTED' : 'NO PHOTO');
    status.type = 'button';
    status.disabled = true;
    const local = make('button', 'dbl-bgtest-pack-local-button', 'Use local photo');
    local.type = 'button';
    local.hidden = sources.length > 0;
    local.title = 'Choose a photo from this device to test masking; no files are modified or saved.';
    const localInput = make('input', 'dbl-bgtest-pack-upload');
    localInput.type = 'file';
    localInput.accept = 'image/png,image/jpeg,image/webp';
    localInput.hidden = true;
    image.addEventListener('load', () => {
      missing.hidden = true;
      image.hidden = false;
    });
    image.addEventListener('error', () => {
      if (image.dataset.bgMaskCutout && image.src === image.dataset.bgMaskCutout) {
        // A revoked/undecodable temporary PNG should fall back to its
        // original and never turn the player into a broken image.
        image.src = image.dataset.bgMaskOriginal;
        return;
      }
      image._bgtestFailedLoad.add(image.src);
      const alternative = image._bgtestSources.find(url =>
        !image._bgtestFailedLoad.has(url));
      if (alternative) image.src = alternative;
      else {
        image.hidden = true;
        missing.hidden = false;
        status.textContent = 'PHOTO UNAVAILABLE';
        status.disabled = true;
        local.hidden = false;
      }
    });
    if (sources.length) image.src = sources[0];
    frame.appendChild(image);
    front.appendChild(frame);
    front.appendChild(make('strong', 'dbl-bgtest-pack-name', card.name));
    front.appendChild(make('span', 'dbl-bgtest-pack-rating',
      'CURRENT OVR ' + (card.currentOvr ?? '—')));
    front.appendChild(status);
    front.appendChild(local);
    front.appendChild(localInput);
    const why = make('button', 'dbl-bgtest-pack-why', 'Why?');
    why.type = 'button';
    why.hidden = true;
    const reason = make('span', 'dbl-bgtest-pack-reason');
    reason.hidden = true;
    reason.setAttribute('role', 'status');
    front.appendChild(why);
    front.appendChild(reason);
    return front;
  }
  function backgroundTestBack(card, back) {
    back.classList.add('dbl-bgtest-pack-back');
    back.appendChild(make('strong', 'dbl-bgtest-pack-back-heading', 'BACKGROUND TEST'));
    back.appendChild(make('strong', 'dbl-bgtest-pack-back-name', card.name));
    back.appendChild(make('span', 'dbl-bgtest-pack-back-team',
      card.teamName || card.team || 'DBL'));
    back.appendChild(make('span', 'dbl-bgtest-pack-back-score',
      'CURRENT OVR · ' + (card.currentOvr ?? '—')));
    back.appendChild(make('span', 'dbl-bgtest-pack-back-help',
      'Photo masking is a display-only experiment. Original files remain unchanged.'));
    back.appendChild(make('span', 'dbl-bgtest-pack-back-footer',
      'SERIES 2 · ' + (card.era || 'CURRENT SEASON')));
    back.appendChild(favoriteAction(card));
    return back;
  }
  function activateBackgroundPhoto(button, card, retry = false) {
    if (!isBackgroundTest(card)) return;
    const image = button.querySelector('.dbl-bgtest-pack-image');
    const label = button.querySelector('.dbl-bgtest-pack-mask-status');
    const local = button.querySelector('.dbl-bgtest-pack-local-button');
    const why = button.querySelector('.dbl-bgtest-pack-why');
    const reason = button.querySelector('.dbl-bgtest-pack-reason');
    if (!image || !label || image.hidden || !window.DBLBackgroundTest?.maskPhoto ||
        (image.dataset.bgMaskStarted === 'true' && !retry)) return;
    const begin = () => {
      if (!image.isConnected || image.hidden || !(image.naturalWidth > 0)) return;
      const source = image.dataset.bgMaskOriginal || image.currentSrc || image.src;
      if (!source || (source.startsWith('blob:') && !image._bgtestLocalUrl)) return;
      image.dataset.bgMaskStarted = 'true';
      label.disabled = true;
      label.textContent = 'REMOVING BACKGROUND…';
      void window.DBLBackgroundTest.maskPhoto(image, source, label).then(success => {
        if (!label.isConnected) return;
        label.disabled = false;
        if (success) {
          image.dataset.bgMaskVisible = 'cutout';
          label.dataset.action = 'compare';
          label.textContent = 'SHOW ORIGINAL';
          if (why) why.hidden = true;
          if (reason) reason.hidden = true;
          if (local) local.hidden = true;
        } else {
          image.dataset.bgMaskStarted = '';
          image._bgtestTriedMasks.add(source);
          const alternative = image._bgtestSources?.find(url =>
            !image._bgtestTriedMasks.has(url) &&
            !image._bgtestFailedLoad?.has(url));
          if (alternative) {
            // Some image hosts allow display but deny canvas pixel reads.
            // Automatically try the second source before showing retry.
            label.textContent = 'TRYING ALTERNATE PHOTO…';
            image.src = alternative;
            activateBackgroundPhoto(button, card, true);
          } else {
            label.dataset.action = 'retry';
            const code = image.dataset.bgMaskError;
            label.textContent = code === 'proxy-unavailable' ? 'PROXY NOT ACTIVE' :
              code === 'proxy-denied' ? 'PROXY COULD NOT FETCH' :
              code === 'photo-access' ? 'PHOTO LINK BLOCKED' :
              code === 'model' ? 'AI MODEL UNAVAILABLE' :
              code === 'video' ? 'VIDEO NOT SUPPORTED' : 'RETRY CUTOUT';
            const message = image.dataset.bgMaskErrorMessage ||
              'The background-removal operation failed.';
            label.title = message + ' Tap to retry.';
            label.setAttribute('aria-label', message + ' Tap to retry.');
            if (reason) {
              reason.textContent = message;
              reason.hidden = true;
            }
            if (why) why.hidden = false;
            if (local) local.hidden = false;
          }
        }
      });
    };
    // A loaded but CORS-blocked photo needs a second source or a temporary
    // local file; repeated attempts against the identical URL cannot bypass
    // browser cross-origin security.
    if (image.complete && image.naturalWidth > 0) begin();
    else if (!image.dataset.bgMaskAwaiting) {
      image.dataset.bgMaskAwaiting = 'true';
      image.addEventListener('load', () => {
        image.dataset.bgMaskAwaiting = '';
        begin();
      }, {once: true});
    }
  }
  // A shared viewport observer prevents unseen binder cards from starting AI.
  const backgroundPhotoObserver = typeof window.IntersectionObserver === 'function'
    ? new window.IntersectionObserver(entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          backgroundPhotoObserver.unobserve(entry.target);
          if (entry.target.isConnected && !panel.hidden)
            activateBackgroundPhoto(entry.target, entry.target._backgroundTestCard);
        }
      }, {rootMargin: '100px 0px'})
    : null;

  function frontOf(card) {
    if (isBackgroundTest(card)) return backgroundTestFront(card);
    if (isToppsPlayer(card)) return toppsPlayerFront(card);
    if (isToppsUniform(card)) return toppsUniformFront(card);
    if (isTeamSeason(card)) return teamSeasonFront(card);
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
      back.appendChild(make('strong', 'dbl-cards-back-sealed-series',
        isBackgroundTest(card) ? 'BACKGROUND TEST' : 'SERIES 0'));
      back.appendChild(make('span', 'dbl-cards-back-small', 'LEGENDS NEVER FADE'));
      back.appendChild(make('span', 'dbl-cards-back-tap', 'TAP TO REVEAL'));
      return back;
    }
    if (isBackgroundTest(card)) return backgroundTestBack(card, back);
    if (isToppsPlayer(card) || isToppsUniform(card)) return toppsBack(card);
    if (isTeamSeason(card)) return teamSeasonBack(card, back);
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
    back.appendChild(marketTag(card));
    back.appendChild(favoriteAction(card));
    return back;
  }
  function showAllCollections() {
    const fragment = document.createDocumentFragment();
    for (const collection of CARD_COLLECTIONS) {
      const tile = make('button', 'dbl-cards-series-tile');
      tile.type = 'button';
      tile.setAttribute('aria-label', 'Open ' + collection.name +
        (collection.series === 2 ? ' test gallery' : ' checklist'));
      // Use the exact sealed reverse used in the Pack Room, not a static
      // image or a second, separately maintained copy of the design.
      const cover = make('span', 'dbl-cards-card is-sealed dbl-cards-series-cover');
      cover.setAttribute('aria-hidden', 'true');
      const inner = make('span', 'dbl-cards-inner');
      if (collection.series === 1) {
        // Cover art may show the set; actual sealed pack backs stay identical.
        const printed = make('span', 'dbl-cards-face dbl-cards-front dbl-topps-collection-preview');
        printed.appendChild(make('strong', 'dbl-topps-preview-date', '1968'));
        printed.appendChild(make('strong', 'dbl-topps-preview-wordmark', 'TOPPS'));
        printed.appendChild(make('span', 'dbl-topps-preview-subtitle', 'TEST ISSUE'));
        inner.appendChild(printed);
        cover.classList.remove('is-sealed');
      } else if (collection.series === 2) {
        // Third set is a pure visual experiment, not a collectible rarity.
        const preview = make('span', 'dbl-cards-face dbl-cards-front dbl-bgtest-cover');
        preview.appendChild(make('strong', '', 'BACKGROUND'));
        preview.appendChild(make('span', '', 'TEST'));
        preview.appendChild(make('small', '', 'OVR 50+ · ORIGINALS UNTOUCHED'));
        inner.appendChild(preview);
        cover.classList.remove('is-sealed');
      } else inner.appendChild(backOf({series: collection.series}, true));
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
        if (collection.series === 2) {
          openCardsSubtab(BACKGROUND_TEST_TAB_INDEX);
          return;
        }
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
  // One-off reveal flourishes: no rarity-specific DOM is added until a card
  // is actually revealed. The sealed reverse therefore stays a true mystery.
  const REVEAL_EFFECTS = Object.freeze({
    crome: {duration: 1100, sparks: 5, spread: .43, glyph: '✦'},
    refractor: {duration: 1580, sparks: 10, spread: .62, glyph: '✧'},
    'black-label': {duration: 2100, sparks: 16, spread: .84, glyph: '✦'},
    'mythic-aether': {duration: 2850, sparks: 21, spread: 1.04, glyph: '✧'},
    'mythic-eclipse': {duration: 2850, sparks: 21, spread: 1.04, glyph: '✦'},
    'mythic-aurora': {duration: 2850, sparks: 22, spread: 1.04, glyph: '✧'}
  });

  function playCardRevealEffect(button, card) {
    // Champion team-season cards borrow the Refractor flourish; ordinary
    // team seasons still have just the normal flip.
    const effect = isChampionTeam(card) ? 'refractor' : card.rarity;
    const config = REVEAL_EFFECTS[effect];
    // Base cards have no extra effect. Respect OS reduced-motion preferences.
    if (!config || reduced()) return;
    button.querySelector('.dbl-cards-reveal-fx')?.remove();
    const fx = make('span', 'dbl-cards-reveal-fx');
    fx.setAttribute('aria-hidden', 'true');
    fx.dataset.effect = effect;
    fx.style.setProperty('--fx-duration', config.duration + 'ms');
    fx.style.setProperty('--fx-delay', '170ms');
    // Confine ONLY the one-time glint to the card surface for these three
    // grades. The flash, halo, ring, symbol and particles can still burst
    // beyond the card edge because the main FX layer remains unclipped.
    if (effect === 'crome' || effect === 'refractor' ||
        effect === 'black-label') {
      fx.appendChild(make('span', 'dbl-cards-reveal-sweep-window'));
    }
    fx.appendChild(make('span', 'dbl-cards-reveal-halo'));
    fx.appendChild(make('span', 'dbl-cards-reveal-ring'));
    fx.appendChild(make('span', 'dbl-cards-reveal-sigil', config.glyph));

    // Particle trajectories scale to each card; Reveal All stays lightweight.
    const width = button.getBoundingClientRect().width || 160;
    for (let index = 0; index < config.sparks; index++) {
      const angle = -Math.PI / 2 + index * 2 * Math.PI / config.sparks;
      const distance = width * config.spread * (.75 + (index % 4) * .095);
      const spark = make('span', 'dbl-cards-reveal-spark',
        index % 3 === 0 ? config.glyph : '✦');
      spark.style.setProperty('--fx-x', Math.round(Math.cos(angle) * distance) + 'px');
      spark.style.setProperty('--fx-y', Math.round(Math.sin(angle) * distance) + 'px');
      spark.style.setProperty('--fx-stagger', (index % 5) * 40 + 'ms');
      fx.appendChild(spark);
    }
    button.appendChild(fx);
    // Clean up when finished. Existing card, flip state and click events stay.
    window.setTimeout(() => fx.remove(), config.duration + 650);
  }

  function cardElement(card, sealed = false, onFirst = null) {
    const button = make('div', 'dbl-cards-card' + (sealed ? ' is-sealed' : ''));
    button.setAttribute('role', 'group');
    button.tabIndex = 0;
    button.dataset.cardId = card.id;
    button.dataset.cardName = card.name;
    // Mystery cards have no rarity-dependent styling until flipped over.
    // Revealed cards and cards already owned use their proper rarity color.
    if (!sealed) {
      button.dataset.rarity = card.rarity;
      if (isChampionTeam(card)) button.dataset.teamChampion = 'true';
    }
    const cardLabel = isTeamSeason(card)
      ? String(card.era) + ' ' + card.name : card.name;
    button.setAttribute('aria-label', sealed ? 'Reveal mystery DBL card' :
      'View statistics for ' + cardLabel + ', ' + tierMap[card.rarity]?.label);
    const inner = make('span', 'dbl-cards-inner');
    inner.appendChild(frontOf(card));
    if (isBackgroundTest(card)) {
      const action = inner.querySelector('.dbl-bgtest-pack-mask-status');
      const local = inner.querySelector('.dbl-bgtest-pack-local-button');
      const fileInput = inner.querySelector('.dbl-bgtest-pack-upload');
      const why = inner.querySelector('.dbl-bgtest-pack-why');
      const reason = inner.querySelector('.dbl-bgtest-pack-reason');
      why?.addEventListener('click', event => {
        event.stopPropagation();
        event.preventDefault();
        if (reason) reason.hidden = !reason.hidden;
      });
      local?.addEventListener('click', event => {
        event.stopPropagation();
        event.preventDefault();
        fileInput?.click();
      });
      fileInput?.addEventListener('click', event => event.stopPropagation());
      fileInput?.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        fileInput.value = '';
        if (!file) return;
        const label = inner.querySelector('.dbl-bgtest-pack-mask-status');
        const image = inner.querySelector('.dbl-bgtest-pack-image');
        if (!image) return;
        if (!/^image\/(png|jpeg|webp)$/i.test(file.type) ||
            file.size > 10 * 1024 * 1024) {
          if (label) {
            label.disabled = true;
            label.textContent = 'IMAGE MUST BE PNG/JPEG/WEBP UNDER 10 MB';
          }
          return;
        }
        if (!window.DBLBackgroundTest?.createLocalPhoto) return;
        if (image._bgtestLocalUrl)
          window.DBLBackgroundTest.releaseLocalPhoto(image._bgtestLocalUrl);
        const url = window.DBLBackgroundTest.createLocalPhoto(file);
        image._bgtestLocalUrl = url;
        image._bgtestSources = [url];
        image._bgtestFailedLoad = new Set();
        image._bgtestTriedMasks = new Set();
        if (why) why.hidden = true;
        if (reason) reason.hidden = true;
        image.dataset.bgMaskStarted = '';
        image.dataset.bgMaskOriginal = '';
        image.dataset.bgMaskCutout = '';
        image.dataset.bgMaskSource = '';
        image.hidden = false;
        local.hidden = true;
        if (label) {
          label.textContent = 'LOADING LOCAL PHOTO…';
          label.disabled = true;
        }
        image.src = url;
        activateBackgroundPhoto(button, card, true);
      });
      action?.addEventListener('click', event => {
        event.stopPropagation();
        event.preventDefault();
        const image = inner.querySelector('.dbl-bgtest-pack-image');
        if (!image) return;
        if (action.dataset.action === 'retry') {
          image._bgtestTriedMasks = new Set();
          activateBackgroundPhoto(button, card, true);
        } else if (action.dataset.action === 'compare' &&
            image.dataset.bgMaskOriginal && image.dataset.bgMaskCutout) {
          const showingCutout = image.dataset.bgMaskVisible === 'cutout';
          image.src = showingCutout
            ? image.dataset.bgMaskOriginal : image.dataset.bgMaskCutout;
          image.dataset.bgMaskVisible = showingCutout ? 'original' : 'cutout';
          action.textContent = showingCutout ? 'SHOW CUTOUT' : 'SHOW ORIGINAL';
        }
      });
    }
    const reverse = backOf(card, sealed);
    inner.appendChild(reverse);
    button.appendChild(inner);
    let revealed = !sealed;
    const flipCard = () => {
      if (!revealed) {
        revealed = true;
        const newBack = backOf(card, false);
        // Newly revealed alternate-set backs need their own card-stock class;
        // all sealed cards still start with the identical mystery reverse.
        reverse.className = newBack.className;
        reverse.replaceChildren(...Array.from(newBack.childNodes));
        button.classList.remove('is-sealed');
        button.dataset.rarity = card.rarity;
        if (isChampionTeam(card)) button.dataset.teamChampion = 'true';
        playCardRevealEffect(button, card);
        activateBackgroundPhoto(button, card);
        scheduleNameFit();
        button.setAttribute('aria-label', 'View statistics for ' + cardLabel +
          ', ' + tierMap[card.rarity]?.label);
        if (onFirst) onFirst();
      } else {
        button.classList.toggle('is-turned');
        const favorite = button.querySelector('.dbl-cards-favorite-action');
        if (favorite) favorite.tabIndex = button.classList.contains('is-turned') ? 0 : -1;
        button.setAttribute('aria-label', button.classList.contains('is-turned')
          ? 'View front of ' + cardLabel : 'View statistics for ' + cardLabel);
        // Repeat the flourish when turning from the statistics side to the
        // front, never while displaying the readable statistics reverse.
        if (!button.classList.contains('is-turned'))
          playCardRevealEffect(button, card);
      }
    };
    button.addEventListener('click', flipCard);
    if (!sealed && isBackgroundTest(card)) {
      button._backgroundTestCard = card;
      if (backgroundPhotoObserver) backgroundPhotoObserver.observe(button);
    }
    button.addEventListener('keydown', event => {
      if (event.target !== button || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      flipCard();
    });
    return button;
  }
  function newPackArt(tearing = false) {
    const topps = packType === 'topps-1968';
    const background = packType === 'background-test';
    const pack = make('div', 'dbl-cards-pack' + (tearing ? ' is-ripping' : ''));
    pack.dataset.packType = packType;
    pack.appendChild(make('span', 'dbl-cards-pack-crest',
      background ? 'DBL / EXPERIMENT' : topps ? 'DBL / 1968' : 'DBL / 1916'));
    pack.appendChild(make('strong', 'dbl-cards-pack-name',
      background ? 'MASK' : topps ? 'TOPPS' : 'LEGACY'));
    pack.appendChild(make('span', 'dbl-cards-pack-shape',
      background ? '02' : topps ? '68' : '◇'));
    pack.appendChild(make('span', 'dbl-cards-pack-series',
      background ? 'SERIES 2 · BACKGROUND TEST' :
        topps ? '1968 · TEST ISSUE' :
        'SERIES ' + api.currentSeries + ' · THE COLLECTOR SERIES'));
    pack.appendChild(make('span', 'dbl-cards-pack-guarantee',
      background ? '5 CARDS · CURRENT OVR 50+' :
        topps ? '5 CARDS · 1968 TOPPS ONLY' : '5 CARDS · RANDOM PULLS'));
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
    const pulled = api.getPack(packType);
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
    const favoritesOnly = favoritesFilter.value === 'favorites';
    const result = api.items.filter(item => {
      if (favoritesOnly && !api.isFavorite(item.id)) return false;
      if (tier !== 'all' && tier !== item.rarity) return false;
      if (selectedTeam !== 'all' && teamNameForCard(item) !== selectedTeam) return false;
      return !q || item.name.toLocaleLowerCase().includes(q) ||
        item.team.toLocaleLowerCase().includes(q) ||
        item.teamName.toLocaleLowerCase().includes(q) ||
        String(item.era ?? '').includes(q);
    });
    switch (order.value) {
      case 'name': result.sort((a, b) => a.name.localeCompare(b.name)); break;
      case 'duplicates':
        result.sort((a, b) => b.count - a.count || tierIndex[b.rarity] - tierIndex[a.rarity]);
        break;
      case 'player':
        result.sort((a, b) => (b.peak ?? -1) - (a.peak ?? -1) ||
          tierIndex[b.rarity] - tierIndex[a.rarity]); break;
      case 'value':
        result.sort((a, b) => api.marketValue(b) - api.marketValue(a) ||
          a.name.localeCompare(b.name)); break;
      default:
        result.sort((a, b) => tierIndex[b.rarity] - tierIndex[a.rarity] ||
          (b.peak ?? -1) - (a.peak ?? -1) || a.name.localeCompare(b.name));
    }
    return result;
  }
  function updateGalleryCounts(total) {
    galleryCount.textContent = formattedCount(total) + ' card edition' +
      (total === 1 ? '' : 's') + ' shown';
    loadMore.hidden = total <= limit;
    loadMore.textContent = 'Show ' + Math.min(36, total - limit) + ' more';
  }
  function binderEntry(card, turned = false) {
    const cell = make('div', 'dbl-cards-binder-entry');
    cell.classList.toggle('is-selected', selectedCardIds.has(card.id));
    if (selectionMode) {
      const picker = make('label', 'dbl-cards-entry-picker');
      const checkbox = make('input', 'dbl-cards-entry-select');
      checkbox.type = 'checkbox';
      checkbox.checked = selectedCardIds.has(card.id);
      checkbox.disabled = deletingSelected || api.status.deletingCards;
      checkbox.setAttribute('aria-label', 'Select ' + card.name + ' for deletion, all copies');
      const text = make('span', '', 'Select');
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selectedCardIds.add(card.id);
        else selectedCardIds.delete(card.id);
        cell.classList.toggle('is-selected', checkbox.checked);
        updateSelectionControls();
      });
      picker.appendChild(checkbox);
      picker.appendChild(text);
      cell.appendChild(picker);
    }
    const element = cardElement(card);
    if (turned) {
      element.classList.add('is-turned');
      element.setAttribute('aria-label', 'View front of ' +
        (isTeamSeason(card) ? String(card.era) + ' ' + card.name : card.name));
      const favorite = element.querySelector('.dbl-cards-favorite-action');
      if (favorite) favorite.tabIndex = 0;
    }
    cell.appendChild(element);
    cell.appendChild(make('span', 'dbl-cards-owned', 'OWNED ×' + card.count));
    cell.appendChild(make('span', 'dbl-cards-binder-market',
      isBackgroundTest(card) ? 'TEST · CURRENT OVR ' + (card.currentOvr ?? '—')
        : 'EST. ' + marketMoney(api.marketValue(card))));
    return cell;
  }
  function updateSelectionControls() {
    const owned = new Map(api.items.map(c => [c.id, c]));
    for (const id of selectedCardIds) if (!owned.has(id)) selectedCardIds.delete(id);
    const totalCopies = [...selectedCardIds].reduce((sum, id) =>
      sum + (owned.get(id)?.count || 0), 0);
    const blocked = busy || clearing || transferBusy || deletingSelected ||
      api.status.merging || api.status.deletingCards || !api.status.ready;
    selectToggle.disabled = blocked || owned.size === 0;
    selectToggle.setAttribute('aria-pressed', String(selectionMode));
    selectToggle.textContent = selectionMode ? 'Selecting cards' : 'Select cards';
    selectionActions.hidden = !selectionMode;
    selectionCount.textContent = selectedCardIds.size + ' edition' +
      (selectedCardIds.size === 1 ? '' : 's') + ' selected · ' +
      totalCopies + ' card' + (totalCopies === 1 ? '' : 's');
    deleteSelectedBtn.disabled = blocked || !selectedCardIds.size;
    selectVisibleBtn.disabled = blocked;
    deselectAllBtn.disabled = blocked || !selectedCardIds.size;
    cancelSelectionBtn.disabled = deletingSelected || api.status.deletingCards;
    const shown = filteredCards().slice(0, limit);
    const allShownSelected = shown.length > 0 &&
      shown.every(card => selectedCardIds.has(card.id));
    selectVisibleBtn.disabled ||= !shown.length;
    selectVisibleBtn.textContent = allShownSelected ? 'Deselect shown' : 'Select shown';
  }
  function syncSelectionChecks() {
    for (const cell of gallery.querySelectorAll('.dbl-cards-binder-entry')) {
      const id = cell.querySelector('.dbl-cards-card')?.dataset.cardId;
      const checked = selectedCardIds.has(id);
      const checkbox = cell.querySelector('.dbl-cards-entry-select');
      if (checkbox) checkbox.checked = checked;
      cell.classList.toggle('is-selected', checked);
    }
    updateSelectionControls();
  }
  function showGallery() {
    syncTeamFilter();
    // Full redraws are still appropriate for genuine collection changes,
    // changing filters, or loading additional cards.
    const turned = new Set(Array.from(gallery.querySelectorAll(
      '.dbl-cards-card.is-turned'), card => card.dataset.cardId));
    const filtered = filteredCards();
    updateGalleryCounts(filtered.length);
    gallery.replaceChildren();
    if (!filtered.length) {
      gallery.appendChild(make('p', 'dbl-cards-empty', api.status.unique
        ? 'No cards match those filters.' :
          'Nothing in your binder yet. Open a pack to start collecting.'));
    } else {
      const fragment = document.createDocumentFragment();
      for (const card of filtered.slice(0, limit))
        fragment.appendChild(binderEntry(card, turned.has(card.id)));
      gallery.appendChild(fragment);
    }
    updateSelectionControls();
    scheduleNameFit();
  }
  function syncFavoriteButtons(id) {
    // Update every visible copy of the same edition, including pack pulls,
    // without destroying any card elements or restarting photo loads.
    const selected = api.isFavorite(id);
    for (const button of document.querySelectorAll('.dbl-cards-favorite-action')) {
      if (button.dataset.cardId !== id) continue;
      button.classList.toggle('is-favorite', selected);
      button.textContent = selected ? '♥' : '♡';
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('aria-label',
        (selected ? 'Remove ' : 'Add ') + (button.closest('.dbl-cards-card')
          ?.dataset.cardName || 'card') +
        (selected ? ' from favorites' : ' to favorites'));
      button.title = selected ? 'Remove from favorites' : 'Add to favorites';
    }
  }
  function patchFavoritesGallery() {
    // The Favorites Only filter can gain/lose one entry while keeping every
    // other card DOM node (and its flipped state and image) untouched.
    const filtered = filteredCards();
    updateGalleryCounts(filtered.length);
    const wanted = filtered.slice(0, limit);
    const existing = new Map(Array.from(gallery.querySelectorAll(
      '.dbl-cards-binder-entry'), entry =>
      [entry.querySelector('.dbl-cards-card')?.dataset.cardId, entry]));
    if (!wanted.length) {
      for (const node of existing.values()) node.remove();
      if (!gallery.querySelector('.dbl-cards-empty'))
        gallery.appendChild(make('p', 'dbl-cards-empty',
          api.status.unique ? 'No cards match those filters.' :
            'Nothing in your binder yet. Open a pack to start collecting.'));
      updateSelectionControls();
      return;
    }
    gallery.querySelector('.dbl-cards-empty')?.remove();
    for (let i = 0; i < wanted.length; i++) {
      const card = wanted[i];
      const entry = existing.get(card.id) || binderEntry(card);
      const atPosition = gallery.children[i] || null;
      if (atPosition !== entry) gallery.insertBefore(entry, atPosition);
      existing.delete(card.id);
    }
    for (const node of existing.values()) node.remove();
    updateSelectionControls();
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
      .map(card => [card.id, card]));
    const totals = Object.fromEntries(completionTiers.map(tier =>
      [tier.id, {label: tier.label, possible: 0, collected: 0}]));
    const all = [];
    let collected = 0;
    if (activeChecklistSeries === 1) {
      const all = [], totals = Object.fromEntries(toppsCompletionTiers.map(t =>
        [t.id, {label: t.label, possible: 0, collected: 0}]));
      let collected = 0;
      for (const card of api.checklistTopps) {
        const item = owned.get(card.id), isOwned = !!item;
        const stat = totals[card.rarity];
        if (!stat) continue;
        stat.possible++;
        if (isOwned) {stat.collected++; collected++;}
        all.push({
          id: card.id, pid: card.pid, tid: card.franchiseTid,
          rookie: card.rookie, draftPick: card.draftPick,
          type: card.type, name: card.name,
          team: card.teamName, era: 1968,
          franchiseKey: Number.isInteger(card.franchiseTid) && card.franchiseTid >= 0
            ? 'tid:' + card.franchiseTid : 'unknown',
          franchiseName: card.franchiseName || card.teamName,
          peak: card.peak, rarity: card.rarity,
          label: card.type === 'topps-uniform' ? 'Topps Uniform · ' +
            String(card.uniform || '').toUpperCase() :
            (card.rookie ? 'Topps Rookie' : 'Topps Base'),
          owned: isOwned, copies: item?.count || 0
        });
      }
      return {all, totals, collected};
    }
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
          rookie: player.rookie, draftPick: player.draftPick,
          team: player.teamName || player.team || 'Team unavailable',
          // Use the stable ZenGM franchise TID, not changing team names
          // or abbreviations, to group each eligible edition.
          franchiseKey: Number.isInteger(player.franchiseTid) && player.franchiseTid >= 0
            ? 'tid:' + player.franchiseTid : 'unknown',
          franchiseName: player.franchiseName || player.teamName || player.team || 'Team unavailable',
          peak: player.peak, era: player.era,
          rarity: tier.id, label: tier.label,
          owned: isOwned, copies: item?.count || 0
        });
      }
    }
    const seasons = activeChecklistSeries === api.currentSeries
      ? api.checklistTeamSeasons : [];
    if (insertTier) {
      for (const season of seasons) {
        const item = owned.get(season.id);
        const isOwned = !!item;
        totals[insertTier.id].possible++;
        if (isOwned) {
          totals[insertTier.id].collected++;
          collected++;
        }
        all.push({
          id: season.id, type: 'team-season', tid: season.tid,
          won: season.won, lost: season.lost, tied: season.tied,
          finishKind: season.finishKind, playoffRoundsWon: season.playoffRoundsWon,
          name: season.name + ' (' + season.era + ')',
          team: season.teamName, era: season.era, peak: null,
          franchiseKey: Number.isInteger(season.tid) && season.tid >= 0
            ? 'tid:' + season.tid : 'unknown',
          franchiseName: season.franchiseName || season.teamName,
          rarity: insertTier.id, label: insertTier.label,
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
  function franchiseCompletionData(cards) {
    const groups = new Map();
    for (const card of cards) {
      const key = card.franchiseKey;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          name: key === 'unknown' ? 'Unassigned franchise' : card.franchiseName,
          totals: Object.fromEntries(activeCompletionTiers().map(tier => [
            tier.id, {collected: 0, possible: 0}
          ])),
          overall: {collected: 0, possible: 0}
        });
      }
      const group = groups.get(key);
      const tier = group.totals[card.rarity];
      if (!tier) continue;
      tier.possible++;
      group.overall.possible++;
      if (card.owned) {
        tier.collected++;
        group.overall.collected++;
      }
    }
    return [...groups.values()].sort((a, b) =>
      a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
  }

  function compareFranchiseCompletion(a, b) {
    const fallback = a.name.localeCompare(b.name) || a.key.localeCompare(b.key);
    if (franchiseSortKey === 'franchise')
      return franchiseSortDirection === 'asc' ? fallback : -fallback;
    const key = franchiseSortKey;
    const aTally = key === 'overall' ? a.overall : a.totals[key];
    const bTally = key === 'overall' ? b.overall : b.totals[key];
    // An ineligible edition (—) is always last, regardless of sort direction.
    if (!aTally?.possible && bTally?.possible) return 1;
    if (!bTally?.possible && aTally?.possible) return -1;
    const direction = franchiseSortDirection === 'asc' ? 1 : -1;
    const aPct = aTally?.possible ? aTally.collected / aTally.possible : 0;
    const bPct = bTally?.possible ? bTally.collected / bTally.possible : 0;
    return (aPct - bPct) * direction ||
      ((aTally?.collected || 0) - (bTally?.collected || 0)) * direction ||
      ((aTally?.possible || 0) - (bTally?.possible || 0)) * direction ||
      fallback;
  }

  function renderFranchiseCompletion(cards, focusKey = null) {
    const previousScroll = checklistFranchises.querySelector('.dbl-cards-franchise-scroll')?.scrollLeft || 0;
    checklistFranchises.replaceChildren();
    const groups = franchiseCompletionData(cards).sort(compareFranchiseCompletion);
    if (!groups.length) {
      checklistFranchises.appendChild(make('p', 'dbl-cards-empty',
        'No franchise editions are eligible in this league archive.'));
      return;
    }

    const scroll = make('div', 'dbl-cards-franchise-scroll');
    scroll.tabIndex = 0;
    scroll.setAttribute('role', 'region');
    scroll.setAttribute('aria-label', 'Franchise completion by rarity, scroll horizontally to see all editions');

    const table = make('table', 'dbl-cards-franchise-table');
    const thead = make('thead');
    const head = make('tr');
    function appendSortableHeader(key, label, isOverall = false) {
      const th = make('th', isOverall ? 'is-overall' : '');
      th.scope = 'col';
      if (franchiseSortKey === key) {
        th.setAttribute('aria-sort', franchiseSortDirection === 'asc'
          ? 'ascending' : 'descending');
      }
      const button = make('button', 'dbl-cards-franchise-sort' +
        (franchiseSortKey === key ? ' is-sorted' : ''));
      button.type = 'button';
      button.dataset.sortKey = key;
      button.setAttribute('aria-label', 'Sort franchises by ' + label +
        (franchiseSortKey === key ? ', ' + franchiseSortDirection + 'ending' : ''));
      button.appendChild(make('span', '', label));
      const indicator = make('span', 'dbl-cards-franchise-sort-arrow',
        franchiseSortKey === key
          ? (franchiseSortDirection === 'asc' ? '▲' : '▼') : '↕');
      indicator.setAttribute('aria-hidden', 'true');
      button.appendChild(indicator);
      button.addEventListener('click', () => {
        if (franchiseSortKey === key) {
          franchiseSortDirection = franchiseSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          franchiseSortKey = key;
          franchiseSortDirection = key === 'franchise' ? 'asc' : 'desc';
        }
        renderFranchiseCompletion(cards, key);
      });
      th.appendChild(button);
      head.appendChild(th);
    }
    appendSortableHeader('franchise', 'Franchise');
    for (const tier of activeCompletionTiers()) appendSortableHeader(tier.id, tier.label);
    appendSortableHeader('overall', 'Overall', true);
    thead.appendChild(head);
    table.appendChild(thead);

    const tbody = make('tbody');
    function appendProgressCell(row, tally, label, groupName, overall = false) {
      const td = make('td', overall ? 'is-overall' : '');
      if (!tally.possible) {
        td.appendChild(make('span', 'dbl-cards-franchise-na', '—'));
        td.title = 'No eligible ' + label + ' editions for ' + groupName;
      } else {
        const percent = tally.collected / tally.possible * 100;
        const count = make('strong', 'dbl-cards-franchise-count',
          format(tally.collected) + ' / ' + format(tally.possible));
        const pct = make('span', 'dbl-cards-franchise-percent', percent.toFixed(1) + '%');
        const track = make('span', 'dbl-cards-franchise-track');
        const fill = make('span', 'dbl-cards-franchise-fill');
        fill.style.width = percent.toFixed(2) + '%';
        track.appendChild(fill);
        td.append(count, pct, track);
        td.title = format(tally.collected) + ' of ' + format(tally.possible) +
          ' ' + label + ' editions collected for ' + groupName;
      }
      row.appendChild(td);
    }
    for (const group of groups) {
      const tr = make('tr');
      const name = make('th', 'dbl-cards-franchise-name', group.name);
      name.scope = 'row';
      tr.appendChild(name);
      for (const tier of activeCompletionTiers()) {
        appendProgressCell(tr, group.totals[tier.id], tier.label, group.name);
      }
      appendProgressCell(tr, group.overall, 'overall', group.name, true);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    scroll.appendChild(table);
    checklistFranchises.appendChild(scroll);
    scroll.scrollLeft = previousScroll;
    if (focusKey !== null) {
      const button = Array.from(scroll.querySelectorAll('.dbl-cards-franchise-sort'))
        .find(item => item.dataset.sortKey === focusKey);
      button?.focus({preventScroll: true});
    }
  }

  function showChecklist() {
    if (activeCardsSubtab !== CHECKLIST_TAB_INDEX || panel.hidden) return;
    const topps = activeChecklistSeries === 1;
    checklistSeriesContext.textContent = topps
      ? '1968 Topps · Test Issue' : 'Series 0 · Original FLAGSHIP set';
    checklistDescription.textContent = topps
      ? 'Every 1968-active player, including rookies, and home/away uniform inserts from the uploaded league archive.'
      : 'Every obtainable player edition and historical team-season insert in your uploaded league archive. Cards check off automatically when collected.';
    checklistFranchiseDescription.textContent = topps
      ? '1968 Topps player and uniform completion, grouped by 1968 franchise. Duplicates count once.'
      : 'Completion by franchise, including peak-season player editions and historical Team Season inserts. Name changes stay grouped; duplicates count once.';
    checklistNote.textContent = topps
      ? 'One plain-paper 1968 Topps card per eligible player, with rookie styling for first-season players, plus one home and one away uniform placeholder per 1968 team. No Chrome or other premium versions. The checklist comes from the uploaded league export; owned cards remain saved even when that file is unloaded.'
      : 'One entry per player and standard eligible rarity: Base 35+, Chrome 45+, Refractor 55+, and Black Label 60+ peak OVR, plus one Team Season insert per recorded team-season. Duplicates count once. Owned cards missing from a newer export stay in My Collection.';
    const s = api.status;
    checklistStats.replaceChildren();
    checklistFranchises.replaceChildren();
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
    if (activeChecklistSeries === 1) {
      for (const tier of toppsCompletionTiers) {
        const t = totals[tier.id];
        checklistCounter(checklistStats, t.label, t.collected, t.possible);
      }
    } else {
      for (const tier of checklistTiers) {
        const t = totals[tier.id];
        checklistCounter(checklistStats, t.label + ' · peak OVR ' + tier.minOvr + '+',
          t.collected, t.possible);
      }
      if (insertTier) {
        const t = totals[insertTier.id];
        checklistCounter(checklistStats, 'Team Season inserts', t.collected, t.possible);
      }
    }
    // Compute from the complete eligible Series checklist, not from the
    // player search, ownership, rarity filters or pagination.
    renderFranchiseCompletion(all);
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
    } else if (checklistSort.value === 'value') {
      result.sort((a, b) => api.marketValue(b) - api.marketValue(a) ||
        a.name.localeCompare(b.name));
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
      details.appendChild(make('span', 'dbl-cards-checklist-market',
        'EST. ' + marketMoney(api.marketValue(card))));
      entry.appendChild(details);
      entry.appendChild(make('span', 'dbl-cards-checklist-ovr',
        card.type === 'team-season' ? 'TEAM' :
          card.type === 'topps-uniform' ? 'KIT' :
          card.type === 'topps-player' ? '1968' : 'OVR ' + card.peak));
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
    if (index !== BACKGROUND_TEST_TAB_INDEX)
      window.DBLBackgroundTest?.close();
    if (index === 1) { showGallery(); scheduleNameFit(); }
    if (index === BACKGROUND_TEST_TAB_INDEX)
      window.DBLBackgroundTest?.open();
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
  api.subscribe(change => {
    if (change?.type === 'favorite' || change?.type === 'favorite-save') {
      if (change.type === 'favorite') {
        syncFavoriteButtons(change.id);
        if (activeCardsSubtab === 1 && favoritesFilter.value === 'favorites')
          patchFavoritesGallery();
      }
      // Updating the save indicator is cheap; never rebuild the binder,
      // repopulate photos, or restart card flip animations for heart taps.
      showCounters();
      return;
    }
    repaint();
  });
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
  function choosePackType(type) {
    if (busy || type === packType) return;
    packType = type;
    readyStage();
  }
  mixedPackType.addEventListener('click', () => choosePackType('mixed'));
  toppsPackType.addEventListener('click', () => choosePackType('topps-1968'));
  backgroundPackType.addEventListener('click', () => choosePackType('background-test'));
  openBtn.addEventListener('click', openPack);
  revealBtn.addEventListener('click', revealAll);
  againBtn.addEventListener('click', readyStage);
  for (const control of [rarityFilter, teamFilter, favoritesFilter, order, search]) {
    control.addEventListener(control === search ? 'input' : 'change', () => {
      limit = 36;
      showGallery();
    });
  }
  loadMore.addEventListener('click', () => { limit += 36; showGallery(); });
  selectToggle.addEventListener('click', () => {
    if (selectToggle.disabled) return;
    selectionMode = !selectionMode;
    if (!selectionMode) selectedCardIds.clear();
    selectionFeedback.textContent = '';
    showGallery();
  });
  selectVisibleBtn.addEventListener('click', () => {
    if (!selectionMode || selectVisibleBtn.disabled) return;
    const shown = filteredCards().slice(0, limit);
    const all = shown.every(card => selectedCardIds.has(card.id));
    for (const card of shown) {
      if (all) selectedCardIds.delete(card.id);
      else selectedCardIds.add(card.id);
    }
    syncSelectionChecks();
  });
  deselectAllBtn.addEventListener('click', () => {
    if (deselectAllBtn.disabled) return;
    selectedCardIds.clear();
    syncSelectionChecks();
  });
  cancelSelectionBtn.addEventListener('click', () => {
    if (deletingSelected) return;
    selectionMode = false;
    selectedCardIds.clear();
    showGallery();
  });
  deleteSelectedBtn.addEventListener('click', async () => {
    if (!selectionMode || deleteSelectedBtn.disabled) return;
    const selected = api.items.filter(card => selectedCardIds.has(card.id));
    if (!selected.length) return;
    const copies = selected.reduce((sum, card) => sum + card.count, 0);
    const confirmed = window.confirm(
      'Delete ' + selected.length + ' selected card edition' +
      (selected.length === 1 ? '' : 's') + ' (' + copies + ' total copies)?\n\n' +
      'ALL duplicate copies of each selected edition will be removed.\n' +
      'Other cards and your pack-opening history will remain unchanged.\n\n' +
      'This cannot be undone here. An older backup may reintroduce deleted editions.'
    );
    if (!confirmed) return;
    deletingSelected = true;
    updateSelectionControls();
    selectionFeedback.textContent = 'Deleting selected card editions…';
    try {
      const result = await api.deleteSelectedCards(selected.map(card => card.id));
      if (result.saved) {
        selectedCardIds.clear();
        selectionMode = false;
        selectionFeedback.textContent = 'Deleted ' + result.deletedEditions +
          ' editions (' + result.deletedCards + ' total copies). ' +
          'Other cards and pack history were kept.';
      } else {
        selectionFeedback.textContent =
          'Deletion was not saved. Your selected cards were kept. Please try again.';
      }
    } catch (error) {
      console.warn('Could not delete selected card editions.', error);
      selectionFeedback.textContent = 'Deletion failed. Your cards were kept.';
    } finally {
      deletingSelected = false;
      repaint();
    }
  });
  // Browser-local collection backups (not the full ZenGM league file).
  // All copy/pack totals are source-aware so repeated and two-way imports
  // do not count the same previously transferred pulls twice.
  function transferMessage(message, error = false) {
    mergeFeedback.textContent = message;
    mergeFeedback.classList.toggle('is-error', error);
  }
  exportBtn.addEventListener('click', () => {
    if (!api.status.ready || transferBusy || clearing || api.status.merging) return;
    try {
      const backup = api.exportCollection();
      const contents = JSON.stringify(backup);
      const blob = new Blob([contents], {type: 'application/json'});
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'DBL-Cards-Collection-' +
        new Date().toISOString().replace(/[:.]/g, '-') + '.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
      transferMessage('Collection backup prepared. Save the JSON file somewhere you can access from your other device.');
    } catch (error) {
      console.warn('Card collection export failed.', error);
      transferMessage('Could not export the collection: ' + (error.message || 'Unknown error'), true);
    }
  });
  mergeBtn.addEventListener('click', () => {
    if (!api.status.ready || busy || clearing || transferBusy || api.status.merging) return;
    mergeFile.click();
  });
  mergeFile.addEventListener('change', async () => {
    const file = mergeFile.files?.[0];
    // Reset immediately: selecting the same backup again must work.
    mergeFile.value = '';
    if (!file || transferBusy || busy || clearing || api.status.merging) return;
    if (file.size > 20 * 1024 * 1024) {
      transferMessage('This backup is too large to import (20 MB maximum).', true);
      return;
    }
    transferBusy = true;
    showCounters();
    showStatus();
    try {
      const text = typeof file.text === 'function'
        ? await file.text()
        : await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(reader.error || Error('Could not read the file.'));
            reader.readAsText(file);
          });
      const backup = JSON.parse(text);
      const preview = api.previewCollectionMerge(backup);
      if (preview.unchanged) {
        transferMessage('This collection is already included here. No cards or pack counts were changed.');
        return;
      }
      const additions = '+' + format(preview.addedCards) + ' card copies, +' +
        format(preview.addedEditions) + ' unique editions, +' +
        format(preview.addedPacks) + ' packs opened.';
      const proceed = window.confirm(
        'Merge this DBL Cards backup into the collection on this device?\n\n' +
        additions + '\n\n' +
        'After merging: ' + format(preview.totalCards) + ' cards, ' +
        format(preview.totalEditions) + ' unique editions, ' +
        format(preview.totalPacks) + ' packs opened.\n\n' +
        'Nothing you already own will be removed. For extra safety, ' +
        'you can export this device’s collection before merging.'
      );
      if (!proceed) {
        transferMessage('Import cancelled. Your collection was not changed.');
        return;
      }
      const result = await api.mergeCollection(backup);
      if (!result.saved) {
        transferMessage('Could not save the merged collection. Your existing cards were kept.', true);
        return;
      }
      transferMessage('Collections merged! Added ' + format(result.addedCards) +
        ' card copies and ' + format(result.addedPacks) + ' packs. ' +
        'You now have ' + format(result.totalEditions) + ' unique editions. ' +
        'Export again to transfer the combined collection to your other device.');
      if (activeCardsSubtab === 1) showGallery();
      if (activeCardsSubtab === CHECKLIST_TAB_INDEX) showChecklist();
    } catch (error) {
      console.warn('Card collection merge failed.', error);
      transferMessage('Import failed: ' + (error.message || 'Invalid backup file') +
        '. Your collection was not changed.', true);
    } finally {
      transferBusy = false;
      showCounters();
      showStatus();
    }
  });
  clearBtn.addEventListener('click', async () => {
    if (clearing || busy || transferBusy || deletingSelected ||
        api.status.deletingCards || api.status.merging ||
        !api.status.ready || !api.status.count) return;
    const okay = window.confirm(
      'Permanently clear all collected cards, duplicates, and pack counts on this device? This cannot be undone.'
    );
    if (!okay) return;
    clearing = true;
    repaint();
    try {
      const cleared = await api.clearCollection();
      if (cleared) {
        selectedCardIds.clear();
        selectionMode = false;
        selectionFeedback.textContent = '';
        readyStage();
        limit = 36;
        search.value = '';
        rarityFilter.value = 'all';
        teamFilter.value = 'all';
        favoritesFilter.value = 'all';
        order.value = 'rarity';
        transferMessage('');
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
      if (activeCardsSubtab === BACKGROUND_TEST_TAB_INDEX)
        window.DBLBackgroundTest?.open();
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