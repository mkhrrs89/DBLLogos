(() => {
  'use strict';
  const api = window.DBLCardEngine;
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
  const order = document.getElementById('cardsSort');
  const loadMore = document.getElementById('cardsShowMoreBtn');
  if (!api || !panel || !status || !saveStatus || !packStage || !openBtn ||
      !actions || !revealBtn || !againBtn || !counter || !gallery ||
      !galleryCount || !search || !rarityFilter || !order || !loadMore) return;

  const tierIndex = Object.fromEntries(api.rarities.map((r, i) => [r.id, i]));
  const tierMap = Object.fromEntries(api.rarities.map(r => [r.id, r]));
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
  let packToken = 0;
  let packCards = [];
  let limit = 36;
  let lastFileState = '';

  function appendStat(parent, value, heading) {
    const box = make('span', 'dbl-cards-stat');
    box.appendChild(make('strong', '', value));
    box.appendChild(make('span', '', heading));
    parent.appendChild(box);
  }
  function showCounters() {
    const s = api.status;
    counter.replaceChildren();
    appendStat(counter, format(s.packs), 'Packs opened');
    appendStat(counter, format(s.count), 'Total cards');
    appendStat(counter, format(s.unique), 'Unique editions');
    appendStat(counter, format(api.items.filter(c => c.rarity === 'black-label')
      .reduce((n, c) => n + c.count, 0)), 'Black Label pulls');
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
    openBtn.disabled = busy || !s.ready || !s.poolSize || s.loading;
    openBtn.textContent = busy ? 'Opening pack…' : 'Open five-card pack';
  }
  function art(card) {
    const artArea = make('span', 'dbl-cards-art');
    const initials = card.name.split(/\s+/).slice(0, 2)
      .map(x => x[0] || '').join('').toUpperCase();
    artArea.appendChild(make('span', 'dbl-cards-initials', initials));
    const source = api.findPhoto(card);
    if (source) {
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
      image.addEventListener('error', () => image.remove());
      image.src = source;
      artArea.appendChild(image);
    }
    artArea.appendChild(make('span', 'dbl-cards-art-number', card.peak ?? card.ovr ?? 'DBL'));
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
  function frontOf(card) {
    const front = make('span', 'dbl-cards-face dbl-cards-front');
    const top = make('span', 'dbl-cards-front-top');
    top.appendChild(make('span', '', 'FLAGSHIP'));
    top.appendChild(make('span', '', card.era ?? 'ARCHIVE'));
    front.appendChild(top);
    front.appendChild(art(card));
    front.appendChild(teamCrest(card));
    const bottom = make('span', 'dbl-cards-bottom');
    bottom.appendChild(make('strong', 'dbl-cards-name', card.name));
    bottom.appendChild(make('span', 'dbl-cards-affiliation', card.team + ' / ' + card.pos));
    const foot = make('span', 'dbl-cards-front-foot');
    foot.appendChild(make('strong', 'dbl-cards-rarity-name', tierMap[card.rarity]?.label.toUpperCase()));
    foot.appendChild(make('span', '', 'OVR ' + (card.ovr ?? '—') + ' · POT ' + (card.pot ?? '—')));
    bottom.appendChild(foot);
    front.appendChild(bottom);
    front.appendChild(make('span', 'dbl-cards-foil'));
    // Sparkles are entirely hidden on sealed cards; only a revealed Black
    // Label front enables them through its rarity data attribute.
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
      back.appendChild(make('span', 'dbl-cards-back-small', 'LEGENDS NEVER FADE'));
      back.appendChild(make('span', 'dbl-cards-back-tap', 'TAP TO REVEAL'));
      return back;
    }
    back.appendChild(make('span', 'dbl-cards-back-heading', 'PLAYER PROFILE'));
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
    back.appendChild(make('span', 'dbl-cards-back-foot', (card.era ?? 'DBL') +
      ' · ' + tierMap[card.rarity]?.label.toUpperCase()));
    back.appendChild(make('span', 'dbl-cards-back-tap', 'TAP TO TURN'));
    return back;
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
    pack.appendChild(make('span', 'dbl-cards-pack-series', 'THE COLLECTOR SERIES'));
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
  function showPulls(picks, token) {
    if (token !== packToken) return;
    busy = false;
    packStage.replaceChildren();
    packStage.appendChild(make('p', 'dbl-cards-stage-note',
      'Five cards added to your collection · Tap each card to reveal it'));
    const spread = make('div', 'dbl-cards-pull-grid');
    packCards = picks.map((card, index) => {
      const element = cardElement(card, true, () => {
        if (packCards.every(c => !c.classList.contains('is-sealed'))) revealBtn.disabled = true;
      });
      element.classList.add('dbl-cards-appearing');
      element.style.setProperty('--pack-position', index);
      spread.appendChild(element);
      return element;
    });
    packStage.appendChild(spread);
    actions.hidden = false;
    revealBtn.disabled = false;
    showStatus();
  }
  function openPack() {
    if (busy) return;
    const pulled = api.getPack();
    if (pulled.length !== 5) return;
    // Save the pulls immediately. Closing the tab mid-animation cannot
    // discard a pack that was successfully opened.
    if (!api.collectPack(pulled)) return;
    busy = true;
    const token = ++packToken;
    actions.hidden = true;
    packStage.replaceChildren(newPackArt(true),
      make('p', 'dbl-cards-stage-note', 'Unsealing your collector pack…'));
    showStatus();
    window.setTimeout(() => showPulls(pulled, token), reduced() ? 10 : 850);
  }
  function filteredCards() {
    const q = search.value.trim().toLocaleLowerCase();
    const tier = rarityFilter.value;
    const result = api.items.filter(item => {
      if (tier !== 'all' && tier !== item.rarity) return false;
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
  }
  function formattedCount(n) { return n.toLocaleString('en-US'); }
  function repaint() {
    showStatus();
    showCounters();
    showGallery();
    // A new file uploaded while Cards is already open should immediately
    // populate the new player pool, not require switching tabs twice.
    if (!panel.hidden) api.ensurePool();
  }
  api.subscribe(repaint);
  openBtn.addEventListener('click', openPack);
  revealBtn.addEventListener('click', revealAll);
  againBtn.addEventListener('click', readyStage);
  for (const control of [rarityFilter, order, search]) {
    control.addEventListener(control === search ? 'input' : 'change', () => {
      limit = 36;
      showGallery();
    });
  }
  loadMore.addEventListener('click', () => { limit += 36; showGallery(); });
  window.addEventListener('dbl:tab-change', event => {
    if (event.detail?.panelId === 'cardsPanel') api.ensurePool();
  });
  readyStage();
  repaint();
})();