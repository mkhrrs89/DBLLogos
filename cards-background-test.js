(() => {
  'use strict';
  if (window.DBLBackgroundTest) return;
  const hub = window.DBLLeagueFileHub;
  const reader = window.DBLLeagueStream;
  const view = document.getElementById('cardsBackgroundTestView');
  const grid = document.getElementById('cardsBackgroundTestGrid');
  const status = document.getElementById('cardsBackgroundTestStatus');
  const search = document.getElementById('cardsBackgroundTestSearch');
  const sort = document.getElementById('cardsBackgroundTestSort');
  const more = document.getElementById('cardsBackgroundTestMore');
  if (!hub || !reader || !view || !grid || !status || !search || !sort || !more) return;

  // Pin model and runtime together. Neither runs or downloads unless this
  // separate test collection is actually opened and an image scrolls into view.
  const TASKS_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/+esm';
  const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/wasm';
  const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';
  const PAGE_SIZE = 12;
  const CACHE_LIMIT = 30;
  const MAX_SIDE = 512;
  let currentFile = null;
  let generation = 0;
  let scannedGeneration = -1;
  let scanning = null;
  let season = null;
  let players = [];
  let active = false;
  let visibleLimit = PAGE_SIZE;
  let segmenterPromise = null;
  const cache = new Map();
  const pending = [];
  const pendingIds = new Set();
  let working = false;
  let observer = null;
  // One on-device model job at a time, shared by the gallery and pack pulls.
  // Cache lives only in memory; original image bytes and league files stay intact.
  const inFlight = new Map();
  let cutoutQueue = Promise.resolve();

  const make = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = String(text);
    return node;
  };
  const num = value => value === null || value === undefined || value === '' ||
    !Number.isFinite(Number(value)) ? null : Number(value);
  const int = value => Number.isInteger(num(value)) ? num(value) : null;
  const safePhoto = value => typeof value === 'string' &&
    ((/^https?:\/\/\S+$/i.test(value) && value.length < 2000) ||
      (/^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(value) &&
        value.length < 2000000))
    ? value : '';
  const errorText = error => {
    const message = String(error?.message || error || '');
    if (/taint|cross.origin|cors|securityerror/i.test(message))
      return 'This photo host does not allow browser image processing. Original kept.';
    if (/image failed to load/i.test(message))
      return 'The photo could not be loaded for background removal (broken link or cross-origin restriction).';
    if (/network|fetch|load|wasm|module|model/i.test(message))
      return 'Could not load the background model. Tap Retry to try again.';
    return 'Could not isolate this player. Original photograph kept.';
  };

  function currentRating(player, year) {
    let selected = null;
    let selectedYear = -Infinity;
    for (const rating of Array.isArray(player.ratings) ? player.ratings : []) {
      const entryYear = int(rating?.season);
      if (entryYear === null || entryYear > year || num(rating?.ovr) === null) continue;
      if (entryYear >= selectedYear) { selected = rating; selectedYear = entryYear; }
    }
    return num(selected?.ovr);
  }

  function rosterFromRecords(records, year) {
    const found = new Map();
    for (const player of records) {
      const pid = int(player?.pid);
      const tid = int(player?.tid);
      // Active-season players include free agents (ZenGM tid -1), but not
      // retired players or future draft prospects (tid below -1).
      if (pid === null || pid < 0 || tid === null || tid < -1) continue;
      const ovr = currentRating(player, year);
      if (ovr === null || ovr < 50) continue;
      const name = [player.firstName, player.lastName]
        .filter(x => typeof x === 'string' && x.trim()).join(' ').trim() ||
        String(player.name || 'Unnamed player');
      const photo = safePhoto(player.imgURL);
      found.set(pid, {pid, tid, ovr, name, photo,
        position: String(player.pos || '').trim()});
    }
    return [...found.values()].sort((a,b) => b.ovr - a.ovr ||
      a.name.localeCompare(b.name) || a.pid - b.pid);
  }

  async function scan() {
    if (!active) return;
    const token = generation;
    if (!currentFile) {
      season = null;
      players = [];
      status.textContent = 'Upload a league file to see current players rated 50 OVR or above.';
      grid.replaceChildren();
      more.hidden = true;
      return;
    }
    if (scannedGeneration === token) { render(); return; }
    if (scanning) return scanning;
    status.textContent = 'Reading current player ratings from your league file…';
    grid.replaceChildren();
    scanning = (async () => {
      try {
        const attrs = await reader.readTopLevelValue(currentFile, 'gameAttributes');
        const year = int(attrs?.season);
        if (year === null) throw Error('League file season is unavailable.');
        const matches = [];
        await reader.forEachTopLevelArrayItem(currentFile, 'players', player => {
          // Keep only compact image references and the current overall rating.
          const tid = int(player?.tid);
          if (tid === null || tid < -1) return;
          if ((currentRating(player, year) ?? -1) < 50) return;
          matches.push(player);
        });
        const available = rosterFromRecords(matches, year);
        if (token !== generation) return;
        players = available;
        season = year;
        scannedGeneration = token;
        if (active) render();
      } catch (error) {
        if (token !== generation) return;
        season = null;
        players = [];
        status.textContent = 'Could not read the league file: ' +
          String(error.message || error);
        grid.replaceChildren();
        more.hidden = true;
      } finally {
        if (token === generation) scanning = null;
      }
    })();
    return scanning;
  }

  function cancelObservation() {
    observer?.disconnect();
    observer = null;
    pending.length = 0;
    pendingIds.clear();
  }
  function resetResults() {
    cancelObservation();
    grid.replaceChildren();
    for (const item of cache.values()) URL.revokeObjectURL(item);
    cache.clear();
    visibleLimit = PAGE_SIZE;
  }
  function onLeagueFile(file) {
    if (file === currentFile) return;
    currentFile = file || null;
    generation++;
    scannedGeneration = -1;
    scanning = null;
    players = [];
    resetResults();
    if (active) void scan();
  }

  function shownPlayers() {
    const q = search.value.trim().toLocaleLowerCase();
    const shown = players.filter(p =>
      !q || p.name.toLocaleLowerCase().includes(q) ||
        String(p.ovr) === q);
    if (sort.value === 'name')
      shown.sort((a, b) => a.name.localeCompare(b.name) || a.pid - b.pid);
    return shown;
  }

  function addCard(player) {
    const entry = make('article', 'dbl-bgtest-entry');
    entry.dataset.pid = String(player.pid);
    const face = make('div', 'dbl-bgtest-card');
    const heading = make('span', 'dbl-bgtest-card-top', 'DBL · BACKGROUND TEST');
    const frame = make('div', 'dbl-bgtest-photo');
    const original = make('img', 'dbl-bgtest-original');
    original.alt = 'Original photo of ' + player.name;
    original.loading = 'lazy';
    original.decoding = 'async';
    original.referrerPolicy = 'no-referrer';
    if (player.photo) original.src = player.photo;
    else original.hidden = true;
    const cutout = make('img', 'dbl-bgtest-cutout');
    cutout.alt = 'Background-free cutout of ' + player.name;
    cutout.hidden = true;
    frame.appendChild(make('span', 'dbl-bgtest-photo-backdrop'));
    frame.appendChild(original);
    frame.appendChild(cutout);
    face.appendChild(heading);
    face.appendChild(frame);
    face.appendChild(make('strong', 'dbl-bgtest-player-name', player.name));
    face.appendChild(make('span', 'dbl-bgtest-player-rating', 'CURRENT OVR ' + player.ovr));
    const note = make('p', 'dbl-bgtest-item-status',
      player.photo ? 'Waiting to process when visible…' :
        'No player photograph available.');
    const controls = make('div', 'dbl-bgtest-actions');
    const toggle = make('button', 'dbl-bgtest-toggle', 'Show original');
    toggle.type = 'button';
    toggle.disabled = true;
    toggle.hidden = !player.photo;
    const retry = make('button', 'dbl-bgtest-retry', 'Retry');
    retry.type = 'button';
    retry.hidden = true;
    const compare = {original, cutout, note, toggle, retry, frame, entry,
      player, token:generation, mode:'cutout', ready:false};
    entry._bgTestView = compare;
    toggle.addEventListener('click', () => {
      if (!compare.ready) return;
      compare.mode = compare.mode === 'cutout' ? 'original' : 'cutout';
      showMode(compare);
    });
    retry.addEventListener('click', () => {
      retry.hidden = true;
      queueProcess(compare, true);
    });
    controls.appendChild(toggle);
    controls.appendChild(retry);
    entry.appendChild(face);
    const saved = window.DBLCardEngine?.items.find(card =>
      card.type === 'background-test' && card.pid === player.pid);
    entry.appendChild(make('span', 'dbl-bgtest-owned',
      saved ? 'OWNED ×' + saved.count : 'NOT YET PULLED'));
    entry.appendChild(note);
    entry.appendChild(controls);

    if (player.photo) {
      const cached = cache.get(player.photo);
      if (cached) {
        setProcessed(compare, cached, true);
      } else if (observer) {
        observer.observe(entry);
      }
    }
    return entry;
  }

  function showMode(c) {
    const useCutout = c.ready && c.mode === 'cutout';
    c.original.hidden = useCutout;
    c.cutout.hidden = !useCutout;
    c.frame.classList.toggle('is-cutout', useCutout);
    c.toggle.textContent = useCutout ? 'Show original' : 'Show cutout';
  }

  function setProcessed(c, url, allowDetached = false) {
    if (c.token !== generation || (!allowDetached && !c.entry.isConnected)) return;
    c.cutout.src = url;
    c.ready = true;
    c.toggle.disabled = false;
    c.retry.hidden = true;
    c.note.textContent = 'Background hidden · Original photo unchanged';
    showMode(c);
  }

  function queueProcess(c, retry = false) {
    if (!active || c.token !== generation || !c.player.photo ||
        c.ready || !c.entry.isConnected) return;
    if (pendingIds.has(c.player.pid) && !retry) return;
    if (pendingIds.has(c.player.pid)) return;
    pendingIds.add(c.player.pid);
    pending.push(c);
    c.note.textContent = 'Queued for background detection…';
    if (!working) void pump();
  }

  async function getSegmenter() {
    if (!segmenterPromise) {
      segmenterPromise = (async () => {
        // Use the official versioned bundle when some browsers cannot
        // import the CDN-generated ESM wrapper.
        let module;
        try {
          module = await import(TASKS_URL);
          if (!module.FilesetResolver || !module.ImageSegmenter)
            throw Error('Missing MediaPipe exports.');
        } catch (_) {
          module = await import(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/vision_bundle.mjs');
        }
        const wasm = await module.FilesetResolver.forVisionTasks(WASM_URL);
        return module.ImageSegmenter.createFromOptions(wasm, {
          baseOptions: {modelAssetPath: MODEL_URL, delegate: 'CPU'},
          runningMode: 'IMAGE',
          outputCategoryMask: false,
          outputConfidenceMasks: true
        });
      })().catch(error => {
        segmenterPromise = null;
        throw error;
      });
    }
    return segmenterPromise;
  }

  async function loadSource(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      if (/^https?:/i.test(src)) image.crossOrigin = 'anonymous';
      image.referrerPolicy = 'no-referrer';
      image.onload = () => resolve(image);
      image.onerror = () => reject(Error('Image failed to load (possibly CORS).'));
      image.src = src;
    });
  }

  function makeCutout(segmenter, image) {
    const ratio = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * ratio));
    const height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', {willReadFrequently: true});
    if (!ctx) throw Error('Canvas image processing unavailable.');
    ctx.drawImage(image, 0, 0, width, height);
    // Throws on a cross-origin source without CORS: show the original, never
    // attempt to bypass the browser's security restrictions.
    const rgba = ctx.getImageData(0, 0, width, height);
    let gotMask = false;
    segmenter.segment(canvas, result => {
      // Selfie Segmenter returns ONE person confidence mask at index 0.
      // The previous [1] access failed even on successful AI results.
      // Multi-class models can provide background [0], person [1].
      const masks = result.confidenceMasks || [];
      const mask = masks.length === 1 ? masks[0] : masks[1] || masks[0];
      if (!mask) throw Error('No person mask was returned.');
      const probs = mask.getAsFloat32Array();
      const maskWidth = mask.width;
      const maskHeight = mask.height;
      if (!probs?.length || maskWidth < 1 || maskHeight < 1)
        throw Error('Empty person mask.');
      const pixels = rgba.data;
      for (let y = 0; y < height; y++) {
        const maskRow = Math.min(maskHeight - 1, Math.floor(y * maskHeight / height)) * maskWidth;
        for (let x = 0; x < width; x++) {
          const probability = probs[maskRow + Math.min(maskWidth - 1,
            Math.floor(x * maskWidth / width))];
          // Soft edges retain loose hair and partially transparent details.
          const t = Math.min(1, Math.max(0, (probability - .13) / .74));
          const alpha = t * t * (3 - 2 * t);
          const i = (y * width + x) * 4 + 3;
          pixels[i] = Math.round(pixels[i] * alpha);
        }
      }
      gotMask = true;
    });
    if (!gotMask) throw Error('Person segmentation did not finish.');
    ctx.putImageData(rgba, 0, 0);
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('Could not create cutout.')),
        'image/png');
    });
  }

  function trimCache() {
    if (cache.size <= CACHE_LIMIT) return;
    const inUse = new Set([...document.querySelectorAll(
      'img.dbl-bgtest-cutout, img.dbl-bgtest-pack-image')]
      .map(img => img.src));
    for (const [source, url] of cache) {
      if (cache.size <= CACHE_LIMIT) break;
      if (inUse.has(url)) continue;
      cache.delete(source);
      URL.revokeObjectURL(url);
    }
  }

  function cutoutFor(src) {
    const cached = cache.get(src);
    if (cached) return Promise.resolve(cached);
    const pending = inFlight.get(src);
    if (pending) return pending;
    const job = cutoutQueue.catch(() => {}).then(async () => {
      const [segmenter, image] = await Promise.all([getSegmenter(), loadSource(src)]);
      const blob = await makeCutout(segmenter, image);
      const url = URL.createObjectURL(blob);
      // The new blob is not yet attached to an image. Trimming here can
      // revoke that very URL when 30 other cutouts are visible. Defer
      // eviction until AFTER the caller displays the image.
      cache.set(src, url);
      return url;
    });
    inFlight.set(src, job);
    cutoutQueue = job.catch(() => {});
    void job.then(() => inFlight.delete(src), () => inFlight.delete(src));
    return job;
  }

  // Reusable for five-card pack reveals and saved binder cards. Never writes
  // or modifies any source image; only swaps an on-screen image URL to a
  // separate, temporary transparent PNG blob.
  function maskPhoto(element, source, label = null) {
    const src = safePhoto(source);
    if (!element || !src) {
      if (label) label.textContent = 'NO PROCESSABLE PHOTO';
      return Promise.resolve(false);
    }
    if (element.dataset.bgMaskSource === src) return Promise.resolve(true);
    if (label) label.textContent = 'REMOVING BACKGROUND…';
    return cutoutFor(src).then(url => {
      if (!element.isConnected) { trimCache(); return false; }
      element.src = url;
      element.dataset.bgMaskSource = src;
      element.dataset.bgMaskOriginal = src;
      element.dataset.bgMaskCutout = url;
      trimCache();
      if (label) {
        label.textContent = 'BACKGROUND HIDDEN';
        label.title = 'Only the displayed image changes; its original file stays intact.';
      }
      return true;
    }).catch(error => {
      if (label && label.isConnected) {
        const reason = errorText(error);
        label.textContent = reason.includes('host') ? 'PHOTO HOST BLOCKED' :
          reason.includes('model') ? 'AI MODEL UNAVAILABLE' : 'CUTOUT FAILED';
        label.title = reason;
      }
      console.warn('Background Test pack cutout unavailable.', error);
      return false;
    });
  }
  async function pump() {
    if (working) return;
    working = true;
    try {
      while (active && pending.length) {
        const c = pending.shift();
        pendingIds.delete(c.player.pid);
        if (c.token !== generation || !c.entry.isConnected) continue;
        const cached = cache.get(c.player.photo);
        if (cached) { setProcessed(c, cached); continue; }
        try {
          c.note.textContent = 'Loading AI and detecting player…';
          const url = await cutoutFor(c.player.photo);
          if (!active || c.token !== generation || !c.entry.isConnected) continue;
          setProcessed(c, url);
          trimCache();
        } catch (error) {
          if (c.token === generation && c.entry.isConnected) {
            c.note.textContent = errorText(error);
            c.retry.hidden = false;
            console.warn('Background Test could not isolate ' + c.player.name, error);
          }
        }
        // Yield between cards to keep taps and scrolling responsive.
        await new Promise(resolve => window.setTimeout(resolve, 0));
      }
    } finally {
      working = false;
      if (active && pending.length) void pump();
    }
  }

  function render() {
    if (!active) return;
    cancelObservation();
    const rows = shownPlayers();
    const shown = rows.slice(0, visibleLimit);
    status.textContent = season === null
      ? 'Reading league file…'
      : rows.length + ' of ' + players.length + ' players match · ' +
        season + ' season · Current OVR 50+ (including free agents) · Backgrounds are hidden only on screen.';
    more.hidden = rows.length <= visibleLimit;
    more.textContent = 'Show ' + Math.min(PAGE_SIZE, rows.length - visibleLimit) + ' more players';
    grid.replaceChildren();
    if (!shown.length) {
      grid.appendChild(make('p', 'dbl-cards-empty',
        season === null ? 'Loading players…' : players.length
          ? 'No players match your search.'
          : 'No active players rated 50+ were found in this league file.'));
      return;
    }
    // Only process images near the viewport; never run AI over the whole
    // roster or force a mass download at app startup.
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(entries => {
        for (const item of entries) {
          if (!item.isIntersecting) continue;
          observer?.unobserve(item.target);
          if (item.target._bgTestView) queueProcess(item.target._bgTestView);
        }
      }, {rootMargin:'160px 0px'});
    }
    const fragment = document.createDocumentFragment();
    for (const player of shown) fragment.appendChild(addCard(player));
    grid.appendChild(fragment);
    // Without IntersectionObserver, queue only a few initial cards.
    if (!observer) {
      for (const entry of [...grid.children].slice(0, 4)) {
        const c = entry._bgTestView;
        if (c) queueProcess(c);
      }
    }
  }

  function open() {
    if (view.hidden || document.getElementById('cardsPanel')?.hidden) return;
    active = true;
    void scan();
  }
  function close() {
    active = false;
    cancelObservation();
  }
  search.addEventListener('input', () => {visibleLimit = PAGE_SIZE; render();});
  sort.addEventListener('change', render);
  more.addEventListener('click', () => {visibleLimit += PAGE_SIZE; render();});
  window.addEventListener('dbl:tab-change', event => {
    if (event.detail?.panelId === 'cardsPanel' && !view.hidden) open();
    else close();
  });
  window.DBLCardEngine?.subscribe(change => {
    if (!active || change?.type === 'favorite' || change?.type === 'favorite-save') return;
    // Keep owned markers current after a pack pull/import, while keeping
    // photos and processed DOM intact to avoid unnecessary reprocessing.
    const owned = new Map(window.DBLCardEngine.items
      .filter(card => card.type === 'background-test').map(card => [card.pid, card.count]));
    for (const node of grid.querySelectorAll('.dbl-bgtest-entry')) {
      const pid = Number(node.dataset.pid);
      const copies = owned.get(pid);
      const marker = node.querySelector('.dbl-bgtest-owned');
      if (marker) marker.textContent = copies ? 'OWNED ×' + copies : 'NOT YET PULLED';
    }
  });
  hub.subscribe(({file}) => onLeagueFile(file));
  onLeagueFile(hub.getCurrentFile?.() || null);
  window.DBLBackgroundTest = Object.freeze({open, close, maskPhoto,
    // Exposed for validation, not part of collection storage or pack odds.
    rosterFromRecords, currentRating});
  // cards-ui.js restores the last tab before this module finishes loading.
  if (!view.hidden) open();
})();