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
  // A Cloudflare Pages Function at this app's own origin is the only proxy
  // target. If this site is on static GitHub Pages, health detection safely
  // disables this fallback. No private/local photos are ever sent to it.
  const PROXY_ENDPOINT = new URL('./api/cards-photo',
    document.baseURI || window.location.href).toString();
  let currentFile = null;
  let generation = 0;
  let scannedGeneration = -1;
  let scanning = null;
  let season = null;
  let players = [];
  let active = false;
  let visibleLimit = PAGE_SIZE;
  let segmenterPromise = null;
  let proxyHealth = null;
  const cache = new Map();
  const pending = [];
  const pendingIds = new Set();
  let working = false;
  let observer = null;
  // User-selected local photos are temporary, never written to the league
  // file, card storage, or collection backups.
  const localPhotoUrls = new Set();
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
      (/^blob:/i.test(value) && value.length < 3000) ||
      // Same-origin stock images use the existing, shared year map.
      (/^\.\/assets\/\d{4}(?:-\d{4})?\.jpg$/i.test(value)) ||
      (/^data:image\/(?:jpeg|jpg|png|webp|gif);base64,/i.test(value) &&
        value.length < 2000000))
    ? value : '';
  // Distinct codes let the card explain the specific failure rather than
  // showing a generic "Retry Cutout" for unrelated issues.
  const codedError = (code, message, cause) => {
    const error = new Error(message);
    error.code = code;
    if (cause) error.cause = cause;
    return error;
  };
  const errorText = error => {
    switch (error?.code) {
      case 'video': return 'Animated MP4/MOV video needs frame-by-frame processing. Choose a still player photo.';
      case 'photo-access': return 'The image link cannot be read for processing (broken URL or CORS restriction).';
      case 'proxy-unavailable': return 'Photo host blocked pixel access. The same-origin image proxy is not active on this site. Use a local photo or enable the Cloudflare Pages Function.';
      case 'proxy-denied': return 'The image proxy refused this source or could not retrieve it. Use a local photo or an approved public image host.';
      case 'model': return 'The background-removal AI could not load on this device. Check the connection and try again.';
      case 'segment': return 'The AI could not isolate this player photo. An alternate photo may work.';
      default: return 'Background removal failed. The original photograph was kept.';
    }
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
      const primary = safePhoto(player.imgURL);
      const photoFallback = safePhoto(player.imgURLSmall);
      // Exact same asset-year lookup as the other two card collections.
      // This uses the active league year, not the player's career peak.
      const stockPath = safePhoto(
        window.DBLCardEraStockPortrait?.({era: year}) || '');
      const stockPhoto = stockPath
        ? new URL(stockPath, document.baseURI).href : '';
      // Normalize the stock path to the URL that img.src reports, otherwise
      // a missing stock file could be retried infinitely in the browser.
      const photoSources = [...new Set(
        [primary, photoFallback, stockPhoto].filter(Boolean))];
      const photo = photoSources[0] || '';
      found.set(pid, {pid, tid, ovr, name, photo, photoFallback,
        stockPhoto, photoSources, position: String(player.pos || '').trim()});
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
    for (const url of localPhotoUrls) URL.revokeObjectURL(url);
    localPhotoUrls.clear();
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
    const stockTag = make('span', 'dbl-bgtest-stock-tag', 'YEAR STOCK PHOTO');
    stockTag.hidden = true;
    const failedLoads = new Set();
    original.addEventListener('load', () => {
      original.hidden = false;
      stockTag.hidden = !player.stockPhoto || original.src !== player.stockPhoto;
    });
    original.addEventListener('error', () => {
      failedLoads.add(original.src);
      const fallback = player.photoSources?.find(source =>
        !failedLoads.has(source));
      if (fallback) {
        player.photo = fallback;
        original.src = fallback;
      } else {
        original.hidden = true;
        stockTag.hidden = true;
        const note = entry.querySelector('.dbl-bgtest-item-status');
        if (note) note.textContent = 'The photo links failed, including the year stock image.';
        const local = entry.querySelector('.dbl-bgtest-local-photo');
        if (local) local.hidden = false;
      }
    });
    if (player.photo) original.src = player.photo;
    else original.hidden = true;
    const cutout = make('img', 'dbl-bgtest-cutout');
    cutout.alt = 'Background-free cutout of ' + player.name;
    cutout.hidden = true;
    frame.appendChild(make('span', 'dbl-bgtest-photo-backdrop'));
    frame.appendChild(original);
    frame.appendChild(cutout);
    frame.appendChild(stockTag);
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
    const local = make('button', 'dbl-bgtest-local-photo', 'Use local photo');
    local.type = 'button';
    local.hidden = !!player.photo;
    const localInput = make('input', 'dbl-bgtest-local-input');
    localInput.type = 'file';
    localInput.accept = 'image/png,image/jpeg,image/webp';
    localInput.hidden = true;
    const compare = {original, cutout, note, toggle, retry, local, frame, entry,
      player, stockTag, failedLoads, triedPhotos:new Set(), token:generation,
      mode:'cutout', ready:false};
    entry._bgTestView = compare;
    toggle.addEventListener('click', () => {
      if (!compare.ready) return;
      compare.mode = compare.mode === 'cutout' ? 'original' : 'cutout';
      showMode(compare);
    });
    retry.addEventListener('click', () => {
      retry.hidden = true;
      compare.triedPhotos.clear();
      queueProcess(compare, true);
    });
    local.addEventListener('click', () => localInput.click());
    localInput.addEventListener('change', () => {
      const file = localInput.files?.[0];
      localInput.value = '';
      if (!file) return;
      if (!/^image\/(png|jpeg|webp)$/i.test(file.type) || file.size > 10 * 1024 * 1024) {
        note.textContent = 'Choose a PNG, JPEG or WebP image under 10 MB.';
        return;
      }
      if (compare.localUrl) releaseLocalPhoto(compare.localUrl);
      compare.localUrl = createLocalPhoto(file);
      player.photo = compare.localUrl;
      player.photoFallback = '';
      player.photoSources = [compare.localUrl];
      compare.triedPhotos.clear();
      compare.failedLoads.clear();
      compare.stockTag.hidden = true;
      original.hidden = false;
      original.src = compare.localUrl;
      compare.ready = false;
      compare.mode = 'cutout';
      local.hidden = true;
      retry.hidden = true;
      queueProcess(compare, true);
    });
    controls.appendChild(toggle);
    controls.appendChild(retry);
    controls.appendChild(local);
    controls.appendChild(localInput);
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
    const usedStock = !!c.player.stockPhoto &&
      c.player.photo === c.player.stockPhoto;
    c.stockTag.hidden = !usedStock;
    c.note.textContent = usedStock
      ? 'Year stock photo · Background hidden · Original files unchanged'
      : 'Background hidden · Original photo unchanged';
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

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      if (/^https?:/i.test(src)) image.crossOrigin = 'anonymous';
      image.referrerPolicy = 'no-referrer';
      image.onload = () => image.naturalWidth > 0 && image.naturalHeight > 0
        ? resolve(image) : reject(codedError('photo-access', 'Empty or undecodable image.'));
      image.onerror = () => reject(codedError('photo-access',
        'Image could not load for pixel processing (CORS, 404 or format).'));
      image.src = src;
    });
  }

  async function proxyIsReady() {
    if (!proxyHealth) {
      proxyHealth = (async () => {
        if (typeof fetch !== 'function') return false;
        try {
          const response = await fetch(PROXY_ENDPOINT + '?health=1', {
            credentials:'omit', cache:'no-store', mode:'same-origin'
          });
          if (!response.ok || response.headers.get('X-DBL-Proxy') !== 'v1')
            return false;
          const result = await response.json();
          return result.service === 'dbl-cards-photo-proxy' && result.version === 1;
        } catch (_) { return false; }
      })();
    }
    return proxyHealth;
  }

  async function processProxiedSource(src, segmenter) {
    const ready = await proxyIsReady();
    if (!ready) throw codedError('proxy-unavailable', 'The same-origin image proxy is not active.');
    const url = PROXY_ENDPOINT + '?url=' + encodeURIComponent(src);
    let response;
    try {
      response = await fetch(url, {mode:'same-origin', credentials:'omit'});
    } catch (error) {
      throw codedError('proxy-denied', 'Image proxy request failed.', error);
    }
    if (!response.ok || response.headers.get('X-DBL-Proxy') !== 'v1')
      throw codedError('proxy-denied', 'Image proxy returned HTTP ' + response.status + '.');
    const type = (response.headers.get('content-type') || '').split(';')[0];
    if (!/^image\/(?:png|jpeg|webp|gif|avif)$/i.test(type))
      throw codedError('proxy-denied', 'Image proxy returned a non-image response.');
    const blob = await response.blob();
    if (!blob.size || blob.size > 8 * 1024 * 1024)
      throw codedError('proxy-denied', 'Image proxy returned an invalid image size.');
    const localUrl = URL.createObjectURL(blob);
    try {
      const image = await loadImage(localUrl);
      return await makeCutout(segmenter, image);
    } finally {
      URL.revokeObjectURL(localUrl);
    }
  }

  async function loadSource(src, segmenter) {
    if (/\.(?:mp4|mov|m4v)(?:[?#]|$)/i.test(src) ||
        /^data:video\//i.test(src))
      throw codedError('video', 'Animated video is not supported by still-image masking.');
    try {
      const image = await loadImage(src);
      return await makeCutout(segmenter, image);
    } catch (error) {
      if (!/^https:\/\//i.test(src) ||
          !(error?.code === 'photo-access' ||
            error?.name === 'SecurityError' ||
            /taint|cross.origin|cors/i.test(String(error?.message || ''))))
        throw error;
      // The fallback is attempted ONLY for public remote HTTPS images and
      // ONLY if the same-origin proxy's health endpoint is actually active.
      try { return await processProxiedSource(src, segmenter); }
      catch (cause) {
        if (cause?.code) throw cause;
        throw codedError('segment', 'AI could not process the fetched image.', cause);
      }
    }
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

  function createLocalPhoto(blob) {
    const url = URL.createObjectURL(blob);
    localPhotoUrls.add(url);
    return url;
  }
  function releaseLocalPhoto(url) {
    if (localPhotoUrls.delete(url)) URL.revokeObjectURL(url);
  }
  function cutoutFor(src) {
    const cached = cache.get(src);
    if (cached) return Promise.resolve(cached);
    const pending = inFlight.get(src);
    if (pending) return pending;
    const job = cutoutQueue.catch(() => {}).then(async () => {
      let segmenter;
      try { segmenter = await getSegmenter(); }
      catch (cause) { throw codedError('model', 'The AI model failed to load.', cause); }
      const blob = await loadSource(src, segmenter);
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
    delete element.dataset.bgMaskError;
    delete element.dataset.bgMaskErrorMessage;
    if (label) label.textContent = 'REMOVING BACKGROUND…';
    return cutoutFor(src).then(url => {
      if (!element.isConnected) { trimCache(); return false; }
      element.src = url;
      element.dataset.bgMaskSource = src;
      delete element.dataset.bgMaskError;
      delete element.dataset.bgMaskErrorMessage;
      element.dataset.bgMaskOriginal = src;
      element.dataset.bgMaskCutout = url;
      trimCache();
      if (label) {
        label.textContent = 'BACKGROUND HIDDEN';
        label.title = 'Only the displayed image changes; its original file stays intact.';
      }
      return true;
    }).catch(error => {
      const code = error?.code || 'segment';
      const reason = errorText(error);
      element.dataset.bgMaskError = code;
      element.dataset.bgMaskErrorMessage = reason;
      if (label && label.isConnected) {
        label.textContent = code === 'proxy-unavailable' ? 'PROXY NOT ACTIVE' :
          code === 'proxy-denied' ? 'PROXY COULD NOT FETCH' :
          code === 'photo-access' ? 'PHOTO LINK BLOCKED' :
          code === 'model' ? 'AI MODEL UNAVAILABLE' :
          code === 'video' ? 'VIDEO NEEDS FRAME PROCESSING' :
          'CUTOUT FAILED';
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
        const attemptedSource = c.player.photo;
        const cached = cache.get(attemptedSource);
        if (cached) { setProcessed(c, cached); continue; }
        try {
          c.note.textContent = attemptedSource === c.player.stockPhoto
            ? 'Removing background from year stock photo…'
            : 'Loading AI and detecting player…';
          const url = await cutoutFor(attemptedSource);
          if (!active || c.token !== generation || !c.entry.isConnected) continue;
          setProcessed(c, url);
          trimCache();
        } catch (error) {
          if (c.token === generation && c.entry.isConnected) {
            c.triedPhotos.add(attemptedSource);
            // Try each original/alternate source first, then the matching
            // local-year stock portrait when a source cannot be processed.
            const fallback = c.player.photoSources?.find(source =>
              !c.triedPhotos.has(source) && !c.failedLoads.has(source));
            if (fallback) {
              c.player.photo = fallback;
              c.original.hidden = false;
              c.original.src = fallback;
              c.stockTag.hidden = !c.player.stockPhoto ||
                fallback !== c.player.stockPhoto;
              c.note.textContent = fallback === c.player.stockPhoto
                ? 'Trying matching year stock photo…'
                : 'Trying alternate player photograph…';
              queueProcess(c, true);
            } else {
              c.note.textContent = errorText(error) +
                ' You can choose a local photograph to try again.';
              c.retry.hidden = false;
              c.local.hidden = false;
            }
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
  window.DBLBackgroundTest = Object.freeze({open, close, maskPhoto, createLocalPhoto, releaseLocalPhoto,
    proxyIsReady,
    // Exposed for validation, not part of collection storage or pack odds.
    rosterFromRecords, currentRating});
  // cards-ui.js restores the last tab before this module finishes loading.
  if (!view.hidden) open();
})();