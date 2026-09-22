(() => {
  if (window.DBLLeagueFileHub) return;

  let currentFile = null;
  let version = 0;
  const subscribers = new Set();

  function getSnapshot(source = 'current') {
    return {
      file: currentFile,
      version,
      source,
    };
  }

  function notify(source) {
    const snapshot = getSnapshot(source);
    window.queueMicrotask(() => {
      for (const subscriber of subscribers) {
        try {
          subscriber(snapshot);
        } catch (error) {
          console.error('League file subscriber failed.', error);
        }
      }

      window.dispatchEvent(new CustomEvent('dbl:league-file', {
        detail: snapshot,
      }));
    });
  }

  function publish(file, source = 'upload') {
    if (!(file instanceof Blob)) return null;
    currentFile = file;
    version += 1;
    notify(source);
    return getSnapshot(source);
  }

  function clear(source = 'clear') {
    currentFile = null;
    version += 1;
    notify(source);
  }

  function subscribe(callback, { immediate = true } = {}) {
    if (typeof callback !== 'function') return () => {};
    subscribers.add(callback);

    if (immediate && currentFile) {
      const snapshot = getSnapshot('current');
      window.queueMicrotask(() => {
        if (!subscribers.has(callback)) return;
        try {
          callback(snapshot);
        } catch (error) {
          console.error('League file subscriber failed.', error);
        }
      });
    }

    return () => subscribers.delete(callback);
  }

  window.DBLLeagueFileHub = {
    publish,
    clear,
    subscribe,
    getCurrentFile: () => currentFile,
    getVersion: () => version,
  };

  document.addEventListener('change', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'file') return;
    if (input.id !== 'leagueFile' && !input.matches('[data-league-file-input]')) return;

    const [file] = input.files || [];
    if (file) publish(file, 'upload');
  }, true);

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('#clearLeagueFileBtn')) clear('clear');
  }, true);
})();
