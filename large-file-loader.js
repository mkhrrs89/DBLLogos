(() => {
  const LARGE_FILE_THRESHOLD_BYTES = 12 * 1024 * 1024;

  function isLargeFile(file) {
    return Boolean(file && Number(file.size) >= LARGE_FILE_THRESHOLD_BYTES);
  }

  async function isGzipFile(file) {
    if (!file) return false;
    if (String(file.name || '').toLowerCase().endsWith('.gz')) return true;
    const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    return head[0] === 0x1f && head[1] === 0x8b;
  }

  async function* decodedChunks(file) {
    const gzip = await isGzipFile(file);

    if (gzip && typeof DecompressionStream !== 'undefined') {
      const stream = file.stream().pipeThrough(new DecompressionStream('gzip'));
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value?.length) {
            const text = decoder.decode(value, { stream: true });
            if (text) yield text;
          }
        }
        const tail = decoder.decode();
        if (tail) yield tail;
      } finally {
        try {
          await reader.cancel();
        } catch (error) {
          // The stream may already be closed.
        }
      }
      return;
    }

    if (!gzip) {
      const reader = file.stream().getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value?.length) {
            const text = decoder.decode(value, { stream: true });
            if (text) yield text;
          }
        }
        const tail = decoder.decode();
        if (tail) yield tail;
      } finally {
        try {
          await reader.cancel();
        } catch (error) {
          // The stream may already be closed.
        }
      }
      return;
    }

    if (!window.pako) {
      throw new Error('Gzip support did not load.');
    }

    // Older browsers without DecompressionStream retain the previous fallback.
    // Current iOS/Chrome/Safari use the streaming path above.
    const bytes = new Uint8Array(await file.arrayBuffer());
    yield window.pako.ungzip(bytes, { to: 'string' });
  }

  // Yield the requested top-level object's value beginning with its first
  // non-whitespace character. This deliberately tracks the root JSON depth so
  // nested properties with the same name cannot be mistaken for top-level data.
  async function* topLevelValueChunks(file, key) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    let expectingTopLevelKey = false;
    let capturingKey = false;
    let keyBuffer = '';
    let keyMatched = false;
    let awaitingColon = false;
    let awaitingValue = false;
    let found = false;

    for await (const chunk of decodedChunks(file)) {
      if (found) {
        yield chunk;
        continue;
      }

      for (let i = 0; i < chunk.length; i += 1) {
        const char = chunk[i];

        if (inString) {
          if (escaped) {
            escaped = false;
            if (capturingKey) keyBuffer += char;
          } else if (char === '\\') {
            escaped = true;
            if (capturingKey) keyBuffer += char;
          } else if (char === '"') {
            inString = false;
            if (capturingKey) {
              capturingKey = false;
              keyMatched = keyBuffer === key;
              awaitingColon = true;
            }
          } else if (capturingKey) {
            keyBuffer += char;
          }
          continue;
        }

        if (awaitingColon) {
          if (/\s/.test(char)) continue;
          if (char === ':') {
            awaitingColon = false;
            if (keyMatched) awaitingValue = true;
            keyMatched = false;
            continue;
          }
          awaitingColon = false;
          keyMatched = false;
        }

        if (awaitingValue) {
          if (/\s/.test(char)) continue;
          awaitingValue = false;
          found = true;
          yield chunk.slice(i);
          break;
        }

        if (char === '"') {
          inString = true;
          if (depth === 1 && expectingTopLevelKey) {
            capturingKey = true;
            keyBuffer = '';
            expectingTopLevelKey = false;
          }
          continue;
        }

        if (char === '{') {
          depth += 1;
          if (depth === 1) expectingTopLevelKey = true;
          continue;
        }

        if (char === '[') {
          depth += 1;
          continue;
        }

        if (char === '}' || char === ']') {
          depth -= 1;
          continue;
        }

        if (char === ',' && depth === 1) {
          expectingTopLevelKey = true;
        }
      }
    }
  }

  async function scanTopLevelArrayItems(file, key, onItem) {
    if (!file || typeof onItem !== 'function') return 0;

    let count = 0;
    let arrayStarted = false;
    let arrayFinished = false;
    let itemStarted = false;
    let itemParts = [];
    let itemSegmentStart = 0;
    let nesting = 0;
    let inString = false;
    let escaped = false;

    const finishItem = (text, endIndex) => {
      const tail = text.slice(itemSegmentStart, endIndex);
      const raw = `${itemParts.join('')}${tail}`.trim();
      itemParts = [];
      itemStarted = false;
      itemSegmentStart = endIndex + 1;
      nesting = 0;
      inString = false;
      escaped = false;
      if (!raw) return null;
      const value = JSON.parse(raw);
      const pending = onItem(value, count, raw);
      // Most consumers use synchronous callbacks. Avoid two microtask hops
      // for every player/game while retaining ordered async callbacks.
      if (pending && typeof pending.then === 'function') {
        return Promise.resolve(pending).then(() => { count += 1; });
      }
      count += 1;
      return null;
    };

    const processArrayText = async (text, startIndex = 0) => {
      let i = startIndex;
      if (itemStarted) itemSegmentStart = i;

      while (i < text.length) {
        const char = text[i];

        if (!itemStarted) {
          if (/\s/.test(char) || char === ',') {
            i += 1;
            continue;
          }
          if (char === ']') {
            arrayFinished = true;
            return;
          }

          itemStarted = true;
          itemSegmentStart = i;
          nesting = 0;
          inString = false;
          escaped = false;
        }

        if (inString) {
          if (escaped) {
            escaped = false;
          } else if (char === '\\') {
            escaped = true;
          } else if (char === '"') {
            inString = false;
          }
          i += 1;
          continue;
        }

        if (char === '"') {
          inString = true;
          i += 1;
          continue;
        }

        if (char === '{' || char === '[') {
          nesting += 1;
          i += 1;
          continue;
        }

        if (char === '}' || char === ']') {
          if (nesting > 0) {
            nesting -= 1;
            i += 1;
            continue;
          }

          if (char === ']') {
            const pending = finishItem(text, i);
            if (pending) await pending;
            arrayFinished = true;
            return;
          }
        }

        if (char === ',' && nesting === 0) {
          const pending = finishItem(text, i);
          if (pending) await pending;
          i += 1;
          itemSegmentStart = i;
          continue;
        }

        i += 1;
      }

      if (itemStarted) {
        itemParts.push(text.slice(itemSegmentStart));
        itemSegmentStart = 0;
      }
    };

    for await (const chunk of topLevelValueChunks(file, key)) {
      if (arrayFinished) break;

      let startIndex = 0;
      if (!arrayStarted) {
        while (startIndex < chunk.length && /\s/.test(chunk[startIndex])) startIndex += 1;
        if (startIndex >= chunk.length) continue;
        if (chunk[startIndex] !== '[') {
          throw new Error(`The top-level ${key} value is not an array.`);
        }
        arrayStarted = true;
        startIndex += 1;
      }

      await processArrayText(chunk, startIndex);
    }

    if (!arrayStarted) return 0;
    if (!arrayFinished) {
      throw new Error(`The ${key} array ended unexpectedly.`);
    }

    return count;
  }

  async function collectTopLevelArray(file, key) {
    const values = [];
    await forEachTopLevelArrayItem(file, key, (value) => {
      values.push(value);
    });
    return values;
  }

  async function readTopLevelValueUncached(file, key) {
    if (!file) return undefined;

    let started = false;
    let mode = '';
    let parts = [];
    let segmentStart = 0;
    let nesting = 0;
    let inString = false;
    let escaped = false;

    const finish = (text, endIndex) => {
      const raw = `${parts.join('')}${text.slice(segmentStart, endIndex)}`.trim();
      return raw ? JSON.parse(raw) : undefined;
    };

    for await (const chunk of topLevelValueChunks(file, key)) {
      let index = 0;

      if (!started) {
        while (index < chunk.length && /\s/.test(chunk[index])) index += 1;
        if (index >= chunk.length) continue;

        started = true;
        segmentStart = index;
        const first = chunk[index];
        mode = first === '{' || first === '['
          ? 'container'
          : first === '"'
            ? 'string'
            : 'primitive';
      } else {
        segmentStart = 0;
      }

      for (let i = index; i < chunk.length; i += 1) {
        const char = chunk[i];

        if (inString) {
          if (escaped) {
            escaped = false;
          } else if (char === '\\') {
            escaped = true;
          } else if (char === '"') {
            inString = false;
            if (mode === 'string' && nesting === 0) {
              return finish(chunk, i + 1);
            }
          }
          continue;
        }

        if (char === '"') {
          inString = true;
          continue;
        }

        if (mode === 'container') {
          if (char === '{' || char === '[') {
            nesting += 1;
          } else if (char === '}' || char === ']') {
            nesting -= 1;
            if (nesting === 0) {
              return finish(chunk, i + 1);
            }
          }
        } else if (mode === 'primitive' && (char === ',' || char === '}')) {
          return finish(chunk, i);
        }
      }

      parts.push(chunk.slice(segmentStart));
      segmentStart = 0;
    }

    return undefined;
  }

  // gameAttributes is small but commonly requested by multiple heavy tabs.
  // Reuse a read for the same File object, including concurrent callers,
  // without caching giant player/game arrays or decompressed exports.
  const gameAttributesByFile = new WeakMap();
  function readTopLevelValue(file, key) {
    if (!file || key !== 'gameAttributes') {
      return readTopLevelValueUncached(file, key);
    }
    let pending = gameAttributesByFile.get(file);
    if (!pending) {
      pending = readTopLevelValueUncached(file, key);
      gameAttributesByFile.set(file, pending);
      pending.catch(() => {
        if (gameAttributesByFile.get(file) === pending) gameAttributesByFile.delete(file);
      });
    }
    return pending;
  }

  // Reuse small, complete collections across tabs without storing an entire
  // expanded league file. Each File is keyed by identity, so a new upload
  // gets fresh results; abandoned files are collectible with the WeakMap.
  const MAX_REPLAY_BYTES_PER_COLLECTION = 2 * 1024 * 1024;
  const MAX_REPLAY_BYTES_PER_FILE = 6 * 1024 * 1024;
  const MAX_REPLAY_ITEMS = 6000;
  const SHARED_COLLECTION_KEYS = new Set([
    'teams', 'teamStats', 'players', 'retiredPlayers',
    'releasedPlayers', 'freeAgents', 'games', 'events', 'playerFeats',
  ]);
  const collectionStateByFile = new WeakMap();

  function getCollectionState(file) {
    let state = collectionStateByFile.get(file);
    if (!state) {
      state = { completed: new Map(), pending: new Map(), bytes: 0 };
      collectionStateByFile.set(file, state);
    }
    return state;
  }

  async function replayCollection(rows, onItem) {
    // Parse afresh for each caller: a callback may edit its row, and that
    // must never change the data seen by any other tab.
    for (let i = 0; i < rows.length; i += 1) {
      const pending = onItem(JSON.parse(rows[i]), i);
      if (pending && typeof pending.then === 'function') await pending;
    }
    return rows.length;
  }

  function forEachTopLevelArrayItem(file, key, onItem) {
    if (!file || typeof onItem !== 'function') return Promise.resolve(0);
    if (!SHARED_COLLECTION_KEYS.has(key)) {
      return scanTopLevelArrayItems(file, key, onItem);
    }

    const state = getCollectionState(file);
    const replay = state.completed.get(key);
    if (replay) return replayCollection(replay, onItem);

    let job = state.pending.get(key);
    // A reader joining before parsing begins can share the exact scan.
    // Later readers use their own scan rather than missing early rows.
    if (!job || job.started) {
      job = {
        started: false, listeners: [], rows: [], bytes: 0,
        cacheable: true,
      };
      state.pending.set(key, job);
      const ownJob = job;

      // Queue the start by one microtask to coalesce callers originating from
      // the same load event, without adding a visible timer delay.
      Promise.resolve().then(async () => {
        ownJob.started = true;
        return scanTopLevelArrayItems(file, key, (item, index, raw) => {
          if (ownJob.cacheable) {
            const nextBytes = ownJob.bytes + raw.length * 2;
            if (nextBytes > MAX_REPLAY_BYTES_PER_COLLECTION
                || ownJob.rows.length >= MAX_REPLAY_ITEMS
                || nextBytes + state.bytes > MAX_REPLAY_BYTES_PER_FILE) {
              ownJob.cacheable = false;
              ownJob.rows = [];
              ownJob.bytes = 0;
            } else {
              ownJob.rows.push(raw);
              ownJob.bytes = nextBytes;
            }
          }

          const promises = [];
          const active = ownJob.listeners.filter(listener => listener.active);
          for (let i = 0; i < active.length; i += 1) {
            const listener = active[i];
            try {
              // Distinct parsed objects keep each consumer isolated, just as
              // if it had read the file separately.
              const value = i === 0 ? item : JSON.parse(raw);
              const pending = listener.onItem(value, index);
              if (pending && typeof pending.then === 'function') {
                promises.push(Promise.resolve(pending).catch(error => {
                  listener.active = false;
                  listener.reject(error);
                }));
              }
            } catch (error) {
              listener.active = false;
              listener.reject(error);
            }
          }

          const checkListeners = () => {
            if (!ownJob.listeners.some(listener => listener.active)) {
              // No consumer remains; stop scanning and discard partial cache.
              throw new Error('Shared league scan has no remaining consumers.');
            }
          };
          if (promises.length) {
            return Promise.all(promises).then(checkListeners);
          }
          checkListeners();
          return null;
        });
      }).then(count => {
        if (ownJob.cacheable
            && !state.completed.has(key)
            && ownJob.bytes + state.bytes <= MAX_REPLAY_BYTES_PER_FILE) {
          state.completed.set(key, ownJob.rows);
          state.bytes += ownJob.bytes;
        }
        for (const listener of ownJob.listeners) {
          if (listener.active) listener.resolve(count);
        }
      }).catch(error => {
        for (const listener of ownJob.listeners) {
          if (listener.active) listener.reject(error);
        }
      }).finally(() => {
        if (state.pending.get(key) === ownJob) state.pending.delete(key);
        ownJob.listeners.length = 0;
        ownJob.rows = [];
      });
    }

    return new Promise((resolve, reject) => {
      job.listeners.push({ onItem, resolve, reject, active: true });
    });
  }

  window.DBLLeagueStream = {
    thresholdBytes: LARGE_FILE_THRESHOLD_BYTES,
    isLargeFile,
    forEachTopLevelArrayItem,
    collectTopLevelArray,
    readTopLevelValue,
  };

  if (typeof readLeagueFile !== 'function') return;

  const originalReadLeagueFile = readLeagueFile;

  readLeagueFile = async function readLeagueFileLowMemory(file) {
    if (!isLargeFile(file)) {
      window.__dblLargeLeagueFile = null;
      window.__dblLargeLeagueMode = false;
      return originalReadLeagueFile(file);
    }

    window.__dblLargeLeagueFile = file;
    window.__dblLargeLeagueMode = true;

    const teams = await collectTopLevelArray(file, 'teams');
    if (!teams.length) {
      throw new Error('No team history could be read from this large league file.');
    }

    // Initial import only needs the team timeline. Player/game-heavy views are
    // rebuilt on demand so mobile never has to hold the entire decompressed
    // league export in memory at once.
    return JSON.stringify({ teams });
  };
})();