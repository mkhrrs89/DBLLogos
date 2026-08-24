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

  async function forEachTopLevelArrayItem(file, key, onItem) {
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

  async function readTopLevelValue(file, key) {
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