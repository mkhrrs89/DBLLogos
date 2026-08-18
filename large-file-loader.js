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

  function findValueStart(text, pattern, startIndex = 0) {
    let searchIndex = startIndex;
    while (searchIndex < text.length) {
      const matchIndex = text.indexOf(pattern, searchIndex);
      if (matchIndex < 0) return { index: -1, incompleteAt: -1, matchIndex: -1 };

      let cursor = matchIndex + pattern.length;
      while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
      if (cursor >= text.length) return { index: -1, incompleteAt: matchIndex, matchIndex };
      if (text[cursor] !== ':') {
        searchIndex = matchIndex + pattern.length;
        continue;
      }

      cursor += 1;
      while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
      if (cursor >= text.length) return { index: -1, incompleteAt: matchIndex, matchIndex };
      return { index: cursor, incompleteAt: -1, matchIndex };
    }

    return { index: -1, incompleteAt: -1, matchIndex: -1 };
  }

  async function forEachTopLevelArrayItem(file, key, onItem) {
    if (!file || typeof onItem !== 'function') return 0;

    const pattern = `"${key}"`;
    let searching = true;
    let carry = '';
    let count = 0;
    let itemStarted = false;
    let itemParts = [];
    let itemSegmentStart = 0;
    let nesting = 0;
    let inString = false;
    let escaped = false;
    let arrayFinished = false;

    const finishItem = async (text, endIndex) => {
      const tail = text.slice(itemSegmentStart, endIndex);
      const raw = `${itemParts.join('')}${tail}`.trim();
      itemParts = [];
      itemStarted = false;
      itemSegmentStart = endIndex + 1;
      nesting = 0;
      inString = false;
      escaped = false;
      if (!raw) return;
      const value = JSON.parse(raw);
      await onItem(value, count);
      count += 1;
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
            await finishItem(text, i);
            arrayFinished = true;
            return;
          }
        }

        if (char === ',' && nesting === 0) {
          await finishItem(text, i);
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

    for await (const chunk of decodedChunks(file)) {
      if (arrayFinished) break;

      if (searching) {
        const text = carry + chunk;
        let searchFrom = 0;
        let found = findValueStart(text, pattern, searchFrom);

        while (found.index >= 0 && text[found.index] !== '[') {
          searchFrom = Math.max(found.index + 1, found.matchIndex + pattern.length);
          found = findValueStart(text, pattern, searchFrom);
        }

        if (found.index < 0) {
          if (found.incompleteAt >= 0) {
            carry = text.slice(found.incompleteAt);
          } else {
            const keep = Math.max(pattern.length + 32, 96);
            carry = text.slice(-keep);
          }
          continue;
        }

        searching = false;
        carry = '';
        await processArrayText(text, found.index + 1);
        continue;
      }

      await processArrayText(chunk, 0);
    }

    if (searching) {
      return 0;
    }

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

  async function readTopLevelValue(file, key) {
    if (!file) return undefined;

    const pattern = `"${key}"`;
    let searching = true;
    let carry = '';
    let started = false;
    let parts = [];
    let segmentStart = 0;
    let nesting = 0;
    let inString = false;
    let escaped = false;
    let primitiveOrString = false;

    const finish = (text, endIndex) => {
      const raw = `${parts.join('')}${text.slice(segmentStart, endIndex)}`.trim();
      return raw ? JSON.parse(raw) : undefined;
    };

    for await (const chunk of decodedChunks(file)) {
      let text = chunk;
      let index = 0;

      if (searching) {
        text = carry + chunk;
        const found = findValueStart(text, pattern);
        if (found.index < 0) {
          if (found.incompleteAt >= 0) {
            carry = text.slice(found.incompleteAt);
          } else {
            const keep = Math.max(pattern.length + 32, 96);
            carry = text.slice(-keep);
          }
          continue;
        }

        searching = false;
        carry = '';
        index = found.index;
        segmentStart = index;
        started = true;
        const first = text[index];
        primitiveOrString = first !== '{' && first !== '[';
      } else {
        segmentStart = 0;
      }

      for (let i = index; i < text.length; i += 1) {
        const char = text[i];

        if (inString) {
          if (escaped) {
            escaped = false;
          } else if (char === '\\') {
            escaped = true;
          } else if (char === '"') {
            inString = false;
          }
          continue;
        }

        if (char === '"') {
          inString = true;
          continue;
        }

        if (char === '{' || char === '[') {
          nesting += 1;
          continue;
        }

        if (char === '}' || char === ']') {
          if (nesting > 0) {
            nesting -= 1;
            if (!primitiveOrString && nesting === 0) {
              return finish(text, i + 1);
            }
            continue;
          }
        }

        if (primitiveOrString && nesting === 0 && (char === ',' || char === '}')) {
          return finish(text, i);
        }
      }

      if (started) {
        parts.push(text.slice(segmentStart));
        segmentStart = 0;
      }
    }

    return undefined;
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
