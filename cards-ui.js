(() => {
  'use strict';
  const api = window.DBLCardEngine;
  const psychedelic = window.DBLUndergroundCards;
  const cardLightbox = window.DBLCardLightbox;
  const CARDS_SUBTAB_KEY = 'dbl-cards-active-subtab:v1';
  const panel = document.getElementById('cardsPanel');
  const status = document.getElementById('cardsStatus');
  const saveStatus = document.getElementById('cardsSaveStatus');
  const packStage = document.getElementById('cardsPackStage');
  const packsOpenedTotal = document.getElementById('cardsPacksOpenedTotal');
  const openBtn = document.getElementById('cardsOpenPackBtn');
  const packLimitStatus = document.getElementById('cardsPackLimitStatus');
  const packLimits = window.DBLCardPackLimits;
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
  const undergroundPackType = document.getElementById('cardsUndergroundPackType');
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
      !actions || !revealBtn || !againBtn || !packLimitStatus || !counter || !gallery ||
      !galleryCount || !selectToggle || !selectionActions || !selectionCount ||
      !selectVisibleBtn || !deselectAllBtn || !deleteSelectedBtn ||
      !cancelSelectionBtn || !selectionFeedback ||
      !search || !rarityFilter || !teamFilter ||
      !favoritesFilter || !mixedPackType || !toppsPackType || !undergroundPackType || !psychedelic || !backgroundPackType || !order || !loadMore ||
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
    },
    {
      series: 3, name: '1968 Underground',
      subtitle: 'Psychedelic press · New Breed rookies · Headliners inserts',
      establishedIrl: 'Nov 20, 2026', establishedInGame: '1968'
    }
  ];
  let activeChecklistSeries = 0;
  const tierIndex = Object.fromEntries(api.rarities.map((r, i) => [r.id, i]));
  // Sorting preference (highest first): Mythical, Black Label,
  // Refractor, Topps Uniform, Chrome, Team Season, 1968 Topps Base,
  // Background Test, standard Base. This affects display order only;
  // pack odds, underlying editions and hidden-rarity behavior are unchanged.
  tierIndex['topps-1968-uniform'] = 1.5;
  tierIndex['team-season'] = .75;
  tierIndex['topps-1968'] = .5;
  tierIndex['background-test'] = .25;
  tierIndex['underground-1968'] = .52;
  tierIndex['underground-headliner'] = 1.6;
  tierIndex['underground-nickname'] = 1.65;
  const tierMap = Object.fromEntries(api.rarities.map(r => [r.id, r]));
  // Autographs sort between Black Label and Refractor, regardless of
  // their underlying card edition. This changes display order only.
  const TEAM_VARIANT_SORT = Object.freeze({base:.75,bronze:1.2,silver:1.8,gold:2.4});
  const teamVariant = card => ['base','bronze','silver','gold'].includes(card?.teamVariant)
    ? card.teamVariant : 'base';
  const teamVariantName = card => {
    const value=teamVariant(card);
    return value[0].toUpperCase()+value.slice(1);
  };
  const raritySortRank = card => card?.type==='team-season'
    ? TEAM_VARIANT_SORT[teamVariant(card)]
    : card.autograph === true &&
      !tierMap[card.rarity]?.mythical && card.rarity !== 'black-label'
      ? 2.5 : (tierIndex[card.rarity] ?? -1);

  // Undiscovered editions must never appear in the checklist or public
  // progress totals, even for players who meet their hidden requirements.
  const checklistTiers = api.rarities.filter(r => !r.mythical && !r.insert);
  const insertTier = api.rarities.find(r => r.insert);
  const completionTiers = insertTier ? [...checklistTiers, insertTier] : checklistTiers;
  const toppsCompletionTiers = api.rarities.filter(r =>
    r.id === 'topps-1968' || r.id === 'topps-1968-uniform');
  const undergroundCompletionTiers = api.rarities.filter(r =>
    r.id === 'underground-1968' || r.id === 'underground-headliner' ||
    r.id === 'underground-nickname');
  const activeCompletionTiers = () => activeChecklistSeries === 1
    ? toppsCompletionTiers : activeChecklistSeries === 3
      ? undergroundCompletionTiers : completionTiers;
  const isTeamSeason = card => card?.type === 'team-season';
  // Finish (champion, finalist, playoffs) describes team performance;
  // edition (Base/Bronze/Silver/Gold) controls the collectible artwork.
  const isMetalTeam = card => isTeamSeason(card) && teamVariant(card)!=='base';
  const isToppsPlayer = card => card?.type === 'topps-player';
  const isToppsUniform = card => card?.type === 'topps-uniform';
  const isBackgroundTest = card => card?.type === 'background-test';
  const isUnderground = card => card?.type === 'underground-player';
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
  const closeCardLightbox = immediate => cardLightbox?.close(immediate);
  let packType = 'mixed';
  let packResetTimer = null;
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
  function fitCardNames(root) {
    if (!root) return;
    for (const name of root.querySelectorAll?.('.dbl-cards-name') || [])
      fitName(name);
    for (const name of root.querySelectorAll?.('.dbl-topps-uniform-fit-name') || [])
      fitUniformName(name);
  }
  function fitLightboxNames() {
    fitCardNames(cardLightbox?.container);
  }
  function fitVisibleNames() {
    // A pack/collection can have dozens of costly photo-backed cards.
    // Never measure all of them in an animation frame while a card zooms.
    const focused = cardLightbox?.container;
    if (focused) fitCardNames(focused);
    else for (const root of [gallery, packStage]) fitCardNames(root);
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
  // Track rendered market labels without retaining detached card DOM nodes.
  // Saving a PID multiplier can refresh visible pack cards in place, without
  // restarting card animations or flipping cards back over.
  const marketTags = new WeakMap();
  function marketTag(card) {
    const tag = make('span', 'dbl-cards-market-value');
    marketTags.set(tag, card);
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
    appendStat(counter, format(api.items.filter(c => c.series === 3)
      .reduce((n, c) => n + c.count, 0)), 'Underground pulls');
    appendStat(counter, format(api.items.filter(c => isTeamSeason(c))
      .reduce((n, c) => n + c.count, 0)), 'Team Season inserts');
    appendStat(counter, format(api.items.filter(c => c.rarity === 'black-label')
      .reduce((n, c) => n + c.count, 0)), 'Black Label pulls');
    appendStat(counter, format(api.items.filter(c => c.autograph === true)
      .reduce((n, c) => n + c.count, 0)), 'Autograph pulls');
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
  const PACK_WINDOW_HOURS = 6;
  const packQuota = () => packLimits?.describe(packType) ||
    (packType === 'background-test'
      ? {available:true,unlimited:true}
      : {available:false,error:'Pack limit storage is unavailable.'});
  function packResetTime(milliseconds) {
    const when = new Date(milliseconds);
    const clock = when.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
    const today = new Date();
    const sameDay = when.getFullYear()===today.getFullYear() &&
      when.getMonth()===today.getMonth()&&when.getDate()===today.getDate();
    return sameDay ? clock : when.toLocaleDateString(undefined,
      {month:'short',day:'numeric'})+' at '+clock;
  }
  function showPackQuota(quota) {
    const label = packType === 'underground-1968' ? '1968 Underground' :
      packType === 'topps-1968' ? '1968 Topps' :
      packType === 'background-test' ? 'Background Test' : 'Legacy Mixed';
    if (packResetTimer !== null) {
      window.clearTimeout(packResetTimer);
      packResetTimer = null;
    }
    if (quota.error) {
      packLimitStatus.textContent = quota.error +
        ' Regular packs are paused to protect your existing allowance.';
    } else if (quota.unlimited) {
      packLimitStatus.textContent = 'Background Test: unlimited packs · no cooldown.';
    } else if (quota.resetAt) {
      packLimitStatus.textContent = label + ': ' + quota.remaining + ' of ' +
        quota.max + ' packs remaining · resets at ' + packResetTime(quota.resetAt) +
        '. Each variety has its own ' + PACK_WINDOW_HOURS + '-hour window.';
      const delay = quota.resetAt - Date.now();
      if (delay > 0) {
        packResetTimer = window.setTimeout(showStatus, Math.min(delay + 25,2147483647));
      }
    } else {
      packLimitStatus.textContent = label + ': ' + quota.max +
        ' of ' + quota.max + ' packs remaining · the ' +
        PACK_WINDOW_HOURS + '-hour window begins with the first opened pack.';
    }
  }
  function showStatus() {
    const s = api.status;
    const fileKey = [s.hasFile, s.poolSize, s.toppsPoolSize,
      s.undergroundPoolSize, s.undergroundNicknamePoolSize,
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
      else if (packType === 'underground-1968' && !s.undergroundPoolSize) status.textContent =
        'No 1968 Underground players yet. Upload an export containing the 1968 season.';
      else if (packType === 'underground-1968') status.textContent =
        format(s.undergroundPoolSize) + ' 1968 Underground players available · 20% Headliners' +
        (s.undergroundNicknamePoolSize
          ? ' · 5% They Call Him… (' + format(s.undergroundNicknamePoolSize) + ' selected players)'
          : ' · nickname insert roster awaiting entries') + '.';
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
    const canOpenSelected = packType === 'underground-1968'
      ? s.undergroundPoolSize > 0 : packType === 'topps-1968'
      ? s.toppsPoolSize > 0 : packType === 'background-test'
        ? s.backgroundTestPoolSize > 0 : s.poolSize > 0;
    const quota = packQuota();
    showPackQuota(quota);
    openBtn.disabled = busy || clearing || transferBusy || deletingSelected ||
      s.merging || s.deletingCards ||
      !s.ready || !canOpenSelected || s.loading || !quota.available;
    openBtn.textContent = busy ? 'Opening pack…' :
      !quota.available && !quota.error ? 'Pack limit reached · check reset time' :
      packType === 'underground-1968' ? 'Open Underground pack' :
      packType === 'topps-1968' ? 'Open 1968 Topps pack' :
      packType === 'background-test' ? 'Open Background Test pack' : 'Open five-card pack';
    mixedPackType.classList.toggle('is-selected', packType === 'mixed');
    toppsPackType.classList.toggle('is-selected', packType === 'topps-1968');
    undergroundPackType.classList.toggle('is-selected', packType === 'underground-1968');
    backgroundPackType.classList.toggle('is-selected', packType === 'background-test');
    mixedPackType.setAttribute('aria-pressed', String(packType === 'mixed'));
    toppsPackType.setAttribute('aria-pressed', String(packType === 'topps-1968'));
    undergroundPackType.setAttribute('aria-pressed', String(packType === 'underground-1968'));
    backgroundPackType.setAttribute('aria-pressed', String(packType === 'background-test'));
    mixedPackType.disabled = busy;
    toppsPackType.disabled = busy;
    undergroundPackType.disabled = busy;
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
    const year = Number(card?.era); // Stock year, or the card's peak OVR season.
    if (!Number.isInteger(year)) return '';
    const range = ERA_CARD_PORTRAITS.find(([first, last]) =>
      year >= first && year <= last);
    return range ? './assets/' + range[2] : '';
  }
  // One shared, verified stock-year map for standard cards AND Background
  // Test. Display-only, never stored as a player photograph or backup image.
  window.DBLCardEraStockPortrait = genericPhotoFor;

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
  // Run the optional uniform cutout when its real image is visible. The
  // original stays on screen while processing and whenever masking fails.
  function activateUniformCutout(image) {
    if (!image?.isConnected || !window.DBLBackgroundTest?.maskUniformPhoto ||
        image.closest('.dbl-cards-card.is-sealed')) return;
    const source = image.dataset.uniformOriginal;
    if (!source || image.src !== source ||
        image.dataset.uniformMaskStarted === source) return;
    image.dataset.uniformMaskStarted = source;
    void window.DBLBackgroundTest.maskUniformPhoto(image, source);
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
      const loadNext = () => {
        const next = urls[index++];
        if (!next) return false;
        img.dataset.uniformCutout = '';
        img.dataset.uniformMaskStarted = '';
        img.src = next;
        // Keep this original URL separate from the temporary cutout URL.
        img.dataset.uniformOriginal = img.src;
        return true;
      };
      img.addEventListener('load', () => {
        uniformImageResults.set(key, img.dataset.uniformOriginal || img.src);
        artwork.classList.add('has-image');
        // Lazy-loaded images are processed only after the asset loads.
        // Sealed cards wait until the player reveals them.
        if (img.src === img.dataset.uniformOriginal) activateUniformCutout(img);
      });
      img.addEventListener('error', () => {
        if (img.dataset.uniformCutout &&
            img.src === img.dataset.uniformCutout) {
          // An evicted or invalid temporary PNG must never break a card.
          img.src = img.dataset.uniformOriginal;
          return;
        }
        artwork.classList.remove('has-image');
        if (!loadNext()) {
          uniformImageResults.set(key, null);
          img.remove();
        }
      });
      artwork.appendChild(img);
      loadNext();
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
  // A two-ink, late-1960s-style printed reverse. Values remain in the
  // collection UI, never on the collectible's physical-looking face.
  function toppsBack(card) {
    const uniform = isToppsUniform(card);
    const back = make('span', 'dbl-cards-face dbl-cards-back dbl-topps-back ' +
      'dbl-topps-vintage-back ' +
      (uniform ? 'dbl-topps-vintage-uniform' : 'dbl-topps-vintage-player'));

    const masthead = make('span', 'dbl-topps-vintage-masthead');
    masthead.appendChild(make('strong', 'dbl-topps-vintage-brand', 'TOPPS'));
    masthead.appendChild(make('span', 'dbl-topps-vintage-issue', '1968 · DBL BASKETBALL'));
    back.appendChild(masthead);

    const nameplate = make('span', 'dbl-topps-vintage-nameplate');
    if (uniform) {
      // Preserve fitting for unusually long team wordmarks.
      nameplate.appendChild(uniformName(card.teamName || card.team || 'DBL',
        'dbl-topps-vintage-name dbl-topps-uniform-fit-name'));
    } else {
      nameplate.appendChild(make('strong', 'dbl-topps-vintage-name',
        card.name || 'Unknown player'));
    }
    nameplate.appendChild(make('span', 'dbl-topps-vintage-teamline',
      uniform ? '1968 TEAM UNIFORM ISSUE' : (card.teamName || card.team || 'DBL')));
    back.appendChild(nameplate);

    const profile = make('span', 'dbl-topps-vintage-profile');
    const emblem = make('span', 'dbl-topps-vintage-emblem');
    emblem.appendChild(teamCrest(card));
    profile.appendChild(emblem);
    const facts = make('span', 'dbl-topps-vintage-facts');
    const addFact = (label, value) => {
      const row = make('span', 'dbl-topps-vintage-fact');
      row.appendChild(make('span', 'dbl-topps-vintage-fact-label', label));
      row.appendChild(make('strong', 'dbl-topps-vintage-fact-value', value));
      facts.appendChild(row);
    };
    if (uniform) {
      addFact('CLUB', card.team || 'DBL');
      addFact('UNIFORM', (card.uniform || 'home').toUpperCase());
      addFact('SEASON', '1968');
    } else {
      const jersey = api.findJersey?.(card) ?? card.jersey;
      addFact('POSITION', card.pos || '—');
      addFact('NUMBER', jersey !== null && jersey !== undefined &&
        String(jersey).trim() ? '#' + String(jersey).trim() : '—');
      addFact('STATUS', card.rookie === true ? 'ROOKIE' : 'PLAYER');
    }
    profile.appendChild(facts);
    back.appendChild(profile);

    const panel = make('span', 'dbl-topps-vintage-panel');
    if (uniform) {
      panel.appendChild(make('strong', 'dbl-topps-vintage-panel-heading',
        '1968 UNIFORM REFERENCE'));
      const edition = make('span', 'dbl-topps-vintage-uniform-edition');
      edition.appendChild(make('strong', 'dbl-topps-vintage-uniform-side',
        (card.uniform || 'home').toUpperCase()));
      edition.appendChild(make('span', 'dbl-topps-vintage-uniform-desc',
        'HISTORIC TEAM ISSUE'));
      panel.appendChild(edition);
    } else {
      panel.appendChild(make('strong', 'dbl-topps-vintage-panel-heading',
        '1968 REGULAR SEASON'));
      const played = Number(card.gp) > 0;
      const columns = [
        ['YEAR', '1968'],
        ['GP', format(card.gp)],
        ['PPG', played ? format(card.ppg, 1) : '—'],
        ['RPG', played ? format(card.rpg, 1) : '—'],
        ['APG', played ? format(card.apg, 1) : '—']
      ];
      const table = make('span', 'dbl-topps-vintage-table');
      for (const [label] of columns)
        table.appendChild(make('span', 'dbl-topps-vintage-table-label', label));
      for (const [, value] of columns)
        table.appendChild(make('strong', 'dbl-topps-vintage-table-value', value));
      panel.appendChild(table);
    }
    back.appendChild(panel);

    const footer = make('span', 'dbl-topps-vintage-footer');
    footer.appendChild(make('strong', 'dbl-topps-vintage-footer-mark',
      '1968 TOPPS · DBL'));
    footer.appendChild(make('span', 'dbl-topps-vintage-footer-type',
      uniform ? 'UNIFORM CARD' : 'PLAYER CARD'));
    back.appendChild(footer);
    // Favorites remain interactive; unlike market values they belong to
    // collection controls, not the printed historical player information.
    back.appendChild(favoriteAction(card));
    return back;
  }

  function teamSeasonFront(card) {
    const front = make('span', 'dbl-cards-face dbl-cards-front dbl-cards-team-season-front');
    front.appendChild(make('span', 'dbl-cards-team-season-masthead', 'HISTORIC TEAMS OF THE DBL'));
    // Plain Base Team Season cards need no visible edition label; metal
    // variants retain their collectible finish names.
    if (teamVariant(card) !== 'base')
      front.appendChild(make('span', 'dbl-cards-team-season-edition',
        teamVariantName(card).toUpperCase() + ' EDITION'));
    front.appendChild(make('strong', 'dbl-cards-team-season-year', card.era ?? '—'));
    const emblem = make('span', 'dbl-cards-team-season-emblem');
    emblem.appendChild(teamCrest(card, true));
    front.appendChild(emblem);
    const teamName = make('span', 'dbl-cards-team-season-name', card.teamName);
    // Scale long names to fit the inset card frame, including on mobile.
    const nameLength = String(card.teamName || '').trim().length;
    if (nameLength > 17) {
      const scale = Math.max(.58, Math.min(1, 17 / nameLength));
      teamName.style.setProperty('--team-season-name-scale', String(scale));
    }
    front.appendChild(teamName);
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
    if (isMetalTeam(card))
      front.appendChild(make('span', 'dbl-cards-foil'));
    return front;
  }

  // Shared, read-only Series 0 reverse helpers. No storage changes.
  function series0Masthead(back, descriptor) {
    const row = make('span', 'dbl-series0-masthead');
    row.appendChild(make('strong', 'dbl-series0-brand', 'DBL'));
    row.appendChild(make('span', 'dbl-series0-issue', 'SERIES 0 · ' + descriptor));
    back.appendChild(row);
  }
  function series0Metric(parent, value, label) {
    const metric = make('span', 'dbl-series0-metric');
    metric.appendChild(make('strong', 'dbl-series0-metric-value', value));
    metric.appendChild(make('span', 'dbl-series0-metric-label', label));
    parent.appendChild(metric);
  }
  function series0Footer(back, imprint) {
    const footer = make('span', 'dbl-series0-footer');
    footer.appendChild(make('strong', 'dbl-series0-imprint', imprint));
    footer.appendChild(make('span', 'dbl-series0-turn', 'TAP TO TURN'));
    back.appendChild(footer);
  }
  function teamSeasonBack(card, back) {
    back.classList.add('dbl-series0-back', 'dbl-series0-team-back');
    series0Masthead(back, 'TEAM ARCHIVE');
    const identity = make('span', 'dbl-series0-identity');
    identity.appendChild(make('strong', 'dbl-series0-name',
      card.teamName || card.name || 'Unknown team'));
    identity.appendChild(make('span', 'dbl-series0-subtitle',
      (card.era ?? 'YEAR UNKNOWN') + ' SEASON · ' +
      teamVariantName(card).toUpperCase() + ' EDITION'));
    back.appendChild(identity);
    const visual = make('span', 'dbl-series0-team-visual');
    const crest = make('span', 'dbl-series0-team-crest');
    crest.appendChild(teamCrest(card));
    visual.appendChild(crest);
    const season = make('span', 'dbl-series0-team-identity');
    season.appendChild(make('strong', 'dbl-series0-team-year', card.era ?? '—'));
    season.appendChild(make('span', 'dbl-series0-team-abbrev', card.team || 'DBL'));
    visual.appendChild(season);
    back.appendChild(visual);
    // Finish comes from the verified historical-season evaluation, never
    // inferred from the metal tier or the team's regular-season record.
    const finish = make('span', 'dbl-cards-team-season-back-finish dbl-series0-team-finish',
      card.finish || 'SEASON FINISH UNAVAILABLE');
    finish.dataset.finish = card.finishKind || 'unknown';
    back.appendChild(finish);
    const stats = make('span', 'dbl-series0-stats dbl-series0-team-stats');
    const hasRecord = Number.isFinite(card.won) && Number.isFinite(card.lost);
    const gp = hasRecord ? card.won + card.lost +
      (Number.isFinite(card.tied) ? card.tied : 0) : null;
    series0Metric(stats, format(card.won), 'WINS');
    series0Metric(stats, format(card.lost), 'LOSSES');
    series0Metric(stats, gp > 0 ? (card.won / gp * 100).toFixed(1) + '%' : '—',
      'WIN %');
    series0Metric(stats, Number.isInteger(card.playoffRoundsWon) &&
      card.playoffRoundsWon >= 0 ? format(card.playoffRoundsWon) : '—',
      'PLAYOFF ROUNDS WON');
    back.appendChild(stats);
    series0Footer(back, 'HISTORIC TEAMS OF THE DBL');
    if (isMetalTeam(card)) back.appendChild(make('span', 'dbl-cards-foil'));
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
    // Use the SAME year-to-assets map already used by the normal cards.
    // The stock photograph is LAST: only used when original links cannot
    // load or cannot be processed (including CORS/proxy failures).
    const stockPath = genericPhotoFor(card);
    // DOM image.src resolves relative paths to absolute URLs. Normalize the
    // stock source too, so fallback retries and stock labels compare equal.
    const stockPhoto = stockPath ? new URL(stockPath, document.baseURI).href : '';
    const sources = [...new Set([...rawSources.filter(url => !isVideoUrl(url)),
      stockPhoto].filter(Boolean))];
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
    image._bgtestStockSrc = stockPhoto;
    image._bgtestFailedLoad = new Set();
    image._bgtestTriedMasks = new Set();
    const stockLabel = make('span', 'dbl-bgtest-pack-stock-label',
      (card.era || '') + ' STOCK PHOTO');
    stockLabel.hidden = true;
    frame.appendChild(stockLabel);
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
      // A generated cutout uses a blob URL, so inspect its original source.
      const originalSource = image.dataset.bgMaskOriginal ||
        image.currentSrc || image.src;
      stockLabel.hidden = !stockPhoto || originalSource !== stockPhoto;
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
        stockLabel.hidden = true;
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
          // Preserve the stock-image identification even after cutout.
          const badge = button.querySelector('.dbl-bgtest-pack-stock-label');
          if (badge) badge.hidden = !image._bgtestStockSrc ||
            image.dataset.bgMaskOriginal !== image._bgtestStockSrc;
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
            // After original and small photo, also try the matching
            // local-year stock photo; it is same-origin and processable.
            label.textContent = alternative === image._bgtestStockSrc
              ? 'TRYING YEAR STOCK PHOTO…' : 'TRYING ALTERNATE PHOTO…';
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

  // Stable visual print serials by card identity. Preserve the existing
  // Black Label hash and /500 number exactly; Mythicals use the same
  // placement, finish, and hash with a /100 edition size. This does not
  // change collection copies, card IDs, pull odds, or pack limits.
  function numberedCardSerial(card, editionSize) {
    // A handwritten signature does not change the already-printed
    // Black Label /500 or Mythical /100 serial on this same card design.
    const identity = String(card.id || card.pid || card.name || 'black-label')
      .replace(/:auto$/, '');
    let hash = 2166136261;
    for (let i = 0; i < identity.length; i++)
      hash = Math.imul(hash ^ identity.charCodeAt(i), 16777619) >>> 0;
    return String(hash % editionSize + 1).padStart(3, '0') + '/' + editionSize;
  }

  function frontOf(card) {
    if (isBackgroundTest(card)) return backgroundTestFront(card);
    if (isUnderground(card)) return psychedelic.front(card, {make,art});
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
      // Aurora's upper-right decoration is intentionally absent.
      // Preserve all other card designs without revealing or changing them.
      if (card.rarity !== 'mythic-aurora') {
        const symbol = make('span', 'dbl-cards-mythical-symbol',
          card.rarity === 'mythic-eclipse' ? '◉' : '✦');
        symbol.setAttribute('aria-hidden', 'true');
        front.appendChild(symbol);
      }
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
    if (card.rarity === 'black-label' || edition?.mythical) {
      // Place Black Label and Mythical print numbers on the same baseline,
      // aligned with the portrait edge, without moving player names.
      const firstLine = make('span', 'dbl-cards-black-first-line');
      if (names.first)
        firstLine.appendChild(make('span', 'dbl-cards-first-name', names.first));
      const editionSize = edition?.mythical ? 100 : 500;
      const serial = make('span', 'dbl-cards-black-serial',
        numberedCardSerial(card, editionSize));
      serial.setAttribute('aria-label', 'Card serial ' + serial.textContent);
      firstLine.appendChild(serial);
      details.appendChild(firstLine);
    } else if (names.first) {
      details.appendChild(make('span', 'dbl-cards-first-name', names.first));
    }
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

    // Black Label's premium finish is now glossy lacquer with a metallic
    // sheen; do not inject the previous seven floating star decorations.
    front.appendChild(make('span', 'dbl-cards-foil'));
    return front;
  }
  function backOf(card, sealed) {
    const back = make('span', 'dbl-cards-face dbl-cards-back');
    if (sealed) {
      back.appendChild(make('span', 'dbl-cards-back-logo', 'DBL'));
      back.appendChild(make('span', 'dbl-cards-back-ornament', '✦'));
      back.appendChild(make('strong', 'dbl-cards-back-sealed-series',
        isUnderground(card) ? '1968 UNDERGROUND' :
          isBackgroundTest(card) ? 'BACKGROUND TEST' : 'SERIES 0'));
      back.appendChild(make('span', 'dbl-cards-back-small', 'LEGENDS NEVER FADE'));
      back.appendChild(make('span', 'dbl-cards-back-tap', 'TAP TO REVEAL'));
      return back;
    }
    if (isBackgroundTest(card)) return backgroundTestBack(card, back);
    if (isUnderground(card)) return psychedelic.back(card, {make,format,favoriteAction});
    if (isToppsPlayer(card) || isToppsUniform(card)) return toppsBack(card);
    if (isTeamSeason(card)) return teamSeasonBack(card, back);
    // A compact archival player dossier. Keep peak-year data distinct from
    // career averages, and use dashes rather than inventing missing figures.
    back.classList.add('dbl-series0-back', 'dbl-series0-player-back');
    const edition = tierMap[card.rarity];
    series0Masthead(back, edition?.mythical ? 'MYTHICAL ARCHIVE' : 'PLAYER ARCHIVE');
    const identity = make('span', 'dbl-series0-identity');
    identity.appendChild(make('strong', 'dbl-series0-name', card.name || 'Unknown player'));
    identity.appendChild(make('span', 'dbl-series0-subtitle',
      (card.teamName || card.team || 'DBL') + ' · ' + (card.pos || 'POSITION UNKNOWN')));
    back.appendChild(identity);
    const profile = make('span', 'dbl-series0-player-profile');
    const ovr = make('span', 'dbl-series0-ovr');
    ovr.appendChild(make('strong', 'dbl-series0-ovr-number',
      Number.isFinite(card.peak) ? format(card.peak) :
      Number.isFinite(card.ovr) ? format(card.ovr) : '—'));
    ovr.appendChild(make('span', 'dbl-series0-ovr-label', 'PEAK OVR'));
    profile.appendChild(ovr);
    const facts = make('span', 'dbl-series0-facts');
    const fact = (label, value) => {
      const row = make('span', 'dbl-series0-fact');
      row.appendChild(make('span', 'dbl-series0-fact-label', label));
      row.appendChild(make('strong', 'dbl-series0-fact-value', value));
      facts.appendChild(row);
    };
    fact('PEAK YEAR', card.peakVerified === false ? '—' : card.era ?? '—');
    const jersey = api.findJersey?.(card) ?? card.jersey;
    fact('JERSEY', jersey != null && String(jersey).trim() ?
      '#' + String(jersey).trim() : '—');
    fact('DRAFT PICK', Number.isSafeInteger(card.draftPick) &&
      card.draftPick > 0 ? '#' + format(card.draftPick) : '—');
    fact('DRAFT YEAR', Number.isSafeInteger(card.draftYear) &&
      card.draftYear > 0 ? String(card.draftYear) : '—');
    profile.appendChild(facts);
    // Print the full college name across the entire player profile.
    const college = make('span', 'dbl-series0-college');
    college.appendChild(make('span', 'dbl-series0-college-label', 'COLLEGE'));
    const school = String(card.college || '').trim() || '—';
    const collegeName = make('strong', 'dbl-series0-college-name', school);
    collegeName.title = school;
    college.appendChild(collegeName);
    profile.appendChild(college);
    back.appendChild(profile);
    const stats = make('span', 'dbl-series0-stats dbl-series0-player-stats');
    series0Metric(stats, format(card.gp), 'CAREER GAMES');
    series0Metric(stats, format(card.ppg, 1), 'CAREER PPG');
    series0Metric(stats, format(card.ws, 1), 'CAREER WIN SHARES');
    back.appendChild(stats);
    const editionLine = make('span', 'dbl-series0-edition');
    const tags = [edition?.shortLabel || edition?.label || 'BASE'];
    if (card.autograph === true) tags.push('AUTOGRAPH');
    if (card.rookie === true) tags.push('ROOKIE');
    editionLine.appendChild(make('strong', 'dbl-series0-edition-name',
      tags.join(' · ').toUpperCase()));
    if (card.rarity === 'black-label' || edition?.mythical)
      editionLine.appendChild(make('span', 'dbl-series0-serial',
        'NO. ' + numberedCardSerial(card, edition?.mythical ? 100 : 500)));
    back.appendChild(editionLine);
    series0Footer(back, 'DBL · FLAGSHIP COLLECTION');
    back.appendChild(make('span', 'dbl-cards-foil'));
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
      } else if (collection.series === 3) {
        inner.appendChild(psychedelic.cover(make));
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
    // Metallic Team Season variants have finish-specific reveals, not
    // the player-card Chrome/Refractor art.
    'bronze-champion': {duration: 1660, sparks: 8, spread: .46, glyph: '◆'},
    'silver-team': {duration: 1780, sparks: 10, spread: .53, glyph: '✦'},
    'gold-team': {duration: 1950, sparks: 12, spread: .60, glyph: '✧'},
    // Retain the Black Label reveal's flash, halo, ring and foil sweep.
    // Remove star-shaped particles and the star sigil per the finish redesign.
    'black-label': {duration: 2100, sparks: 0, spread: 0, glyph: ''},
    'mythic-aether': {duration: 2850, sparks: 21, spread: 1.04, glyph: '✧'},
    'mythic-eclipse': {duration: 2850, sparks: 21, spread: 1.04, glyph: '✦'},
    'mythic-aurora': {duration: 2850, sparks: 22, spread: 1.04, glyph: '✧'}
  });

  function playCardRevealEffect(button, card) {
    // Old champion Base cards retain a normal flip: only the actual metal
    // edition determines its one-time reveal treatment.
    const effect = isTeamSeason(card) ? ({
      bronze:'bronze-champion',silver:'silver-team',gold:'gold-team'
    })[teamVariant(card)] : card.rarity;
    const config = REVEAL_EFFECTS[effect];
    // Base cards have no extra effect. Respect OS reduced-motion preferences.
    if (!config || reduced()) return;
    button.querySelector('.dbl-cards-reveal-fx')?.remove();
    const fx = make('span', 'dbl-cards-reveal-fx');
    fx.setAttribute('aria-hidden', 'true');
    fx.dataset.effect = effect;
    fx.style.setProperty('--fx-duration', config.duration + 'ms');
    fx.style.setProperty('--fx-delay', '170ms');
    // Confine just the one-time glint to the card surface for reflective
    // editions; the bronze spark/ring may extend outside the silhouette.
    if (effect === 'crome' || effect === 'refractor' ||
        effect === 'black-label' || effect === 'bronze-champion' ||
        effect === 'silver-team' || effect === 'gold-team') {
      fx.appendChild(make('span', 'dbl-cards-reveal-sweep-window'));
    }
    fx.appendChild(make('span', 'dbl-cards-reveal-halo'));
    fx.appendChild(make('span', 'dbl-cards-reveal-ring'));
    if (config.glyph)
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

  // Deterministic per-player on-card ink: an SVG signature with a
  // PID-seeded writing style, pen angle and underline. No generated
  // bitmap is saved or exported; it is redrawn from player name and PID.
  function autographArtwork(card) {
    if (card.autograph !== true || !Number.isSafeInteger(Number(card.pid))) return null;
    const overlay = make('span', 'dbl-cards-autograph');
    overlay.setAttribute('aria-hidden', 'true');
    const name = String(card.name || '').trim();
    const nameParts = name.split(/\s+/).filter(Boolean);
    // A few players abbreviate their given name in their signatures.
    let seed = (Number(card.pid) + 1) >>> 0;
    for (const character of name) seed = (Math.imul(seed ^ character.charCodeAt(0), 16777619)) >>> 0;
    const first = nameParts.shift() || '';
    const last = nameParts.join(' ');
    const signature = last && seed % 5 === 0
      ? first.charAt(0) + '. ' + last : (first + ' ' + last).trim();
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 340 110');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('focusable', 'false');
    const text = document.createElementNS(svgNS, 'text');
    // Great Vibes is loaded explicitly in index.html, so mobile browsers
    // do not silently fall back to a generic italic serif face.
    const signatureFont = '"Great Vibes","Snell Roundhand",cursive';
    const fontSize = Math.max(49, Math.min(91, 96 - Math.max(0, signature.length - 11) * 2.8));
    const ink = ['#123f98','#174baf','#16449d','#204da8'][seed % 4];
    overlay.style.setProperty('--autograph-ink', ink);
    text.setAttribute('x', '170');
    text.setAttribute('y', '61');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-family', signatureFont);
    text.setAttribute('font-style', 'italic');
    text.setAttribute('font-size', String(fontSize));
    text.setAttribute('font-weight', '400');
    text.setAttribute('stroke', 'currentColor');
    text.setAttribute('stroke-width', '1.2');
    text.setAttribute('stroke-linejoin', 'round');
    text.setAttribute('paint-order', 'stroke fill');
    text.setAttribute('letter-spacing', String(((seed >>> 8) % 7 - 3) / 8));
    text.setAttribute('fill', 'currentColor');
    text.setAttribute('transform',
      'rotate(' + (((seed >>> 11) % 13) - 6) + ' 170 55)');
    // Keep longer signatures inside the printed portrait without clipping.
    const length = Math.min(310, signature.length * fontSize * .53);
    if (signature.length > 15) {
      text.setAttribute('textLength', String(length));
      text.setAttribute('lengthAdjust', 'spacingAndGlyphs');
    }
    text.textContent = signature;
    svg.appendChild(text);
    if ((seed >>> 3) % 5 !== 0) {
      const flourish = document.createElementNS(svgNS, 'path');
      const start = 53 + (seed % 23);
      const end = 298 - ((seed >>> 7) % 26);
      const y = 78 + ((seed >>> 14) % 9);
      flourish.setAttribute('d', 'M ' + start + ' ' + y +
        ' C 127 ' + (y + 13) + ' 244 ' + (y - 4) +
        ' ' + end + ' ' + (y - 9));
      flourish.setAttribute('fill', 'none');
      flourish.setAttribute('stroke', 'currentColor');
      flourish.setAttribute('stroke-width', String(2.5 + (seed % 5) * .25));
      flourish.setAttribute('stroke-linecap', 'round');
      svg.appendChild(flourish);
    }
    overlay.appendChild(svg);
    return overlay;
  }
  function applyAutograph(front, card) {
    const ink = autographArtwork(card);
    if (!ink) return front;
    front.appendChild(ink);
    return front;
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
      if (card.autograph === true) button.dataset.autograph = 'true';
      if (isTeamSeason(card)) button.dataset.teamVariant = teamVariant(card);
    }
    const cardLabel = isTeamSeason(card)
      ? String(card.era)+' '+card.name+' · '+teamVariantName(card) : card.name;
    button.setAttribute('aria-label', sealed ? 'Reveal mystery DBL card' :
      'View statistics for ' + cardLabel + ', ' + tierMap[card.rarity]?.label +
      (card.autograph ? ', autographed' : ''));
    const inner = make('span', 'dbl-cards-inner');
    inner.appendChild(applyAutograph(frontOf(card), card));
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
        image._bgtestStockSrc = '';
        const badge = inner.querySelector('.dbl-bgtest-pack-stock-label');
        if (badge) badge.hidden = true;
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
        if (card.autograph === true) button.dataset.autograph = 'true';
        if (isTeamSeason(card)) button.dataset.teamVariant = teamVariant(card);
        playCardRevealEffect(button, card);
        activateBackgroundPhoto(button, card);
        if (isToppsUniform(card)) {
          const uniform = button.querySelector('.dbl-topps-uniform-image');
          if (uniform?.complete && uniform.naturalWidth > 0)
            activateUniformCutout(uniform);
        }
        scheduleNameFit();
        button.setAttribute('aria-label', 'View statistics for ' + cardLabel +
          ', ' + tierMap[card.rarity]?.label +
          (card.autograph === true ? ', autographed' : ''));
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
    // Pack Room pulls flip/reveal immediately on tap; never move them into
    // the zoom lightbox. Binder/collection cards keep their existing zoom,
    // with flip interaction inside the enlarged view. Reveal All still
    // calls _dblFlip directly and is unchanged.
    button._dblFlip = flipCard;
    const activateCard = () => {
      if (packStage.contains(button) || cardLightbox?.isOpen(button)) flipCard();
      else cardLightbox?.open(button);
    };
    button.addEventListener('click', activateCard);
    if (!sealed && isBackgroundTest(card)) {
      button._backgroundTestCard = card;
      if (backgroundPhotoObserver) backgroundPhotoObserver.observe(button);
    }
    button.addEventListener('keydown', event => {
      if (event.target !== button || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      activateCard();
    });
    return button;
  }
  function newPackArt(tearing = false) {
    const topps = packType === 'topps-1968';
    const background = packType === 'background-test';
    const underground = packType === 'underground-1968';
    const pack = make('div', 'dbl-cards-pack' + (tearing ? ' is-ripping' : ''));
    pack.dataset.packType = packType;
    pack.appendChild(make('span', 'dbl-cards-pack-crest',
      underground ? 'DBL / FREE PRESS' : background ? 'DBL / EXPERIMENT' : topps ? 'DBL / 1968' : 'DBL / 1916'));
    pack.appendChild(make('strong', 'dbl-cards-pack-name',
      underground ? 'UNDERGROUND' : background ? 'MASK' : topps ? 'TOPPS' : 'LEGACY'));
    pack.appendChild(make('span', 'dbl-cards-pack-shape',
      underground ? '✿' : background ? '02' : topps ? '68' : '◇'));
    pack.appendChild(make('span', 'dbl-cards-pack-series',
      underground ? '1968 · THE UNDERGROUND' :
      background ? 'SERIES 2 · BACKGROUND TEST' :
        topps ? '1968 · TEST ISSUE' :
        'SERIES ' + api.currentSeries + ' · THE COLLECTOR SERIES'));
    pack.appendChild(make('span', 'dbl-cards-pack-guarantee',
      underground ? '5 CARDS · 20% HEADLINERS!' :
      background ? '5 CARDS · CURRENT OVR 50+' :
        topps ? '5 CARDS · 1968 TOPPS ONLY' : '5 CARDS · RANDOM PULLS'));
    pack.appendChild(make('span', 'dbl-cards-pack-tear'));
    return pack;
  }
  function readyStage() {
    closeCardLightbox(true);
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
      if (card.classList.contains('is-sealed')) card._dblFlip?.();
    }
    revealBtn.disabled = true;
  }
  function showPulls(picks, token, ownedBeforePack) {
    if (token !== packToken) return;
    closeCardLightbox(true);
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
      // A separate caption below the card avoids covering its portrait,
      // signature, or stats. Both rarity and estimated value stay secret
      // until the first flip; only the original card owns the price.
      const pullValue = make('div', 'dbl-cards-pull-value');
      pullValue.hidden = true;
      pullValue.title = 'Fictional DBL card market estimate; not real money';
      pullValue.appendChild(make('span', 'dbl-cards-pull-value-caption', 'EST. VALUE'));
      pullValue.appendChild(make('strong', 'dbl-cards-pull-price',
        marketMoney(api.marketValue(card))));
      // Share the existing weakly referenced value lookup with Settings
      // updates; no card copies or persistent prices are created.
      marketTags.set(pullValue, card);
      const element = cardElement(card, true, () => {
        const isNew = alreadyOwned === 0;
        status.textContent = isNew ? 'NEW CARD' :
          format(alreadyOwned) + (alreadyOwned === 1 ? ' COPY' : ' COPIES') + ' ALREADY OWNED';
        status.classList.add(isNew ? 'is-new' : 'is-owned');
        // This callback runs only the first time the card is revealed.
        // Repeated flips cannot replay the NEW burst or hide the value.
        pullValue.hidden = false;
        pullValue.classList.add('is-revealed');
        if (packCards.every(c => !c.classList.contains('is-sealed'))) revealBtn.disabled = true;
      });
      element.classList.add('dbl-cards-appearing');
      element.style.setProperty('--pack-position', index);
      entry.appendChild(element);
      entry.appendChild(pullValue);
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
    if (busy || clearing || transferBusy || deletingSelected ||
        api.status.merging || api.status.deletingCards ||
        !api.status.ready || api.status.loading) return;
    // Recheck when actually clicked: a stale or concurrently-opened tab
    // must not rely on the previously enabled button.
    const quota = packQuota();
    if (!quota.available) { showStatus(); return; }
    const pulled = api.getPack(packType);
    if (pulled.length !== 5) return;
    // Count copies of each player/rarity edition BEFORE collecting this pack.
    // The just-opened cards must not inflate the 'already owned' labels.
    const ownedBeforePack = new Map(api.items.map(card => [card.id, card.count]));
    // Reserve only after drawing a valid five-card pack. A failed collection
    // gets its slot back; successful openings keep their timer through
    // league-file changes, refreshes, and even clearing the collection.
    const reservation = packLimits?.reserve(packType) ||
      (packType === 'background-test'
        ? {ok:true,unlimited:true} : {ok:false});
    if (!reservation.ok) { showStatus(); return; }
    let collected = false;
    try { collected = api.collectPack(pulled); }
    catch (error) {
      packLimits?.release(reservation);
      showStatus();
      throw error;
    }
    if (!collected) {
      packLimits?.release(reservation);
      showStatus();
      return;
    }
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
      if (tier === 'autograph' ? item.autograph !== true :
          tier !== 'all' && tier !== item.rarity) return false;
      if (selectedTeam !== 'all' && teamNameForCard(item) !== selectedTeam) return false;
      return !q || item.name.toLocaleLowerCase().includes(q) ||
        String(item.nickname || '').toLocaleLowerCase().includes(q) ||
        item.team.toLocaleLowerCase().includes(q) ||
        item.teamName.toLocaleLowerCase().includes(q) ||
        String(item.era ?? '').includes(q);
    });
    switch (order.value) {
      case 'name': result.sort((a, b) => a.name.localeCompare(b.name)); break;
      case 'duplicates':
        result.sort((a, b) => b.count - a.count || raritySortRank(b) - raritySortRank(a));
        break;
      case 'player':
        result.sort((a, b) => (b.peak ?? -1) - (a.peak ?? -1) ||
          raritySortRank(b) - raritySortRank(a)); break;
      case 'value':
        result.sort((a, b) => api.marketValue(b) - api.marketValue(a) ||
          a.name.localeCompare(b.name)); break;
      default:
        result.sort((a, b) => raritySortRank(b) - raritySortRank(a) ||
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
    cell.appendChild(make('span', 'dbl-cards-owned',
      (card.autograph === true ? 'AUTOGRAPH · ' : '') + 'OWNED ×' + card.count));
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
    closeCardLightbox(true);
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
    // A signature annotates a physical copy, not a new checklist edition.
    // Signed-only ownership must satisfy the ORIGINAL player/rarity checklist
    // item, and signed + unsigned copies contribute to its one owned total.
    const owned = new Map();
    for (const card of api.items) {
      if ((card.series ?? api.currentSeries) !== activeChecklistSeries) continue;
      const editionId = card.autograph === true
        ? String(card.id).replace(/:auto$/, '') : card.id;
      const existing = owned.get(editionId);
      owned.set(editionId, {
        ...card,
        count: (existing?.count || 0) + card.count
      });
    }
    const totals = Object.fromEntries(completionTiers.map(tier =>
      [tier.id, {label: tier.label, possible: 0, collected: 0}]));
    const all = [];
    let collected = 0;
    if (activeChecklistSeries === 3) {
      const all = [], totals = Object.fromEntries(undergroundCompletionTiers.map(t =>
        [t.id, {label:t.label, possible:0, collected:0}]));
      let collected = 0;
      for (const card of api.checklistUnderground) {
        const item = owned.get(card.id), isOwned = !!item;
        const stat = totals[card.rarity];
        if (!stat) continue;
        stat.possible++;
        if (isOwned) {stat.collected++;collected++;}
        all.push({
          id:card.id,pid:card.pid,tid:card.tid,type:card.type,
          name:card.name,team:card.teamName,era:1968,peak:card.peak,
          nickname:card.nickname || '',
          rookie:card.rookie,rarity:card.rarity,
          franchiseKey:Number.isInteger(card.tid) && card.tid >= 0 ?
            'tid:'+card.tid : 'unknown',
          franchiseName:card.franchiseName || card.teamName,
          label:card.rarity === 'underground-nickname' ?
            'They Call Him… · “' + card.nickname + '”' :
            card.rarity === 'underground-headliner' ?
            'Headliners! · Screenprint insert' :
            (card.rookie ? 'Underground · New Breed Rookie' : 'Underground · Base'),
          owned:isOwned,copies:item?.count || 0
        });
      }
      return {all,totals,collected};
    }
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
          teamVariant:teamVariant(season),
          won: season.won, lost: season.lost, tied: season.tied,
          finishKind: season.finishKind, playoffRoundsWon: season.playoffRoundsWon,
          name: season.name + ' (' + season.era + ')',
          team: season.teamName, era: season.era, peak: null,
          franchiseKey: Number.isInteger(season.tid) && season.tid >= 0
            ? 'tid:' + season.tid : 'unknown',
          franchiseName: season.franchiseName || season.teamName,
          rarity: insertTier.id, label: insertTier.label+' · '+teamVariantName(season),
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
    const topps = activeChecklistSeries === 1, underground = activeChecklistSeries === 3;
    checklistSeriesContext.textContent = underground
      ? '1968 Underground · Free Press Issue' : topps
        ? '1968 Topps · Test Issue' : 'Series 0 · Original FLAGSHIP set';
    checklistDescription.textContent = underground
      ? 'Every eligible 1968 player as a psychedelic base card and a Headliners! insert, plus selected They Call Him… nickname cards.' : topps
      ? 'Every 1968-active player, including rookies, and home/away uniform inserts from the uploaded league archive.'
      : 'Every obtainable player edition and every eligible Base, Bronze, Silver and Gold Team Season insert. Editions check off when collected.';
    checklistFranchiseDescription.textContent = underground
      ? '1968 Underground Base, Headliners!, and curated They Call Him… editions by historical franchise; duplicates count once.' : topps
      ? '1968 Topps player and uniform completion, grouped by 1968 franchise. Duplicates count once.'
      : 'Completion by franchise, including peak-season player editions and historical Team Season inserts. Name changes stay grouped; duplicates count once.';
    checklistNote.textContent = underground
      ? 'Each eligible 1968 player has Base and Headliners! editions. They Call Him… contains only selected players with approved nicknames. If at least one is eligible, Underground-only pack slots are 75% Base, 20% Headliners!, and 5% nicknames; until then the original 80%/20% split applies. No inserts are guaranteed. Rookie indicators and saved collections remain unchanged.' : topps
      ? 'One plain-paper 1968 Topps card per eligible player, with rookie styling for first-season players, plus one home and one away uniform placeholder per 1968 team. No Chrome or Refractor tiers; rare autograph variations can appear but are not required for standard set completion. The checklist comes from the uploaded league export; owned cards remain saved even when that file is unloaded.'
      : 'One entry per player and standard eligible rarity: Base 35+, Chrome 45+, Refractor 55+, and Black Label 60+ peak OVR. Team Season Base is available for every season; Bronze for playoff teams, Silver for finalists, Gold for champions. Each finish is a separate collectible edition. Autographs remain separate; duplicates count once. Owned cards missing from a newer export stay in My Collection.';
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
    if (activeChecklistSeries === 3) {
      for (const tier of undergroundCompletionTiers) {
        const t = totals[tier.id];
        checklistCounter(checklistStats, t.label, t.collected, t.possible);
      }
    } else if (activeChecklistSeries === 1) {
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
        String(card.nickname || '').toLocaleLowerCase().includes(query) ||
        card.team.toLocaleLowerCase().includes(query) ||
        String(card.era ?? '').includes(query)));
    if (checklistSort.value === 'rating') {
      result.sort((a, b) => b.peak - a.peak ||
        a.name.localeCompare(b.name) || raritySortRank(b) - raritySortRank(a));
    } else if (checklistSort.value === 'value') {
      result.sort((a, b) => api.marketValue(b) - api.marketValue(a) ||
        a.name.localeCompare(b.name));
    } else if (checklistSort.value === 'rarity') {
      result.sort((a, b) => raritySortRank(b) - raritySortRank(a) ||
        a.name.localeCompare(b.name));
    } else {
      result.sort((a, b) => a.name.localeCompare(b.name) ||
        raritySortRank(b) - raritySortRank(a));
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
    closeCardLightbox(true);
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
  // Synchronously fit only the enlarged card before its zoom begins.
  // The rest of the binder is measured after closing, off the animation path.
  window.addEventListener('dbl:card-lightbox-open', fitLightboxNames);
  window.addEventListener('dbl:card-lightbox-close', scheduleNameFit);
  window.addEventListener('resize', () => {
    if (cardLightbox?.container) fitLightboxNames();
  });
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
  undergroundPackType.addEventListener('click', () => choosePackType('underground-1968'));
  backgroundPackType.addEventListener('click', () => choosePackType('background-test'));
  openBtn.addEventListener('click', openPack);
  // A second browser tab can use packs; refresh the displayed count when
  // shared browser storage changes, or the device wakes from sleep.
  window.addEventListener('storage', event => {
    if (event.key === packLimits?.key) showStatus();
  });
  window.addEventListener('focus', showStatus);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) showStatus();
  });
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
        order.value = 'value';
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
  // A Settings change never alters ownership or the saved collection.
  // Keep current pack reveal animations and flipped states intact while
  // refreshing the computed price labels, totals and value-based sorting.
  window.addEventListener('dbl:card-values-changed', () => {
    showCounters();
    for (const tag of document.querySelectorAll('.dbl-cards-market-value, .dbl-cards-pull-value')) {
      const card = marketTags.get(tag);
      const amount = tag.querySelector('.dbl-cards-market-price, .dbl-cards-pull-price');
      if (card && amount) amount.textContent = marketMoney(api.marketValue(card));
    }
    if (activeCardsSubtab === 1 && !panel.hidden) showGallery();
    if (activeCardsSubtab === CHECKLIST_TAB_INDEX && !panel.hidden) showChecklist();
  });
  window.addEventListener('dbl:tab-change', event => {
    if (event.detail?.panelId !== 'cardsPanel') closeCardLightbox(true);
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